# OpenAI × Tokyo AI Game Builder Challenge

- **Entry:** Runtime Story SDK
- **Track:** 2, Game Production Tools
- **Creator:** Justin Nel / Cyberlane
- **Developer video:** https://youtu.be/iSmP1_tJRds
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

Production tools include Node.js, npm, Godot (MIT), Python, NumPy (BSD-3-Clause), FFmpeg (installed GPL-3.0-or-later build), Swift/AVFoundation, Mori and Obsidian. OpenAI and proprietary tools retain their applicable terms. The video's original score uses Apple's macOS General MIDI instrument bank, which is not redistributed here; its rendered-soundtrack permission remains unconfirmed. The video is not covered by this repository's MIT license. No external training dataset or third-party trailer footage is incorporated.

## What the evidence establishes

The repository includes three game adapters, deterministic tests, an offline first-plan tutorial, a native Godot smoke test and Unity/Unreal source examples. [Review records](review/README.md) distinguish these checks from live-model and native-engine execution.

The original three-case comparison was passed by the SDK, a competent deterministic planner and an equal-information model reference. It does not demonstrate an accuracy or speed advantage, measured human development-time savings or a world-first invention. OpenAI adds free-form interpretation and composition; the host-owned validation and persistence mechanisms are ordinary deterministic code.

The public 0.2.0 checkout contains publication cleanup and validation improvements made after the original frozen 0.1.0 portability evidence. The selected video demonstrates the competition build. Neither a link nor a repository release proves final competition submission.
