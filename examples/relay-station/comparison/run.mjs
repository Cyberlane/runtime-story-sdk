import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { planIntent, RuntimeError } from "@off-script/runtime-story";
import { StructuredProvider } from "@off-script/runtime-story/providers";
import { createSession, registry } from "../game.mjs";
import { planFromForm } from "./form-planner.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const cases = JSON.parse(await readFile(resolve(here, "cases.json"), "utf8"));
const parent = resolve(root, ".runtime/developer-value");
await mkdir(parent, { recursive: true });
const directory = await mkdtemp(resolve(parent, "run-"));
const digest = async (path) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
const sharedCheckpoint = createSession().snapshot();
const files = [
  "examples/relay-station/game.mjs",
  "examples/relay-station/comparison/form-planner.mjs",
  "examples/relay-station/comparison/cases.json",
  "examples/relay-station/comparison/run.mjs",
  "packages/runtime-story/package.json",
  "packages/runtime-story/src/index.mjs",
  "packages/runtime-story/src/registry.mjs",
  "packages/runtime-story/src/runtime.mjs",
  "packages/runtime-story/src/planning.mjs",
  "packages/runtime-story/src/provider.mjs",
];
await writeFile(
  resolve(directory, "freeze.json"),
  JSON.stringify(
    {
      frozenAt: new Date().toISOString(),
      files: Object.fromEntries(
        await Promise.all(
          files.map(async (path) => [path, await digest(resolve(root, path))]),
        ),
      ),
      sharedCheckpoint,
      live: process.argv.includes("--live"),
    },
    null,
    2,
  ),
);
console.log(`Evidence: ${directory}`);

// A direct-model reference with the same context/schema/provider and one repair.
// It deliberately shares host validation/lifecycle, so this comparison isolates
// proposal generation. It does not measure building a whole SDK from scratch.
async function directReference(runtime, provider, intent) {
  const context = runtime.context();
  const attempts = [];
  let feedback = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const requestId = randomUUID();
    const started = performance.now();
    let output = null;
    let provenance = {};
    try {
      const response = await provider.generate({
        intent,
        context: structuredClone(context),
        schema: registry.schema(),
        feedback,
        requestId,
        signal: AbortSignal.timeout(120000),
      });
      provenance = response.provenance;
      try {
        output =
          typeof response.output === "string"
            ? JSON.parse(response.output)
            : response.output;
      } catch {
        throw new RuntimeError(
          "MALFORMED_OUTPUT",
          "Provider returned invalid JSON.",
        );
      }
      runtime.stage(output, {
        branchId: context.branchId,
        expectedRevision: context.revision,
        intent,
        provenance,
      });
      attempts.push({
        requestId,
        durationMs: performance.now() - started,
        output,
        provenance,
        error: null,
      });
      return { snapshot: runtime.snapshot(), attempts };
    } catch (error) {
      const reason = {
        code: error.code ?? "PROVIDER_ERROR",
        message: error.message,
        details: error.details ?? {},
      };
      attempts.push({
        requestId,
        durationMs: performance.now() - started,
        output,
        provenance,
        error: reason,
      });
      if (
        attempt === 1 ||
        ![
          "SCHEMA_REJECTED",
          "INVALID_PLAN",
          "HOST_REJECTED",
          "UNKNOWN_ACTION",
          "INVALID_JSON",
          "MALFORMED_OUTPUT",
          "RETRYABLE_PROVIDER_ERROR",
        ].includes(reason.code)
      ) {
        error.attempts = attempts;
        throw error;
      }
      feedback = { error: reason, previousOutput: output };
    }
  }
}

function evaluate(runtime, item) {
  const proposed = runtime.snapshot().proposal.plan;
  if (!item.possible) {
    assert.equal(
      proposed.status,
      "unsupported",
      "An impossible mandatory constraint must not become an executable plan.",
    );
    return { semanticPass: true, executed: 0, status: proposed.status };
  }
  assert.equal(proposed.status, "ready");
  assert.deepEqual(
    [...proposed.terms.surveySectors].sort(),
    [...item.terms.surveySectors].sort(),
  );
  assert.deepEqual(
    [...proposed.terms.transmitSectors].sort(),
    [...item.terms.transmitSectors].sort(),
  );
  assert.ok(
    proposed.terms.minBattery >= item.terms.minBattery,
    "Battery promise was weakened.",
  );
  assert.ok(
    proposed.terms.maxHeat <= item.terms.maxHeat,
    "Heat promise was weakened.",
  );
  assert.ok(
    proposed.terms.minMetal >= item.terms.minMetal,
    "Metal promise was weakened.",
  );
  const initial = runtime.snapshot();
  runtime.accept({
    branchId: initial.branchId,
    expectedRevision: initial.revision,
    proposalId: initial.proposal.id,
  });
  assert.deepEqual(runtime.snapshot().state, initial.state);
  const transitions = [];
  let lastCommand;
  while (runtime.snapshot().plans.some((plan) => plan.status === "active")) {
    const current = runtime.snapshot();
    const plan = current.plans.find((plan) => plan.status === "active");
    lastCommand = {
      branchId: current.branchId,
      expectedRevision: current.revision,
      planId: plan.id,
      stepId: plan.stepIds[plan.nextStep],
    };
    transitions.push(runtime.step(lastCommand));
  }
  const completed = runtime.snapshot();
  assert.ok(runtime.step(lastCommand).replayed);
  assert.deepEqual(runtime.snapshot(), completed);
  return {
    semanticPass: true,
    executed: transitions.length,
    status: "fulfilled",
    finalState: completed.state,
    transitions,
    exactRetryUnchanged: true,
  };
}

