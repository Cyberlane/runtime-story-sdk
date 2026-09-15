import assert from "node:assert/strict";
import { createRuntime } from "@off-script/runtime-story";
import { registry, initialState } from "./generator.mjs";

const runtime = createRuntime(registry, initialState);
const guard = () => {
  const { branchId, revision } = runtime.snapshot();
  return { branchId, expectedRevision: revision };
};

// This authored proposal makes the first run deterministic and requires no credentials.
const candidate = {
  status: "ready",
  title: "Restore generator power",
  interpretation: "Spend the fuse repairing the generator, then switch it on.",
  question: "",
  terms: { powered: true },
  steps: [
    {
      action: "repair_generator",
      arguments: {},
      description: "Install the fuse.",
    },
    {
      action: "switch_power",
      arguments: { on: true },
      description: "Turn on the repaired generator.",
    },
  ],
};
runtime.stage(candidate, { ...guard(), intent: "Restore power." });
assert.deepEqual(runtime.snapshot().state, initialState);

// An interactive game displays the proposal and waits for the player's agreement here.
runtime.accept({ ...guard(), proposalId: runtime.snapshot().proposal.id });
assert.deepEqual(runtime.snapshot().state, initialState);

while (runtime.snapshot().plans.some((plan) => plan.status === "active")) {
  const plan = runtime
    .snapshot()
    .plans.find((plan) => plan.status === "active");
  const command = {
    ...guard(),
    planId: plan.id,
    stepId: plan.stepIds[plan.nextStep],
  };
  const outcome = runtime.step(command);
  console.log(outcome.receipt.result);
  assert.equal(runtime.step(command).replayed, true);
  assert.deepEqual(runtime.snapshot(), outcome.snapshot);
}

const checkpoint = runtime.snapshot();
const resumed = createRuntime(registry, initialState, { checkpoint });
assert.deepEqual(resumed.snapshot(), checkpoint);
assert.deepEqual(checkpoint.state, { fuses: 0, repaired: true, powered: true });
console.log(
  "Verified: accepted terms, two executed actions, exact retries, and checkpoint resume.",
);
