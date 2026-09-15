using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

// Source example for Unity 6. Requires com.unity.nuget.newtonsoft-json 3.2.2.
// Rules and model credentials belong to the Node host, not this component.
public sealed class RelayStationClient : MonoBehaviour
{
    public string BaseUrl = "http://127.0.0.1:4330";
    public bool ShowExampleControls = true;
    [TextArea] public string Intent = "Survey north and east. Transmit both. Finish with at least 2 battery, at most 2 heat, and at least 2 metal.";
    [TextArea] public string Status = "";
    public JObject Snapshot { get; private set; }
    public bool Busy { get; private set; }
    public event Action<JObject> StateChanged;
    UnityWebRequest activeRequest;
    JObject lastStepCommand;
    Vector2 scroll;
    string CheckpointPath => Path.Combine(Application.persistentDataPath, "relay-checkpoint.json");

    void Start() => Refresh();
    public void Refresh() => Begin("/state", null);
    public void Propose() => Command("/propose", new JObject { ["intent"] = Intent });
    public void ResetStation() => Command("/reset", new JObject());

    public void AcceptProposed()
    {
        var proposal = Snapshot?["proposal"] as JObject;
        var plan = proposal?["plan"] as JObject;
        if (plan?["status"]?.Type != JTokenType.String || plan["status"].Value<string>() != "ready" ||
            proposal?["id"]?.Type != JTokenType.String)
        { Status = "Review a ready proposal first."; return; }
        Command("/accept", new JObject { ["proposalId"] = proposal["id"].DeepClone() });
    }

    public void ExecuteNext()
    {
        if (Busy) { Status = "Wait for the pending request."; return; }
        var plan = (Snapshot?["plans"] as JArray)?.OfType<JObject>()
            .FirstOrDefault(item => item["status"]?.Value<string>() == "active");
        if (plan == null) { Status = "Accept a plan before executing."; return; }
        var steps = plan["stepIds"] as JArray;
        var indexToken = plan["nextStep"];
        if (indexToken?.Type != JTokenType.Integer || steps == null ||
            indexToken.Value<long>() < 0 || indexToken.Value<long>() >= steps.Count ||
            plan["id"]?.Type != JTokenType.String)
        { Status = "Malformed active plan. Read fresh state."; return; }
        var index = indexToken.Value<int>();
        if (steps[index]?.Type != JTokenType.String)
        { Status = "Malformed next step. Read fresh state."; return; }
        lastStepCommand = Guard();
        lastStepCommand["planId"] = plan["id"].DeepClone();
        lastStepCommand["stepId"] = steps[index].DeepClone();
        Begin("/step", (JObject)lastStepCommand.DeepClone());
    }

    // A lost response must retry this command, never a newly computed next step.
    public void RetryLastStep()
    {
        if (lastStepCommand == null) { Status = "No previous step command."; return; }
        Begin("/step", (JObject)lastStepCommand.DeepClone());
    }

    JObject Guard() => new JObject {
        ["branchId"] = Snapshot?["branchId"]?.DeepClone(),
        ["expectedRevision"] = Snapshot?["revision"]?.DeepClone()
    };

    void Command(string path, JObject fields)
    {
        if (Snapshot == null) { Status = "Read station state first."; return; }
        var payload = Guard();
        foreach (var field in fields.Properties()) payload[field.Name] = field.Value.DeepClone();
        Begin(path, payload);
    }

    void Begin(string path, JObject payload)
    {
        if (Busy) { Status = "Wait for the pending request."; return; }
        if (!isActiveAndEnabled) { Status = "Enable the client before making a request."; return; }
        Busy = true;
        Status = path == "/propose" ? "Waiting for a live plan. Nothing has executed." : "Waiting for host confirmation.";
        StartCoroutine(Send(path, payload));
    }

