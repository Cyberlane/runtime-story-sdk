# Security

The included demo servers bind to `127.0.0.1`, enforce their loopback Host and same-origin boundary, and expose one trusted local session. Do not expose them directly to the internet.

Keep API keys and provider processes on a trusted host. Treat player text and generated output as untrusted. Model output cannot register mechanics or execute code through the SDK. The Codex CLI transport is a local development convenience, not a sandbox for hostile prompts.

Checkpoints validate shape, domain invariants and record links; they are not cryptographically authenticated. A client must not be allowed to choose an arbitrary authoritative checkpoint in a multiplayer game.

See [deployment boundaries](docs/KNOWN-LIMITATIONS.md) before shipping an integration. Report security-sensitive problems using this repository's GitHub private vulnerability reporting feature when enabled. Do not include credentials or private player data in public issues.
