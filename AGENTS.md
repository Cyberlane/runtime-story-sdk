# Working on Runtime Story SDK

Read the root README and the affected package or demo documentation before editing.

- Keep reusable runtime code in `packages/runtime-story` and game-specific rules under `examples`.
- Preserve unrelated worktree changes.
- Keep reducers synchronous, deterministic and free of external effects.
- Preserve branch/revision guards, exact command identities and state/receipt atomicity.
- Keep provider credentials and inference outside browser and native clients.
- Run `npm run check` and `npm run format:check` for publication changes.
- Validate affected UI in a browser. Native engine source review is not compilation evidence.
- Record meaningful review results in `docs/review`, with remaining limitations.
- Do not add private handoffs, generated logs, secrets or discarded media.
- Do not push, publish, deploy or submit external forms without user authorization.
