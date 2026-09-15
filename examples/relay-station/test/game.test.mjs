import test from "node:test";
import assert from "node:assert/strict";
import { createSession, registry, initialState } from "../game.mjs";

const step = (action, args) => ({
  action,
  arguments: args,
  description: action,
});
export const testPlan = {
  status: "ready",
  title: "Two-sector repair trial",
  interpretation: "Test fixture, not a live response",
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
};
const guard = (runtime) => ({
  branchId: runtime.snapshot().branchId,
  expectedRevision: runtime.snapshot().revision,
});

test("different domain executes from the installed package and resumes receipts", () => {
  let runtime = createSession();
  runtime.stage(testPlan, {
    ...guard(runtime),
    intent: "Deterministic test fixture",
  });
  runtime.accept({
    ...guard(runtime),
    proposalId: runtime.snapshot().proposal.id,
  });
  assert.deepEqual(runtime.snapshot().state, initialState);
  for (let index = 0; index < testPlan.steps.length; index++) {
    const plan = runtime.snapshot().plans[0];
    const command = {
      ...guard(runtime),
      planId: plan.id,
      stepId: plan.stepIds[index],
    };
    const first = runtime.step(command);
    runtime = createSession(runtime.snapshot());
    assert.equal(runtime.step(command).replayed, true);
    assert.deepEqual(runtime.snapshot(), first.snapshot);
  }
  assert.deepEqual(runtime.snapshot().state, {
    battery: 2,
    heat: 2,
    metal: 2,
    kits: 0,
    scanner: true,
    radio: true,
    surveyed: ["north", "east"],
    transmitted: ["north", "east"],
  });
  assert.equal(runtime.snapshot().receipts.length, 11);
});

test("resource failures and unrequested broadcasts cannot stage", () => {
  const runtime = createSession();
  const overflow = structuredClone(testPlan);
  overflow.steps.unshift(step("solar_charge", { units: 6 }));
  assert.throws(() =>
    runtime.stage(overflow, { ...guard(runtime), intent: "Overflow" }),
  );
  const privacy = structuredClone(testPlan);
  privacy.terms.transmitSectors = ["north"];
  assert.throws(
    () => registry.simulate(initialState, privacy),
    /exactly the declared transmission set/,
  );
  assert.equal(runtime.snapshot().revision, 0);
  assert.deepEqual(runtime.snapshot().state, initialState);
});
