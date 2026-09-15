#include "RelayRuntimeComponent.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

namespace
{
    FString Encode(const TSharedPtr<FJsonObject>& Object)
    {
        FString Text;
        FJsonSerializer::Serialize(Object.ToSharedRef(), TJsonWriterFactory<>::Create(&Text));
        return Text;
    }
    FString CheckpointPath() { return FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("relay-checkpoint.json")); }
}

void URelayRuntimeComponent::BeginPlay() { Super::BeginPlay(); Refresh(); }
void URelayRuntimeComponent::Refresh() { Send(TEXT("/state")); }

TSharedPtr<FJsonObject> URelayRuntimeComponent::Guard() const
{
    if (!Snapshot.IsValid()) return nullptr;
    FString Branch;
    double Revision;
    if (!Snapshot->TryGetStringField(TEXT("branchId"), Branch) || !Snapshot->TryGetNumberField(TEXT("revision"), Revision)) return nullptr;
    auto Body = MakeShared<FJsonObject>();
    Body->SetStringField(TEXT("branchId"), Branch);
    Body->SetNumberField(TEXT("expectedRevision"), Revision);
    return Body;
}

void URelayRuntimeComponent::Propose(const FString& Intent)
{
    auto Body = Guard();
    if (!Body.IsValid()) { Status = TEXT("Read station state first."); return; }
    Body->SetStringField(TEXT("intent"), Intent);
    Send(TEXT("/propose"), Body);
}

void URelayRuntimeComponent::AcceptProposed()
{
    auto Body = Guard();
    const TSharedPtr<FJsonObject>* Proposal = nullptr;
    const TSharedPtr<FJsonObject>* Plan = nullptr;
    FString Id, PlanStatus;
    if (!Body.IsValid() || !Snapshot->TryGetObjectField(TEXT("proposal"), Proposal) ||
        !(*Proposal)->TryGetStringField(TEXT("id"), Id) || !(*Proposal)->TryGetObjectField(TEXT("plan"), Plan) ||
        !(*Plan)->TryGetStringField(TEXT("status"), PlanStatus) || PlanStatus != TEXT("ready"))
    { Status = TEXT("Review a ready proposal first."); return; }
    Body->SetStringField(TEXT("proposalId"), Id);
    Send(TEXT("/accept"), Body);
}

void URelayRuntimeComponent::ExecuteNext()
{
    if (bBusy) { Status = TEXT("Wait for the pending request."); return; }
    auto Body = Guard();
    const TArray<TSharedPtr<FJsonValue>>* Plans = nullptr;
    if (!Body.IsValid() || !Snapshot->TryGetArrayField(TEXT("plans"), Plans)) { Status = TEXT("Read station state first."); return; }
    for (const auto& Value : *Plans)
    {
        if (!Value.IsValid() || Value->Type != EJson::Object) continue;
        const auto Plan = Value->AsObject();
        FString PlanStatus, Id, StepId;
        double IndexValue;
        const TArray<TSharedPtr<FJsonValue>>* StepIds = nullptr;
        if (!Plan.IsValid() || !Plan->TryGetStringField(TEXT("status"), PlanStatus) || PlanStatus != TEXT("active")) continue;
        if (!Plan->TryGetStringField(TEXT("id"), Id) || !Plan->TryGetNumberField(TEXT("nextStep"), IndexValue) ||
            !Plan->TryGetArrayField(TEXT("stepIds"), StepIds) || !FMath::IsFinite(IndexValue) || IndexValue < 0 || IndexValue >= StepIds->Num() || IndexValue != FMath::FloorToInt(IndexValue) ||
            !(*StepIds)[static_cast<int32>(IndexValue)].IsValid() || !(*StepIds)[static_cast<int32>(IndexValue)]->TryGetString(StepId))
        { Status = TEXT("Malformed active plan."); return; }
        Body->SetStringField(TEXT("planId"), Id);
        Body->SetStringField(TEXT("stepId"), StepId);
        LastStepCommand = Body;
        Send(TEXT("/step"), Body);
        return;
    }
    Status = TEXT("Accept a plan before executing.");
}

void URelayRuntimeComponent::RetryLastStep()
{
    if (!LastStepCommand.IsValid()) { Status = TEXT("No previous step command."); return; }
    Send(TEXT("/step"), LastStepCommand);
}

