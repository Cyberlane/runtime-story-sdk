import test from "node:test";
import assert from "node:assert/strict";
import { scenarios } from "../src/scenarios.mjs";
import {
  createWorld,
  stageProposal,
  acceptProposal,
  executeNext,
  triggerSetback,
  serializeWorld,
  restoreWorld,
} from "./fixtures/world.mjs";

const rule = (code) => (error) =>
  error.code === "HOST_REJECTED" && error.details.ruleCode === code;

const addedIds = ["ferry", "theatre", "glasshouse", "archive"];
const action = (kind, actor, target, factIds = []) => ({
  kind,
  actor,
  target,
  factIds,
  description: `${kind} ${target}`,
});
const privacyIds = (scenario) =>
  Object.keys(scenario.facts).filter(
    (id) =>
      !scenario.policy.evidenceFactIds.includes(id) &&
      !scenario.policy.verificationFactIds.includes(id),
  );

function acceptFixture(world, steps, priority, protectedFactIds = []) {
  const staged = stageProposal(
    world,
    {
      status: "proposal",
      title: "Scenario runtime fixture",
      summary: "Execute only these registered actions.",
      question: "",
      priority,
      protectedFactIds,
      keepOriginal: true,
      steps,
    },
    { source: "authored-scenario-test", live: false },
  );
  return acceptProposal(staged, staged.proposal.id);
}

function complete(world) {
  let next = world;
  while (next.agreements.some((agreement) => agreement.status === "active"))
    next = executeNext(next);
  return next;
}