    IEnumerator Send(string path, JObject payload)
    {
        UnityWebRequest request = null;
        UnityWebRequestAsyncOperation operation = null;
        try
        {
            request = new UnityWebRequest(BaseUrl.TrimEnd('/') + path, payload == null ? "GET" : "POST");
            activeRequest = request;
            request.downloadHandler = new DownloadHandlerBuffer();
            request.timeout = 250;
            request.redirectLimit = 0;
            if (payload != null)
            {
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(payload.ToString(Formatting.None)));
                request.SetRequestHeader("Content-Type", "application/json");
            }
            operation = request.SendWebRequest();
        }
        catch (Exception error) { Status = "Could not start request: " + error.Message; }
        if (operation == null)
        {
            request?.Dispose();
            activeRequest = null;
            Busy = false;
            yield break;
        }

        try
        {
            yield return operation;
            try
            {
                if (request.result == UnityWebRequest.Result.ConnectionError || request.result == UnityWebRequest.Result.DataProcessingError)
                    throw new IOException(request.error + ". Read fresh state before retrying.");
                var text = request.downloadHandler.text;
                if (text.Length > 2097152) throw new IOException("Host response exceeds the example's size limit.");
                JObject response;
                using (var reader = new JsonTextReader(new StringReader(text)) { MaxDepth = 64 })
                    response = JObject.Load(reader);
                if (response["snapshot"] is JObject snapshot)
                {
                    Snapshot = (JObject)snapshot.DeepClone();
                    StateChanged?.Invoke((JObject)Snapshot.DeepClone());
                }
                if (response["error"] != null) Status = response["error"].ToString(Formatting.None);
                else if (request.responseCode >= 400) Status = "Host returned HTTP " + request.responseCode;
                else Status = "Host confirmed. Acceptance alone executes nothing.";
            }
            catch (Exception error) { Status = error.Message; }
        }
        finally
        {
            request.Dispose();
            Busy = false;
            activeRequest = null;
        }
    }

    public void SaveCheckpoint()
    {
        if (Busy || Snapshot == null) return;
        try { File.WriteAllText(CheckpointPath, Snapshot.ToString(Formatting.None)); Status = "Checkpoint saved locally."; }
        catch (Exception error) { Status = error.Message; }
    }

    public void LoadCheckpoint()
    {
        if (Busy) return;
        try
        {
            using (var file = File.OpenText(CheckpointPath))
            using (var reader = new JsonTextReader(file) { MaxDepth = 64 })
                Command("/load", new JObject { ["checkpoint"] = JObject.Load(reader) });
        }
        catch (Exception error) { Status = error.Message; }
    }

    void OnDisable()
    {
        activeRequest?.Abort();
        StopAllCoroutines();
        activeRequest?.Dispose();
        activeRequest = null;
        Busy = false;
    }

    // Developer sample controls, not intended as the showcase game's UI.
    void OnGUI()
    {
        if (!ShowExampleControls) return;
        GUILayout.BeginArea(new Rect(20, 20, Mathf.Max(320, Screen.width - 40), Screen.height - 40));
        GUILayout.Label("RELAY STATION · Unity HTTP integration example");
        GUILayout.Label("Survey north/east/west, choose what to transmit, and specify reserves.");
        var previousEnabled = GUI.enabled;
        GUI.enabled = previousEnabled && !Busy;
        Intent = GUILayout.TextArea(Intent, GUILayout.Height(70));
        GUILayout.BeginHorizontal();
        if (GUILayout.Button("Read state")) Refresh();
        if (GUILayout.Button("Generate live plan")) Propose();
        if (GUILayout.Button("Accept")) AcceptProposed();
        if (GUILayout.Button("Execute next")) ExecuteNext();
        if (GUILayout.Button("Retry exact step")) RetryLastStep();
        GUILayout.EndHorizontal();
        GUILayout.BeginHorizontal();
        if (GUILayout.Button("Save checkpoint")) SaveCheckpoint();
        if (GUILayout.Button("Restore checkpoint")) LoadCheckpoint();
        if (GUILayout.Button("Reset station")) ResetStation();
        GUILayout.EndHorizontal();
        GUI.enabled = previousEnabled;
        GUILayout.Label(Status);
        scroll = GUILayout.BeginScrollView(scroll);
        GUILayout.TextArea(Snapshot?.ToString(Formatting.Indented) ?? "No confirmed snapshot.");
        GUILayout.EndScrollView();
        GUILayout.EndArea();
    }
}
