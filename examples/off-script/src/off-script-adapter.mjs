import {
  createRegistry,
  createRuntime,
  RuntimeError,
} from "@off-script/runtime-story";
import {
  createWorld,
  getContext,
  applyAction,
  validateShape,
  validateOutcome,
} from "./engine.mjs";

const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const array = (items) => ({ type: "array", items, uniqueItems: true });
const text = { type: "string", maxLength: 1000 };
const domainKeys = [
  "scenarioId",
  "entities",
  "documents",
  "knowledge",
  "clock",
  "exitOpen",
  "passageGrants",
  "shelterGrants",
  "resources",
  "investigationOpen",
  "setbackOccurred",
  "shelteredOvernight",
];
const domainState = (world) =>
  structuredClone(
    Object.fromEntries(domainKeys.map((key) => [key, world[key]])),
  );
const need = (condition, message) => {
  if (!condition) throw new RuntimeError("GAME_INVARIANT", message);
};

export function toRuntimePlan(output) {
  return {
    status:
      output.status === "proposal"
        ? "ready"
        : output.status === "clarify"
          ? "needs_context"
          : output.status,
    title: output.title,
    interpretation: output.summary,
    question: output.question,
    terms:
      output.status === "proposal"
        ? {
            priority: output.priority,
            keepOriginal: output.keepOriginal,
            protectedFactIds: output.protectedFactIds,
          }
        : null,
    steps: output.steps.map((step) => ({
      action: step.kind,
      arguments: {
        actor: step.actor,
        target: step.target,
        ...(step.kind === "create_document" ? { factIds: step.factIds } : {}),
      },
      description: step.description,
    })),
  };
}

export function toGamePlan(plan) {
  return {
    status:
      plan.status === "ready"
        ? "proposal"
        : plan.status === "needs_context"
          ? "clarify"
          : plan.status,
    title: plan.title,
    summary: plan.interpretation,
    question: plan.question,
    ...(plan.terms ?? {
      priority: "investigation",
      keepOriginal: true,
      protectedFactIds: [],
    }),
    steps: plan.steps.map((step) => ({
      kind: step.action,
      actor: step.arguments.actor,
      target: step.arguments.target,
      factIds: step.arguments.factIds ?? [],
      description: step.description,
    })),
  };
}

