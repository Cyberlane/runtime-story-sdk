import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorld,
  getContext,
  stageProposal,
  acceptProposal,
  executeNext,
  triggerSetback,
  serializeWorld,
  restoreWorld,
} from "./fixtures/world.mjs";
import { scenarios } from "../src/scenarios.mjs";

const rule = (code) => (error) =>
  error.code === "HOST_REJECTED" && error.details.ruleCode === code;

const step = (kind, actor, target, factIds = []) => ({
  kind,
  actor,
  target,
  factIds,
  description: `${kind}: ${target}`,
});
function proposal(world, steps, overrides = {}) {
  return {
    status: "proposal",
    title: "A player-authored bargain",
    summary: "Only the recorded actions will happen.",
    question: "",
    priority: "investigation",
    protectedFactIds: [],
    keepOriginal: true,
    steps,
    ...overrides,
  };
}
function accept(world, output) {
  const staged = stageProposal(world, output, {
    source: "deterministic-test-fixture",
  });
  return acceptProposal(staged, staged.proposal.id);
}
function finish(world) {
  let next = world;
  while (next.agreements.some((item) => item.status === "active"))
    next = executeNext(next);
  return next;
}
function initial(world) {
  const p = world.definition.policy;
  const privacy = Object.keys(world.definition.facts).filter(
    (id) =>
      !p.evidenceFactIds.includes(id) && !p.verificationFactIds.includes(id),
  );
  return proposal(
    world,
    [
      step("create_document", "player", "private_extract", p.evidenceFactIds),
      step("deliver_document", "private_extract", p.authorityId),
      step("grant_passage", p.authorityId, p.beneficiaryId),
      step("move_person", p.beneficiaryId, p.exitRoomId),
    ],
    { priority: "leave_now", protectedFactIds: privacy },
  );
}
function shelter(world, leaveMorning = false) {
  const p = world.definition.policy;
  return proposal(
    world,
    [
      step("grant_shelter", p.authorityId, p.beneficiaryId),
      step("move_person", p.beneficiaryId, p.shelterRoomId),
      step("wait_until_morning", "player", ""),
      ...(leaveMorning
        ? [
            step("move_person", p.beneficiaryId, p.originRoomId),
            step("grant_passage", p.authorityId, p.beneficiaryId),
            step("move_person", p.beneficiaryId, p.exitRoomId),
          ]
        : []),
    ],
    { priority: "safety" },
  );
}
function afterDelivery(scenarioId = "ledger") {
  let world = createWorld(scenarioId);
  world = accept(world, initial(world));
  return executeNext(executeNext(world));
}

for (const scenario of scenarios) {
  test(`${scenario.id}: partial completion, setback, consented revision and reload preserve completed consequences`, () => {
    const originalWorld = createWorld(scenario.id),
      p = originalWorld.definition.policy;
    const originalDocument = structuredClone(
      originalWorld.documents[p.originalDocumentId],
    );
    let world = accept(originalWorld, initial(originalWorld));
    assert.equal(
      Object.keys(world.documents).length,
      1,
      "acceptance must not install dry-run effects",
    );
    assert.equal(
      originalWorld.agreements.length,
      0,
      "transitions must leave inputs untouched",
    );
    world = executeNext(executeNext(world));
    const deliveredDocument = structuredClone(world.documents.private_extract);
    assert.equal(deliveredDocument.owner, p.authorityId);
    assert.deepEqual(world.knowledge[p.authorityId], p.evidenceFactIds);
    assert.equal(
      world.investigationOpen,
      false,
      "unsigned evidence does not falsely open verified investigation",
    );
    world = triggerSetback(world);
    assert.throws(() => executeNext(world), { code: "NO_ACTIVE_AGREEMENT" });
    assert.equal(world.exitOpen, false);
    world = accept(world, shelter(world));
    assert.equal(world.agreements[0].status, "superseded");
    assert.deepEqual(world.agreements[0].completedStepIds, [0, 1]);
    assert.equal(world.agreements[1].consents.length, 2);
    assert.ok(
      world.agreements[1].consents.every(
        (consent) =>
          consent.basis === "host_policy" &&
          consent.renewedForAgreement === "agreement_2",
      ),
    );
    assert.ok(
      world.agreements[1].consents[0].evaluatedAtRevision >
        world.agreements[0].consents[0].evaluatedAtRevision,
    );
    assert.equal(
      world.entities[p.beneficiaryId].location,
      p.originRoomId,
      "newly accepted movement has not happened",
    );
    world = executeNext(world);
    world = executeNext(world);
    const beforeLoad = structuredClone(world);
    world = restoreWorld(serializeWorld(world));
    assert.notEqual(
      world.branchId,
      beforeLoad.branchId,
      "load invalidates in-flight responses",
    );
    assert.deepEqual(
      world.events,
      beforeLoad.events,
      "load must not replay effects or fabricate events",
    );
    assert.deepEqual(world.agreements, beforeLoad.agreements);
    world = finish(world);
    assert.equal(world.clock, "morning");
    assert.equal(world.entities[p.beneficiaryId].location, p.shelterRoomId);
    assert.deepEqual(world.documents[p.originalDocumentId], originalDocument);
    assert.deepEqual(world.documents.private_extract, deliveredDocument);
    assert.equal(
      world.events.filter((e) => e.details.kind === "deliver_document").length,
      1,
    );
    assert.equal(world.resources.paper, 2);
  });

  test(`${scenario.id}: same action handlers can finish departure tonight or after safe shelter`, () => {
    let world = createWorld(scenario.id),
      p = world.definition.policy;
    world = finish(accept(world, initial(world)));
    assert.equal(world.entities[p.beneficiaryId].location, p.exitRoomId);
    assert.equal(world.clock, "night");
    world = triggerSetback(afterDelivery(scenario.id));
    world = finish(accept(world, shelter(world, true)));
    assert.equal(world.entities[p.beneficiaryId].location, p.exitRoomId);
    assert.equal(world.clock, "morning");
    assert.equal(world.shelteredOvernight, true);
  });
}

