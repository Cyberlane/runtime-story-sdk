import { RuntimeError } from "@off-script/runtime-story";
import { scenarios } from "./scenarios.mjs";

// The adapter runs these game rules on speculative copies. Only the SDK commits state.
const fail = (code, message) => {
  throw new RuntimeError("HOST_REJECTED", message, { ruleCode: code });
};
const need = (condition, code, message) => {
  if (!condition) fail(code, message);
};
const clone = (value) => structuredClone(value);
const has = (object, key) => Object.hasOwn(object, key);
const unique = (values) => [...new Set(values)];
const sameSet = (a, b) =>
  a.length === b.length &&
  [...a].sort().every((v, i) => v === [...b].sort()[i]);
const actionKinds = [
  "create_document",
  "deliver_document",
  "grant_passage",
  "grant_shelter",
  "move_person",
  "wait_until_morning",
];

function event(world, type, description, details = {}) {
  world.events.push({
    id: `event_${world.events.length + 1}`,
    type,
    description,
    revision: world.revision,
    details: clone(details),
  });
}

export function createWorld(scenarioId = "ledger") {
  const definition = scenarios.find((item) => item.id === scenarioId);
  need(definition, "UNKNOWN_SCENARIO", "Unknown scenario.");
  const d = clone(definition),
    p = d.policy;
  const factIds = Object.keys(d.facts);
  const world = {
    schemaVersion: 1,
    scenarioId,
    branchId: "initial-domain",
    revision: 0,
    definition: d,
    entities: clone(d.entities),
    documents: {
      [p.originalDocumentId]: {
        id: p.originalDocumentId,
        title: p.originalTitle,
        factIds,
        owner: p.beneficiaryId,
        original: true,
      },
    },
    knowledge: Object.fromEntries(
      Object.values(d.entities)
        .filter((entity) => entity.kind === "person")
        .map((entity) => [
          entity.id,
          ["player", p.beneficiaryId].includes(entity.id) ? [...factIds] : [],
        ]),
    ),
    agreements: [],
    proposal: null,
    events: [],
    clock: "night",
    exitOpen: true,
    passageGrants: [],
    shelterGrants: [],
    resources: { paper: 3 },
    investigationOpen: false,
    setbackOccurred: false,
    shelteredOvernight: false,
  };
  event(world, "world_created", d.description);
  return world;
}

function protectedFacts(world, extra = []) {
  return unique([
    ...world.agreements.flatMap((agreement) => agreement.protectedFactIds),
    ...extra,
  ]);
}

export function validateShape(world, output) {
  need(
    output && typeof output === "object" && !Array.isArray(output),
    "INVALID_PROPOSAL",
    "A structured proposal is required.",
  );
  need(
    ["proposal", "clarify", "unsupported"].includes(output.status),
    "INVALID_PROPOSAL",
    "Unknown proposal status.",
  );
  for (const key of ["title", "summary", "question"])
    need(
      typeof output[key] === "string" && output[key].length <= 4000,
      "INVALID_PROPOSAL",
      `${key} must be bounded text.`,
    );
  need(
    ["leave_now", "safety", "investigation"].includes(output.priority),
    "INVALID_PROPOSAL",
    "Unknown priority.",
  );
  need(
    typeof output.keepOriginal === "boolean",
    "INVALID_PROPOSAL",
    "keepOriginal must be boolean.",
  );
  need(
    Array.isArray(output.protectedFactIds) &&
      output.protectedFactIds.every(
        (id) => typeof id === "string" && has(world.definition.facts, id),
      ),
    "UNKNOWN_FACT",
    "A protected fact does not exist.",
  );
  need(
    Array.isArray(output.steps) && output.steps.length <= 8,
    "INVALID_PROPOSAL",
    "At most eight supported steps are allowed.",
  );
  if (output.status !== "proposal") {
    need(
      output.steps.length === 0,
      "INVALID_PROPOSAL",
      "Clarification and unsupported results must not contain executable steps.",
    );
    return;
  }
  need(
    output.keepOriginal,
    "ORIGINAL_LOCKED",
    "The original must remain with its owner. Original transfer is not a supported capability.",
  );
  need(
    output.steps.length > 0,
    "EMPTY_PROPOSAL",
    "A playable proposal needs at least one supported action.",
  );
  const protectedIds = protectedFacts(world, output.protectedFactIds);
  for (const id of protectedIds) {
    const exposed = Object.values(world.documents).some(
      (doc) =>
        !doc.original &&
        !["player", world.definition.policy.beneficiaryId].includes(
          doc.owner,
        ) &&
        doc.factIds.includes(id),
    );
    need(
      !exposed,
      "ALREADY_DISCLOSED",
      `The fact ${id} has already been delivered. A revision cannot erase that knowledge.`,
    );
  }
  for (const step of output.steps) {
    need(
      step && typeof step === "object" && actionKinds.includes(step.kind),
      "UNSUPPORTED_ACTION",
      "The plan contains an unregistered capability.",
    );
    for (const key of ["actor", "target", "description"])
      need(
        typeof step[key] === "string" && step[key].length <= 1000,
        "INVALID_ACTION",
        `Action ${key} must be text.`,
      );
    need(
      Array.isArray(step.factIds) &&
        step.factIds.every(
          (id) => typeof id === "string" && has(world.definition.facts, id),
        ),
      "UNKNOWN_FACT",
      "An action references a fact that does not exist.",
    );
    need(
      unique(step.factIds).length === step.factIds.length,
      "DUPLICATE_FACT",
      "A document cannot include the same fact twice.",
    );
    need(
      step.kind === "create_document" || step.factIds.length === 0,
      "INVALID_ACTION",
      "Only create_document takes factIds. Delivery uses the existing document contents.",
    );
    if (step.kind === "create_document")
      need(
        !step.factIds.some((id) => protectedIds.includes(id)),
        "PROTECTED_DISCLOSURE",
        "The proposed document contains a fact protected by this or an earlier agreement.",
      );
  }
}

