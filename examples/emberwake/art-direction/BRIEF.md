# Emberwake art direction

Original painted fantasy artwork for the Emberwake demo: teal shadows, amber lantern light, readable silhouettes and a storm that changes the visible landscape.

`asset-manifest.json` indexes the 14 selected production assets with dimensions and hashes. Generation records retain prompts and selection notes. Private workstation paths and raw tool responses are omitted from this public distribution. Rejected walk-cycle attempts are recorded as rejected; their image files are not shipped.

The renderer uses articulated character parts to keep a supporting foot planted while walking, dedicated encounter art, rowing animation, calm/storm river views and confirmed-state character reactions. Art is a presentation layer; `game.mjs` remains authoritative.

Run `npm run art:check` at the repository root after changing a selected image. A checksum verifies file integrity, not visual quality. Inspect the affected animation in the browser, including reduced motion and state transitions.
