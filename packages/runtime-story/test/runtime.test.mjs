import test from "node:test";
import assert from "node:assert/strict";
import {
  createRuntime,
  stepCommandSchema,
  acceptCommandSchema,
} from "../src/index.mjs";
import {
  runtime,
  game,
  initial,
  proposal,
  guard,
  stage,
  accept,
  stepCommand,
} from "./fixtures.mjs";

function twoSteps() {
  const plan = proposal(4);
  plan.steps = [proposal(2).steps[0], proposal(2).steps[0]];
  return plan;
}

test("stage and acceptance have no game effects, exact-step retries never advance another action", () => {
  const rt = runtime();
  stage(rt, twoSteps());
  assert.deepEqual(rt.snapshot().state, initial);
  const acceptCommand = { ...guard(rt), proposalId: rt.snapshot().proposal.id };
  const acceptance = rt.accept(acceptCommand);
  assert.deepEqual(rt.snapshot().state, initial);
  assert.equal(rt.accept(acceptCommand).replayed, true);
  const first = stepCommand(rt);
  const firstResult = rt.step(first);
  assert.equal(firstResult.snapshot.state.charge, 2);
  assert.equal(rt.step(first).replayed, true);
  assert.equal(rt.snapshot().state.charge, 2);
  assert.equal(rt.snapshot().receipts.length, 1);
  assert.equal(rt.accept(acceptCommand).plan.id, acceptance.plan.id);
  const second = rt.step(stepCommand(rt));
  assert.equal(second.snapshot.state.charge, 4);
  assert.equal(second.snapshot.plans[0].status, "fulfilled");
  const repeat = rt.step(first);
  assert.equal(repeat.receipt.id, firstResult.receipt.id);
  assert.equal(repeat.snapshot.state.charge, 4);
  assert.equal(repeat.snapshot.revision, second.snapshot.revision);
});

test("missing guards, delayed commands and incorrect step identities fail without mutation", () => {
  const rt = runtime();
  stage(rt);
  accept(rt);
  const before = rt.snapshot();
  const command = stepCommand(rt);
  assert.throws(() => rt.step({}), { code: "INVALID_ENVELOPE" });
  assert.throws(() => rt.step({ ...command, expectedRevision: 0 }), {
    code: "STALE_REVISION",
  });
  assert.throws(() => rt.step({ ...command, stepId: "different" }), {
    code: "WRONG_STEP",
  });
  assert.throws(() => rt.step({ ...command, branchId: "different" }), {
    code: "STALE_BRANCH",
  });
  assert.deepEqual(rt.snapshot(), before);
});

test("a setback interrupts unfinished work, a revision preserves committed state and history", () => {
  const rt = runtime();
  stage(rt, twoSteps());
  accept(rt);
  rt.step(stepCommand(rt));
  rt.change(
    { charge: 2, capacity: 3 },
    { ...guard(rt), reason: "Capacity reduced" },
  );
  assert.equal(rt.snapshot().plans[0].status, "interrupted");
  assert.equal(rt.snapshot().proposal, null);
  const revised = proposal(3);
  revised.steps[0].arguments.amount = 1;
  stage(rt, revised);
  accept(rt);
  rt.step(stepCommand(rt));
  const final = rt.snapshot();
  assert.equal(final.state.charge, 3);
  assert.deepEqual(
    final.plans.map((plan) => plan.status),
    ["superseded", "fulfilled"],
  );
  assert.equal(final.receipts.length, 2);
  assert.equal(
    final.history.filter((event) => event.type === "plan_accepted").length,
    2,
  );
});

test("failed simulation and external events leave the whole runtime unchanged", () => {
  const rt = runtime();
  const before = rt.snapshot();
  assert.throws(() => stage(rt, proposal(6)), { code: "HOST_REJECTED" });
  assert.throws(
    () =>
      rt.change(
        { charge: -1, capacity: 5 },
        { ...guard(rt), reason: "Invalid change" },
      ),
    { code: "SCHEMA_REJECTED" },
  );
  assert.deepEqual(rt.snapshot(), before);
  stage(rt);
  const stale = { ...guard(rt), proposalId: rt.snapshot().proposal.id };
  rt.change(initial, { ...guard(rt), reason: "World event" });
  const changed = rt.snapshot();
  assert.throws(() => rt.accept(stale), { code: "STALE_REVISION" });
  assert.deepEqual(rt.snapshot(), changed);
});

test("restore keeps state and receipts together, abandons old commands and resumes remaining work", () => {
  const rt = runtime();
  stage(rt, twoSteps());
  accept(rt);
  const first = stepCommand(rt);
  rt.step(first);
  const checkpoint = JSON.parse(JSON.stringify(rt.snapshot()));
  const delayed = stepCommand(rt);
  rt.step(delayed);
  rt.restore(checkpoint, guard(rt));
  assert.notEqual(rt.snapshot().branchId, checkpoint.branchId);
  assert.equal(rt.snapshot().state.charge, 2);
  assert.equal(rt.snapshot().receipts.length, 1);
  assert.throws(() => rt.step(first), { code: "STALE_BRANCH" });
  assert.throws(() => rt.step(delayed), { code: "STALE_BRANCH" });
  rt.step(stepCommand(rt));
  assert.equal(rt.snapshot().state.charge, 4);
  assert.equal(rt.inspectSave(rt.snapshot()).receipts.length, 2);
});

