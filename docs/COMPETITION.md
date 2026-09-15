# OpenAI × Tokyo AI Game Builder Challenge

- **Entry:** Runtime Story SDK
- **Track:** 2, Game Production Tools
- **Creator:** Justin Nel / Cyberlane
- **Developer video:** https://youtu.be/0kfqFjjUfLY
- **Repository:** https://github.com/Cyberlane/runtime-story-sdk
- **Showcase:** https://cyberlane.github.io/runtime-story-sdk/

Created for the September 2026 [OpenAI × Tokyo AI Game Builder Challenge](https://luma.com/3kj24doy). This repository records the project and its public distribution. It does not constitute submission-form acceptance or affiliation with the organizers.

## Project description

Runtime Story SDK lets game developers turn free-form player intentions into playable plans using mechanics they already control. Developers register actions, facts and constraints. OpenAI interprets what the player wants and proposes a sequence of supported actions. The game checks the proposal, the player accepts it, and the game records what actually happens.

Emberwake demonstrates this through a tactical RPG: rescue a friend without killing the creature blocking the way, then change the journey when a crossing collapses. The revised plan preserves completed actions and accepted promises. Players still perform the actions, and ordinary controls remain available.

The same SDK also powers Off Script, a narrative negotiation game, and Relay Station, a resource-management example with a tested native Godot client. Developers reuse proposal validation, acceptance, revision, execution records and checkpoint restoration while supplying each game’s rules and presentation.

This is a local prototype demonstrating reusable integration and persistent consequences. It does not generate arbitrary mechanics or replace game design. The submission video is an edited replay of retained live OpenAI plans and their executed outcomes.

## Reuse and license disclosure

Project code, scenarios, integration examples, music composition and synthesized effects were developed with OpenAI Codex assistance. OpenAI models provide live planning through Codex CLI. Selected 2D artwork was generated with OpenAI image generation. Public project code, documentation and original art are MIT licensed to the extent applicable rights are held.

The SDK uses Ajv and its dependencies: fast-deep-equal, json-schema-traverse and require-from-string (MIT), and fast-uri (BSD-3-Clause). Prettier is a development tool (MIT). The site bundles Barlow fonts (SIL OFL-1.1). Full notices are retained. Three.js (MIT) and MakeHuman/MPFB experiments were used in earlier private studies and are excluded from this public distribution and selected video.

Production tools include Node.js, npm, Godot (MIT), Python, NumPy (BSD-3-Clause), FFmpeg (installed GPL-3.0-or-later build), Mori and Obsidian. OpenAI and proprietary tools retain their applicable terms. The selected video uses original music and effects rendered through mathematical synthesis without recorded samples or instrument banks. An earlier Swift/AVFoundation render using Apple's General MIDI bank was replaced because applicable soundtrack permission was not established. The external video is not covered by this repository's MIT license. No external training dataset or third-party trailer footage is incorporated.

## Judging criteria responses

Copy each response into its corresponding form field. Each is below 200 words.

### Meaningful OpenAI use · 30%

OpenAI interprets a player's free-form intention and composes a plan from mechanics registered by the developer. The model receives relevant game state, supported actions, prior commitments and constraints. It proposes explicit terms and steps that the host validates before the player can accept them.

In Emberwake, a player can ask to rescue a friend while sparing the creature blocking the route. When a crossing collapses, OpenAI proposes a revised journey that works with completed actions and the remaining resources. The player still performs each accepted action.

The same planning interface supports information disclosure in Off Script and resource management in Relay Station. Each game supplies its own adapter and rules. Removing OpenAI leaves deterministic validation and execution, but removes this build's free-form interpretation and plan synthesis.

Live OpenAI planning is verified through Codex CLI, including two fresh plans in the public release review. The Responses API adapter has mocked transport tests. The submitted video is an edited replay of retained live plans and their executed outcomes.

### Originality · 25%

Runtime Story SDK combines free-form player intentions with explicit outcomes, player acceptance and a record of completed actions. Its focus is the boundary between an unexpected request and a sequence the game's existing mechanics can actually perform.

The reusable workflow continues after acceptance. An interrupted plan can be revised while completed effects remain recorded and game rules enforce continuing promises. Exact action identities and receipts let the host distinguish a repeated command from a new action.

Three contrasting games make that design concrete: Emberwake handles an expedition and resource promises, Off Script handles selective disclosure and consent, and Relay Station handles repairs, surveys and transmission choices. Their domain rules live in separate adapters while the shared package owns validation, acceptance, revisions and checkpoints.

This project offers developers a coherent integration pattern for player-driven plans across different game systems, with the ownership boundaries visible in code and in the player experience.

### Playability / utility · 25%

Developers can try the SDK without an account: the offline tutorial registers two generator mechanics, validates a plan, accepts it, executes both actions and verifies exact retries and checkpoint resume. They can then connect a live provider and adapt one of three included games.

Emberwake provides a playable RPG with ordinary controls alongside intention-based planning. Off Script demonstrates negotiation and persistent information disclosure. Relay Station is a compact resource-management example designed to make the adapter and HTTP protocol easy to inspect.

Each game supplies explicit state, action schemas, reducers and constraints. Developers reuse the package's proposal validation, acceptance, revision guards, receipts and checkpoint checks while keeping control of their mechanics and presentation.

Detailed tutorials cover JavaScript, Godot, Unity and Unreal. Godot has a working native client. Unity and Unreal are documented source integrations awaiting native validation. The included hosts support local experimentation. A deployed game supplies its own authentication, player sessions and durable storage.

### Execution / craft · 20%

The public release separates the SDK, three demos, engine examples, tutorials and visual showcase. The README links directly to the developer video and a complete offline first-plan tutorial. The GitHub Pages presentation uses original artwork, responsive layouts, accessible controls and a playable video embed.

The release review passed 106 tests, selected asset checks and site-reference checks under the minimum supported Node version. CI runs the automated checks on Node 22 and 24. The packed SDK was installed into a fresh external consumer and completed the tutorial successfully.

Native Godot verification executed 11 actions and checked acceptance without effects, exact retries, checkpoint restoration and rejection of abandoned-branch commands. A fresh Emberwake live run completed two OpenAI plans, revised an interrupted journey and retained 12 unique execution receipts.

Independent code reviews addressed provider limits, checkpoint consistency, cancellation, browser recovery and rendering lifecycle. Review records identify remaining limits, including uncompiled Unity/Unreal samples and production hosting responsibilities.

## What the evidence establishes

The repository includes three game adapters, deterministic tests, an offline first-plan tutorial, a native Godot smoke test and Unity/Unreal source examples. [Review records](review/README.md) distinguish these checks from live-model and native-engine execution.

The original three-case comparison was passed by the SDK, a competent deterministic planner and an equal-information model reference. It does not demonstrate an accuracy or speed advantage, measured human development-time savings or a world-first invention. OpenAI adds free-form interpretation and composition; the host-owned validation and persistence mechanisms are ordinary deterministic code.

The public 0.2.0 checkout contains publication cleanup and validation improvements made after the original frozen 0.1.0 portability evidence. The selected video demonstrates the competition build. Neither a link nor a repository release proves final competition submission.
