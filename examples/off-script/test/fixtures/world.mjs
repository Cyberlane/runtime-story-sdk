import {
  createOffScriptAdapter,
  toRuntimePlan,
} from "../../src/off-script-adapter.mjs";
import { projectGameWorld } from "../../src/runtime-api.mjs";
export { getContext } from "../../src/engine.mjs";

// Presentation tests use the same runtime and projection as the browser host.
const project = (runtime) => ({
  ...projectGameWorld(runtime.snapshot()),
  checkpoint: runtime.snapshot(),
});
const guard = (runtime) => ({
  branchId: runtime.snapshot().branchId,
  expectedRevision: runtime.snapshot().revision,
});
const resume = (world) =>
  createOffScriptAdapter(world.scenarioId).createSession(world.checkpoint);
export const createWorld = (id = "ledger") =>
  project(createOffScriptAdapter(id).createSession());
export function stageProposal(world, plan, provenance = {}) {
  const runtime = resume(world);
  runtime.stage(toRuntimePlan(plan), {
    ...guard(runtime),
    intent: "Deterministic test fixture",
    provenance,
  });
  return project(runtime);
}
export function acceptProposal(world, proposalId) {
  const runtime = resume(world);
  runtime.accept({ ...guard(runtime), proposalId });
  return project(runtime);
}
export function executeNext(world) {
  const runtime = resume(world);
  const plan = runtime
    .snapshot()
    .plans.find((plan) => plan.status === "active");
  if (!plan)
    throw Object.assign(new Error("No active plan"), {
      code: "NO_ACTIVE_AGREEMENT",
    });
  runtime.step({
    ...guard(runtime),
    planId: plan.id,
    stepId: plan.stepIds[plan.nextStep],
  });
  return project(runtime);
}
export function triggerSetback(world) {
  const runtime = resume(world);
  createOffScriptAdapter(world.scenarioId).applySetback(runtime);
  return project(runtime);
}
export const serializeWorld = (world) => JSON.stringify(world.checkpoint);
export function restoreWorld(value) {
  const checkpoint =
    typeof value === "string" ? JSON.parse(value) : (value.checkpoint ?? value);
  const runtime = createOffScriptAdapter(
    checkpoint.state.scenarioId,
  ).createSession();
  runtime.restore(checkpoint, guard(runtime));
  return project(runtime);
}
