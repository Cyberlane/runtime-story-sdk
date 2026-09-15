import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime, planIntent, RuntimeError } from "../src/index.mjs";
import { game, initial, proposal, guard } from "./fixtures.mjs";

function setup() {
  const registry = game();
  return { registry, runtime: createRuntime(registry, initial) };
}

test("injected provider receives registered context and schema, then stages without executing", async () => {
  const { registry, runtime } = setup();
  const events = [];
  const result = await planIntent(
    runtime,
    registry,
    async (request) => {
      assert.equal(
        request.schema.properties.steps.items.anyOf[0].properties.action.const,
        "charge",
      );
      assert.equal(request.context.state.capacity, 5);
      assert.equal(request.feedback, null);
      return {
        output: JSON.stringify(proposal()),
        provenance: { provider: "test-fixture", live: false },
      };
    },
    "Charge to three",
    { onProgress: (event) => events.push(event.type) },
  );
  assert.deepEqual(runtime.snapshot().state, initial);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.snapshot.proposal.provenance.provider, "test-fixture");
  assert.deepEqual(events, [
    "provider_started",
    "validation_started",
    "plan_staged",
  ]);
});

test("bounded correction retains the invalid attempt and useful schema feedback", async () => {
  const { registry, runtime } = setup();
  let calls = 0;
  const result = await planIntent(
    runtime,
    registry,
    async (request) => {
      calls += 1;
      if (calls === 1) return { output: proposal("three") };
      assert.equal(request.feedback.error.code, "SCHEMA_REJECTED");
      assert.ok(request.feedback.error.details.errors.length > 0);
      assert.equal(request.feedback.previousOutput.terms.target, "three");
      return { output: proposal() };
    },
    "Charge to three",
  );
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].error.code, "SCHEMA_REJECTED");
  assert.equal(result.attempts[1].error, null);
  assert.deepEqual(runtime.snapshot().state, initial);
});

test("malformed JSON and exhausted host rejection preserve the original world", async () => {
  const { registry, runtime } = setup();
  const original = runtime.snapshot();
  let calls = 0;
  await assert.rejects(
    planIntent(
      runtime,
      registry,
      async () => {
        calls += 1;
        return { output: calls === 1 ? "{broken" : proposal(9) };
      },
      "Charge to nine",
    ),
    (error) => {
      assert.equal(error.name, "PlanningError");
      assert.equal(error.attempts.length, 2);
      assert.equal(error.attempts[0].error.code, "MALFORMED_OUTPUT");
      assert.equal(error.attempts[1].error.code, "HOST_REJECTED");
      return true;
    },
  );
  assert.equal(calls, 2);
  assert.deepEqual(runtime.snapshot(), original);
});

test("timeout aborts the provider and late output cannot stage a result", async () => {
  const { registry, runtime } = setup();
  const original = runtime.snapshot();
  let finish;
  let providerSignal;
  let calls = 0;
  const pending = planIntent(
    runtime,
    registry,
    (request) => {
      calls += 1;
      providerSignal = request.signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    "Charge to three",
    { timeoutMs: 20 },
  );
  await assert.rejects(pending, { code: "PROVIDER_TIMEOUT" });
  assert.equal(providerSignal.aborted, true);
  finish({ output: proposal() });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.deepEqual(runtime.snapshot(), original);
});

test("one request per session, cancellation and stale world responses are explicit failures", async () => {
  const { registry, runtime } = setup();
  let finish;
  const pending = planIntent(
    runtime,
    registry,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    "Charge to three",
  );
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    planIntent(
      runtime,
      registry,
      async () => ({ output: proposal() }),
      "Concurrent request",
    ),
    { code: "PLANNING_BUSY" },
  );
  runtime.change(initial, {
    ...guard(runtime),
    reason: "An external event happened",
  });
  const changed = runtime.snapshot();
  finish({ output: proposal() });
  await assert.rejects(pending, { code: "STALE_REVISION" });
  assert.deepEqual(runtime.snapshot(), changed);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    planIntent(
      runtime,
      registry,
      async () => ({ output: proposal() }),
      "Cancelled request",
      { signal: controller.signal },
    ),
    { code: "CANCELLED" },
  );
});

test("only explicitly retryable transport errors retry, observer failures do not change success", async () => {
  const { registry, runtime } = setup();
  let calls = 0;
  await planIntent(
    runtime,
    registry,
    async () => {
      calls += 1;
      if (calls === 1)
        throw new RuntimeError(
          "RETRYABLE_PROVIDER_ERROR",
          "Temporary connection failure",
        );
      return { output: proposal() };
    },
    "Charge to three",
    {
      onProgress: async () => {
        throw new Error("Observer unavailable");
      },
    },
  );
  assert.equal(calls, 2);
  const before = runtime.snapshot();
  await assert.rejects(
    planIntent(
      runtime,
      registry,
      async () => {
        throw new Error("Missing credentials");
      },
      "Charge to three",
    ),
    (error) => {
      assert.equal(error.code, "PROVIDER_ERROR");
      assert.equal(error.attempts.length, 1);
      return true;
    },
  );
  assert.deepEqual(runtime.snapshot(), before);
});

test("invalid provider objects do not break retained failure diagnostics", async () => {
  const { registry, runtime } = setup();
  await assert.rejects(
    planIntent(
      runtime,
      registry,
      async () => ({ output: proposal(), provenance: () => "not JSON" }),
      "Charge",
      { maxAttempts: 1 },
    ),
    (error) => {
      assert.equal(error.code, "INVALID_JSON");
      assert.equal(error.attempts.length, 1);
      return true;
    },
  );
  assert.equal(runtime.snapshot().revision, 0);
});
