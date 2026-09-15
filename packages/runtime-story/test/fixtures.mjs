import { createRegistry, createRuntime } from "../src/index.mjs";
export const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export const integer = { type: "integer", minimum: 0 };
export const initial = { charge: 0, capacity: 5 };
export const proposal = (amount = 3) => ({
  status: "ready",
  title: "Charge",
  interpretation: "Reach the requested level",
  question: "",
  terms: { target: amount },
  steps: [
    { action: "charge", arguments: { amount }, description: "Add charge" },
  ],
});
export function game(overrides = {}) {
  return createRegistry({
    id: "test-accumulator",
    version: "1",
    stateSchema: object({ charge: integer, capacity: integer }),
    termsSchema: object({ target: integer }),
    context: (state) => state,
    validateState: (state) => state.charge <= state.capacity,
    validatePlan: ({ after, plan }) => after.charge === plan.terms.target,
    actions: [
      {
        id: "charge",
        description: "Add a bounded amount of charge",
        parameters: object({ amount: { type: "integer", minimum: 1 } }),
        reduce: (state, { amount }) => ({
          state: { ...state, charge: state.charge + amount },
          result: { added: amount },
        }),
      },
    ],
    ...overrides,
  });
}
export function guard(runtime) {
  const { branchId, revision } = runtime.snapshot();
  return { branchId, expectedRevision: revision };
}
export function stage(runtime, plan = proposal()) {
  return runtime.stage(plan, {
    ...guard(runtime),
    intent: "Reach the requested charge",
  });
}
export function accept(runtime) {
  return runtime.accept({
    ...guard(runtime),
    proposalId: runtime.snapshot().proposal.id,
  });
}
export function stepCommand(runtime) {
  const plan = runtime
    .snapshot()
    .plans.find((plan) => plan.status === "active");
  return {
    ...guard(runtime),
    planId: plan.id,
    stepId: plan.stepIds[plan.nextStep],
  };
}
export function runtime() {
  return createRuntime(game(), initial);
}
