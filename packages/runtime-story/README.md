# Runtime Story SDK

Turn a player's intention into a plan built from mechanics your game already owns. The model proposes actions. Your rules validate them, the player accepts the terms, and the runtime records each completed action.

**Version 0.2.0 · Node.js 22+ · MIT**

Built for the **OpenAI Game Builder Challenge, Track 2: Game Production Tools**. [Watch the one-minute developer demo](https://youtu.be/0kfqFjjUfLY).

## Start here

Clone the repository and install its npm workspaces:

```sh
git clone https://github.com/Cyberlane/runtime-story-sdk.git
cd runtime-story-sdk
npm ci
node docs/integrations/snippets/first-plan.mjs
```

The first example runs without credentials. It verifies a two-action plan, explicit acceptance, exact command retries and checkpoint resume. The package has not been published to npm. Workspaces resolve the import from this checkout.

- [Complete quickstart](https://github.com/Cyberlane/runtime-story-sdk/blob/main/docs/QUICKSTART.md)
- [API reference](https://github.com/Cyberlane/runtime-story-sdk/blob/main/docs/API.md)
- [JavaScript / browser tutorial](https://github.com/Cyberlane/runtime-story-sdk/blob/main/docs/integrations/WEB.md)
- [Godot tutorial](https://github.com/Cyberlane/runtime-story-sdk/blob/main/docs/integrations/GODOT.md)
- [Unity tutorial](https://github.com/Cyberlane/runtime-story-sdk/blob/main/docs/integrations/UNITY.md)
- [Unreal tutorial](https://github.com/Cyberlane/runtime-story-sdk/blob/main/docs/integrations/UNREAL.md)
- [Host and persistence integration](https://github.com/Cyberlane/runtime-story-sdk/blob/main/docs/integrations/HOST.md)

To try it in a separate Node project, run `npm pack --workspace=@off-script/runtime-story` from the repository root. Install the resulting `off-script-runtime-story-0.2.0.tgz` using its actual path. Packing does not publish anything.

## The boundary

```text
Player intention → provider proposal → host simulation → player acceptance
                                                           ↓
                                              one exact accepted step
                                                           ↓
                                             confirmed state + receipt
```

The SDK does not generate executable code or invent mechanics. It cannot guarantee that model text correctly understood the player. Show the interpretation and terms before acceptance, and render completed actions from confirmed state.

```js
import {
  createRegistry,
  createRuntime,
  planIntent,
  RuntimeError,
  PlanningError,
} from "@off-script/runtime-story";
import { StructuredProvider } from "@off-script/runtime-story/providers";
```

## Register your rules

`createRegistry(definition)` takes the following fields:

| Field                                            | Contract                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `id`, `version`                                  | Stable game identity and rule version. Change `version` when reducer or validation behavior changes. |
| `stateSchema`                                    | Strict draft-07 JSON Schema for authoritative game state.                                            |
| `termsSchema`                                    | Schema for the outcomes and constraints the player accepts.                                          |
| `actions`                                        | 1–128 entries with unique `id`, `description`, `parameters` schema and `reduce` callback.            |
| `context(state, history)`                        | Return the facts and rules the provider needs to plan.                                               |
| `validateState(state)`                           | Return `true` or throw. Enforces invariants after every simulated transition.                        |
| `validatePlan({ before, after, plan, history })` | Return `true` or throw. Enforces the full outcome and any commitments carried through history.       |
| `maxSteps`                                       | Maximum steps in one plan. Default 32, allowed range 1–256.                                          |

An action's `reduce(state, arguments, terms, history)` returns `{ state, result }`. Callbacks receive frozen JSON copies and must be synchronous, deterministic and free of external effects. They can run repeatedly during simulation. Do not animate a character, send a message, charge a purchase or write a save from a reducer.

Registries are trusted host code. Freezing input is an immutability safeguard, not a JavaScript sandbox. The contract fingerprint includes declared schemas, descriptions and the rule version. It does not hash callback source.

The registry uses Ajv without coercion, defaults or removal of unexpected properties. The built-in provider requires a supported Structured Outputs schema, including required object properties and `additionalProperties: false`. Use nullable fields instead of optional keys. Array uniqueness is checked by the host and omitted from the provider schema. Unsupported schema composition receives a configuration error before inference. Other provider-specific schema limits may still be rejected by the service. See [OpenAI's supported schema subset](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas).

## Runtime operations

Create the runtime with `createRuntime(registry, initialState)`.

| Operation                                                              | Result                                                                              |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `snapshot()`                                                           | Detached state, branch/revision, proposal, accepted plans, receipts and history.    |
| `context()`                                                            | Registry capabilities, projected state, accepted plans and committed history.       |
| `stage(candidate, { branchId, expectedRevision, intent, provenance })` | Validate and simulate a candidate, then stage it against the exact current context. |
| `accept({ branchId, expectedRevision, proposalId })`                   | Record explicit acceptance. No game effect occurs.                                  |
| `step({ branchId, expectedRevision, planId, stepId })`                 | Revalidate remaining work and commit exactly the next accepted transition.          |
| `change(nextState, { branchId, expectedRevision, reason })`            | Apply a trusted host event, discard a proposal and interrupt active work.           |
| `inspectSave(checkpoint)`                                              | Validate the envelope, adapter, domain state and record links.                      |
| `restore(checkpoint, { branchId, expectedRevision })`                  | Restore state and receipts together and create a new timeline branch.               |

Exact retries of a successful `accept` or `step` command return `replayed: true`. The command must be byte-for-byte equivalent in its field values, including the original revision and IDs. Constructing a new command from fresh state asks for new work. Commands from an abandoned restore branch fail.

Every successful mutation increments the revision. Read fresh state after a stale-context response, then let the player decide again. A new accepted plan supersedes unfinished work. Completed effects stay in state and receipt history. The host's `validatePlan` callback decides which prior commitments remain binding.

`stepCommandSchema` and `acceptCommandSchema` are exported, deeply frozen JSON schemas for client protocol validation. `copyJson` validates and copies finite, acyclic JSON data. It rejects functions, accessors, sparse arrays and non-JSON object types.

## Connect a provider

Use `planIntent(runtime, registry, provider, intent, options)` to call a provider and stage its validated response. It executes no game action.

The injected provider receives `{ intent, context, schema, feedback, requestId, signal }` and returns `{ output, provenance }`. `output` can be a JSON value or JSON text. `provenance` is an optional JSON object. Providers must respect cancellation where possible. Late results cannot stage after a timeout or changed world.

```js
const provider = new StructuredProvider({
  kind: "openai",
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL ?? "gpt-6-astra",
});

// runtime and registry come from your registered host game.
const result = await planIntent(
  runtime,
  registry,
  (request) => provider.generate(request),
  "Restore power while keeping one fuse for the emergency beacon.",
);

// Show result.snapshot.proposal.plan, then wait for player acceptance.
```

Keep credentials on the host. The Responses API adapter sends no tools and requests `store: false`. For untrusted production players, use this API path or an independently isolated provider.

The Codex CLI adapter is a local development convenience using the developer's login. It runs in a temporary directory, requests a read-only sandbox, ignores user configuration, disables shell/search/collaboration/apps/plugins/memory/hooks for that invocation, and rejects reported command, MCP, search or file-change activity. Those safeguards are not a hardened isolation boundary for arbitrary input. Local machine policy and CLI-version compatibility still apply. The current transport flags were checked against Codex CLI 0.153.4.

| Constructor option | Environment alternative | Default                                                     |
| ------------------ | ----------------------- | ----------------------------------------------------------- |
| `kind`             | `MODEL_PROVIDER`        | `openai` when an API key is supplied, otherwise `codex-cli` |
| `apiKey`           | `OPENAI_API_KEY`        | None                                                        |
| `model`            | `OPENAI_MODEL`          | `gpt-6-astra`                                               |
| `binary`           | `CODEX_BIN`             | `codex`                                                     |
| `limit`            | `MODEL_CALL_LIMIT`      | 30 attempted calls per provider instance                    |
| `timeout`          | `MODEL_TIMEOUT_MS`      | 120000 ms per provider call                                 |

Explicit options take precedence over environment variables. Use a model available to your account. The presence of a CLI command or API key does not establish valid authentication or quota. The provider allows two simultaneous calls per instance and does not replenish its call budget automatically. The provider does not load `.env` files itself. The repository’s demo npm start scripts explicitly load the root `.env` when present.

`planIntent` separately accepts `maxAttempts` (default 2, maximum 3), `timeoutMs` (default 120000 per attempt, maximum 300000), `signal` and `onProgress`. Both timeout layers apply. Up to two default attempts can take approximately four minutes in total. A schema/domain rejection, malformed output or explicitly retryable transport error may receive bounded feedback and another attempt. Cancellation, timeout, refusal and ordinary transport errors do not automatically repeat.

Successful results contain `{ snapshot, attempts }`. Failures are `PlanningError` objects with `code`, `message`, `details` and `attempts`. Every correction keeps the rejected output and diagnostics. Progress observers receive detached event data. Their exceptions do not turn a successful stage into failure.

Provenance includes request IDs, timing, model/transport and content hashes for the built-in provider. It is diagnostic metadata, not a signature or proof that the player agreed. Injected providers supply their own claims. Context and attempt records can contain player/game data, so choose retention and access rules before storing them.

## Persistence and production limits

Persist the complete snapshot, including state and receipts. To resume the same authoritative timeline after a process restart:

```js
const runtime = createRuntime(registry, initialState, { checkpoint });
```

Use `restore` for deliberate rollback, which abandons the previous branch. Loading does not ask the model to recreate promises or executed results.

The host must atomically persist state and receipts before acknowledging durable execution. This package provides an in-memory runtime and validated checkpoints. It does not provide a disk store, authentication, multiplayer sessions or distributed transactions. Checkpoints are trusted host data, not anti-cheat signatures. Native asynchronous effects need host-owned coordination and idempotency.

Sessions retain at most 1,000 accepted plans and 10,000 history/receipt entries. Plan inputs allow at most 8,000 characters. Built-in provider prompts are capped at one megabyte, transport responses at two megabytes and proposal output at 512,000 bytes. Keep sessions and projected context small. Whole-campaign compaction, streaming partial plans and parallel step execution are outside this version.

Run package regression tests from the repository root:

```sh
npm test --workspace=@off-script/runtime-story
```

See the [core review](https://github.com/Cyberlane/runtime-story-sdk/blob/main/docs/review/CORE.md) for tested behavior and remaining evidence limits. Historical 0.1.0 demonstration evidence does not by itself verify this 0.2.0 revision.

## License

MIT, copyright 2026 Justin Nel (Cyberlane). See the included [LICENSE](LICENSE). Generated demo artwork and third-party components have their own documented treatment in the repository's notices.
