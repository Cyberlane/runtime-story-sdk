# Rendering and audio review

Reviewed September 15, 2026. Scope was the complete source of these five modules, 2,314 lines before this review's changes:

| File                                              | Complete read coverage | Responsibility                                                                            |
| ------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------- |
| `examples/off-script/public/demo-scene.js`        | 424 lines              | Scene loading, chroma compositing, room presentation, travel, poses, particles and camera |
| `examples/off-script/public/demo-audio.mjs`       | 380 lines              | Synthesized score, scheduled effects, volume, ambience and developer recording            |
| `examples/off-script/public/character-acting.mjs` | 95 lines               | Authored sprite regions and confirmed-state pose selection                                |
| `examples/off-script/public/play-state.mjs`       | 353 lines              | Player guidance, accepted-action labels and outcome summaries                             |
| `examples/emberwake/public/scene.js`              | 1,062 lines            | Atlas preparation, articulated gait, map travel, ferry, combat and render loop            |

The review also read the Off Script travel and sound-toggle callers, the existing Emberwake motion tests and the relevant example package scripts. It did not claim a complete read of `demo.js`, `game.js`, server or SDK modules, which have separate review owners.

## Corrected defects

1. **Camera position used the viewport origin.** Off Script normalized pointer coordinates without subtracting the canvas rectangle's left/top offsets. A pointer in the center of an offset canvas therefore produced camera drift. Coordinates now use the canvas rectangle, remain clamped to its bounds and recenter when the pointer leaves. Reduced-motion mode now snaps the camera to zero instead of easing toward zero over subsequent frames.

2. **Finished walks retained walking bob.** The sprite switched back to idle when a walk completed, but its vertical motion still used the mere presence of the walk object. This kept the faster, larger walking bob during the subsequent room transition. Sprite selection and bob now share the same active-walking predicate.

3. **Scene accessibility metadata changed every frame.** Emberwake wrote the same body dataset and canvas label continuously. The ferry was also described as an interactive forest map. Metadata now changes only when the scene mode changes, including the first frame. Ferry travel has its own accurate label.

4. **Audio scene diagnostics could grow indefinitely.** Cues already retained at most 200 events, but repeated scene/checkpoint changes bypassed that bound. Scene events now use the same cap.

5. **Recorder initialization failure retained capture resources.** The capture stream was connected before constructing and starting `MediaRecorder`. An unsupported recorder or startup failure could leave capture tracks and an output connection behind. Recorder setup now succeeds before the audio output is connected, and failed setup stops the newly created tracks.

6. **Repeated stop requests could lose their completion promise.** A second `stopRecording()` call replaced the first stop handler. Calls now share the pending stop promise and release the stream once.

These are small presentation and resource-handling fixes. They do not change host state, supported actions, accepted terms, game rules or the SDK contract.

## Code and architecture findings

No unsafe HTML construction was found in the five reviewed modules. Scene graphics use canvas. Emberwake writes only fixed scene-mode values and fixed accessibility labels to the DOM. Player/model-dependent text in `play-state.mjs` is returned as text for its caller, so that caller's escaping remains a separate boundary.

Character poses, gate art, document ownership and encounter outcomes derive from confirmed host state. Renderers do not execute mechanics or convert narration into effects. Scene movement is presentation of a confirmed transition. The Off Script caller awaits the host step before beginning the travel animation.

The larger atlas preparation routine is purposeful. Connected-component slicing preserves painted weapons and limbs that exceed nominal atlas cell margins. It runs during asset loading, not during every animation frame. Replacing it with a shared generic asset engine would add coupling between independent demos without resolving a demonstrated defect. The separate compositors and explicit game-specific pose data were retained.

Comments about authority boundaries, chroma compositing, planted feet and guard timing explain non-obvious behavior or prior visual defects. They were retained. No new framework, dependency, rendering abstraction or asynchronous game effect layer was introduced.

## Verification

The focused rendering checks exercise:

- Centered pointer behavior with a canvas offset from the viewport, clamping and pointer-leave recentering.
- Identical idle placement before a walk and after the walk has completed.
- Bounded diagnostic history across repeated scene changes.
- Capture-track cleanup when recording is unsupported.
- Shared completion and single resource cleanup for repeated recorder stop requests.
- Scene labels changing once per mode, including the ferry label.

Existing gait checks sample 1,200 phases for support contact and constant limb lengths, check loop continuity and planted-foot cancellation of forward movement, and verify that the calming interaction never translates an idle character across the ground. These are geometry and behavior checks, not a claim of human visual acceptance.

Run the two affected suites from the repository root:

```sh
npm test --workspace=@runtime-story/off-script
npm test --workspace=@runtime-story/emberwake
```

Changed files were formatted with the repository's pinned Prettier version. Both complete example test suites pass after the fixes: 51 Off Script tests and 10 Emberwake tests.

## Remaining limits

These are page-owned demo renderers. Each client creates one renderer and one soundscape for its page lifetime. Animation loops, the resize observer and the score timer are not exposed as reusable engine resources with an explicit teardown API. A host that mounts/unmounts these classes without navigating the page would need that lifecycle design. The current clients do not do so.

This pass did not make live model calls, change sprite artwork, conduct a fresh full gameplay recording, listen to the soundtrack or measure rendering performance on representative low-power devices. Media capture was checked with focused failure/completion mocks, not a fresh browser recording. Root browser review and retained live gameplay evidence are separate from this source review. Passing tests do not establish subjective audiovisual quality or production deployment readiness.