function ensureAuthorityEvidence(world, terms) {
  const p = world.definition.policy;
  const needed = [
    ...p.evidenceFactIds,
    ...(terms.priority === "investigation" ? p.verificationFactIds : []),
  ];
  const missing = needed.filter(
    (id) => !world.knowledge[p.authorityId].includes(id),
  );
  need(
    missing.length === 0,
    "NPC_REFUSAL",
    `${world.entities[p.authorityId].name} refuses to grant access without ${missing.map((id) => world.definition.facts[id].text).join(" ")}`,
  );
}

// This mutates an already-cloned draft and is used unchanged for acceptance
// simulation and real execution. Acceptance never installs the simulated effects.
export function applyAction(world, step, terms, emit = false) {
  const p = world.definition.policy;
  const protectedIds = protectedFacts(world, terms.protectedFactIds);
  const person = (id) =>
    need(
      has(world.entities, id) && world.entities[id].kind === "person",
      "UNKNOWN_ENTITY",
      `Unknown person: ${id}`,
    );
  const authorityPair = () => {
    need(
      step.actor === p.authorityId && step.target === p.beneficiaryId,
      "NO_AUTHORITY",
      "Only the registered authority can grant this protection to the beneficiary.",
    );
    ensureAuthorityEvidence(world, terms);
  };
  switch (step.kind) {
    case "create_document": {
      need(
        step.actor === "player",
        "NO_AUTHORITY",
        "Only the player can prepare a copy.",
      );
      need(
        /^[a-z][a-z0-9_-]{0,47}$/.test(step.target) &&
          !["constructor", "prototype", "__proto__"].includes(step.target),
        "INVALID_DOCUMENT_ID",
        "A document needs a fresh simple ID.",
      );
      need(
        !has(world.documents, step.target) && !has(world.entities, step.target),
        "DUPLICATE_EFFECT",
        "That document ID already exists.",
      );
      need(
        step.factIds.length > 0,
        "EMPTY_DOCUMENT",
        "A document must contain at least one registered fact.",
      );
      need(
        !step.factIds.some((id) => protectedIds.includes(id)),
        "PROTECTED_DISCLOSURE",
        "The copy would disclose a protected fact.",
      );
      need(
        !Object.values(world.documents).some(
          (doc) => !doc.original && sameSet(doc.factIds, step.factIds),
        ),
        "DUPLICATE_EFFECT",
        "An equivalent extract already exists. Reuse the existing document.",
      );
      need(
        world.resources.paper > 0,
        "NO_RESOURCE",
        "There is no blank paper left.",
      );
      need(
        world.entities.player.location ===
          world.entities[p.beneficiaryId].location,
        "OUT_OF_REACH",
        "The original and the player must be in the same room to copy it.",
      );
      world.documents[step.target] = {
        id: step.target,
        title: `Selected evidence extract ${Object.keys(world.documents).length}`,
        factIds: [...step.factIds],
        owner: "player",
        original: false,
        sourceId: p.originalDocumentId,
      };
      world.resources.paper -= 1;
      break;
    }
    case "deliver_document": {
      person(step.target);
      need(
        step.target !== "player",
        "INVALID_RECIPIENT",
        "Delivery needs another person as recipient.",
      );
      need(
        has(world.documents, step.actor),
        "UNKNOWN_DOCUMENT",
        `Unknown document: ${step.actor}`,
      );
      const doc = world.documents[step.actor];
      need(
        !doc.original,
        "ORIGINAL_LOCKED",
        "The original remains with its owner.",
      );
      need(
        doc.owner === "player",
        "DUPLICATE_EFFECT",
        "The player no longer holds this document. It cannot be delivered twice.",
      );
      need(
        world.entities.player.location === world.entities[step.target].location,
        "OUT_OF_REACH",
        "The recipient is not in the player’s room.",
      );
      need(
        !doc.factIds.some((id) => protectedIds.includes(id)),
        "PROTECTED_DISCLOSURE",
        "Delivery would disclose a protected fact.",
      );
      doc.owner = step.target;
      world.knowledge[step.target] = unique([
        ...world.knowledge[step.target],
        ...doc.factIds,
      ]);
      world.investigationOpen = [
        ...p.evidenceFactIds,
        ...p.verificationFactIds,
      ].every((id) => world.knowledge[p.authorityId].includes(id));
      break;
    }
    case "grant_passage":
      authorityPair();
      need(
        world.exitOpen,
        "EXIT_BLOCKED",
        "The outside exit is locked. Permission cannot open it.",
      );
      need(
        !world.passageGrants.includes(step.target),
        "DUPLICATE_EFFECT",
        "Passage has already been granted.",
      );
      world.passageGrants.push(step.target);
      break;
    case "grant_shelter":
      authorityPair();
      need(
        world.clock === "night",
        "SHELTER_UNAVAILABLE",
        "This is a one-night shelter offer.",
      );
      need(
        !world.shelterGrants.includes(step.target),
        "DUPLICATE_EFFECT",
        "Shelter has already been granted.",
      );
      world.shelterGrants.push(step.target);
      break;
    case "move_person": {
      person(step.actor);
      need(
        step.actor === p.beneficiaryId,
        "NO_AUTHORITY",
        "Only the consenting beneficiary can be moved by this agreement.",
      );
      need(
        has(world.entities, step.target) &&
          world.entities[step.target].kind === "room",
        "UNKNOWN_ENTITY",
        `Unknown room: ${step.target}`,
      );
      const origin = world.entities[step.actor].location;
      need(
        origin !== step.target,
        "DUPLICATE_EFFECT",
        "The person is already in that room.",
      );
      need(
        p.routes.some(
          ([a, b]) =>
            (a === origin && b === step.target) ||
            (b === origin && a === step.target),
        ),
        "NO_ROUTE",
        "There is no direct registered route between these rooms.",
      );
      if (step.target === p.exitRoomId) {
        need(world.exitOpen, "EXIT_BLOCKED", "The outside exit is locked.");
        need(
          world.passageGrants.includes(step.actor),
          "NO_PERMISSION",
          "The person has no passage permission.",
        );
      }
      if (step.target === p.shelterRoomId)
        need(
          world.shelterGrants.includes(step.actor),
          "NO_PERMISSION",
          "The person has not been granted shelter.",
        );
      world.entities[step.actor].location = step.target;
      break;
    }
    case "wait_until_morning":
      need(
        step.actor === "player" && step.target === "",
        "INVALID_ACTION",
        "Waiting uses actor player and an empty target.",
      );
      need(
        world.clock === "night",
        "DUPLICATE_EFFECT",
        "It is already morning.",
      );
      need(
        world.shelterGrants.includes(p.beneficiaryId) &&
          world.entities[p.beneficiaryId].location === p.shelterRoomId,
        "NO_SHELTER",
        "Waiting is safe only after the beneficiary reaches authorized shelter.",
      );
      world.clock = "morning";
      world.shelteredOvernight = true;
      world.exitOpen = true;
      break;
    default:
      fail("UNSUPPORTED_ACTION", "Unregistered action.");
  }
  if (emit)
    event(world, "action_executed", actionDescription(world, step), {
      kind: step.kind,
      actor: step.actor,
      target: step.target,
      factIds: step.factIds,
    });
}

