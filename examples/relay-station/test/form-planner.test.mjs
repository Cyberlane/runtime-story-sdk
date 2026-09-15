import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { planFromForm } from "../comparison/form-planner.mjs";
import { registry, initialState } from "../game.mjs";

test("form search composes both feasible objectives and exhausts the impossible metal constraint", async () => {
  const cases = JSON.parse(
    await readFile(new URL("../comparison/cases.json", import.meta.url)),
  );
  for (const item of cases) {
    const result = planFromForm(item.terms);
    assert.equal(!!result.plan, item.possible, item.id);
    if (result.plan) {
      const simulated = registry.simulate(initialState, result.plan);
      assert.equal(
        simulated.state.transmitted.length,
        item.terms.transmitSectors.length,
      );
    } else assert.equal(result.exhausted, true);
  }
});
