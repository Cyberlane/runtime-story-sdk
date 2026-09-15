#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Interfaces/IHttpRequest.h"
#include "RelayRuntimeComponent.generated.h"

class FJsonObject;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FRelayStateChanged, const FString&, SnapshotJson);

// Source example for an Unreal Engine C++ project. No model credentials here.
UCLASS(ClassGroup=(RuntimeStory), meta=(BlueprintSpawnableComponent))
class URelayRuntimeComponent : public UActorComponent
{
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Runtime Story")
    FString BaseUrl = TEXT("http://127.0.0.1:4330");
    UPROPERTY(BlueprintReadOnly, Category="Runtime Story")
    FString SnapshotJson;
    UPROPERTY(BlueprintReadOnly, Category="Runtime Story")
    FString Status;
    UPROPERTY(BlueprintReadOnly, Category="Runtime Story")
    bool bBusy = false;
    UPROPERTY(BlueprintAssignable, Category="Runtime Story")
    FRelayStateChanged OnStateChanged;

    UFUNCTION(BlueprintCallable, Category="Runtime Story") void Refresh();
    UFUNCTION(BlueprintCallable, Category="Runtime Story") void Propose(const FString& Intent);
    UFUNCTION(BlueprintCallable, Category="Runtime Story") void AcceptProposed();
    UFUNCTION(BlueprintCallable, Category="Runtime Story") void ExecuteNext();
    UFUNCTION(BlueprintCallable, Category="Runtime Story") void RetryLastStep();
    UFUNCTION(BlueprintCallable, Category="Runtime Story") void SaveCheckpoint();
    UFUNCTION(BlueprintCallable, Category="Runtime Story") void LoadCheckpoint();
    UFUNCTION(BlueprintCallable, Category="Runtime Story") void ResetStation();

protected:
    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
private:
    TSharedPtr<FJsonObject> Snapshot;
    TSharedPtr<FJsonObject> LastStepCommand;
    FHttpRequestPtr ActiveRequest;
    TSharedPtr<FJsonObject> Guard() const;
    void Send(const FString& Path, TSharedPtr<FJsonObject> Payload = nullptr);
    void Completed(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bConnected);
};
