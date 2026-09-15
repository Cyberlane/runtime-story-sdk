# Host, protocol and save rules

All engine tutorials use [Relay Station's Node host](../../examples/relay-station/server.mjs) and [game adapter](../../examples/relay-station/game.mjs). Read this once, then follow your engine guide. The host is a loopback, single-session learning example. Its networking policy and storage are deliberately narrower than a deployed game service.

## Who owns what

```text
Player enters an intention
        |
Engine UI sends intent + current branch/revision
        |
Node host projects game state and registered capabilities
        |
OpenAI proposes supported actions and terms
        |
SDK validates and simulates using your pure reducers
        |
Player reviews and accepts the valid proposal
        |
Host executes an exact accepted step, returns state + receipt
        |
Engine renders the confirmed result
```

The **game adapter** owns allowed actions, resource rules, success conditions and truth. The **SDK** owns proposal validation, acceptance, revision guards, receipts and checkpoint consistency. The **engine** owns presentation and player input. The **model** interprets intent and composes a candidate from supported mechanics. Model descriptions and dialogue do not establish facts.

Reducers run both during speculative validation and actual execution. They must be synchronous, deterministic and free of side effects. Do not call engine physics, charge a player, write a database row, send a network message or play an effect from a reducer. Return a new JSON state and a JSON result instead. Animate only after the confirmed response. Games in which native physics decides success need an additional acknowledgement and reconciliation protocol. That integration is outside this release.

## Provider configuration

Set these in the shell **before starting the Node host**. They are environment variables, not URL parameters and not client settings.

| Variable             | Default                                                    | Purpose                                                                                                                |
| -------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `MODEL_PROVIDER`     | `openai` if `OPENAI_API_KEY` exists, otherwise `codex-cli` | Select the direct Responses adapter or authenticated Codex CLI. Set explicitly to avoid accidental provider selection. |
| `OPENAI_MODEL`       | `gpt-6-astra`                                              | Model used for planning. Choose one your account can access and verify its structured output support.                  |
| `OPENAI_API_KEY`     | Unset                                                      | Required only by the direct Responses transport. Keep it server-side.                                                  |
| `CODEX_BIN`          | `codex`                                                    | Codex executable path when not on the host's PATH.                                                                     |
| `MODEL_TIMEOUT_MS`   | `120000`                                                   | Per-call timeout in milliseconds.                                                                                      |
| `MODEL_CALL_LIMIT`   | `30`                                                       | Maximum provider calls per process, including correction attempts.                                                     |
| `PORT`               | `4330` for Relay Station                                   | Loopback host port.                                                                                                    |
| `RELAY_CHECKPOINT`   | Unset                                                      | Trusted JSON checkpoint file to resume at startup.                                                                     |
| `RELAY_EVIDENCE_DIR` | Unset                                                      | Optional private directory for retained planning attempts.                                                             |

`planIntent` separately limits each planning attempt to 120 seconds by default, with at most two attempts. The demo hosts retain that limit, so increasing only `MODEL_TIMEOUT_MS` does not extend their planning deadline. The native clients allow 250 seconds for a complete request.

The demo start commands also load an optional repository-root `.env` file through Node. Copy `.env.example` to `.env`, edit it locally and keep it out of Git. Environment variables already set in the process take precedence. Directly running an arbitrary `.mjs` file does not load `.env` unless you pass Node's `--env-file-if-exists=.env` flag. Keep model/player logs out of public commits. Codex authentication and model availability are documented by [OpenAI](https://learn.chatgpt.com/docs/auth). The Codex path has local live evidence. Direct Responses has mocked transport tests only. Use the API adapter or another appropriately isolated provider for a remotely deployed service, after authentication, authorization and budget controls are implemented. Do not expose the development Codex process to untrusted public clients.

## Read state before issuing commands

`GET /state` returns an envelope:

```json
{
  "protocol": "runtime-story-example-v1",
  "snapshot": {
    "branchId": "generated-session-branch",
    "revision": 0,
    "state": {},
    "proposal": null,
    "plans": [],
    "receipts": [],
    "history": []
  },
  "provider": {},
  "planning": false,
  "progress": null
}
```

This illustration omits other checkpoint metadata. Preserve the **whole actual snapshot** when saving. `state` is the game's JSON state. Never infer branch, revision, proposal, plan or step IDs from this illustration. Copy them from your host's current response.

Use `Content-Type: application/json` on POST requests. Every mutation carries `branchId` and `expectedRevision` from the latest snapshot:

| Request             | Extra JSON fields   | Effect                                                       |
| ------------------- | ------------------- | ------------------------------------------------------------ |
| `GET /capabilities` | None                | Registered action schemas and game contract.                 |
| `GET /save`         | None                | Raw checkpoint. This response has no outer `snapshot` field. |
| `POST /propose`     | `intent` string     | Generate and stage a validated candidate. Executes nothing.  |
| `POST /accept`      | `proposalId`        | Accept the displayed ready proposal. Executes nothing.       |
| `POST /step`        | `planId`, `stepId`  | Execute that exact accepted step.                            |
| `POST /load`        | `checkpoint` object | Restore a validated save onto a new branch.                  |
| `POST /reset`       | None                | Start a new station and branch.                              |

Successful POSTs contain the refreshed state envelope. `/accept` also includes `acceptance`. `/step` includes `execution: { receipt, snapshot, replayed }`. The top-level `snapshot` is the view to render. Most domain failures include `error: { code, message, attempts }` and a reconciled snapshot. Early HTTP rejections may contain a string error instead. Clients should display both forms.

## Exact execution and retries

Find the accepted plan with `status === 'active'`. Its `stepIds[nextStep]` identifies the next supported action. Record the complete command **before** sending it:

```js
const command = {
  branchId: snapshot.branchId,
  expectedRevision: snapshot.revision,
  planId: activePlan.id,
  stepId: activePlan.stepIds[activePlan.nextStep],
};
```

If the response is lost, resend this exact object or fetch state and reconcile receipts. Repeating an already committed command in the current branch returns its recorded receipt with `replayed: true`. It does not spend resources again. Do not calculate a new `nextStep` for a network retry. After a restore, the old branch command fails even if its effect existed in the saved timeline.

Disable command controls while a request is pending. That improves the UI but does not replace server revision checks. Multiple windows still share one station. A 409 response means stale or conflicting context. Read fresh state, render the changed world and have the player reconsider. Do not silently rebase the player's command.

## Replanning after a world change

The trusted host can call:

```js
const before = runtime.snapshot();
runtime.change(nextGameState, {
  branchId: before.branchId,
  expectedRevision: before.revision,
  reason: "The crossing collapsed.",
});
```

The host validates `nextGameState`, invalidates the pending proposal and interrupts unfinished work. Send the player's revised intention through `planIntent` and present the new proposal for acceptance. Completed effects and receipt history remain. In Relay Station, `/propose` can plan from its current resources and completed surveys. Terms describe the **entire final set**, including prior surveys/transmissions. A later accepted plan supersedes unfinished work. The sample exposes no arbitrary `/change` HTTP route. Add narrowly authorized game events rather than exposing arbitrary state replacement.

## Checkpoints and process restarts

An explicit checkpoint is the entire `runtime.snapshot()`, including accepted terms, adapter metadata, branch/revision, plans, receipts and history. The engine controls save timing and stores the JSON locally. `/load` validates it and creates a new branch, preserving already completed effects without another model call.

To resume the same timeline after a **host process restart**, start Relay Station with `RELAY_CHECKPOINT` set to a trusted saved snapshot file. The host validates it at startup and preserves its branch and receipts. This is distinct from player-requested rollback, which creates a new branch.

These examples do not automatically persist every command. A crash loses work after the last explicit checkpoint. For durable execution, the authoritative service must persist state and receipts atomically before acknowledging success. Client-controlled saves are not proof against cheating. Authorize and validate every save on your own host.

## Before connecting a public game

Plan and implement per-player sessions, authentication, ownership checks, TLS, request rate and spend limits, safe log retention, durable storage and provider isolation. Test process crashes and uncertain network outcomes. The sample host binds to `127.0.0.1` and intentionally has none of those remote-service guarantees. Desktop loopback tests do not validate browser exports, console networking or mobile builds.
