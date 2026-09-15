import { characterPoses } from "../public/character-acting.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorld,
  stageProposal,
  acceptProposal,
  executeNext,
  triggerSetback,
  restoreWorld,
} from "./fixtures/world.mjs";
import {
  nextInteraction,
  observations,
  canRingCurfew,
  guideView,
  storyGuide,
} from "../public/play-state.mjs";

test("2.5D interactions follow accepted host actions through delivery, interruption, shelter, reload and departure", () => {
  const operation = (kind, actor, target, factIds = []) => ({
    kind,
    actor,
    target,
    factIds,
    description: kind,
  });
  const terms = (priority, steps) => ({
    status: "proposal",
    title: "Deterministic UI integration fixture",
    summary: "Not a live AI result.",
    question: "",
    priority,
    protectedFactIds: ["worker_names", "mara_signature"],
    keepOriginal: true,
    steps,
  });
  let world = createWorld();
  const original = structuredClone(world.documents.ledger_original);
  assert.equal(characterPoses(world).ivo, "guarded");
  assert.equal(characterPoses(world).mara, "watchful");
  world = stageProposal(
    world,
    terms("leave_now", [
      operation("create_document", "player", "ui_extract", [
        "false_invoices",
        "missing_wages",
      ]),
      operation("deliver_document", "ui_extract", "sera"),
      operation("grant_passage", "sera", "ivo"),
      operation("move_person", "ivo", "outside"),
    ]),
  );
  assert.equal(
    nextInteraction(world),
    null,
    "a proposed action is not a clickable executable objective",
  );
  assert.equal(canRingCurfew(world), false);
  world = acceptProposal(world, world.proposal.id);
  for (const target of ["desk", "sera"]) {
    assert.equal(
      storyGuide(world).mode,
      "action",
      "guidance must render even when the next target is a document ID, not a person",
    );
    assert.equal(nextInteraction(world).target, target);
    world = executeNext(world);
  }
  assert.deepEqual(observations(world).copyOwners, ["Sera"]);
  assert.equal(observations(world).workersPrivate, true);
  assert.equal(characterPoses(world).mara, "guardedRelief");
  assert.equal(canRingCurfew(world), true);
  world = triggerSetback(world);
  assert.equal(characterPoses(world).ivo, "alarmed");
  assert.equal(characterPoses(world).sera, "concerned");
  assert.equal(
    nextInteraction(world),
    null,
    "interrupted objectives must not remain clickable",
  );
  assert.equal(canRingCurfew(world), false);
  const delivered = structuredClone(world.documents.ui_extract);
  world = stageProposal(
    world,
    terms("safety", [
      operation("grant_shelter", "sera", "ivo"),
      operation("move_person", "ivo", "office"),
      operation("wait_until_morning", "player", ""),
      operation("move_person", "ivo", "warehouse"),
      operation("grant_passage", "sera", "ivo"),
      operation("move_person", "ivo", "outside"),
    ]),
  );
  world = acceptProposal(world, world.proposal.id);
  for (const target of ["sera", "office", "office", "ivo", "sera", "gate"]) {
    assert.equal(storyGuide(world).mode, "action");
    assert.equal(nextInteraction(world).target, target);
    world = executeNext(world);
    if (world.entities.ivo.location === "office") {
      if (world.clock === "night")
        assert.equal(characterPoses(world).ivo, "resting");
      world = restoreWorld(world);
      assert.equal(characterPoses(world).sera, "reassuring");
    }
  }
  assert.equal(nextInteraction(world), null);
  assert.equal(observations(world).safelyDeparted, true);
  assert.equal(world.clock, "morning");
  assert.equal(world.shelteredOvernight, true);
  assert.equal(characterPoses(world).ivo, "resolved");
  assert.deepEqual(world.documents.ui_extract, delivered);
  assert.deepEqual(world.documents.ledger_original, original);
  assert.equal(world.resources.paper, 2);
});

test("Mara reacts to actual disclosure, never merely to a proposed or accepted plan", () => {
  let world = createWorld();
  world = stageProposal(world, {
    status: "proposal",
    title: "Disclosure fixture",
    summary: "Authored test, not inference.",
    question: "",
    priority: "leave_now",
    protectedFactIds: ["worker_names"],
    keepOriginal: true,
    steps: [
      {
        kind: "create_document",
        actor: "player",
        target: "signed_extract",
        factIds: ["false_invoices", "missing_wages", "mara_signature"],
        description: "Prepare signed extract",
      },
      {
        kind: "deliver_document",
        actor: "signed_extract",
        target: "sera",
        factIds: [],
        description: "Deliver extract",
      },
      {
        kind: "grant_passage",
        actor: "sera",
        target: "ivo",
        factIds: [],
        description: "Authorize passage",
      },
      {
        kind: "move_person",
        actor: "ivo",
        target: "outside",
        factIds: [],
        description: "Leave",
      },
    ],
  });
  assert.equal(characterPoses(world).mara, "watchful");
  world = acceptProposal(world, world.proposal.id);
  assert.equal(characterPoses(world).mara, "watchful");
  world = executeNext(world);
  assert.equal(characterPoses(world).mara, "watchful");
  world = executeNext(world);
  assert.equal(characterPoses(world).mara, "defensive");
});
