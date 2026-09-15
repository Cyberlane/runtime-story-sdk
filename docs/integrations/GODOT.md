# Godot 4.6 tutorial

Run the included native scene, complete a small resource-management plan, then connect the same client to your own game. **Godot 4.6.2 on macOS has been executed for this release.** The [repeatable smoke test](#7-run-the-native-protocol-test) covers acceptance, execution, retries, restore and stale branches. Godot exports to other platforms remain unverified.

## 1. Install and start the host

Install [Godot 4.6](https://godotengine.org/download/), Node 22.12+ and Git. Clone this repository and run `npm ci` at its root using the [Quickstart](../QUICKSTART.md). Keep the complete repository together. There is no GDExtension, .NET dependency or separate SDK archive.

In a terminal at the repository root:

```sh
npm run demo:relay-station
```

Leave that process running. First open `http://127.0.0.1:4330` in a browser to confirm the host responds. Set up the [host provider](HOST.md#provider-configuration) before generating a live plan. Merely connecting does not use a model.

## 2. Open the supplied Godot project

1. Launch the Godot Project Manager.
2. Click **Import** and choose `examples/relay-station/godot/project.godot`.
3. Import and edit the project using Godot 4.6. Do not import the repository root as a Godot project.
4. Press **F6** to run the current scene or **F5** to run the project. The main scene is `main.tscn`.
5. Confirm that the station shows battery **5**, heat **0**, metal **6**, kits **0**, and damaged scanner/radio on a fresh host.

If you used the browser to change this station, the native client will show that same state. Both are views of the single host session. Use **Reset station** for a new start.

You can also launch with a Godot executable on PATH:

```sh
godot --path examples/relay-station/godot
```

On macOS with Godot in Applications:

```sh
/Applications/Godot.app/Contents/MacOS/Godot --path examples/relay-station/godot
```

For another port, set `PORT` on the Node host and `RELAY_URL` on the process launching Godot. For example, `PORT=4335 npm run demo:relay-station` and `RELAY_URL=http://127.0.0.1:4335 godot --path examples/relay-station/godot` on macOS/Linux. Environment variables set in a terminal are not automatically inherited by an already-open editor. The [client's](../../examples/relay-station/godot/client.gd) `base_url` is also editable in code.

## 3. Generate and execute a live plan

The text box includes a starting request:

> Survey north and east. Transmit both. Finish with at least 2 battery, at most 2 heat, and at least 2 metal.

1. Click **Generate live plan**. Controls disable while the host is working. Resources do not change.
2. Review **Agreed outcome** and each action. An unsupported or clarification response has no executable plan.
3. Click **Accept plan**. Resources should still be unchanged.
4. Click **Execute next action**. Now a confirmed action changes resources.
5. Continue until complete. The exact sequence can vary, but a valid plan must satisfy the accepted final sets and reserves.
6. Click **Retry exact step** after an execution. The prior receipt is replayed, so resource totals do not change again.

The client displays native controls and host results. This learning scene is separate from the cinematic Emberwake demo.

## 4. Add the client to your own Godot game

Copy [client.gd](../../examples/relay-station/godot/client.gd) into `res://runtime_story/client.gd` in your Godot project. Keep the Node host running separately. Attach this complete script to a Node in a scene:

```gdscript
extends Node

const RelayClient = preload("res://runtime_story/client.gd")
var client: Node

func _ready() -> void:
    client = RelayClient.new()
    add_child(client)
    client.state_changed.connect(render_state)
    await refresh()

func refresh() -> void:
    report(await client.send_api("/state"))

func propose(text: String) -> void:
    report(await client.command("/propose", {"intent": text}))

func accept_displayed_plan() -> void:
    var proposal: Variant = client.snapshot.get("proposal")
    if proposal == null or proposal.plan.status != "ready":
        print("Review a ready proposal first.")
        return
    report(await client.command("/accept", {"proposalId": proposal.id}))

func execute_next() -> void:
    report(await client.execute_next())

func retry_exact_step() -> void:
    report(await client.retry_last_step())

func render_state(snapshot: Dictionary) -> void:
    print("Confirmed state: ", snapshot.state)
    if snapshot.get("proposal") != null:
        print("Proposal to review: ", snapshot.proposal.plan)

func report(response: Dictionary) -> void:
    if response.has("error"):
        print("Request failed: ", response.error)
```

Wire your own controls to `propose`, `accept_displayed_plan` and `execute_next`. Do not call acceptance automatically on proposal arrival. Connect `client.busy_changed` to disable relevant controls. Replace `print` with your resource display and proposal review UI. `state_changed` passes a detached snapshot copy.

To integrate your own mechanics, edit the Node adapter, not this transport. Follow [registering game mechanics](WEB.md#2-understand-the-game-adapter). Keep registered reducers pure because the host simulates them before acceptance. Animate confirmed receipts in Godot. Do not perform a native collision or physics operation during speculative planning and call it confirmed.

The client uses Godot's [HTTPRequest](https://docs.godotengine.org/en/4.6/classes/class_httprequest.html), with one active request, a 250-second timeout, a 2 MiB response-body limit and redirects disabled. These settings are for the local example. They do not establish a remote server's trust or make arbitrary payloads valid game state.

## 5. Save, restore and revise

**Save checkpoint** writes the complete host snapshot to `user://relay-checkpoint.json`. Godot resolves `user://` to the project's writable user-data directory. **Restore checkpoint** reads that file and asks the host to validate it. Restoration preserves accepted terms, completed effects and receipts but creates a new branch. An exact step command saved before that rollback must now fail as `STALE_BRANCH`.

A host restart starts fresh unless you supply a trusted checkpoint using `RELAY_CHECKPOINT`. That startup path resumes the same timeline. Explicit saving is not automatic durable storage. See [checkpoint rules](HOST.md#checkpoints-and-process-restarts).

For a revised objective, read current state and generate a new plan that respects what has already happened. Accepting it supersedes unfinished work. For external world events, implement a trusted host operation using `runtime.change`, then request a new proposal. [Replanning](HOST.md#replanning-after-a-world-change) explains why the client never submits arbitrary replacement state.

## 6. Recover from failures

Display `response.error` and render any reconciled snapshot. A timeout does not prove that an action failed to execute. Click **Retry exact step**, or **Read current state** to reconcile. Never use **Execute next action** as a transport retry because it derives a new action from whatever state is currently loaded.

If the host cannot be reached, check its terminal, the port, and the exact `127.0.0.1` address. If planning fails, check provider login and quota on the Node host. A stale response means another client changed the same session or a save was restored. Refresh and review. Failed responses must not trigger success animations.

## 7. Run the native protocol test

This is a deterministic test, requires no model credentials and uses a separate port. It resets its target station. Keep it separate from a demo you want to preserve.

Terminal A, from the repository root:

```sh
node examples/relay-station/godot/test-host.mjs
```

Terminal B, from the same repository root:

```sh
godot --headless --path examples/relay-station/godot --script smoke.gd
```

Use the full Godot executable path shown above if `godot` is not on PATH. With no `RELAY_URL` set, the script targets the test host at `http://127.0.0.1:4339`. If you have a custom environment, explicitly set `RELAY_URL` to that test address. Expect `GODOT_SMOKE_OK` and exit code 0.

The test verifies that accepting spends nothing, all 11 fixture actions execute, exact retries do not apply twice, a checkpoint restores onto a new branch, old commands fail and the final resources match. It exercises the **actual Godot HTTP/JSON client against the actual Node host**, using an authored provider fixture. It does not claim fresh model inference, visual quality, a native Godot SDK or exported-platform compatibility. Stop the test host with Ctrl+C when done. [Review evidence](../review/ENGINES.md) records the tested engine version.
