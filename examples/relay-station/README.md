# Relay Station integration example

A deliberately small resource-management game that consumes the installed Runtime Story package. Its mechanics are charging, cooling, fabrication, subsystem repair, surveying and radio transmission. It contains no warehouse, evidence-document, shelter, character-consent or night/morning rules.

From this directory, run `npm ci`, `npm test` and `npm start`. Open `http://127.0.0.1:4330`. Node 22+ and a configured provider are required. The default uses the authenticated Codex CLI, or `OPENAI_API_KEY` with the Responses API when set. Credentials belong only on the server. No key is supplied to the browser or engine client. For a different port, set `PORT`. To retain every inference attempt, set `RELAY_EVIDENCE_DIR` to a private directory.

`game.mjs` defines six registered actions, JSON state/terms schemas, a planning context and deterministic constraints. All resource limits apply at every step. Metal and repair kits are conserved. Surveys require a repaired scanner. Transmissions require a repaired radio and an existing survey. The final survey and transmission sets must exactly match the accepted terms. The model cannot create a new operation.

Write your own objective, review the generated terms and action sequence, accept and execute one action at a time. The view shows confirmed resource values and which surveys remain local. An accepted plan alone changes no resources. Save and restore a checkpoint through the controls. Reset creates a fresh station.

## HTTP integration boundary

This is a game-owned sample host, not a production multi-user service. It binds only to loopback, rejects foreign Host/Origin values and accepts JSON commands. Only one station exists per process. Engines render the same authoritative state as the browser.

- `GET /state`: protocol identifier, snapshot, provider metadata and planning status.
- `GET /capabilities`: registered action schemas and domain contract.
- `GET /save`: raw validated SDK checkpoint.
- `POST /propose`: `{ branchId, expectedRevision, intent }`. Returns a validated candidate or explicit unsupported/needs-context result.
- `POST /accept`: `{ branchId, expectedRevision, proposalId }`. Records acceptance without execution.
- `POST /step`: `{ branchId, expectedRevision, planId, stepId }`. Executes that exact step. Repeating the identical command returns its recorded receipt, even after later steps.
- `POST /load`: `{ branchId, expectedRevision, checkpoint }`. Validates the save and creates a fresh branch.
- `POST /reset`: `{ branchId, expectedRevision }`. Starts a fresh station.

Read `snapshot.plans` for an active plan and use `stepIds[nextStep]` in the next command. Do not send an unguarded generic “next” request. After a lost response, resend the exact command or read state. After a stale error, read state and ask the player to reconsider. Do not silently rebase a different action.

Responses contain `snapshot` and optional `error: { code, message, attempts }`. On failures the view reconciles to returned host state. HTTP 409 means stale/concurrent context. Schema/domain/provider failures use HTTP 400. A needs-context or unsupported model result is an ordinary successful planning response with no executable steps.

Checkpoints include terms, plans, receipts and canonical game state. The browser stores an explicit checkpoint in localStorage. Restarting the server starts fresh. There is no automatic durable disk store, account system, remote authentication or native physics integration. These are deliberate example limits. This host does not prove production deployment suitability.

The deterministic test sequence is a regression fixture only. The live planner receives capabilities, context and intent, not the test's action sequence. Current installation and live-provider evidence are recorded in the [public release review](../../docs/review/README.md).

Native Godot setup and verified scope: [Godot integration](../../docs/integrations/GODOT.md). Set `RELAY_CHECKPOINT` to a trusted checkpoint JSON path to resume the same host timeline explicitly at startup. This is not automatic durable storage. See the [engine review](../../docs/review/ENGINES.md) for native-client verification and remaining limits.