test("restore rejects malformed domains, missing receipts, wrong identities and wrong adapter versions atomically", () => {
  const rt = runtime();
  stage(rt);
  accept(rt);
  rt.step(stepCommand(rt));
  const before = rt.snapshot();
  const corruptions = [
    (save) => {
      save.state.charge = -1;
    },
    (save) => {
      save.state.extra = true;
    },
    (save) => {
      save.receipts = [];
    },
    (save) => {
      save.receipts[0].command.stepId = "unknown";
    },
    (save) => {
      save.plans[0].nextStep = 0;
    },
    (save) => {
      save.adapter.version = "2";
    },
    (save) => {
      save.history[0].revision = 100;
    },
    (save) => {
      save.receipts.push(structuredClone(save.receipts[0]));
    },
    (save) => {
      save.history = [];
    },
    (save) => {
      save.receipts[0].result.added = 999;
    },
    (save) => {
      save.state.charge = 4;
    },
    (save) => {
      save.plans[0].plan.terms.target = 4;
    },
  ];
  for (const corrupt of corruptions) {
    const save = structuredClone(before);
    corrupt(save);
    assert.throws(() => rt.restore(save, guard(rt)));
    assert.deepEqual(rt.snapshot(), before);
  }
});

test("context, schemas and snapshots are detached and historical commitments reach game constraints", () => {
  let receivedHistory;
  const registry = game({
    validatePlan: ({ after, plan, history }) => {
      receivedHistory = history;
      return after.charge === plan.terms.target;
    },
  });
  const rt = createRuntime(registry, initial);
  stage(rt);
  accept(rt);
  rt.step(stepCommand(rt));
  assert.equal(
    receivedHistory.filter((event) => event.type === "plan_accepted").length,
    1,
  );
  assert.equal(Object.isFrozen(receivedHistory), true);
  const copy = rt.snapshot();
  copy.state.charge = 0;
  copy.plans.length = 0;
  const context = rt.context();
  context.state.charge = 0;
  context.history.length = 0;
  assert.equal(rt.snapshot().state.charge, 3);
  assert.equal(rt.snapshot().plans.length, 1);
});

test("unsupported and clarification results are visible but cannot execute", () => {
  const rt = runtime();
  stage(rt, {
    ...proposal(),
    status: "needs_context",
    question: "Which target?",
    terms: null,
    steps: [],
  });
  const before = rt.snapshot();
  assert.throws(() => accept(rt), { code: "NOT_EXECUTABLE" });
  assert.deepEqual(rt.snapshot(), before);
});

test("host process resume preserves timeline identity and exact retry receipts", () => {
  const original = runtime();
  stage(original, twoSteps());
  accept(original);
  const first = stepCommand(original);
  original.step(first);
  const checkpoint = JSON.parse(JSON.stringify(original.snapshot()));
  const resumed = createRuntime(game(), initial, { checkpoint });
  assert.deepEqual(resumed.snapshot(), checkpoint);
  assert.equal(resumed.step(first).replayed, true);
  resumed.step(stepCommand(resumed));
  assert.equal(resumed.snapshot().state.charge, 4);
});

test("checkpoint validation rejects orphaned records and altered event facts", () => {
  const rt = runtime();
  stage(rt);
  accept(rt);
  rt.step(stepCommand(rt));
  const before = rt.snapshot();
  const corruptions = [
    (save) => {
      save.plans = [];
      save.receipts = [];
    },
    (save) => {
      save.plans[0].intent = "Altered intention";
    },
    (save) => {
      save.history.at(-1).data.action = "invented_action";
    },
    (save) => {
      save.history[0].type = "invented_event";
    },
  ];
  for (const corrupt of corruptions) {
    const save = structuredClone(before);
    corrupt(save);
    assert.throws(() => rt.restore(save, guard(rt)));
    assert.deepEqual(rt.snapshot(), before);
  }

  const fresh = runtime();
  stage(fresh);
  const staged = fresh.snapshot();
  staged.history.at(-1).data.status = "unsupported";
  assert.throws(() => fresh.inspectSave(staged), { code: "INVALID_SAVE" });
});

test("exported protocol schemas cannot weaken validation in later sessions", () => {
  assert.throws(() => {
    stepCommandSchema.properties.expectedRevision.minimum = -1;
  }, TypeError);
  assert.throws(() => {
    acceptCommandSchema.required.length = 0;
  }, TypeError);
  const rt = runtime();
  stage(rt);
  assert.throws(() => rt.accept({}), { code: "INVALID_ENVELOPE" });
});
