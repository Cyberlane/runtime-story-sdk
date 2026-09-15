# Emberwake

A small fantasy RPG using the shared Runtime Story SDK. Explore Lantern Reach, rescue Lark and recover the Dawnseed. Fight, sneak, gather herbs or spare the ash wolf. The storm can close your route after real progress, requiring a new plan that respects completed actions and prior promises.

From the repository root:

```sh
npm ci
npm run demo:emberwake
```

Open **http://127.0.0.1:4340**. Manual play works without a model account. Click connected map locations and available actions. Keyboard shortcuts: arrow keys travel, 1/2/3 select attacks, H uses a potion and E interacts. Reduced motion is available in the journal and follows the browser preference by default.

To use live planning, [configure a provider](../../docs/QUICKSTART.md), then describe an expedition. For example: “Rescue Lark, recover the Dawnseed, spare the wolf and bring us home without using a potion.” Inspect the proposed costs and goals before accepting. Each accepted action is still played separately.

The SDK validates candidate routes against `game.mjs`. It owns proposal, acceptance, exact-step receipts and checkpoint validation. The game owns nine mechanics, combat rules, resource limits and the authored flood. `server.mjs` hosts one local session. `public/` contains the UI, canvas animation and selected art.

| Request                                | Purpose                                               |
| -------------------------------------- | ----------------------------------------------------- |
| `GET /state`, `/save`, `/capabilities` | Current UI projection, checkpoint, registered actions |
| `POST /propose`                        | `{branchId, expectedRevision, intent}`                |
| `POST /accept`                         | Guards plus `proposalId`                              |
| `POST /step`                           | Guards plus exact `planId` and `stepId`               |
| `POST /act`                            | Guards plus unique `commandId`, `action`, `arguments` |
| `POST /load`                           | Guards plus trusted `checkpoint`                      |
| `POST /reset`                          | Guards; starts a new branch                           |

All mutations require JSON. Reuse the exact command when retrying. Planned-step receipts survive checkpointing; the manual-command cache retains the last 200 commands only in memory. The journal stores explicit checkpoints in browser local storage. There is no automatic durable server persistence.

[Art direction and provenance](art-direction/BRIEF.md) · [Deployment boundaries](../../docs/KNOWN-LIMITATIONS.md) · [Developer video](https://youtu.be/0kfqFjjUfLY).
