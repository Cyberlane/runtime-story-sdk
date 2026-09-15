import test from "node:test";
import assert from "node:assert/strict";
import { copyJson, createRegistry } from "../src/registry.mjs";
import { game, proposal, initial } from "./fixtures.mjs";

test("registered numeric mechanics simulate without changing input state", () => {
  const runtime = game();
  const state = structuredClone(initial);
  const result = runtime.simulate(state, proposal());
  assert.deepEqual(result.state, { charge: 3, capacity: 5 });
  assert.deepEqual(result.results, [{ added: 3 }]);
  assert.deepEqual(state, initial);
  assert.equal(runtime.describe().actions[0].id, "charge");
});

test("schema and domain rules reject before a result can be committed", () => {
  const runtime = game();
  assert.throws(() => runtime.simulate(initial, proposal(6)), {
    code: "HOST_REJECTED",
  });
  assert.throws(() => runtime.simulate(initial, proposal("3")), {
    code: "SCHEMA_REJECTED",
  });
  const badGoal = proposal();
  badGoal.terms.target = 4;
  assert.throws(() => runtime.simulate(initial, badGoal), {
    code: "HOST_REJECTED",
  });
  assert.throws(() => runtime.validateState({ charge: -1, capacity: 5 }), {
    code: "SCHEMA_REJECTED",
  });
});

test("unknown actions, extra fields and malformed non-ready results fail closed", () => {
  const runtime = game();
  const unknown = proposal();
  unknown.steps[0].action = "teleport";
  assert.throws(() => runtime.simulate(initial, unknown), {
    code: "SCHEMA_REJECTED",
  });
  assert.throws(
    () => runtime.simulate(initial, { ...proposal(), extra: true }),
    { code: "SCHEMA_REJECTED" },
  );
  assert.throws(
    () => runtime.simulate(initial, { ...proposal(), status: "unsupported" }),
    { code: "INVALID_PLAN" },
  );
  assert.deepEqual(
    runtime.simulate(initial, {
      ...proposal(),
      status: "unsupported",
      terms: null,
      steps: [],
    }).state,
    initial,
  );
});

test("callbacks receive immutable inputs and async callbacks are rejected", () => {
  const mutating = game({
    validateState: (value) => {
      value.charge = 1;
      return true;
    },
  });
  assert.throws(() => mutating.validateState(initial), {
    code: "HOST_REJECTED",
  });
  const asynchronous = game({ context: async (state) => state });
  assert.throws(() => asynchronous.context(initial), {
    code: "ASYNC_CALLBACK",
  });
  assert.equal(initial.charge, 0);
});

test("JSON boundary rejects coercion, hidden properties, cycles and accessors", () => {
  const cycle = {};
  cycle.self = cycle;
  const accessor = Object.defineProperty({}, "value", {
    get() {
      throw new Error("must not run");
    },
    enumerable: true,
  });
  for (const value of [
    undefined,
    NaN,
    Infinity,
    new Date(),
    new Array(2),
    cycle,
    accessor,
    { a: undefined },
  ]) {
    assert.throws(() => copyJson(value), { code: "INVALID_JSON" });
  }
  const protoKey = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.deepEqual(copyJson(protoKey), protoKey);
  assert.equal({}.polluted, undefined);
});

test("schema snapshots cannot modify the registered contract", () => {
  const runtime = game();
  const schema = runtime.schema();
  schema.properties.steps.maxItems = 0;
  const description = runtime.describe();
  description.actions[0].id = "other";
  assert.equal(runtime.simulate(initial, proposal()).state.charge, 3);
  assert.equal(runtime.describe().actions[0].id, "charge");
  assert.equal(runtime.fingerprint, game().fingerprint);
  assert.notEqual(runtime.fingerprint, game({ version: "2" }).fingerprint);
});

test("invalid adapter registrations provide startup diagnostics", () => {
  for (const definition of [null, undefined, [], "invalid"]) {
    assert.throws(() => createRegistry(definition), {
      code: "INVALID_ADAPTER",
    });
  }
  assert.throws(() => game({ actions: [null] }), { code: "INVALID_ADAPTER" });
  assert.throws(() => game({ actions: [] }), { code: "INVALID_ADAPTER" });
  assert.throws(
    () => game({ stateSchema: { type: "object", typoKeyword: true } }),
    { code: "INVALID_SCHEMA" },
  );
  assert.throws(() => game({ maxSteps: 0 }), { code: "INVALID_ADAPTER" });
});

test("host callbacks may throw non-Error values without losing runtime diagnostics", () => {
  for (const reason of [null, "rejected"]) {
    const registry = game({
      context() {
        throw reason;
      },
    });
    assert.throws(() => registry.context(initial), { code: "HOST_REJECTED" });
  }
});
