# Runtime Story 0.2.0 API

Node.js 22.12+ is required. The SDK is MIT licensed and included as a workspace. Run `npm ci` at the repository root to use it in the demos. To install it in another host:

```sh
npm pack --workspace=@off-script/runtime-story
# Run in your own Node project's directory, using the actual tarball path:
npm install /path/to/off-script-runtime-story-0.2.0.tgz
```

```js
import {
  createRegistry,
  createRuntime,
  planIntent,
  RuntimeError,
} from "@off-script/runtime-story";
import { StructuredProvider } from "@off-script/runtime-story/providers";
```

## Register a game

`createRegistry({ id, version, stateSchema, termsSchema, actions, context, validateState, validatePlan, maxSteps })`

| Field                                          | Contract                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `id`, `version`                                | Stable nonempty game/rules identity. Bump the rule version when callback semantics change. |
| `stateSchema`                                  | Strict draft-07 JSON Schema for authoritative game state.                                  |
| `termsSchema`                                  | Schema for the outcome and constraints a player accepts.                                   |
| `actions`                                      | 1–128 definitions, each with unique `id`, description, parameter schema and reducer.       |
| `reduce(state, arguments, terms, history)`     | Pure synchronous callback returning `{ state, result }`. Inputs are frozen copies.         |
| `context(state, history)`                      | JSON facts and rule explanations needed by the planner.                                    |
| `validateState(state)`                         | Return `true` or throw. Called on intermediate states as well as endpoints.                |
| `validatePlan({before, after, plan, history})` | Return `true` or throw. Enforce success and accepted domain constraints.                   |
| `maxSteps`                                     | Integer 1–256, default 32.                                                                 |

Use strict object schemas with all properties required and `additionalProperties:false` for the provider wire format. Represent optional fields with nullable schemas. Host-only uniqueness checks remain enforced even where the provider schema omits them. Schemas validate shape, not the player's intended meaning. The player must inspect the proposed terms.

The complete six-action [Relay Station adapter](../examples/relay-station/game.mjs) is the adoption example. It defines resources and domain rules in one file, independently of the warehouse game.

## Plan, review, accept, execute

```js
const runtime = createRuntime(registry, initialState);
const provider = new StructuredProvider();
await planIntent(
  runtime,
  registry,
  (request) => provider.generate(request),
  intent,
);
const proposalSnapshot = runtime.snapshot();
// UI now presents proposalSnapshot.proposal.plan. Wait for explicit acceptance.
const accepted = runtime.accept({
  branchId: proposalSnapshot.branchId,
  expectedRevision: proposalSnapshot.revision,
  proposalId: proposalSnapshot.proposal.id,
});
const current = runtime.snapshot();
const command = {
  branchId: current.branchId,
  expectedRevision: current.revision,
  planId: accepted.plan.id,
  stepId: accepted.plan.stepIds[accepted.plan.nextStep],
};
const result = runtime.step(command);
// Render result.snapshot.state and animate result.receipt.result.
// If the response is lost, retry this exact command, not a newly computed next step.
```

Unsupported and needs-context plans cannot be accepted. Their question/interpretation should be shown to the player. A valid plan uses status `ready`, non-null game terms, and steps with `action`, `arguments`, `description`. Do not execute the description as code or treat it as a completed event.

`planIntent(..., options)` supports `maxAttempts` (default 2), `timeoutMs` (default 120000 per attempt), `signal` and `onProgress`. Malformed output and domain rejection can prompt a bounded correction. Ordinary transport failure, cancellation and timeout do not silently trigger a second call. Attempts/provenance are returned or attached to `PlanningError.attempts`. One runtime cannot plan concurrently. Stale captured context is rejected.

A custom provider callback receives `{intent, context, schema, feedback, requestId, signal}` and returns `{output, provenance}`. Output may be JSON text or a JSON value. A provider must respect cancellation and keep credentials outside clients. The supplied provider supports authenticated Codex CLI and the Responses API. The CLI is a trusted local convenience with live test evidence. Direct Responses support has transport tests with mocked responses; this checkout has not made a live API-key request. See the [provider boundary](KNOWN-LIMITATIONS.md).

## Runtime operations

| Method                                                               | Effect / result                                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `snapshot()`                                                         | Detached full envelope: adapter, branch/revision, state, proposal, plans, receipts and history. |
| `context()`                                                          | Detached planning projection.                                                                   |
| `stage(candidate, {branchId, expectedRevision, intent, provenance})` | Validates a non-model or model candidate and stages it. Returns snapshot, no domain effects.    |
| `accept({branchId, expectedRevision, proposalId})`                   | Returns `{plan, snapshot, replayed}`. No domain effects.                                        |
| `step({branchId, expectedRevision, planId, stepId})`                 | Commits one exact step, returns `{receipt, snapshot, replayed}`.                                |
| `change(nextState, {branchId, expectedRevision, reason})`            | Trusted host-only event, interrupts active work. Returns snapshot.                              |
| `inspectSave(checkpoint)`                                            | Validates adapter, state and history/receipt links. Returns detached validated checkpoint.      |
| `restore(checkpoint, {branchId, expectedRevision})`                  | Creates a new branch and discards a staged proposal. Returns snapshot.                          |
| `createRuntime(registry, initialState, {checkpoint})`                | Validated same-timeline host restart from an explicit trusted checkpoint.                       |

An exact acceptance or step retry is idempotent on its current branch. A different command with an old revision is stale. A restored branch rejects old commands even if their step was once valid. Keep state and receipts together when saving. Hashes are integrity metadata, not signatures or anti-cheat.

## Failure handling

Catch errors and inspect `code`, `message`, `details`, and planning `attempts`. `STALE_BRANCH`/`STALE_REVISION` require reading fresh state and reconsidering the request. `SCHEMA_REJECTED`/`HOST_REJECTED` explain malformed input or a game rule failure. `NOT_EXECUTABLE` means clarification/unsupported output. `WRONG_STEP`/`INACTIVE_PLAN` mean the client must reconcile to current accepted work. `INVALID_SAVE`/`INVALID_ENVELOPE` must not become an unchecked load. `ASYNC_CALLBACK` means a reducer or validator violates the synchronous contract.

The station [HTTP host contract](../examples/relay-station/README.md#http-integration-boundary) is the concrete engine transport example. It uses guarded JSON commands and explicit snapshot/error responses. HTTP paths are host-owned, not magic package globals.

See [architecture](ARCHITECTURE.md) and [limitations](KNOWN-LIMITATIONS.md) before production adoption.
