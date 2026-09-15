# SDK and Relay Station review

Reviewed September 15, 2026 for the public 0.2.0 repository. This report describes source inspection and deterministic checks. It does not certify every deployment or future integration as production safe.

## Coverage

All 17 JavaScript files in this scope were read, including their callers within the owned modules and their tests:

| Area                               | Files reviewed                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| SDK entry point and implementation | `packages/runtime-story/src/index.mjs`, `registry.mjs`, `runtime.mjs`, `planning.mjs`, `provider.mjs`                         |
| SDK fixtures and regression tests  | `packages/runtime-story/test/fixtures.mjs`, `registry.test.mjs`, `runtime.test.mjs`, `planning.test.mjs`, `provider.test.mjs` |
| Relay domain and host              | `examples/relay-station/game.mjs`, `server.mjs`                                                                               |
| Deterministic comparison           | `examples/relay-station/comparison/form-planner.mjs`, `run.mjs`, plus `cases.json`                                            |
| Relay tests                        | `examples/relay-station/test/game.test.mjs`, `server.test.mjs`, `form-planner.test.mjs`                                       |

The package manifest, included MIT license, exports and package README were also reviewed and updated. The original 0.1.0 source and historical proof remain separate from this checkout. Off Script, Emberwake, native engine clients, site code and the Relay browser page have separate review owners.

## Findings addressed

1. **Exported protocol schemas could be mutated.** Deep freezing prevents a consumer from weakening validation in runtimes created later. A regression attempts nested-property and required-field mutation, then checks that malformed acceptance still fails.
2. **Checkpoint validation could accept orphaned history.** Removing both accepted plans and their receipts left acceptance/execution events without corresponding records. Validation now requires those links in both directions. It also checks accepted intent, executed action and staged status against the event, and rejects unknown event types. Restore remains atomic on failure.
3. **Provider text limits applied after allocation/parsing.** Responses bodies and CLI answer files now have bounded reads. Transport output is limited to two megabytes and proposal text to 512,000 bytes. Invalid transport shapes fail with actionable errors, and concurrency slots are released after failures.
4. **CLI output decoding could split UTF-8 characters.** Bounded byte chunks are decoded together. The executable transport fixture deliberately splits Japanese text between chunks and verifies intact provenance.
5. **CLI inference inherited unnecessary capabilities.** Its invocation disables documented shell, search, collaboration, apps, plugins, memory and hook capabilities while retaining read-only sandboxing and ignored user config. Reported tool execution is rejected. A zero exit status alone is insufficient: the process must also report a completed turn. These controls reduce the local helper's exposure but do not establish a security sandbox for untrusted players.
6. **Provider configuration and error reporting had gaps.** Model and executable values are checked early. Explicit host-only API credentials can be supplied without changing process-global environment and are stored in a private field. Provider timeouts have a distinct code. `PlanningError` reports its own error name. Non-Error values thrown by trusted callbacks remain host rejection errors.
7. **Optional evidence writes could turn a successful stage into apparent failure.** Relay now returns the authoritative snapshot with an explicit `evidenceWarning` if its diagnostic file cannot be written. A logging failure also preserves the original provider error. Evidence filenames use independent IDs and exclusive creation.
8. **Reset/load left unnecessary inference running.** Relay cancels pending work on these operations and on client disconnect. A regression resets during an unresolved provider call, confirms cancellation and confirms a late response cannot populate the fresh session.
9. **HTTP and initial-state details were weak.** Relay accepts the exact JSON media type, preserves loopback/origin checks, loads its page before sending headers and freezes initial collection values. Tests exercise foreign origins, a forged Host header, invalid media types and malformed JSON without state mutation.
10. **The comparison runner referenced the old private archive.** New runs fingerprint the current SDK source and retain evidence under ignored `.runtime/developer-value/`. Live comparison uses the configured provider/model instead of hardcoding the historical transport. The deterministic search remains separate from model planning.

The owned source was formatted consistently. Comments explaining authority, cancellation, simulation and evidence limits were retained. No generic plugin layer, persistence abstraction or speculative engine framework was added.

## Public API and authority review

The public package exports `createRegistry`, `createRuntime`, `planIntent`, `RuntimeError`, `PlanningError`, `copyJson`, `stepCommandSchema` and `acceptCommandSchema`. The `/providers` entry exports `StructuredProvider` and `providerSchema`. The recursive freezing helper is internal and is not in the package export map.

Staging and acceptance spend no game resources. Execution re-simulates the remaining accepted plan before committing one transition. Exact command retries return existing receipts. A deliberate restore creates a new branch, while a host-process checkpoint resume preserves the branch and retry identity. Reducers receive detached frozen JSON and remain trusted, synchronous host callbacks.

Provenance is recorded diagnostic data. Built-in provider hashes and IDs are not signatures, and an injected provider can claim its own provenance. Player acceptance and actual execution are represented separately. A valid schema and successful simulation do not prove that a model correctly understood an ambiguous intention. The player must review the proposed terms.

## Verification

Executed locally on macOS with Node.js 26.5.0:

```sh
npm test --workspace=@off-script/runtime-story
npm test --workspace=@runtime-story/relay-station
node examples/relay-station/comparison/run.mjs
npm pack --workspace=@off-script/runtime-story --dry-run --json
```

- **SDK: 37 tests passed**, including real child-process transport fixtures and mocked Responses API responses. The four executable-script transport tests are POSIX fixtures and explicitly skip on Windows.
- **Relay: 8 tests passed**, covering domain resources, checkpoint resume, HTTP rejection, evidence failure and cancellation.
- **Deterministic comparison: all 3 authored cases passed.** The two feasible objectives produced valid 12-step and 7-step plans. The mandatory metal-reserve conflict was exhausted without a plan. No live model call was made by this check.
- **Package preview: 8 files**, consisting of the five source modules, package manifest, README and MIT license. Tests, generated evidence, environment files and demo assets are excluded from the package.
- Files in this scope were formatted with the repository's pinned Prettier version.

The lead reviewer owns the final repository-wide Mori scan and independent review. This scoped report does not claim structural-similarity coverage from a scan that was not performed here. The available binary was verified as `mori 0.32.0` before handing off that scan.

## Current evidence limits

- The new transport flags were checked against local Codex CLI **0.153.4**, its command/feature help and the current [configuration reference](https://developers.openai.com/codex/config-reference/). The hosted schema boundary was checked against [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas).
- This scoped review did not make a fresh live Codex or Responses API request. Historical 0.1.0 live evidence and 0.2.0 mocked/fixture transport tests are distinct. Any later integrated live test should be recorded separately.
- Node 22 is the declared minimum. These local checks ran under Node 26, so the lead's minimum-version CI check is separate evidence.
- The CLI helper uses a developer's authenticated local environment. Use the Responses API transport or an independently isolated provider for untrusted production traffic.
- The runtime is in memory. Durable state-and-receipt storage, authentication, multiplayer session isolation, quotas across processes, distributed exactly-once side effects and anti-cheat are host responsibilities.
- Checkpoints are trusted host data. Structural links and state hashes detect specified corruption, not intentional forgery. Historical world-change states are not independently replayed during load.
- The finite goal-search comparison is internal benchmark code for three authored objectives. It is not evidence of universal optimal planning, measured developer hours saved or model superiority.
- Engine builds, browser usability, audiovisual quality and external submission acceptance are outside this report's scope.