/** Off Script owns these mechanics and policies. The package knows none of them. */
export function createOffScriptAdapter(scenarioId = "ledger") {
  const initial = createWorld(scenarioId);
  const definition = initial.definition;
  const policy = definition.policy;
  const facts = Object.keys(definition.facts);
  const people = Object.values(definition.entities)
    .filter((entity) => entity.kind === "person")
    .map((entity) => entity.id);
  const rooms = Object.values(definition.entities)
    .filter((entity) => entity.kind === "room")
    .map((entity) => entity.id);
  const factIds = array({ type: "string", enum: facts });
  const entitySchema = object(
    Object.fromEntries(
      Object.entries(definition.entities).map(([id, entity]) => [
        id,
        object(
          Object.fromEntries(
            Object.entries(entity).map(([key, value]) => [
              key,
              key === "location"
                ? { type: "string", enum: rooms }
                : { type: typeof value, const: value },
            ]),
          ),
        ),
      ]),
    ),
  );
  const documentSchema = {
    type: "object",
    additionalProperties: false,
    required: ["id", "title", "factIds", "owner", "original"],
    properties: {
      id: text,
      title: text,
      factIds,
      owner: { type: "string", enum: people },
      original: { type: "boolean" },
      sourceId: { type: "string", const: policy.originalDocumentId },
    },
  };
  const stateSchema = object({
    scenarioId: { type: "string", const: scenarioId },
    entities: entitySchema,
    documents: {
      type: "object",
      minProperties: 1,
      maxProperties: 4,
      propertyNames: { pattern: "^[a-z][a-z0-9_-]{0,47}$" },
      additionalProperties: documentSchema,
    },
    knowledge: object(Object.fromEntries(people.map((id) => [id, factIds]))),
    clock: { type: "string", enum: ["night", "morning"] },
    exitOpen: { type: "boolean" },
    passageGrants: array({ type: "string", const: policy.beneficiaryId }),
    shelterGrants: array({ type: "string", const: policy.beneficiaryId }),
    resources: object({ paper: { type: "integer", minimum: 0, maximum: 3 } }),
    investigationOpen: { type: "boolean" },
    setbackOccurred: { type: "boolean" },
    shelteredOvernight: { type: "boolean" },
  });
  const termsSchema = object({
    priority: {
      type: "string",
      enum: ["leave_now", "safety", "investigation"],
    },
    keepOriginal: { type: "boolean", const: true },
    protectedFactIds: factIds,
  });
  function asGameWorld(state, history) {
    return {
      ...structuredClone(state),
      definition: structuredClone(definition),
      schemaVersion: 1,
      revision: 0,
      branchId: "adapter-preview",
      events: [],
      agreements: history
        .filter((event) => event.type === "plan_accepted")
        .map((event) => ({
          ...toGamePlan(event.data.plan),
          id: event.data.planId,
        })),
    };
  }
  const descriptions = getContext(initial).capabilities;
  const actions = descriptions.map((capability) => {
    const parameters = object({
      actor: text,
      target: text,
      ...(capability.kind === "create_document" ? { factIds } : {}),
    });
    return {
      id: capability.kind,
      description: capability.limits,
      parameters,
      reduce(state, args, terms, history) {
        const world = asGameWorld(state, history);
        const step = {
          kind: capability.kind,
          ...args,
          factIds: args.factIds ?? [],
          description: "",
        };
        applyAction(world, step, terms, true);
        return {
          state: domainState(world),
          result: {
            description: world.events.at(-1).description,
            details: world.events.at(-1).details,
          },
        };
      },
    };
  });
  const registry = createRegistry({
    id: `off-script.${scenarioId}`,
    version: "1",
    maxSteps: 8,
    stateSchema,
    termsSchema,
    actions,
    context: (state, history) => getContext(asGameWorld(state, history)),
    validateState(state) {
      const original = state.documents[policy.originalDocumentId];
      need(
        original?.original &&
          original.owner === policy.beneficiaryId &&
          original.title === policy.originalTitle &&
          original.id === policy.originalDocumentId &&
          original.factIds.length === facts.length &&
          facts.every((id) => original.factIds.includes(id)),
        "The original ledger must remain unchanged with its owner.",
      );
      const copies = Object.entries(state.documents).filter(
        ([id]) => id !== policy.originalDocumentId,
      );
      need(
        state.resources.paper + copies.length === 3,
        "Paper use must match created copies.",
      );
      for (const [id, document] of copies) {
        need(
          !["constructor", "prototype", "__proto__"].includes(id) &&
            !Object.hasOwn(state.entities, id) &&
            document.id === id &&
            !document.original &&
            document.sourceId === policy.originalDocumentId &&
            document.factIds.length > 0,
          "Invalid evidence copy.",
        );
        need(
          document.factIds.every((fact) =>
            state.knowledge[document.owner].includes(fact),
          ),
          "Document owners must know their recorded evidence.",
        );
      }
      need(
        state.exitOpen ===
          (state.clock === "morning" || !state.setbackOccurred),
        "Gate state must match the clock and night watch.",
      );
      need(
        state.investigationOpen ===
          [...policy.evidenceFactIds, ...policy.verificationFactIds].every(
            (id) => state.knowledge[policy.authorityId].includes(id),
          ),
        "Investigation state must match actual authority knowledge.",
      );
      for (const person of people) {
        if (person !== policy.beneficiaryId)
          need(
            state.entities[person].location ===
              definition.entities[person].location,
            "This game exposes movement only for the beneficiary.",
          );
      }
      const location = state.entities[policy.beneficiaryId].location;
      if (location === policy.shelterRoomId)
        need(
          state.shelterGrants.includes(policy.beneficiaryId),
          "The beneficiary needs permission to occupy shelter.",
        );
      if (location === policy.exitRoomId)
        need(
          state.passageGrants.includes(policy.beneficiaryId),
          "The beneficiary needs passage permission to be outside.",
        );
      if (state.clock === "morning")
        need(
          state.shelteredOvernight &&
            state.shelterGrants.includes(policy.beneficiaryId),
          "Morning must follow authorized overnight shelter.",
        );
      return true;
    },
    validatePlan({ before, after, plan, history }) {
      const proposed = toGamePlan(plan);
      const world = asGameWorld(before, history);
      validateShape(world, proposed);
      validateOutcome(world, asGameWorld(after, history), proposed);
      return true;
    },
  });
  const initialState = domainState(initial);
  return {
    registry,
    initialState,
    createSession: (checkpoint) =>
      createRuntime(registry, initialState, checkpoint ? { checkpoint } : {}),
    applySetback(runtime) {
      const current = runtime.snapshot();
      const state = current.state;
      need(
        !state.setbackOccurred && state.clock === "night",
        "The night watch can close the gate only once, at night.",
      );
      need(
        state.entities[policy.beneficiaryId].location !== policy.exitRoomId &&
          Object.values(state.documents).some(
            (doc) => !doc.original && doc.owner === policy.authorityId,
          ),
        "The setback follows evidence delivery and precedes departure.",
      );
      return runtime.change(
        { ...state, exitOpen: false, setbackOccurred: true },
        {
          branchId: current.branchId,
          expectedRevision: current.revision,
          reason: definition.setback,
        },
      );
    },
  };
}
