import { createRegistry, RuntimeError } from "@off-script/runtime-story";

const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const registry = createRegistry({
  id: "generator-tutorial",
  version: "1",
  maxSteps: 4,
  stateSchema: object({
    fuses: { type: "integer", minimum: 0, maximum: 1 },
    repaired: { type: "boolean" },
    powered: { type: "boolean" },
  }),
  termsSchema: object({ powered: { type: "boolean" } }),
  context: (state) => ({
    state,
    rules: ["Repair the generator with a fuse before switching on its power."],
  }),
  validateState(state) {
    if (state.powered && !state.repaired)
      throw new RuntimeError(
        "HOST_REJECTED",
        "Power needs a repaired generator.",
      );
    if (state.fuses + Number(state.repaired) !== 1)
      throw new RuntimeError(
        "HOST_REJECTED",
        "A repair consumes the one available fuse.",
      );
    return true;
  },
  validatePlan({ after, plan }) {
    if (after.powered !== plan.terms.powered)
      throw new RuntimeError(
        "HOST_REJECTED",
        "The plan must achieve its accepted power setting.",
      );
    return true;
  },
  actions: [
    {
      id: "repair_generator",
      description: "Repair the broken generator using one fuse.",
      parameters: object({}),
      reduce(state) {
        if (state.repaired || state.fuses < 1)
          throw new RuntimeError(
            "HOST_REJECTED",
            "A broken generator and a fuse are required.",
          );
        return {
          state: { ...state, fuses: state.fuses - 1, repaired: true },
          result: { event: "generator_repaired" },
        };
      },
    },
    {
      id: "switch_power",
      description: "Set the power on a repaired generator.",
      parameters: object({ on: { type: "boolean" } }),
      reduce(state, { on }) {
        if (!state.repaired)
          throw new RuntimeError(
            "HOST_REJECTED",
            "Repair the generator first.",
          );
        return {
          state: { ...state, powered: on },
          result: { event: "power_changed", on },
        };
      },
    },
  ],
});

export const initialState = { fuses: 1, repaired: false, powered: false };
