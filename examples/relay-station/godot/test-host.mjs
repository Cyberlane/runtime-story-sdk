import { createStationServer } from "../server.mjs";

const step = (action, args) => ({
  action,
  arguments: args,
  description: action,
});
const provider = {
  info: () => ({
    kind: "fixture",
    model: "none",
    configured: true,
    label: "Deterministic native-client test. No inference.",
  }),
  async generate() {
    return {
      provenance: { provider: "fixture", model: "none" },
      output: {
        status: "ready",
        title: "Native transport smoke test",
        interpretation:
          "Authored fixture to verify the client protocol. Not a model response.",
        question: "",
        terms: {
          surveySectors: ["north", "east"],
          transmitSectors: ["north", "east"],
          minBattery: 2,
          maxHeat: 2,
          minMetal: 2,
        },
        steps: [
          step("solar_charge", { units: 5 }),
          step("fabricate_kit", { units: 2 }),
          step("repair_subsystem", { subsystem: "scanner" }),
          step("repair_subsystem", { subsystem: "radio" }),
          step("radiator_cool", { units: 6 }),
          step("solar_charge", { units: 6 }),
          step("survey_sector", { sector: "north" }),
          step("survey_sector", { sector: "east" }),
          step("transmit_survey", { sector: "north" }),
          step("transmit_survey", { sector: "east" }),
          step("radiator_cool", { units: 4 }),
        ],
      },
    };
  },
};

const server = createStationServer({ provider });
server.listen(Number(process.env.PORT ?? 4339), "127.0.0.1", () => {
  console.log(
    `Deterministic Godot test host: http://127.0.0.1:${server.address().port}`,
  );
});
