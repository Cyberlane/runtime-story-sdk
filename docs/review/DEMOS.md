# Independent demo integration review

September 15, 2026. A reviewer independent of the demo cleanup examined the SDK integration, host request handling and the changed browser flows. This was a bounded follow-up review. It is not a claim that every visual or audio module was independently re-reviewed here.

## Source coverage

Read in full:

- `examples/off-script/server.mjs`
- `examples/off-script/src/runtime-api.mjs`
- `examples/off-script/src/off-script-adapter.mjs`
- `examples/off-script/src/engine.mjs`
- `examples/off-script/test/fixtures/world.mjs`
- `examples/off-script/test/runtime-api.test.mjs`
- `examples/emberwake/server.mjs`
- `examples/emberwake/game.mjs`
- `examples/emberwake/test/game.test.mjs`

Focused browser-source review:

- `examples/off-script/public/demo.js`: storage startup, API requests and recovery, locking, world/proposal rendering, hotspot creation, proposal/acceptance/restart flows, save/load handlers and bootstrap.
- `examples/emberwake/public/game.js`: startup preferences, request/recovery flow, manual versus planned commands, world/proposal rendering, promise-aware action availability, ending display and save/load handlers. The final keyboard-navigation/bootstrap tail was not read in this pass.

The following presentation/audio files were **not read in this independent pass** and remain in the lead reviewer's full-source coverage: Off Script `demo-scene.js`, `demo-audio.mjs`, `character-acting.mjs`, `play-state.mjs`, `demo.html`, `demo.css`, and Emberwake `scene.js`, `index.html`, `style.css`. Their passing tests or successful loading do not substitute for source and visual review. Scenario definitions and the remaining domain/presentation test files were exercised by the suite but not fully re-read here.

## Fixes from the independent review

1. **Off Script hotspot positioning conflicted with its new CSP.** The page generated inline `style` attributes through `innerHTML`, while its host now requires `style-src 'self'`. The hotspot is now a DOM element whose position uses individual style properties. This retains the stricter policy. Final browser review must confirm the hotspot's position and absence of CSP errors.
2. **Optional evidence failure was only written to the console.** Both demo hosts now return `evidenceWarning` without hiding a successful staged proposal or replacing an original provider error. Successful proposal flows display the warning. Default play still writes no evidence files unless configured.
3. **RPG oversized request status was incorrect.** Requests beyond 512 KiB now return HTTP 413. The regression sends an oversized body and checks that the saved world remains unchanged.
4. **Media-type matching was case-sensitive.** Both hosts now accept case-insensitive `application/json` with parameters and reject lookalike media types. The RPG regression includes `Application/JSON; charset=utf-8`.
5. **Response writers could target disconnected clients.** Both hosts now check whether the response has been destroyed before writing an error/result.

## Integration assessment

The removed Off Script lifecycle has been replaced in tests by a fixture built from the same SDK and game adapter as the host. Existing domain assertions still exercise real receipts, state changes, privacy, the authored curfew and restored consequences. The cumulative privacy projection agrees with the adapter's enforcement of all accepted historical privacy commitments.

RPG manual actions execute registered reducers on a draft, retain irreversible wolf/potion promises, then commit host changes. The existing manual command ID/signature check and exact-retry test preserve the distinction between retrying one command and requesting another action. The authored flood and state transition are prepared on a draft before the visible host assignment.

Reset behavior differs between the examples. Off Script accepts a guarded reset while inference is pending, then rejects the old response as stale. Emberwake rejects mutations, including reset, while planning. These paths preserve state consistency. They do not implement a user-facing cancel action in this revision.

The Off Script proposal header now follows `provenance.live`, matching its detailed provenance text. Non-live fixtures and saved authored candidates display “CHECKED PLAN” or “CHECKED RESPONSE” rather than claiming live generation.

## Checks

```sh
npm test --workspace=@runtime-story/off-script
npm test --workspace=@runtime-story/emberwake
```

- Off Script: **45 tests passed**.
- Emberwake: **8 tests passed**.
- New regressions cover evidence-write failure on success and provider failure, malformed and oversized request bodies, exact JSON media-type handling and preserved world state.
- Modified files were formatted with the repository's pinned Prettier.

These checks ran locally under Node.js 26.5.0 on macOS. This review did not run a fresh live model call, a native engine build, an independent listening test or a browser visual acceptance pass. The lead's integrated checks remain separate evidence.
