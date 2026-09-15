import test from "node:test";
import assert from "node:assert/strict";
import { scenarios } from "../src/scenarios.mjs";
import { createOffScriptAdapter } from "../src/off-script-adapter.mjs";

const guard = (runtime) => ({
  branchId: runtime.snapshot().branchId,
  expectedRevision: runtime.snapshot().revision,
});
const action = (id, actor, target, factIds) => ({
  action: id,
  arguments: { actor, target, ...(factIds ? { factIds } : {}) },
  description: "Deterministic adapter integration fixture",
});
function stageAndAccept(runtime, plan) {
  runtime.stage(plan, {
    ...guard(runtime),
    intent: "Test the registered game adapter",
    provenance: { live: false, source: "test-fixture" },
  });
  runtime.accept({
    ...guard(runtime),
    proposalId: runtime.snapshot().proposal.id,
  });
}
function execute(runtime) {
  const active = runtime
    .snapshot()
    .plans.find((plan) => plan.status === "active");
  return runtime.step({
    ...guard(runtime),
    planId: active.id,
    stepId: active.stepIds[active.nextStep],
  });
}

for (const scenario of scenarios)
  test(`${scenario.id}: package executes evidence, interruption, revised shelter and departure through the game adapter`, () => {
    const adapter = createOffScriptAdapter(scenario.id);
    const runtime = adapter.createSession();
    const p = scenario.policy;
    const protectedFactIds = Object.keys(scenario.facts).filter(
      (id) => !p.evidenceFactIds.includes(id),
    );
    const terms = {
      priority: "leave_now",
      keepOriginal: true,
      protectedFactIds,
    };
    const plan = {
      status: "ready",
      title: "Private evidence bargain",
      interpretation: "Evidence for departure",
      question: "",
      terms,
      steps: [
        action("create_document", "player", "adapter_copy", p.evidenceFactIds),
        action("deliver_document", "adapter_copy", p.authorityId),
        action("grant_passage", p.authorityId, p.beneficiaryId),
        action("move_person", p.beneficiaryId, p.exitRoomId),
      ],
    };
    stageAndAccept(runtime, plan);
    assert.equal(Object.keys(runtime.snapshot().state.documents).length, 1);
    const first = execute(runtime);
    assert.equal(first.receipt.result.details.kind, "create_document");
    assert.equal(runtime.step(first.receipt.command).replayed, true);
    execute(runtime);
    adapter.applySetback(runtime);
    const delivered = structuredClone(
      runtime.snapshot().state.documents.adapter_copy,
    );
    const revised = {
      ...plan,
      title: "Safe night and morning departure",
      terms: { ...terms, priority: "safety" },
      steps: [
        action("grant_shelter", p.authorityId, p.beneficiaryId),
        action("move_person", p.beneficiaryId, p.shelterRoomId),
        action("wait_until_morning", "player", ""),
        action("move_person", p.beneficiaryId, p.originRoomId),
        action("grant_passage", p.authorityId, p.beneficiaryId),
        action("move_person", p.beneficiaryId, p.exitRoomId),
      ],
    };
    stageAndAccept(runtime, revised);
    execute(runtime);
    execute(runtime);
    const checkpoint = runtime.snapshot();
    runtime.restore(checkpoint, guard(runtime));
    for (let i = 0; i < 4; i += 1) execute(runtime);
    const final = runtime.snapshot();
    assert.equal(final.state.entities[p.beneficiaryId].location, p.exitRoomId);
    assert.equal(final.state.clock, "morning");
    assert.equal(
      final.state.documents[p.originalDocumentId].owner,
      p.beneficiaryId,
    );
    assert.equal(final.state.resources.paper, 2);
    assert.equal(final.state.investigationOpen, false);
    assert.deepEqual(final.state.documents.adapter_copy, delivered);
    assert.deepEqual(
      final.plans.map((plan) => plan.status),
      ["superseded", "fulfilled"],
    );
    assert.equal(final.receipts.length, 8);
    assert.equal(runtime.inspectSave(final).receipts.length, 8);
  });

test("game adapter rejects the malformed save states accepted by the old loader", () => {
  const adapter = createOffScriptAdapter();
  const runtime = adapter.createSession();
  for (const change of [
    (state) => {
      state.resources.paper = -1;
    },
    (state) => {
      state.entities.ivo.location = "missing-room";
    },
    (state) => {
      state.clock = "yesterday";
    },
  ]) {
    const bad = runtime.snapshot();
    change(bad.state);
    assert.throws(() => runtime.restore(bad, guard(runtime)));
    assert.equal(runtime.snapshot().revision, 0);
  }
});
