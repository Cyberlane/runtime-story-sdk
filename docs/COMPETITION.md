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

OpenAI turns a player's priorities into choices the game can carry out. In Emberwake, a player can ask to rescue a friend, spare the wolf and keep their potions. The model receives the current world state and the developer's available actions, then proposes a compatible sequence. This lets players express an approach in their own words, including combinations that were not written as individual quest branches.

Live planning runs through Codex CLI. The SDK checks the proposal against game rules before presenting it for acceptance, and only the game's action handlers can change the world. OpenAI supplies interpretation and planning while the developer retains control over what is possible.

I also used Codex to help implement and review the project, and OpenAI image generation for selected artwork. The video replays plans retained from live OpenAI runs.

### Originality · 25%

Runtime Story SDK treats a quest as an agreement the player can help shape and renegotiate. Its distinctive focus is what happens after that agreement has already changed the world.

A revised plan must account for completed actions and the restrictions the game continues to enforce. A delivered item stays delivered, spent supplies stay spent, and unfinished steps can change through a newly accepted proposal. That history also survives saving and restoring the game.

This creates a different authoring model from writing every quest route as a fixed branch: developers define the available mechanics and their boundaries, while players can propose combinations at runtime. The reusable package carries the agreement through acceptance, interruption and revision across different scenarios.

The contribution is the complete, inspectable workflow for both player and developer. It builds on established planning and validation techniques.

### Playability / utility · 25%

A developer can start with a complete offline exercise before connecting a model. The tutorial shows how to register actions to repair and power a generator, run a plan, resume a saved session and safely retry a command. It works without an API key.

From there, Relay Station provides a small resource-management game and HTTP host to adapt to another project. The integration work is explicit: describe the relevant game state, expose permitted actions and connect their outcomes to the game's existing systems. The SDK supplies the shared planning lifecycle.

The repository includes JavaScript, Godot, Unity and Unreal guides. A native Godot client has been run end to end. Unity and Unreal currently provide source examples awaiting native validation.

For players, Emberwake demonstrates the result in a playable RPG with ordinary movement and actions alongside intention-based planning. The current package supports local prototyping. Online releases still require game-specific authentication, sessions and durable storage.

### Execution / craft · 20%

I treated the release as something another developer should be able to inspect, install and understand. The SDK, game demos and engine examples live in clearly separated folders, with an MIT license and dependency notices. The public presentation adds original artwork, responsive layouts, keyboard-accessible controls and a one-minute developer video.

The release passed 106 automated tests, and GitHub CI checks Node 22 and 24. The packaged SDK was also tested in a separate project, verifying installation outside the development workspace.

The most important checks covered mistakes that could break a player's save: duplicate actions, interrupted plans, stale responses and checkpoint restoration. A fresh live OpenAI run produced two plans and executed 12 actions, including a revised route after a crossing collapsed.

Source reviews led to fixes in cancellation, provider limits, save consistency and browser recovery. The repository includes these review records so developers can inspect the evidence alongside the code.

## What the evidence establishes

The repository includes three game adapters, deterministic tests, an offline first-plan tutorial, a native Godot smoke test and Unity/Unreal source examples. [Review records](review/README.md) distinguish these checks from live-model and native-engine execution.

The original three-case comparison was passed by the SDK, a competent deterministic planner and an equal-information model reference. It does not demonstrate an accuracy or speed advantage, measured human development-time savings or a world-first invention. OpenAI adds free-form interpretation and composition; the host-owned validation and persistence mechanisms are ordinary deterministic code.

The public 0.2.0 checkout contains publication cleanup and validation improvements made after the original frozen 0.1.0 portability evidence. The selected video demonstrates the competition build. Neither a link nor a repository release proves final competition submission.
