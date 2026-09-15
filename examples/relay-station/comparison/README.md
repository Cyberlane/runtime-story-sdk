# Developer comparison

This is a small, transparent comparison over three authored Relay Station objectives. It is not a general benchmark or a measured productivity study.

Run the deterministic planner from the repository root:

```sh
node examples/relay-station/comparison/run.mjs
```

It enumerates the registered mechanics for a structured form objective, validates resulting candidates using the same host rules, and writes local results under ignored `.runtime/developer-value/`. `cases.json` defines two feasible objectives and one objective whose required metal reserve makes it impossible.

To compare live providers, inspect `run.mjs` and use its explicit `--live` mode with your own provider account. This makes model calls and can consume quota. The runner captures the current SDK source fingerprint and records separate per-condition results. Never relabel fixture output as live inference or replace a failed result with a corrected run without retaining both.

The original competition comparison had three conditions: the SDK workflow, the deterministic form planner and an equal-information direct-model reference. All three passed all three cases. Deterministic search was faster. The useful distinction is the free-form, reviewed-plan integration workflow. These results establish no superiority in model accuracy or speed and no measured hours saved.
