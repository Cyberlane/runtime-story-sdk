# Deployment boundaries

Reviewed September 15, 2026. Version 0.2.0 is a tested competition SDK and a starting point for integration. A shipped game needs additional host infrastructure.

| Area          | Included                                                                          | Your production host must supply                                                          |
| ------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Mechanics     | Registered JSON schemas, pure reducers, whole-plan simulation and step validation | All actual game rules, permission rules and meaningful context                            |
| Player review | Explicit proposal, terms and acceptance                                           | UX that communicates costs and consequences accurately                                    |
| Execution     | Exact command receipts and same-branch idempotency                                | Reconciliation for asynchronous physics, external services or economic effects            |
| Storage       | Complete checkpoints containing state, plans, receipts and history                | Atomic persistence before durable acknowledgement, backups, migration and recovery policy |
| Sessions      | One in-memory session per local demo host                                         | Authentication, per-player isolation, authorization, rate limits and monitoring           |
| Saves         | Schema/domain and record-link validation                                          | Trusted storage, signatures if needed, and anti-cheat controls                            |
| Providers     | Server-side Codex CLI and Responses API transports                                | Secret management, quotas, cost policy, account permissions and provider isolation        |

Reducers and validators are synchronous. They can be called repeatedly on speculative state, so they must not write files, call native physics, award real purchases or send network requests. Native clients animate already-confirmed state. A distributed effect acknowledgement/compensation protocol is outside this release.

The Codex CLI provider is for **trusted local development**. It launches a local process in a temporary workspace with tools/features restricted, but it is not a security boundary for hostile player prompts and must not be treated as one. Use the Responses API transport or an independently isolated provider for untrusted users. Neither provider can guarantee correct interpretation. Valid output must still satisfy host constraints, and the player must review the proposed terms.

The runtime supports bounded JSON state, 1–128 actions, up to 256 steps per plan, up to 1,000 accepted plans and up to 10,000 history/receipt entries. Games must manage context growth and session lifetime. Provider calls have configurable limits and timeouts. The Emberwake manual-control retry cache retains its most recent 200 commands in memory; planned-action receipts are part of the SDK checkpoint.

Godot 4.6.2 has native smoke-test evidence. Unity and Unreal integrations are source reviewed, with explicit setup instructions, but were not compiled in their engines during this review. Direct Responses API behavior is tested with mocked responses; live authenticated Codex inference has been exercised. The public website hosts presentation only.

The three-case comparison is small: the SDK, deterministic planner and equal-information model reference all passed. It establishes a working integration workflow, not an accuracy advantage, measured developer-hours saving or comprehensive benchmark. Independent human playtesting and deployment at production scale have not been performed.
