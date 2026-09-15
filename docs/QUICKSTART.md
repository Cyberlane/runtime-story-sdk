# Your first working plan

Start with the offline example to see exactly what the runtime guarantees. Then connect a live provider and a game engine. This repository was built for the **OpenAI Game Builder Challenge, Track 2: Game Production Tools**. [Watch the one-minute developer demo](https://youtu.be/iSmP1_tJRds).

## 1. Install the repository

You need Git and **Node.js 22.12 or newer**, including npm. These commands work from a terminal on macOS, Linux, or Windows with Git installed:

```sh
git clone https://github.com/Cyberlane/runtime-story-sdk.git
cd runtime-story-sdk
node --version
npm ci
```

Run `npm ci` **once at the repository root**. npm workspaces link `@off-script/runtime-story` to `packages/runtime-story`. There is no npm registry installation step and no separately downloaded SDK archive is required. Keep the terminal in this directory for every command below.

## 2. Execute a plan without an account or API key

```sh
node docs/integrations/snippets/first-plan.mjs
```

Expected result:

```text
{ event: 'generator_repaired' }
{ event: 'power_changed', on: true }
Verified: accepted terms, two executed actions, exact retries, and checkpoint resume.
```

Read [the complete executable example](integrations/snippets/first-plan.mjs) and its [game adapter](integrations/snippets/generator.mjs). It registers two mechanics: repair a generator using one fuse, then switch on its power. It stages a fixed candidate, accepts it, executes two actions, repeats each exact command and resumes the saved session. Assertions check that proposal and acceptance spend nothing, each command takes effect once, and resume preserves the checkpoint.

This example uses an **authored candidate**, so it tests the runtime without claiming AI inference. [The JavaScript tutorial](integrations/WEB.md) explains every part and shows the provider call that replaces the fixed candidate.

## 3. Open a game

Choose one command. Each starts a Node server and keeps that terminal occupied until you press Ctrl+C.

| Command                      | Open in your browser         | What it demonstrates                                 |
| ---------------------------- | ---------------------------- | ---------------------------------------------------- |
| `npm run demo:emberwake`     | `http://127.0.0.1:4340`      | RPG actions, promises and an interrupted journey     |
| `npm run demo:off-script`    | `http://127.0.0.1:4320/play` | Negotiation, information boundaries and consequences |
| `npm run demo:relay-station` | `http://127.0.0.1:4330`      | Small adapter suited to learning the engine protocol |

Use the exact `127.0.0.1` address. The sample hosts deliberately accept loopback requests and reject foreign origins. The graphical Pages site is a static showcase. It does not host these Node processes.

Opening a demo does not require inference. Its **Generate live plan** action does. Configure a provider before using that action.

## Configure a live provider

For the locally verified development path, install the [Codex CLI](https://learn.chatgpt.com/docs/codex/cli), then authenticate:

```sh
codex login
codex login status
```

Start Relay Station explicitly using that provider. macOS/Linux:

```sh
MODEL_PROVIDER=codex-cli npm run demo:relay-station
```

PowerShell:

```powershell
$env:MODEL_PROVIDER = "codex-cli"
npm run demo:relay-station
```

The sample defaults to `gpt-6-astra`. Set `OPENAI_MODEL` on the host if your account uses another supported model. Model access and quota depend on your account. [OpenAI's authentication guide](https://learn.chatgpt.com/docs/auth) explains login and account boundaries.

For the direct Responses API adapter, put `OPENAI_API_KEY` in the **host process environment**, set `MODEL_PROVIDER=openai`, and start the same command. Never put credentials in an engine project or browser bundle. The demo commands load an optional repository-root `.env` file. Copy `.env.example` to `.env` for local configuration, and keep it out of Git. Environment variables already set in your shell take precedence. Direct Responses transport has automated mocked tests but has not been verified against a live account in this project. See [host configuration](integrations/HOST.md#provider-configuration) for all settings and the deployment boundary.

## 5. Get your first live result

In Relay Station, type:

> Survey north and east. Transmit both. Finish with at least 2 battery, at most 2 heat, and at least 2 metal.

1. Click **Generate live plan** and wait for the host to finish.
2. Read the proposed terms and each supported action. A valid plan may use a different sequence from our fixture.
3. Click **Accept this plan**. Confirm that the resources are unchanged.
4. Click **Execute next action** one action at a time. Resources now change and receipts accumulate.
5. Save a checkpoint partway through, execute another action, then restore it. Confirm that you return to the saved resources on a new branch.

An `unsupported` or `needs_context` result is a valid non-executable response. Edit your request or answer its question. A provider error is a failed request, never a completed action.

## 6. Connect your engine

| Start here                                    | Integration shape                                   | Verification level                           |
| --------------------------------------------- | --------------------------------------------------- | -------------------------------------------- |
| [JavaScript and browser](integrations/WEB.md) | Import SDK on Node, call your host from the browser | Executable repository examples               |
| [Godot 4.6](integrations/GODOT.md)            | Included GDScript scene and HTTP client             | Native Godot 4.6.2 smoke test                |
| [Unity 6](integrations/UNITY.md)              | Copy one C# component into a desktop project        | Source reviewed, engine build still required |
| [Unreal Engine 5.5+](integrations/UNREAL.md)  | Copy a C++ ActorComponent into your module          | Source reviewed, engine build still required |

All three native engines connect to the same Node host. The SDK is JavaScript running on that host. It is not a C#/C++/GDScript library that directly controls your scene or physics. Your adapter registers a deterministic JSON simulation, and the engine displays confirmed outcomes. The [host guide](integrations/HOST.md) explains exact command identity, replanning, saving and remote deployment work.

## Troubleshooting the first run

| Symptom                                                | Check                                                                                                                        |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `ERR_MODULE_NOT_FOUND` for `@off-script/runtime-story` | Run `npm ci` from the repository root using Node 22.12+.                                                                     |
| Browser or engine cannot connect                       | Keep the host terminal running. Use the exact printed `127.0.0.1` URL and port.                                              |
| `EADDRINUSE`                                           | Another process owns that port. Stop the process you started or set a different `PORT`. Match the client URL to it.          |
| Codex executable missing                               | Install Codex CLI, confirm `codex --version`, or set `CODEX_BIN` to its executable path on the host.                         |
| Authentication, quota or model error                   | Check `codex login status`, selected provider and `OPENAI_MODEL`. Provider labels alone do not prove access.                 |
| Stale branch/revision                                  | Another client changed the same station or you restored a checkpoint. Refresh state and review before issuing a new command. |
| Lost step response                                     | Retry the exact command, or refresh to reconcile. Do not recompute the next step as a network retry.                         |

For the current scope and repeatable checks, read [engine review](review/ENGINES.md) and the [package API](../packages/runtime-story/README.md).