test("the six-scene catalogue has complete presentation and valid, isolated fact and actor references", () => {
  assert.equal(scenarios.length, 6);
  assert.equal(
    new Set(scenarios.map((scene) => scene.id)).size,
    scenarios.length,
  );
  const npcIds = [],
    factIds = [],
    originalIds = [];
  for (const scene of scenarios) {
    const p = scene.policy;
    for (const field of [
      "chapter",
      "kicker",
      "genre",
      "brief",
      "stakes",
      "accent",
      "mood",
      "documentLabel",
    ]) {
      assert.equal(
        typeof scene.presentation[field],
        "string",
        `${scene.id} needs ${field}`,
      );
      assert.ok(scene.presentation[field].trim().length > 0);
    }
    assert.match(scene.presentation.accent, /^#[a-f0-9]{6}$/i);
    assert.ok(
      scene.initialPrompt.length > 40 && scene.revisionPrompt.length > 40,
    );
    const people = Object.values(scene.entities).filter(
      (entity) => entity.kind === "person",
    );
    assert.equal(
      people.length,
      4,
      `${scene.id} contains only the player and three primary NPCs`,
    );
    assert.equal(
      Object.values(scene.entities).filter((entity) => entity.kind === "room")
        .length,
      3,
    );
    for (const [id, entity] of Object.entries(scene.entities)) {
      assert.equal(entity.id, id);
      if (entity.kind === "person") {
        assert.equal(scene.entities[entity.location]?.kind, "room");
        assert.ok(entity.role && entity.description);
      }
    }
    const roles = [p.authorityId, p.beneficiaryId, p.antagonistId];
    assert.equal(new Set(roles).size, 3);
    roles.forEach((id) => assert.equal(scene.entities[id]?.kind, "person"));
    for (const room of [p.originRoomId, p.shelterRoomId, p.exitRoomId])
      assert.equal(scene.entities[room]?.kind, "room");
    for (const [from, to] of p.routes) {
      assert.equal(scene.entities[from]?.kind, "room");
      assert.equal(scene.entities[to]?.kind, "room");
      assert.notEqual(from, to);
    }
    assert.ok(
      p.routes.some(
        (pair) =>
          pair.includes(p.originRoomId) && pair.includes(p.shelterRoomId),
      ),
    );
    assert.ok(
      p.routes.some(
        (pair) => pair.includes(p.originRoomId) && pair.includes(p.exitRoomId),
      ),
    );
    for (const id of [...p.evidenceFactIds, ...p.verificationFactIds])
      assert.ok(scene.facts[id], `${scene.id} has unknown policy fact ${id}`);
    assert.equal(privacyIds(scene).length, 1);
    npcIds.push(...roles);
    factIds.push(...Object.keys(scene.facts));
    originalIds.push(p.originalDocumentId);
  }
  assert.equal(
    new Set(npcIds).size,
    npcIds.length,
    "scenario casts must not accidentally share identity",
  );
  assert.equal(
    new Set(factIds).size,
    factIds.length,
    "scenario evidence must not leak through reused fact IDs",
  );
  assert.equal(new Set(originalIds).size, originalIds.length);
  assert.deepEqual(
    scenarios.find((scene) => scene.id === "ledger").policy.evidenceFactIds,
    ["false_invoices", "missing_wages"],
  );
  assert.deepEqual(
    scenarios.find((scene) => scene.id === "lab").policy.evidenceFactIds,
    ["sensor_mismatch", "suppressed_warning"],
  );
});

for (const scenarioId of addedIds) {
  test(`${scenarioId}: accepted privacy bargain, actual delivery, interruption, revised morning departure and reload`, () => {
    let world = createWorld(scenarioId);
    const p = world.definition.policy;
    const hidden = privacyIds(world.definition);
    const original = structuredClone(world.documents[p.originalDocumentId]);
    const firstPlan = [
      action(
        "create_document",
        "player",
        "protected_extract",
        p.evidenceFactIds,
      ),
      action("deliver_document", "protected_extract", p.authorityId),
      action("grant_passage", p.authorityId, p.beneficiaryId),
      action("move_person", p.beneficiaryId, p.exitRoomId),
    ];
    world = acceptFixture(world, firstPlan, "leave_now", hidden);
    assert.equal(
      world.resources.paper,
      3,
      "acceptance does not perform the copy",
    );
    assert.deepEqual(
      world.knowledge[p.authorityId],
      [],
      "acceptance does not disclose facts",
    );
    assert.deepEqual(
      world.agreements[0].consents.map((item) => item.actorId),
      [p.beneficiaryId, p.authorityId],
    );
    world = executeNext(executeNext(world));
    const delivered = structuredClone(world.documents.protected_extract);
    assert.equal(delivered.owner, p.authorityId);
    assert.deepEqual(world.knowledge[p.authorityId], p.evidenceFactIds);
    world = triggerSetback(world);
    assert.equal(world.exitOpen, false);
    assert.equal(world.agreements[0].status, "interrupted");
    assert.throws(
      () => acceptFixture(world, firstPlan.slice(2), "leave_now", hidden),
      rule("EXIT_BLOCKED"),
    );
    world = acceptFixture(
      world,
      [
        action("grant_shelter", p.authorityId, p.beneficiaryId),
        action("move_person", p.beneficiaryId, p.shelterRoomId),
        action("wait_until_morning", "player", ""),
        action("move_person", p.beneficiaryId, p.originRoomId),
        action("grant_passage", p.authorityId, p.beneficiaryId),
        action("move_person", p.beneficiaryId, p.exitRoomId),
      ],
      "safety",
    );
    assert.equal(world.agreements[0].status, "superseded");
    assert.deepEqual(world.agreements[0].completedStepIds, [0, 1]);
    assert.deepEqual(
      world.agreements[1].protectedFactIds,
      hidden,
      "revision inherits privacy even when not repeated",
    );
    assert.ok(
      world.agreements[1].consents.every(
        (item) => item.renewedForAgreement === "agreement_2",
      ),
    );
    world = executeNext(executeNext(world));
    assert.equal(world.entities[p.beneficiaryId].location, p.shelterRoomId);
    const checkpoint = structuredClone(world);
    world = restoreWorld(serializeWorld(world));
    assert.notEqual(world.branchId, checkpoint.branchId);
    assert.deepEqual(world.documents, checkpoint.documents);
    assert.deepEqual(world.events, checkpoint.events);
    assert.deepEqual(world.agreements, checkpoint.agreements);
    world = complete(world);
    assert.equal(world.clock, "morning");
    assert.equal(world.shelteredOvernight, true);
    assert.equal(world.exitOpen, true);
    assert.equal(world.entities[p.beneficiaryId].location, p.exitRoomId);
    assert.deepEqual(world.documents[p.originalDocumentId], original);
    assert.deepEqual(world.documents.protected_extract, delivered);
    assert.equal(world.resources.paper, 2);
    assert.equal(
      world.events.filter((event) => event.details.kind === "deliver_document")
        .length,
      1,
    );
    for (const id of hidden)
      assert.equal(world.knowledge[p.authorityId].includes(id), false);
    assert.equal(
      world.investigationOpen,
      false,
      "unsigned evidence supports protection without naming a signatory",
    );
    assert.throws(() => executeNext(world), { code: "NO_ACTIVE_AGREEMENT" });
  });

  test(`${scenarioId}: named verification changes the investigation outcome without exposing incidental identities`, () => {
    let world = createWorld(scenarioId);
    const p = world.definition.policy,
      hidden = privacyIds(world.definition);
    world = complete(
      acceptFixture(
        world,
        [
          action("create_document", "player", "signed_extract", [
            ...p.evidenceFactIds,
            ...p.verificationFactIds,
          ]),
          action("deliver_document", "signed_extract", p.authorityId),
        ],
        "investigation",
        hidden,
      ),
    );
    assert.equal(world.investigationOpen, true);
    assert.deepEqual(world.knowledge[p.authorityId], [
      ...p.evidenceFactIds,
      ...p.verificationFactIds,
    ]);
    assert.equal(
      world.entities[p.beneficiaryId].location,
      p.originRoomId,
      "a report is not an unsolicited escape bargain",
    );
    assert.deepEqual(world.passageGrants, []);
    assert.equal(world.documents[p.originalDocumentId].owner, p.beneficiaryId);
    assert.throws(
      () =>
        acceptFixture(
          world,
          [action("create_document", "player", "identities", hidden)],
          "investigation",
        ),
      rule("PROTECTED_DISCLOSURE"),
    );
  });
}