void URelayRuntimeComponent::ResetStation()
{
    auto Body = Guard();
    if (!Body.IsValid()) { Status = TEXT("Read station state first."); return; }
    Send(TEXT("/reset"), Body);
}

void URelayRuntimeComponent::SaveCheckpoint()
{
    if (bBusy || !Snapshot.IsValid()) return;
    Status = FFileHelper::SaveStringToFile(Encode(Snapshot), *CheckpointPath()) ? TEXT("Checkpoint saved locally.") : TEXT("Could not save checkpoint.");
}

void URelayRuntimeComponent::LoadCheckpoint()
{
    if (bBusy) return;
    auto Body = Guard();
    FString Text;
    TSharedPtr<FJsonObject> Checkpoint;
    if (!Body.IsValid() || !FFileHelper::LoadFileToString(Text, *CheckpointPath()) || Text.Len() > 2097152 ||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Checkpoint) || !Checkpoint.IsValid())
    { Status = TEXT("Read host state and save a valid checkpoint first."); return; }
    Body->SetObjectField(TEXT("checkpoint"), Checkpoint);
    Send(TEXT("/load"), Body);
}

void URelayRuntimeComponent::Send(const FString& Path, TSharedPtr<FJsonObject> Payload)
{
    if (bBusy) { Status = TEXT("Wait for the pending request."); return; }
    ActiveRequest = FHttpModule::Get().CreateRequest();
    FString Endpoint = BaseUrl;
    Endpoint.RemoveFromEnd(TEXT("/"));
    ActiveRequest->SetURL(Endpoint + Path);
    ActiveRequest->SetVerb(Payload.IsValid() ? TEXT("POST") : TEXT("GET"));
    ActiveRequest->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    ActiveRequest->SetTimeout(250.0f);
    ActiveRequest->SetDelegateThreadPolicy(EHttpRequestDelegateThreadPolicy::CompleteOnGameThread);
    if (Payload.IsValid()) ActiveRequest->SetContentAsString(Encode(Payload));
    ActiveRequest->OnProcessRequestComplete().BindUObject(this, &URelayRuntimeComponent::Completed);
    bBusy = true;
    Status = Path == TEXT("/propose") ? TEXT("Waiting for a live plan. Nothing has executed.") : TEXT("Waiting for host confirmation.");
    if (!ActiveRequest->ProcessRequest()) { bBusy = false; ActiveRequest.Reset(); Status = TEXT("Could not start HTTP request."); }
}

void URelayRuntimeComponent::Completed(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected)
{
    if (Request != ActiveRequest) return;
    bBusy = false;
    ActiveRequest.Reset();
    if (!bConnected || !Response.IsValid()) { Status = TEXT("Connection failed. Read fresh state before retrying."); return; }
    const FString Text = Response->GetContentAsString();
    TSharedPtr<FJsonObject> Body;
    if (Text.Len() > 2097152 || !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), Body) || !Body.IsValid())
    { Status = TEXT("Invalid JSON response."); return; }
    const TSharedPtr<FJsonObject>* NextSnapshot = nullptr;
    bool bStateChanged = false;
    if (Body->TryGetObjectField(TEXT("snapshot"), NextSnapshot))
    {
        Snapshot = *NextSnapshot;
        SnapshotJson = Encode(Snapshot);
        bStateChanged = true;
    }
    const TSharedPtr<FJsonObject>* Error = nullptr;
    if (Body->TryGetObjectField(TEXT("error"), Error)) Status = Encode(*Error);
    else if (Response->GetResponseCode() >= 400) Status = FString::Printf(TEXT("Host returned HTTP %d"), Response->GetResponseCode());
    else Status = TEXT("Host confirmed. Acceptance alone executes nothing.");
    if (bStateChanged) OnStateChanged.Broadcast(SnapshotJson);
}

void URelayRuntimeComponent::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
    if (ActiveRequest.IsValid())
    {
        ActiveRequest->OnProcessRequestComplete().Unbind();
        ActiveRequest->CancelRequest();
        ActiveRequest.Reset();
    }
    bBusy = false;
    Super::EndPlay(EndPlayReason);
}
