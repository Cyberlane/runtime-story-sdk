# Unreal Engine 5.5+ tutorial

Add an ActorComponent that sends guarded JSON commands to the same Node host as the browser and Godot demos. **The supplied C++ source was reviewed against Epic's APIs but has not been built or run in Unreal for this release.** This is a source example for a C++ game module, not an installed Unreal plugin or native port of the SDK.

## 1. Prepare the host and C++ project

You need Unreal Engine 5.5 or newer, its supported platform compiler, Node 22.12+ and this repository. Complete [Quickstart installation](../QUICKSTART.md#1-install-the-repository), then start the host from the repository root:

```sh
npm run demo:relay-station
```

Keep that terminal running. Check `http://127.0.0.1:4330` in a browser. Configure the [host provider](HOST.md#provider-configuration) before requesting a live plan. Keep all credentials in the Node environment.

Create or open an Unreal **C++** desktop project. For an existing Blueprint-only project, add a C++ class using Unreal's class wizard first so the editor creates a source module and build files. Confirm that your unmodified project builds before adding this example.

## 2. Add the component and module dependencies

Copy these files into `Source/YourModule/`, where `YourModule` is the actual module directory in your project:

- [RelayRuntimeComponent.h](../../examples/relay-station/unreal/RelayRuntimeComponent.h)
- [RelayRuntimeComponent.cpp](../../examples/relay-station/unreal/RelayRuntimeComponent.cpp)

Keep their filenames and `#include "RelayRuntimeComponent.generated.h"` unchanged. That include must remain the last include in the header. Unreal Header Tool creates the generated file during a real editor build. Do not create it manually.

Open `Source/YourModule/YourModule.Build.cs`. Add `HTTP` and `Json` to the existing public dependency list, preserving your project's other entries:

```csharp
PublicDependencyModuleNames.AddRange(new string[] {
    "Core", "CoreUObject", "Engine", "HTTP", "Json"
});
```

If `Core`, `CoreUObject` or `Engine` are already listed, retain one entry for each. `HTTP` is public because the component header exposes HTTP request types. The class has no project-specific API export macro, so it can live in the same game module as its consumers. For use across C++ module boundaries, add **your actual module's export macro** before `URelayRuntimeComponent`, as you would for another exported class in your project.

Build your project's Editor target through the normal IDE/build workflow. Resolve C++ and Unreal Header Tool errors before continuing. Epic's [HTTP module](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/HTTP), [JSON object API](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Json/Dom/FJsonObject) and [delegate thread policy](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/HTTP/EHttpRequestDelegateThreadPolicy) document the underlying interfaces. The component requests completion on the game thread so Blueprint events are not emitted from an HTTP worker callback.

## 3. Put the component in a level

1. Create an Actor Blueprint named `BP_RuntimeStoryHost`.
2. Open it and add **Relay Runtime Component** in the Components panel.
3. Select that component and leave **Base Url** as `http://127.0.0.1:4330`.
4. Compile and save the Blueprint, then place one instance in your level.
5. Enter Play In Editor. The component's `BeginPlay` calls `Refresh()`.
6. While playing, inspect the placed actor's component. `SnapshotJson` should contain the host's state and `Status` should confirm a response.

On a fresh host, `state` has battery 5, heat 0, metal 6 and kits 0. If you already changed the browser's station, Unreal sees that same shared session. There is only one station per host process.

## 4. Build the minimal Blueprint controls

The component implements transport and command identity. It deliberately does not impose a UMG layout. To make the first result explicit:

1. Create a Widget Blueprint named `WBP_RuntimeStory`.
2. Add a multiline editable text box for the intention, a text block for status, a scroll box containing a multiline text block for the snapshot, and seven buttons: **Read**, **Propose**, **Accept**, **Execute**, **Retry exact step**, **Save**, **Restore**.
3. Add a widget variable named `Runtime`, typed as **Relay Runtime Component Object Reference**. Mark it **Instance Editable** and **Expose on Spawn**.
4. In `BP_RuntimeStoryHost`'s Event Graph, use **Event BeginPlay → Create Widget (WBP_RuntimeStory)**. Pass the actor's Relay Runtime Component into the exposed `Runtime` input, then call **Add to Viewport** on the returned widget.
5. In each widget button's **OnClicked** event, call the matching method on the `Runtime` variable using the table below. For Propose, read the text box and convert Text to String.
6. On the widget's **Event Construct**, bind an event to `Runtime.OnStateChanged`. Set the snapshot text block from the event's `SnapshotJson` string.
7. Also populate that text block from `Runtime.SnapshotJson` on construction, because the first response might have arrived before binding.
8. Bind the status text to `Runtime.Status`. Disable mutating controls when `Runtime.bBusy` is true. For the first developer UI, property bindings are sufficient. Your production UI can use its own presentation/view-model approach.
9. Enable mouse input for this test widget using the Player Controller's **Set Show Mouse Cursor** and **Set Input Mode Game And UI** nodes.
10. Compile both Blueprints, save the level and enter Play In Editor.

| Button           | Component function | What to expect                                                  |
| ---------------- | ------------------ | --------------------------------------------------------------- |
| Read             | `Refresh`          | Fresh `SnapshotJson` and state event                            |
| Propose          | `Propose(Intent)`  | A validated candidate or a non-executable result                |
| Accept           | `AcceptProposed`   | Acceptance recorded, resources unchanged                        |
| Execute          | `ExecuteNext`      | One exact accepted action applied                               |
| Retry exact step | `RetryLastStep`    | Previously sent command replayed, never an inferred next action |
| Save             | `SaveCheckpoint`   | Snapshot written to the project's Saved directory               |
| Restore          | `LoadCheckpoint`   | Validated rollback onto a new branch                            |

`ResetStation` is also exposed if you add a reset button. A polished game should parse the relevant `state` and proposal fields in C++, expose typed values to Blueprint and use its own UI. The raw JSON panel exists to make the first integration inspectable without an extra JSON Blueprint plugin.

## 5. Try the whole plan lifecycle

Enter this intention:

> Survey north and east. Transmit both. Finish with at least 2 battery, at most 2 heat, and at least 2 metal.

Click **Propose** and wait. Review `proposal.plan.terms` and `proposal.plan.steps`. Click **Accept** only if the proposal is ready and you agree. Confirm that resources did not change. Click **Execute** one step at a time. Resources and receipt count should change only now.

After a step, click **Retry exact step**. Confirm that receipt count and resource values are unchanged. Save partway through, execute again, then restore. Check that the saved resources return, completed receipts are retained and the branch changes. Retry the pre-restore command and verify that the host rejects the old branch.

Do not assume a particular generated action count. A valid plan can vary while satisfying the same declared terms. The deterministic test in the Godot guide has a fixed 11-step sequence, but it is a protocol fixture rather than a promised model response.

## 6. Supply your own game mechanics

The reusable SDK and canonical simulation execute in Node. Replace [Relay Station's adapter](../../examples/relay-station/game.mjs) using [the registration tutorial](WEB.md#2-understand-the-game-adapter). Declare action schemas, pure reducers, state/terms schemas, a context projection, invariants and final conditions.

The model interprets the intention using those mechanics. The host checks and simulates the candidate. Unreal renders confirmed results and handles player acceptance. Do not spawn an Actor, run native physics, trigger an external service or mutate inventory while the host is speculatively simulating a proposal. If Unreal physics is authoritative for success, design an acknowledgement and reconciliation adapter before using this model. This sample does not implement one.

For an interrupted world, the trusted host applies a validated `runtime.change`, then requests a revised plan. Completed work remains recorded. See [replanning](HOST.md#replanning-after-a-world-change). The HTTP client does not have permission to overwrite arbitrary game state.

## 7. Files, lifecycle and failure behavior

Checkpoints are written to `FPaths::ProjectSavedDir()/relay-checkpoint.json`. They contain the complete SDK snapshot. The host validates a loaded checkpoint, preserves accepted terms and completed effects, and creates a fresh branch. Explicit save is not automatic crash durability. A trusted startup checkpoint can instead resume a host timeline as described in [host saves](HOST.md#checkpoints-and-process-restarts).

The component retains its exact last step JSON for uncertain network outcomes. It rejects concurrent requests locally, reports start/connection/HTTP/JSON errors in `Status`, reconciles returned snapshots and unbinds/cancels active requests during `EndPlay`. JSON size checks happen after the HTTP response is buffered. Remote exposure needs additional controls.

A failed response must not trigger success effects. After stale context, refresh and review. After a lost step response, refresh or retry the original exact command. Recomputing the next action is a new decision, not a retry. Keep model text as text when rendering it. Never treat it as code or authoritative state.

## 8. Required target acceptance

Unreal was not installed in the review environment. Before shipping this component, complete a clean C++/Header Tool build, Blueprint compilation, Play In Editor lifecycle, exact retry, rollback, stale command rejection, host disconnect/reconnect and actor destruction during a request. Build and run your actual desktop target afterward. Networking policies and behavior on consoles, mobile devices and other engine versions are unverified. [Engine review](../review/ENGINES.md) records source coverage without presenting it as native execution.