function actionDescription(world, step) {
  const name = (id) =>
    world.entities[id]?.name || world.documents[id]?.title || id;
  switch (step.kind) {
    case "create_document":
      return `Created ${name(step.target)} with ${step.factIds.length} verified facts. The original stayed with its owner.`;
    case "deliver_document":
      return `${name(step.target)} received ${name(step.actor)} and learned its recorded facts.`;
    case "grant_passage":
      return `${name(step.actor)} granted ${name(step.target)} passage permission.`;
    case "grant_shelter":
      return `${name(step.actor)} granted ${name(step.target)} shelter until morning.`;
    case "move_person":
      return `${name(step.actor)} moved to ${name(step.target)}.`;
    case "wait_until_morning":
      return "Morning arrived. The beneficiary remained in authorized shelter and the exit reopened.";
    default:
      return step.kind;
  }
}

export function validateOutcome(world, simulated, proposal) {
  const p = world.definition.policy;
  if (proposal.priority === "leave_now")
    need(
      simulated.entities[p.beneficiaryId].location === p.exitRoomId &&
        simulated.clock === "night",
      "GOAL_NOT_MET",
      "This plan does not get the beneficiary outside tonight.",
    );
  if (proposal.priority === "safety") {
    const location = simulated.entities[p.beneficiaryId].location;
    const sheltered =
      location === p.shelterRoomId &&
      simulated.shelterGrants.includes(p.beneficiaryId);
    const leftAfterSafeNight =
      location === p.exitRoomId &&
      simulated.clock === "morning" &&
      simulated.shelteredOvernight &&
      simulated.passageGrants.includes(p.beneficiaryId);
    need(
      sheltered || leftAfterSafeNight,
      "GOAL_NOT_MET",
      "This plan must put the beneficiary in authorized shelter, or let them leave after a safely sheltered night.",
    );
  }
  const original = simulated.documents[p.originalDocumentId];
  need(
    p.beneficiaryConsent?.allowDeclaredDisclosures &&
      (!p.beneficiaryConsent.requireOriginalRetained ||
        (proposal.keepOriginal && original.owner === p.beneficiaryId)),
    "NPC_REFUSAL",
    "The beneficiary refuses terms that violate the registered original-retention or disclosure policy.",
  );
}

