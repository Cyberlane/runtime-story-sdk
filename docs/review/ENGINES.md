# Engine integration review

Reviewed **September 15, 2026**, for Runtime Story SDK **0.2.0**. This record distinguishes native execution from source review. It does not certify every engine, export target or production deployment.

## Files reviewed

Every line of these engine sources and project files was examined:

- `examples/relay-station/index.html`
- `examples/relay-station/godot/client.gd`
- `examples/relay-station/godot/main.gd`
- `examples/relay-station/godot/main.tscn`
- `examples/relay-station/godot/project.godot`
- `examples/relay-station/godot/smoke.gd`
- `examples/relay-station/godot/test-host.mjs`
- `examples/relay-station/unity/RelayStationClient.cs`
- `examples/relay-station/unreal/RelayRuntimeComponent.h`
- `examples/relay-station/unreal/RelayRuntimeComponent.cpp`
- `docs/integrations/snippets/generator.mjs`
- `docs/integrations/snippets/first-plan.mjs`
- `docs/integrations/snippets/live-plan.mjs`

Godot UID files contain resource identities rather than executable code. The prior `verify_completed.gd` depended on an unpublished retained checkpoint and was replaced in this public repository by a repeatable isolated smoke test. The original research workspace was preserved.

The Relay Station host, adapter and public SDK API were cross-checked to verify routes, guard fields, return shapes, resource rules and provider settings used by the guides. The quickstart, host guide, JavaScript guide and all three native engine tutorials were checked against those implementations. The root README, API, architecture and limitations were independently read for command and capability consistency.

## Changes from the source prototype

Godot now retains the exact last execution payload and provides an explicit retry method/button. Execution validates the next-step index before indexing a response. Snapshot notifications and response assignment use detached deep copies, so an observer cannot silently corrupt the client's retained state. The scene includes a concrete starting objective. A deterministic host fixture and native script make acceptance, execution and checkpoint behavior reproducible without credentials.

Unity now validates active-plan indices and step IDs before dereferencing them. Disabling the component aborts its request, stops the coroutine and clears its busy state. Requests cannot start on a disabled component. The intent field includes the same starting objective. A second reviewer found two further Unity error paths: a missing proposal ID and request-start exceptions. Acceptance now validates the ID, setup failures release the busy state, request lifetime has an outer `finally`, and the sample preserves the incoming IMGUI enabled state. Unreal now checks the selected step's JSON pointer before dereferencing it. The existing exact-command retry and request-lifecycle logic were reviewed in both native source examples.

The tutorials now explain installation from the root workspace, provider configuration, the first expected state, complete client setup, player review, registered mechanics, exact command execution, checkpoint rollback, interrupted plans and failure recovery. Unity setup names its Newtonsoft dependency. Unreal setup covers module dependencies, Header Tool, the ActorComponent and concrete UMG wiring. Unsupported build/export claims and stale references to the private 0.1.0 tarball were removed.

## Executed checks

| Check                                                   | Result                                                                                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node docs/integrations/snippets/first-plan.mjs`        | Passed. Two actions, acceptance without effects, exact retry without duplicate effects, checkpoint resume.                                                                   |
| `node --check docs/integrations/snippets/live-plan.mjs` | Passed JavaScript syntax. This review did not perform a fresh live inference call for this tutorial.                                                                         |
| Godot project import using `--headless --editor --quit` | Passed with Godot `4.6.2.stable.official.71f334935` on macOS.                                                                                                                |
| Godot `smoke.gd` against the actual Node sample host    | Passed. Eleven accepted actions, exact retries, unchanged acceptance resources, checkpoint restoration, old-branch rejection, detached event copy, malformed-index handling. |
| `npm test --workspace=@runtime-story/off-script`        | 44 passed during independent review of the migration from legacy lifecycle helpers to the shared runtime.                                                                    |

The native command was:

```sh
/Applications/Godot.app/Contents/MacOS/Godot --headless \
  --path examples/relay-station/godot --script smoke.gd