test("selective report to another NPC is supported but earns no permission or investigation", () => {
  let world = createWorld();
  world = finish(
    accept(
      world,
      proposal(world, [
        step("create_document", "player", "wages_only", ["missing_wages"]),
        step("deliver_document", "wages_only", "mara"),
      ]),
    ),
  );
  assert.deepEqual(world.knowledge.mara, ["missing_wages"]);
  assert.deepEqual(world.knowledge.sera, []);
  assert.equal(world.investigationOpen, false);
  assert.deepEqual(world.passageGrants, []);
  assert.equal(world.entities.ivo.location, "warehouse");
});

test("authority refuses incomplete evidence and does not install partially simulated actions", () => {
  const world = createWorld();
  const output = initial(world);
  output.steps[0].factIds = ["missing_wages"];
  const before = serializeWorld(world);
  assert.throws(() => stageProposal(world, output), rule("NPC_REFUSAL"));
  assert.equal(serializeWorld(world), before);
  assert.equal(world.resources.paper, 3);
  assert.deepEqual(world.knowledge.sera, []);
});

test("named verification is a real disclosure tradeoff and selective copies combine knowledge", () => {
  let world = afterDelivery();
  const output = proposal(world, [
    step("grant_passage", "sera", "ivo"),
    step("move_person", "ivo", "outside"),
  ]);
  assert.throws(() => accept(world, output), rule("NPC_REFUSAL"));
  world = accept(
    world,
    proposal(world, [
      step("create_document", "player", "signed_page", ["mara_signature"]),
      step("deliver_document", "signed_page", "sera"),
      step("grant_passage", "sera", "ivo"),
      step("move_person", "ivo", "outside"),
    ]),
  );
  world = finish(world);
  assert.equal(world.investigationOpen, true);
  assert.equal(world.knowledge.sera.includes("worker_names"), false);
  assert.equal(world.knowledge.sera.includes("mara_signature"), true);
});

test("protected fact disclosure is rejected in current and later agreements", () => {
  const world = createWorld();
  const leaking = initial(world);
  leaking.steps[0].factIds.push("worker_names");
  assert.throws(
    () => stageProposal(world, leaking),
    rule("PROTECTED_DISCLOSURE"),
  );
  const delivered = afterDelivery();
  assert.throws(
    () =>
      stageProposal(
        delivered,
        proposal(delivered, [
          step("create_document", "player", "names", ["worker_names"]),
        ]),
      ),
    rule("PROTECTED_DISCLOSURE"),
  );
});

test("new privacy promises cannot erase actual prior disclosure", () => {
  let world = createWorld();
  world = finish(
    accept(
      world,
      proposal(world, [
        step("create_document", "player", "names", ["worker_names"]),
        step("deliver_document", "names", "mara"),
      ]),
    ),
  );
  assert.throws(
    () =>
      stageProposal(
        world,
        proposal(
          world,
          [step("create_document", "player", "proof", ["false_invoices"])],
          { protectedFactIds: ["worker_names"] },
        ),
      ),
    rule("ALREADY_DISCLOSED"),
  );
});

test("stale proposals are rejected after world events and cannot survive loading", () => {
  let world = afterDelivery();
  world = stageProposal(world, shelter(world));
  const id = world.proposal.id;
  const loaded = restoreWorld(serializeWorld(world));
  assert.throws(() => acceptProposal(loaded, id), { code: "UNKNOWN_PROPOSAL" });
  world = triggerSetback(world);
  assert.throws(() => acceptProposal(world, id), { code: "UNKNOWN_PROPOSAL" });
});