export function getContext(world) {
  const p = world.definition.policy;
  return clone({
    scenarioId: world.scenarioId,
    branchId: world.branchId,
    revision: world.revision,
    title: world.definition.title,
    description: world.definition.description,
    entities: world.entities,
    facts: world.definition.facts,
    policy: p,
    documents: world.documents,
    knowledge: world.knowledge,
    agreements: world.agreements,
    events: world.events,
    clock: world.clock,
    exitOpen: world.exitOpen,
    passageGrants: world.passageGrants,
    shelterGrants: world.shelterGrants,
    resources: world.resources,
    protectedFactIds: protectedFacts(world),
    investigationOpen: world.investigationOpen,
    shelteredOvernight: world.shelteredOvernight,
    capabilities: [
      {
        kind: "create_document",
        actor: "player",
        target:
          "fresh document ID, lowercase ASCII letters/digits/underscore/hyphen",
        factIds: "nonempty selected registered fact IDs",
        limits:
          "Uses one paper. Original stays with beneficiary. No protected facts or duplicate extract.",
      },
      {
        kind: "deliver_document",
        actor: "existing or earlier-created non-original document ID",
        target: "registered NPC ID",
        factIds: [],
        limits:
          "Player must hold document and be in recipient room. Recipient learns exactly its facts. Partial reports are allowed, but do not earn passage.",
      },
      {
        kind: "grant_passage",
        actor: p.authorityId,
        target: p.beneficiaryId,
        factIds: [],
        limits: `Authority must actually know evidence ${p.evidenceFactIds.join(", ")}. Investigation-priority grants also require ${p.verificationFactIds.join(", ")}. Exit must be open.`,
      },
      {
        kind: "grant_shelter",
        actor: p.authorityId,
        target: p.beneficiaryId,
        factIds: [],
        limits:
          "Same evidence requirement as passage. Grants access to existing shelter for one night. No new buildings or hidden escape routes.",
      },
      {
        kind: "move_person",
        actor: p.beneficiaryId,
        target: `one registered adjacent room: ${[p.originRoomId, p.shelterRoomId, p.exitRoomId].join(", ")}`,
        factIds: [],
        limits:
          "Shelter/passage permission is required for respective destination. A closed exit cannot be crossed.",
      },
      {
        kind: "wait_until_morning",
        actor: "player",
        target: "",
        factIds: [],
        limits:
          "Beneficiary must already be inside authorized shelter. Advances to morning and reopens exit. Cannot satisfy leaving tonight.",
      },
    ],
    rules: [
      "Proposals and narration do not change game state. Every accepted action is executed separately.",
      "keepOriginal=false is unsupported. There is no original transfer, deletion, forgery, teleportation, payment, combat, or new location capability.",
      "Existing protected facts remain protected across revisions. Disclosures already delivered cannot be retracted or made private retroactively.",
      "Full evidence plus the named signatory delivered to the authority opens a verified investigation. A partial extract is only a report.",
      "Use leave_now when the plan gets the beneficiary outside tonight, safety when it puts them in authorized shelter or lets them leave after a safely sheltered night, and investigation for document/report plans.",
      "Only grant actions require authority evidence consent. Selective copying and delivery to other NPCs are valid, if no protected fact is disclosed.",
      "Revisions replace only unexecuted actions. Reuse delivered documents and knowledge. Do not repeat completed actions.",
    ],
  });
}
