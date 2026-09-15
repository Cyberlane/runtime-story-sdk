# Unity 6 tutorial

Connect a desktop Unity scene to the same authoritative Node host used by the browser and Godot examples. **This C# component is source reviewed, but has not been compiled or run in Unity for this release.** Follow the acceptance steps below in your own Unity project before relying on it. It is a copyable sample component, not a UPM package or a native C# port of the SDK.

## 1. Prepare the host and Unity project

You need Unity 6 with desktop build support, Node 22.12+ and this repository. Complete the [Quickstart installation](../QUICKSTART.md#1-install-the-repository). In a terminal at the repository root, run:

```sh
npm run demo:relay-station
```

Keep it running. Check `http://127.0.0.1:4330` in a browser. Configure [the host provider](HOST.md#provider-configuration) before requesting a live plan. The Unity project must never contain your API key or Codex credentials.

Create or open a Unity 6 desktop project. A 2D or 3D template works because this example uses IMGUI for simple controls. In **Window → Package Manager**, choose the add/install package by name option and enter:

```text
com.unity.nuget.newtonsoft-json
```

Use package version `3.2.2`. Alternatively, merge this entry into the existing `dependencies` object in `Packages/manifest.json`:

```json
"com.unity.nuget.newtonsoft-json": "3.2.2"
```

Do not replace the whole manifest or discard existing dependencies. Unity's [Newtonsoft package guide](https://docs.unity3d.com/Packages/com.unity.nuget.newtonsoft-json@3.2/manual/index.html) documents the package. This sample uses `JObject` and `JArray` because snapshots contain dynamic game-defined schemas.

## 2. Install the component

1. Create `Assets/RuntimeStoryExample/` in your Unity project.
2. Copy [RelayStationClient.cs](../../examples/relay-station/unity/RelayStationClient.cs) into it. Keep the filename unchanged.
3. Wait for Unity to compile the script. Resolve Console errors before entering Play mode.
4. Create an empty GameObject named `Runtime Story Host Client`.
5. Add the **Relay Station Client** component through **Add Component** or by dragging the script onto the object.
6. Leave **Base Url** as `http://127.0.0.1:4330` and **Show Example Controls** checked.
7. Enter Play mode. The Game view should show station controls, status and a JSON snapshot.
8. On a fresh station, confirm battery 5, heat 0, metal 6 and kits 0 in `state`.

The default `Assembly-CSharp` setup requires no assembly definition. If your project uses `.asmdef` files with restricted references, add the Newtonsoft assembly reference supplied by the installed package and allow Unity engine references. The component also uses `UnityEngine.Networking`. Resolve references using your actual project assembly layout rather than inventing a package name.

The component uses [UnityWebRequest](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Networking.UnityWebRequest.html), coroutines and JSON POST bodies. It serializes requests, has a 250-second timeout and disables redirects. Its JSON size check happens after the response is buffered. Treat it as a local sample guard, not a streaming download limit.

## 3. Complete a plan in Play mode

The intent field includes:

> Survey north and east. Transmit both. Finish with at least 2 battery, at most 2 heat, and at least 2 metal.

Click **Generate live plan**, then read `proposal.plan`, its terms and all actions in the JSON view. Click **Accept** only after reviewing a ready plan. Confirm that resources are still unchanged. Click **Execute next** one action at a time. Now `state` and `receipts` change. Click **Retry exact step** and confirm that the same action does not apply again.

If the result is `unsupported` or `needs_context`, show that response and ask the player to refine the request. There is nothing to accept or execute. If a network/provider error occurs, show `Status` and reconcile before continuing.

## 4. Replace the sample controls with your UI

Uncheck **Show Example Controls**. Connect your own buttons to the public component methods:

| Player action                        | Method                                  |
| ------------------------------------ | --------------------------------------- |
| Initial connection or reconciliation | `Refresh()`                             |
| Submit the editable `Intent` field   | `Propose()`                             |
| Agree to the displayed ready plan    | `AcceptProposed()`                      |
| Perform one accepted action          | `ExecuteNext()`                         |
| Retry a lost step response           | `RetryLastStep()`                       |
| Save / roll back                     | `SaveCheckpoint()` / `LoadCheckpoint()` |
| Start a fresh station                | `ResetStation()`                        |

Use `Busy` to disable command controls and `Status` to display errors. Subscribe to `StateChanged` to render confirmed state. For example, save the following complete script as `Assets/RuntimeStoryExample/StationView.cs`, add it to another GameObject and assign the client object in its Inspector field:

```csharp
using Newtonsoft.Json.Linq;
using UnityEngine;

public sealed class StationView : MonoBehaviour
{
    [SerializeField] private RelayStationClient client;

    private void OnEnable()
    {
        if (client != null) client.StateChanged += Render;
    }

    private void OnDisable()
    {
        if (client != null) client.StateChanged -= Render;
    }

    private void Render(JObject snapshot)
    {
        var battery = snapshot["state"]?["battery"]?.Value<int>();
        Debug.Log("Confirmed battery: " + battery);
    }
}
```

Replace the log with your UI binding. `StateChanged` provides a detached JSON copy. Use the current `Snapshot` for proposal review and command identity. The component keeps the exact last step payload for retry and cancels a pending request when disabled.

## 5. Connect your own game rules

The SDK and rules execute in Node, not inside `Update` or a MonoBehaviour. Replace [game.mjs](../../examples/relay-station/game.mjs) using the [registration tutorial](WEB.md#2-understand-the-game-adapter). Define your state schema, terms, supported actions and pure reducers there. Keep Unity as the player-input and rendering layer.

The adapter's `validateState` checks every intermediate state. `validatePlan` checks the agreed outcome. The SDK simulates before staging and revalidates before each committed action. Do not instantiate GameObjects, run a physics raycast or modify a Unity inventory during this speculative simulation. Animate a confirmed result only after the host commits it. Native-physics success requires an acknowledgement/reconciliation design beyond this sample.

## 6. Save, replan and recover

`SaveCheckpoint()` writes the complete snapshot to `Application.persistentDataPath/relay-checkpoint.json`. `LoadCheckpoint()` sends it to the host, which validates it and creates a new branch. Unity's [persistentDataPath documentation](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Application-persistentDataPath.html) explains platform-specific locations. The host does not automatically write each command to disk. [Host checkpoint rules](HOST.md#checkpoints-and-process-restarts) explain same-timeline startup and durability limits.

On a lost response, call `RetryLastStep()` to resend the stored command or call `Refresh()` to reconcile. Do not call `ExecuteNext()` as the retry. Old branch commands fail after restore. A stale error means the current player decision needs fresh state. For interrupted plans, implement a trusted host world event and follow [replanning](HOST.md#replanning-after-a-world-change). Do not give Unity permission to replace arbitrary authoritative state.

## 7. Validate your Unity target

Before calling this integration working in your project:

1. Compile in your exact Unity 6 version and confirm no Console errors.
2. Enter Play mode, connect, generate, review, accept and execute a complete plan.
3. Verify that proposal/acceptance change no resources and exact retry changes no resources twice.
4. Save partway through, execute, restore, and verify preserved terms and the new branch.
5. Stop the Node host, attempt refresh, restart it, then reconcile the displayed state.
6. Disable/re-enable the client while a request is pending and check that controls recover.
7. Build and run your actual desktop target. Check platform networking rules before attempting mobile or browser exports.

Unity was not installed in the review environment, so those steps remain required. The source review and separately executed Godot path are recorded in [engine review](../review/ENGINES.md). No WebGL, console or mobile export compatibility is claimed.