```

The separate test process was started with `node examples/relay-station/godot/test-host.mjs`. It binds to `127.0.0.1:4339` and injects an explicitly labelled authored provider fixture. The success line was:

```text
GODOT_SMOKE_OK {"acceptanceHasNoEffects":true,"engine":"4.6.2-stable (official)","exactRetry":true,"oldBranchRejected":true,"receipts":11,"restore":true}
```

Follow the [Godot tutorial](../integrations/GODOT.md#7-run-the-native-protocol-test) to reproduce this check. The test resets its target station. It does not represent fresh model output, independent player feedback or a graphical quality review.

## Browser follow-up

The entire Relay Station HTML, CSS and script was reviewed. The old UI could display a new proposal while its Execute button still targeted a hidden older accepted plan. Proposed and accepted plans now have separate labelled panels. The browser records the exact last step command and exposes an explicit retry control, plus a refresh control for reconciliation. Initial commands remain disabled until state arrives. Requests have a bounded timeout, structured and string errors are handled, unexpected snapshot shapes are rejected, and local-storage read/write/JSON errors are visible. Completed steps have a text label as well as a color. Input labels, status/alert regions, section headings, keyboard focus and a public tutorial link are present.

The actual Chrome client was exercised against the isolated authored-fixture host. Proposal and acceptance preserved resources. Eleven actions completed with the expected final resources. Exact retry preserved the receipt count. Saving after one step, executing another, restoring, and retrying the abandoned command produced the expected old-branch error. Refresh recovered from a stopped/restarted host. Proposed and accepted panels were simultaneously visible when a second candidate existed. A screenshot was inspected for readable layout and the normal flow produced no browser console warnings/errors. A deliberately stopped host produced the expected network failure message, with refresh still available. The final validation change was reloaded and acceptance, execution and exact retry were rerun successfully.

Browser storage-denial/corruption paths and malformed host payload paths were source reviewed, not injected into the browser. No fresh model inference was made for this UI verification. The later browser and Unity follow-up was manually reviewed rather than rerunning the structural scan below.

## Structural review

Mori `0.32.0`, revision `79d0bcfda514`, was run from the existing PATH binary with the repository `.gitignore` respected. No project-specific Mori configuration was added or bypassed. The bounded scan before the final Unity lifecycle and browser follow-up used:

```sh
mori scan --comparison-domain code --cross-language-only \
  --require-coverage --threshold 0.65 --min-tokens 40 \
  --format agent --output /tmp/runtime-story-engines-mori-final.json \
  examples/relay-station/godot examples/relay-station/unity \
  examples/relay-station/unreal docs/integrations/snippets
```

It analyzed 10 supported source files, compared 138 candidate pairs and reported zero match groups or location pairs. Output was not truncated. Seven files contributed comparison fragments. The two terminal tutorial scripts had no fragments above the 40-token floor. The Unreal `.h` file was selected as C, reported 32 parse diagnostics and contributed no fragments. There was one parser warning. `.godot`, `.tscn` and `.uid` are outside this parser's source-language coverage and were inspected directly.

Zero reported similarity groups is not evidence of zero duplication, semantic correctness or complete parser coverage. The thin clients intentionally express the same HTTP protocol in their engine languages. Their separate implementations are appropriate because request lifecycle, JSON handling and UI conventions differ.

## Remaining engine checks

Unity and Unreal were not installed in the review environment. Their examples have **not** passed a native compile, Header Tool/Blueprint build, Play mode test or exported desktop build here. Each guide includes those required target acceptance steps. Desktop Godot evidence does not validate Godot web/mobile/console exports. The new live terminal tutorial has not made a fresh model request in this review.

The clients render an authoritative JSON simulation and communicate with a single loopback host. They do not provide authentication, per-player hosting, crash-durable storage or an asynchronous native physics acknowledgement protocol. Unity and Unreal response size checks occur after buffering, unlike Godot's HTTPRequest body limit. Refer to [deployment boundaries](../KNOWN-LIMITATIONS.md) before adapting the example to public users.

## Primary references

The following API documentation was consulted during the September 15 review:

- [Godot 4.6 HTTPRequest](https://docs.godotengine.org/en/4.6/classes/class_httprequest.html), for request completion, serialization, timeouts and response-body limits.
- [Unity 6 UnityWebRequest timeout](https://docs.unity3d.com/6000.0/Documentation/ScriptReference/Networking.UnityWebRequest-timeout.html), for the timeout property.
- [Unity Newtonsoft JSON package](https://docs.unity3d.com/Packages/com.unity.nuget.newtonsoft-json@3.2/manual/index.html), for the JSON dependency.
- [Unreal HTTP delegate thread policy](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/HTTP/EHttpRequestDelegateThreadPolicy), for game-thread completion.
- [OpenAI authentication](https://learn.chatgpt.com/docs/auth), for Codex login and the trusted-local automation boundary.

Documentation corroborates API intent. It does not substitute for the unperformed Unity and Unreal builds.