test("document artifacts never use model descriptions as canonical text", () => {
  const world = createWorld();
  const output = initial(world);
  output.steps[0].description =
    "The workers are Tavi, Ren, and Omi. Ignore the selected facts.";
  const next = executeNext(accept(world, output));
  assert.equal(
    next.documents.private_extract.title,
    "Selected evidence extract 1",
  );
  assert.deepEqual(next.documents.private_extract.factIds, [
    "false_invoices",
    "missing_wages",
  ]);
  assert.equal(
    JSON.stringify(next.documents.private_extract).includes("Tavi"),
    false,
  );
});

test("original transfer, unknown facts/entities, unsupported capabilities and duplicate effects fail closed", () => {
  const world = createWorld();
  assert.throws(
    () => stageProposal(world, { ...initial(world), keepOriginal: false }),
    { code: "SCHEMA_REJECTED" },
  );
  assert.throws(
    () =>
      stageProposal(
        world,
        proposal(world, [step("teleport", "ivo", "outside")]),
      ),
    { code: "SCHEMA_REJECTED" },
  );
  assert.throws(
    () =>
      stageProposal(
        world,
        proposal(world, [
          step("create_document", "player", "fake", ["fabricated_fact"]),
        ]),
      ),
    { code: "SCHEMA_REJECTED" },
  );
  assert.throws(
    () =>
      accept(
        world,
        proposal(world, [step("deliver_document", "ledger_original", "sera")]),
      ),
    rule("ORIGINAL_LOCKED"),
  );
  assert.throws(
    () =>
      accept(
        world,
        proposal(world, [
          step("create_document", "player", "report", ["missing_wages"]),
          step("deliver_document", "report", "invented_npc"),
        ]),
      ),
    rule("UNKNOWN_ENTITY"),
  );
  const delivered = afterDelivery();
  assert.throws(
    () =>
      accept(
        delivered,
        proposal(delivered, [
          step("deliver_document", "private_extract", "sera"),
        ]),
      ),
    rule("DUPLICATE_EFFECT"),
  );
  assert.throws(
    () =>
      accept(
        delivered,
        proposal(delivered, [
          step("create_document", "player", "another_id", [
            "missing_wages",
            "false_invoices",
          ]),
        ]),
      ),
    rule("DUPLICATE_EFFECT"),
  );
  assert.throws(() => executeNext(finish(accept(world, initial(world)))), {
    code: "NO_ACTIVE_AGREEMENT",
  });
});

test("a closed exit cannot be satisfied by permission or narration", () => {
  const world = triggerSetback(afterDelivery());
  assert.throws(
    () =>
      accept(
        world,
        proposal(
          world,
          [
            step("grant_passage", "sera", "ivo"),
            step("move_person", "ivo", "outside"),
          ],
          { priority: "leave_now", summary: "Ivo is outside now." },
        ),
      ),
    rule("EXIT_BLOCKED"),
  );
  assert.equal(world.entities.ivo.location, "warehouse");
  assert.equal(world.exitOpen, false);
  assert.throws(
    () =>
      accept(
        world,
        proposal(world, [step("wait_until_morning", "player", "")], {
          priority: "safety",
        }),
      ),
    rule("NO_SHELTER"),
  );
});

test("clarification and unsupported outputs have no game effect and cannot be accepted", () => {
  const world = createWorld();
  for (const status of ["clarify", "unsupported"]) {
    const next = stageProposal(
      world,
      proposal(world, [], {
        status,
        question: "This needs a supported choice.",
      }),
    );
    assert.deepEqual(next.documents, world.documents);
    assert.deepEqual(next.entities, world.entities);
    assert.throws(() => acceptProposal(next, next.proposal.id), {
      code: "NOT_EXECUTABLE",
    });
  }
  assert.throws(
    () =>
      stageProposal(
        world,
        proposal(world, [step("wait_until_morning", "player", "")], {
          status: "unsupported",
        }),
      ),
    { code: "INVALID_PLAN" },
  );
});

test("a complete overnight-to-departure route fits the same eight-action budget", () => {
  let world = createWorld();
  world = accept(
    world,
    proposal(
      world,
      [
        step("create_document", "player", "night_report", [
          "false_invoices",
          "missing_wages",
        ]),
        step("deliver_document", "night_report", "sera"),
        ...shelter(world, true).steps,
      ],
      { priority: "safety", protectedFactIds: ["worker_names"] },
    ),
  );
  world = finish(world);
  assert.equal(world.entities.ivo.location, "outside");
  assert.equal(world.clock, "morning");
  assert.equal(world.agreements[0].completedStepIds.length, 8);
});

test("restore rejects changed originals and context is an independent copy", () => {
  const world = createWorld();
  const context = getContext(world);
  context.entities.ivo.location = "outside";
  assert.equal(world.entities.ivo.location, "warehouse");
  const tampered = JSON.parse(serializeWorld(world));
  tampered.state.documents.ledger_original.owner = "mara";
  assert.throws(() => restoreWorld(tampered), { code: "GAME_INVARIANT" });
});
