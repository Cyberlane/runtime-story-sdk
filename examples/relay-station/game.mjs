import {
  createRegistry,
  createRuntime,
  RuntimeError,
} from "@off-script/runtime-story";

const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const number = (maximum) => ({ type: "integer", minimum: 0, maximum });
const sectors = ["north", "east", "west"];
const sector = { type: "string", enum: sectors };
const sectorList = {
  type: "array",
  items: sector,
  uniqueItems: true,
  maxItems: 3,
};
const units = (maximum) =>
  object({ units: { type: "integer", minimum: 1, maximum } });
const requireRule = (condition, message) => {
  if (!condition) throw new RuntimeError("HOST_REJECTED", message);
};

export const initialState = Object.freeze({
  battery: 5,
  heat: 0,
  metal: 6,
  kits: 0,
  scanner: false,
  radio: false,
  surveyed: Object.freeze([]),
  transmitted: Object.freeze([]),
});

export const registry = createRegistry({
  id: "relay-station",
  version: "1",
  maxSteps: 24,
  stateSchema: object({
    battery: number(12),
    heat: number(8),
    metal: number(6),
    kits: number(3),
    scanner: { type: "boolean" },
    radio: { type: "boolean" },
    surveyed: sectorList,
    transmitted: sectorList,
  }),
  termsSchema: object({
    surveySectors: sectorList,
    transmitSectors: sectorList,
    minBattery: number(12),
    maxHeat: number(8),
    minMetal: number(6),
  }),
  context: (state) => ({
    state,
    rules: [
      "All actions execute sequentially. Battery must remain from 0 to 12 and heat from 0 to 8 at every step.",
      "Solar charging adds the chosen battery units and adds exactly one heat per charge action.",
      "Cooling removes the chosen heat units and consumes one battery. Never cool below zero.",
      "Each fabricated repair kit consumes two metal and two battery and adds two heat.",
      "Repairing either broken subsystem consumes one kit and one battery and adds one heat. Each subsystem may be repaired once.",
      "Surveying a new sector needs a working scanner, consumes two battery and adds one heat.",
      "Transmitting a surveyed sector needs a working radio, consumes one battery and adds one heat. Each sector may be surveyed or transmitted once.",
      "Terms describe the exact final surveyed and transmitted sector sets, including prior work, and final resource bounds.",
      "Do not transmit a sector the player wanted kept local. Do not claim to repair, scan or transmit by narration alone.",
    ],
    availableSectors: sectors,
  }),
  validateState(state) {
    requireRule(
      state.transmitted.every((value) => state.surveyed.includes(value)),
      "Transmission requires an existing survey.",
    );
    requireRule(
      state.surveyed.length === 0 || state.scanner,
      "Survey records require a repaired scanner.",
    );
    requireRule(
      state.transmitted.length === 0 || state.radio,
      "Transmission records require a repaired radio.",
    );
    const consumedKits = Number(state.scanner) + Number(state.radio);
    requireRule(
      state.metal + 2 * (state.kits + consumedKits) === 6,
      "Metal and repair-kit conservation failed.",
    );
    return true;
  },
  validatePlan({ after, plan }) {
    const terms = plan.terms;
    const same = (a, b) =>
      a.length === b.length && a.every((value) => b.includes(value));
    requireRule(
      same(after.surveyed, terms.surveySectors),
      "The plan must produce exactly the declared survey set.",
    );
    requireRule(
      same(after.transmitted, terms.transmitSectors),
      "The plan must produce exactly the declared transmission set.",
    );
    requireRule(
      after.battery >= terms.minBattery,
      "The final battery reserve is too low.",
    );
    requireRule(
      after.heat <= terms.maxHeat,
      "The final heat exceeds the agreed maximum.",
    );
    requireRule(
      after.metal >= terms.minMetal,
      "The plan consumes protected metal reserves.",
    );
    return true;
  },
  actions: [
    {
      id: "solar_charge",
      description:
        "Add 1–6 battery units, up to capacity 12. Adds exactly one heat.",
      parameters: units(6),
      reduce: (state, { units }) => ({
        state: {
          ...state,
          battery: state.battery + units,
          heat: state.heat + 1,
        },
        result: { event: "charged", units },
      }),
    },
    {
      id: "radiator_cool",
      description:
        "Remove 1–8 heat units, never below zero. Costs one battery.",
      parameters: units(8),
      reduce: (state, { units }) => ({
        state: {
          ...state,
          heat: state.heat - units,
          battery: state.battery - 1,
        },
        result: { event: "cooled", units },
      }),
    },
    {
      id: "fabricate_kit",
      description:
        "Build 1–3 kits. Each costs two metal and two battery and adds two heat.",
      parameters: units(3),
      reduce: (state, { units }) => ({
        state: {
          ...state,
          metal: state.metal - units * 2,
          battery: state.battery - units * 2,
          heat: state.heat + units * 2,
          kits: state.kits + units,
        },
        result: { event: "fabricated", units },
      }),
    },
    {
      id: "repair_subsystem",
      description:
        "Repair scanner or radio once, consuming one kit and battery, adding one heat.",
      parameters: object({
        subsystem: { type: "string", enum: ["scanner", "radio"] },
      }),
      reduce(state, { subsystem }) {
        requireRule(!state[subsystem], "This subsystem is already repaired.");
        return {
          state: {
            ...state,
            [subsystem]: true,
            kits: state.kits - 1,
            battery: state.battery - 1,
            heat: state.heat + 1,
          },
          result: { event: "repaired", subsystem },
        };
      },
    },
    {
      id: "survey_sector",
      description:
        "Survey one new sector with the scanner. Costs two battery and adds one heat.",
      parameters: object({ sector }),
      reduce(state, { sector }) {
        requireRule(state.scanner, "Repair the scanner before surveying.");
        requireRule(
          !state.surveyed.includes(sector),
          "This sector was already surveyed.",
        );
        return {
          state: {
            ...state,
            surveyed: [...state.surveyed, sector],
            battery: state.battery - 2,
            heat: state.heat + 1,
          },
          result: { event: "surveyed", sector },
        };
      },
    },
    {
      id: "transmit_survey",
      description:
        "Send one surveyed sector through the repaired radio. Costs one battery and adds one heat.",
      parameters: object({ sector }),
      reduce(state, { sector }) {
        requireRule(
          state.radio && state.surveyed.includes(sector),
          "Repair the radio and survey this sector before transmitting.",
        );
        requireRule(
          !state.transmitted.includes(sector),
          "This survey was already transmitted.",
        );
        return {
          state: {
            ...state,
            transmitted: [...state.transmitted, sector],
            battery: state.battery - 1,
            heat: state.heat + 1,
          },
          result: { event: "transmitted", sector },
        };
      },
    },
  ],
});

export const createSession = (checkpoint) =>
  createRuntime(registry, initialState, checkpoint ? { checkpoint } : {});