const rows = [];
for (const item of cases) {
  const runtime = createSession(sharedCheckpoint);
  const result = planFromForm(item.terms);
  let evaluation;
  if (result.plan) {
    runtime.stage(result.plan, {
      branchId: sharedCheckpoint.branchId,
      expectedRevision: 0,
      intent: "Explicit form fields",
      provenance: { live: false, source: "deterministic goal search" },
    });
    evaluation = evaluate(runtime, item);
  } else
    evaluation = {
      semanticPass: !item.possible && result.exhausted,
      executed: 0,
      status: result.exhausted ? "unsupported" : "search_budget_exhausted",
    };
  const row = {
    condition: "structured-goal search",
    case: item.id,
    durationMs: result.durationMs,
    expanded: result.expanded,
    ...evaluation,
  };
  rows.push(row);
  await writeFile(
    resolve(directory, `${item.id}-form.json`),
    JSON.stringify({ item, result, evaluation }, null, 2),
  );
  console.log(
    JSON.stringify({
      condition: row.condition,
      case: row.case,
      pass: row.semanticPass,
      durationMs: Math.round(row.durationMs),
      actions: row.executed,
    }),
  );
}

if (process.argv.includes("--live")) {
  const provider = new StructuredProvider({
    limit: 12,
  });
  for (const [index, item] of cases.entries()) {
    for (const condition of index % 2
      ? ["direct-model reference", "SDK planning"]
      : ["SDK planning", "direct-model reference"]) {
      const runtime = createSession(sharedCheckpoint);
      assert.deepEqual(
        runtime.context(),
        createSession(sharedCheckpoint).context(),
      );
      const started = performance.now();
      let result;
      let evaluation;
      let failure;
      try {
        result =
          condition === "SDK planning"
            ? await planIntent(
                runtime,
                registry,
                (request) => provider.generate(request),
                item.intent,
              )
            : await directReference(runtime, provider, item.intent);
        const planningDurationMs = performance.now() - started;
        evaluation = { ...evaluate(runtime, item), planningDurationMs };
      } catch (error) {
        failure = {
          code: error.code ?? "SEMANTIC_ASSERTION",
          message: error.message,
          attempts: error.attempts ?? result?.attempts ?? [],
        };
        evaluation = {
          semanticPass: false,
          executed: runtime.snapshot().receipts.length,
          status: "failed",
          planningDurationMs: performance.now() - started,
        };
      }
      const row = {
        condition,
        case: item.id,
        durationMs: evaluation.planningDurationMs,
        attempts: result?.attempts.length ?? failure.attempts.length,
        ...evaluation,
      };
      rows.push(row);
      await writeFile(
        resolve(
          directory,
          `${item.id}-${condition.startsWith("SDK") ? "sdk" : "direct"}.json`,
        ),
        JSON.stringify(
          {
            item,
            condition,
            result: result ?? null,
            evaluation,
            failure: failure ?? null,
            snapshot: runtime.snapshot(),
          },
          null,
          2,
        ),
      );
      console.log(
        JSON.stringify({
          condition,
          case: item.id,
          pass: row.semanticPass,
          durationMs: Math.round(row.durationMs),
          attempts: row.attempts,
          actions: row.executed,
        }),
      );
    }
  }
}
await writeFile(
  resolve(directory, "summary.json"),
  JSON.stringify(
    {
      finishedAt: new Date().toISOString(),
      rows: rows.map(({ transitions, ...row }) => row),
      limits: [
        "Three authored benchmark objectives, not independent human evaluation.",
        "Goal form supplies explicit fields. Models receive the equivalent natural-language intent.",
        "All conditions share host constraints and lifecycle. This isolates proposal generation, not total SDK authoring effort.",
        "No claim of optimal search plans, saved human hours or global model superiority.",
      ],
    },
    null,
    2,
  ),
);
console.log("Comparison complete. Every attempt and failure is retained.");
