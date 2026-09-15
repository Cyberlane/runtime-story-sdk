# Off Script

A narrative negotiation demo using the shared Runtime Story SDK. Help Ivo disclose selected evidence, preserve privacy promises and find safety when the warehouse closes for the night.

From the repository root:

```sh
npm ci
npm run demo:off-script
```

Open **http://127.0.0.1:4320/play**. Follow the opening conversation, inspect the evidence and ask for an agreement. A live provider is required to interpret intentions. Configure it using the [quickstart](../../docs/QUICKSTART.md). The host never silently substitutes prerecorded plans.

The browser offers the warehouse scenario with illustrated characters, procedural audio, explicit acceptance, action-by-action play and checkpoints in browser storage. Five additional data scenarios exercise the same mechanics in tests and through the `reset` API. They do not have separate illustrated browser presentations.

| Location                     | Purpose                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `src/engine.mjs`             | Canonical game rules: copying evidence, disclosure, permission, movement and shelter |
| `src/scenarios.mjs`          | Six authored scenarios, facts and NPC policy                                         |
| `src/off-script-adapter.mjs` | Schemas, reducers, state invariants and SDK registration                             |
| `src/runtime-api.mjs`        | Guarded runtime commands and browser-state projection                                |
| `server.mjs`                 | Same-origin loopback host and selected static assets                                 |
| `public/`                    | Story UI, scene renderer, procedural sound and artwork                               |

`GET /api/runtime/state` returns the current projected world. Mutations use `expectedBranchId` and `expectedRevision`. Accept adds `proposalId`; step/play-step adds exact `planId` and `stepId`. `play-step` applies the authored curfew atomically with the delivery that triggers it. `GET /api/runtime/save` returns the SDK checkpoint. Loading creates a new branch.

The domain rules contain no second planning/acceptance/save engine. The SDK owns that lifecycle, including in presentation tests. Previous protected facts remain binding across all accepted plans and are shown cumulatively in the browser projection.

This is a local single-session demo. Read [deployment boundaries](../../docs/KNOWN-LIMITATIONS.md) before using its host design beyond development.
