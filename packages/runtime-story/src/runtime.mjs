import Ajv from "ajv";
import { createHash, randomUUID } from "node:crypto";
import { copyJson, freezeJson, RuntimeError } from "./registry.mjs";

const object = (properties) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const identifier = { type: "string", minLength: 1, maxLength: 128 };
const revision = {
  type: "integer",
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER - 1,
};
const boundedText = { type: "string", maxLength: 8000 };
const list = (items, maxItems = 10000) => ({ type: "array", items, maxItems });
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const commandProperties = { branchId: identifier, expectedRevision: revision };
export const stepCommandSchema = freezeJson(
  object({
    ...commandProperties,
    planId: identifier,
    stepId: identifier,
  }),
);
export const acceptCommandSchema = freezeJson(
  object({
    ...commandProperties,
    proposalId: identifier,
  }),
);
const guardSchema = object(commandProperties);

function digest(value) {
  // Sort object keys, retaining array order. A hash is integrity metadata, not a signature.
  const canonical = (item) =>
    item !== null && typeof item === "object"
      ? Array.isArray(item)
        ? item.map(canonical)
        : Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, canonical(item[key])]),
          )
      : item;
  return createHash("sha256")
    .update(JSON.stringify(canonical(copyJson(value))))
    .digest("hex");
}

function requireValue(condition, code, message) {
  if (!condition) throw new RuntimeError(code, message);
}

function makeValidators(registry) {
  const ajv = new Ajv({ strict: true, allErrors: true, ownProperties: true });
  const planSchema = registry.schema();
  const provenance = { type: "object" };
  const proposal = object({
    id: identifier,
    intent: boundedText,
    plan: planSchema,
    provenance,
    branchId: identifier,
    basedOnRevision: revision,
    stagedAtRevision: revision,
  });
  const accepted = object({
    id: identifier,
    proposalId: identifier,
    intent: boundedText,
    plan: planSchema,
    provenance,
    command: acceptCommandSchema,
    acceptedAtRevision: revision,
    status: {
      type: "string",
      enum: ["active", "interrupted", "superseded", "fulfilled"],
    },
    stepIds: list(identifier, 256),
    nextStep: { type: "integer", minimum: 0, maximum: 256 },
  });
  const receipt = object({
    id: identifier,
    command: stepCommandSchema,
    revision: revision,
    result: {},
    stateHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
  });
  const event = object({
    id: identifier,
    branchId: identifier,
    revision,
    type: {
      type: "string",
      enum: [
        "plan_proposed",
        "plan_accepted",
        "step_executed",
        "world_changed",
        "checkpoint_restored",
      ],
    },
    data: {},
  });
  const envelope = object({
    schemaVersion: { type: "integer", const: 1 },
    adapter: object({
      id: { const: registry.id, type: "string" },
      version: { const: registry.version, type: "string" },
      fingerprint: { const: registry.fingerprint, type: "string" },
    }),
    branchId: identifier,
    revision,
    state: {},
    proposal: nullable(proposal),
    plans: list(accepted, 1000),
    receipts: list(receipt),
    history: list(event),
  });
  const compiled = Object.fromEntries(
    Object.entries({
      envelope,
      guard: guardSchema,
      accept: acceptCommandSchema,
      step: stepCommandSchema,
    }).map(([name, schema]) => [name, ajv.compile(schema)]),
  );
  return (name, value) => {
    requireValue(
      compiled[name](value),
      "INVALID_ENVELOPE",
      `${name} does not match the runtime protocol: ${ajv.errorsText(compiled[name].errors)}`,
    );
  };
}

/** In-memory authoritative runtime. Save snapshot() state and receipts together.
 * Reducers cannot perform engine/native/network side effects. Only trusted host
 * code may call change(). Expose explicit registered events in a network adapter.
 */
export function createRuntime(registry, initialState, { checkpoint } = {}) {
  const validate = makeValidators(registry);
  let current = {
    schemaVersion: 1,
    adapter: {
      id: registry.id,
      version: registry.version,
      fingerprint: registry.fingerprint,
    },
    branchId: randomUUID(),
    revision: 0,
    state: registry.validateState(initialState),
    proposal: null,
    plans: [],
    receipts: [],
    history: [],
  };

  function snapshot() {
    return copyJson(current);
  }
  function guard(command) {
    validate("guard", command);
    requireValue(
      command.branchId === current.branchId,
      "STALE_BRANCH",
      "This command belongs to an abandoned timeline. Read current state.",
    );
    requireValue(
      command.expectedRevision === current.revision,
      "STALE_REVISION",
      "The world changed. Read current state before continuing.",
    );
  }
  function nextDraft() {
    requireValue(
      current.revision < Number.MAX_SAFE_INTEGER - 2,
      "REVISION_LIMIT",
      "Create a new session before the revision counter is exhausted.",
    );
    const next = snapshot();
    next.revision += 1;
    return next;
  }
  function record(next, type, data) {
    next.history.push({
      id: randomUUID(),
      branchId: next.branchId,
      revision: next.revision,
      type,
      data: copyJson(data),
    });
  }
  function commit(next) {
    validate("envelope", next);
    current = next;
    return snapshot();
  }
  function context() {
    return {
      branchId: current.branchId,
      revision: current.revision,
      capabilities: registry.describe(),
      state: registry.context(current.state, current.history),
      plans: copyJson(current.plans),
      history: copyJson(current.history),
    };
  }
  function stage(
    candidate,
    { branchId, expectedRevision, intent, provenance = {} },
  ) {
    guard({ branchId, expectedRevision });
    requireValue(
      typeof intent === "string" &&
        intent.trim().length > 0 &&
        intent.length <= 8000,
      "INVALID_INTENT",
      "Intent must contain 1–8000 characters.",
    );
    const preview = registry.simulate(
      current.state,
      candidate,
      current.history,
    );
    const next = nextDraft();
    next.proposal = {
      id: randomUUID(),
      intent,
      plan: preview.plan,
      provenance: copyJson(provenance),
      branchId: current.branchId,
      basedOnRevision: current.revision,
      stagedAtRevision: next.revision,
    };
    record(next, "plan_proposed", {
      proposalId: next.proposal.id,
      status: preview.plan.status,
      intent,
    });
    return commit(next);
  }
  function accept(command) {
    const request = copyJson(command);
    validate("accept", request);
    requireValue(
      request.branchId === current.branchId,
      "STALE_BRANCH",
      "This acceptance belongs to an abandoned timeline.",
    );
    const previous = current.plans.find(
      (plan) =>
        plan.proposalId === request.proposalId &&
        digest(plan.command) === digest(request),
    );
    if (previous)
      return { plan: copyJson(previous), snapshot: snapshot(), replayed: true };
    guard({
      branchId: request.branchId,
      expectedRevision: request.expectedRevision,
    });
    const proposal = current.proposal;
    requireValue(
      proposal?.id === request.proposalId,
      "UNKNOWN_PROPOSAL",
      "This proposal is no longer available.",
    );
    requireValue(
      proposal.plan.status === "ready",
      "NOT_EXECUTABLE",
      "Clarification and unsupported results cannot be accepted.",
    );
    requireValue(
      proposal.stagedAtRevision === current.revision,
      "STALE_PROPOSAL",
      "The proposal no longer describes the current revision.",
    );
    registry.simulate(current.state, proposal.plan, current.history);
    const next = nextDraft();
    for (const plan of next.plans)
      if (["active", "interrupted"].includes(plan.status))
        plan.status = "superseded";
    const accepted = {
      id: randomUUID(),
      proposalId: proposal.id,
      intent: proposal.intent,
      plan: copyJson(proposal.plan),
      provenance: copyJson(proposal.provenance),
      command: request,
      acceptedAtRevision: next.revision,
      status: "active",
      stepIds: proposal.plan.steps.map(() => randomUUID()),
      nextStep: 0,
    };
    next.plans.push(accepted);
    next.proposal = null;
    record(next, "plan_accepted", {
      planId: accepted.id,
      intent: accepted.intent,
      plan: accepted.plan,
    });
    return {
      plan: copyJson(accepted),
      snapshot: commit(next),
      replayed: false,
    };
  }
  function step(command) {
    const request = copyJson(command);
    validate("step", request);
    requireValue(
      request.branchId === current.branchId,
      "STALE_BRANCH",
      "This execution belongs to an abandoned timeline.",
    );
    const receipt = current.receipts.find(
      (item) => digest(item.command) === digest(request),
    );
    if (receipt)
      return {
        receipt: copyJson(receipt),
        snapshot: snapshot(),
        replayed: true,
      };
    guard({
      branchId: request.branchId,
      expectedRevision: request.expectedRevision,
    });
    const accepted = current.plans.find((plan) => plan.id === request.planId);
    requireValue(
      accepted?.status === "active",
      "INACTIVE_PLAN",
      "Only the active accepted plan can execute.",
    );
    requireValue(
      accepted.stepIds[accepted.nextStep] === request.stepId,
      "WRONG_STEP",
      "Name the exact next accepted step. Read current state.",
    );
    const remaining = {
      ...accepted.plan,
      steps: accepted.plan.steps.slice(accepted.nextStep),
    };
    // All remaining work must still satisfy current constraints. Commit only the
    // first simulated reducer result. No speculative engine effects are issued.
    const preview = registry.simulate(
      current.state,
      remaining,
      current.history,
    );
    const outcome = preview.transitions[0];
    const next = nextDraft();
    next.state = outcome.state;
    next.proposal = null;
    const executing = next.plans.find((plan) => plan.id === accepted.id);
    executing.nextStep += 1;
    if (executing.nextStep === executing.stepIds.length)
      executing.status = "fulfilled";
    const confirmed = {
      id: randomUUID(),
      command: request,
      revision: next.revision,
      result: outcome.result,
      stateHash: digest(next.state),
    };
    next.receipts.push(confirmed);
    record(next, "step_executed", {
      receiptId: confirmed.id,
      planId: accepted.id,
      stepId: request.stepId,
      action: accepted.plan.steps[accepted.nextStep].action,
      result: outcome.result,
    });
    return {
      receipt: copyJson(confirmed),
      snapshot: commit(next),
      replayed: false,
    };
  }
  function change(state, { branchId, expectedRevision, reason }) {
    guard({ branchId, expectedRevision });
    requireValue(
      typeof reason === "string" && reason.length > 0 && reason.length <= 8000,
      "INVALID_EVENT",
      "A bounded reason is required for an external state change.",
    );
    const validatedState = registry.validateState(state);
    const next = nextDraft();
    next.state = validatedState;
    next.proposal = null;
    for (const plan of next.plans)
      if (plan.status === "active") plan.status = "interrupted";
    record(next, "world_changed", { reason });
    return commit(next);
  }
  function inspectSave(input) {
    const saved = copyJson(input);
    validate("envelope", saved);
    registry.validateState(saved.state);
    const ids = new Set();
    const claimId = (id) => {
      requireValue(!ids.has(id), "INVALID_SAVE", `Duplicate record id: ${id}`);
      ids.add(id);
    };
    requireValue(
      saved.history.length === saved.revision &&
        saved.history.every((event, index) => event.revision === index + 1),
      "INVALID_SAVE",
      "History must account for every committed revision in order.",
    );
    requireValue(
      saved.plans.filter((plan) =>
        ["active", "interrupted"].includes(plan.status),
      ).length <= 1,
      "INVALID_SAVE",
      "At most one unfinished plan may be current.",
    );
    const acceptedRevisions = new Set();
    const executedRevisions = new Set();
    for (const plan of saved.plans) {
      claimId(plan.id);
      registry.validatePlanShape(plan.plan);
      requireValue(
        plan.plan.status === "ready" &&
          plan.stepIds.length === plan.plan.steps.length,
        "INVALID_SAVE",
        "Accepted plan steps do not match their identities.",
      );
      requireValue(
        plan.nextStep <= plan.stepIds.length &&
          (plan.status === "fulfilled") ===
            (plan.nextStep === plan.stepIds.length),
        "INVALID_SAVE",
        "Plan completion does not match its executed steps.",
      );
      requireValue(
        plan.acceptedAtRevision === plan.command.expectedRevision + 1 &&
          plan.acceptedAtRevision <= saved.revision,
        "INVALID_SAVE",
        "Invalid acceptance revision.",
      );
      requireValue(
        plan.command.proposalId === plan.proposalId,
        "INVALID_SAVE",
        "Acceptance names a different proposal.",
      );
      const event = saved.history[plan.acceptedAtRevision - 1];
      requireValue(
        event?.type === "plan_accepted" &&
          event.branchId === plan.command.branchId &&
          event.data?.planId === plan.id &&
          event.data?.intent === plan.intent &&
          digest(event.data.plan) === digest(plan.plan),
        "INVALID_SAVE",
        "Acceptance does not match its history event.",
      );
      plan.stepIds.forEach(claimId);
      acceptedRevisions.add(plan.acceptedAtRevision);
    }
    const executed = new Set();
    for (const receipt of saved.receipts) {
      claimId(receipt.id);
      const plan = saved.plans.find(
        (item) => item.id === receipt.command.planId,
      );
      const index = plan?.stepIds.indexOf(receipt.command.stepId) ?? -1;
      requireValue(
        index >= 0 && index < plan.nextStep,
        "INVALID_SAVE",
        "Receipt does not identify an executed accepted step.",
      );
      requireValue(
        receipt.revision === receipt.command.expectedRevision + 1 &&
          receipt.revision <= saved.revision &&
          receipt.command.expectedRevision >= plan.acceptedAtRevision,
        "INVALID_SAVE",
        "Invalid execution revision.",
      );
      requireValue(
        !executed.has(receipt.command.stepId),
        "INVALID_SAVE",
        "A step has multiple execution receipts.",
      );
      const event = saved.history[receipt.revision - 1];
      requireValue(
        event?.type === "step_executed" &&
          event.branchId === receipt.command.branchId &&
          event.data?.receiptId === receipt.id &&
          event.data?.planId === plan.id &&
          event.data?.stepId === receipt.command.stepId &&
          event.data?.action === plan.plan.steps[index].action &&
          digest(event.data.result) === digest(receipt.result),
        "INVALID_SAVE",
        "Receipt does not match its history event.",
      );
      if (receipt.revision === saved.revision)
        requireValue(
          receipt.stateHash === digest(saved.state),
          "INVALID_SAVE",
          "Latest execution receipt does not match saved state.",
        );
      executed.add(receipt.command.stepId);
      executedRevisions.add(receipt.revision);
    }
    for (const plan of saved.plans) {
      requireValue(
        plan.stepIds.slice(0, plan.nextStep).every((id) => executed.has(id)),
        "INVALID_SAVE",
        "An executed step is missing its receipt.",
      );
    }
    for (const event of saved.history) {
      claimId(event.id);
      if (event.type === "plan_accepted")
        requireValue(
          acceptedRevisions.has(event.revision),
          "INVALID_SAVE",
          "An acceptance event is missing its plan.",
        );
      if (event.type === "step_executed")
        requireValue(
          executedRevisions.has(event.revision),
          "INVALID_SAVE",
          "An execution event is missing its receipt.",
        );
      requireValue(
        event.revision <= saved.revision,
        "INVALID_SAVE",
        "History refers to a future revision.",
      );
    }
    if (saved.proposal) {
      claimId(saved.proposal.id);
      registry.validatePlanShape(saved.proposal.plan);
      requireValue(
        saved.proposal.branchId === saved.branchId &&
          saved.proposal.stagedAtRevision === saved.revision &&
          saved.proposal.basedOnRevision + 1 === saved.revision,
        "INVALID_SAVE",
        "Staged proposal has an invalid context revision.",
      );
      const event = saved.history.at(-1);
      requireValue(
        event?.type === "plan_proposed" &&
          event.branchId === saved.branchId &&
          event.data?.proposalId === saved.proposal.id &&
          event.data?.status === saved.proposal.plan.status &&
          event.data?.intent === saved.proposal.intent,
        "INVALID_SAVE",
        "Staged proposal does not match its history event.",
      );
    }
    // Save files are trusted host checkpoints, not anti-cheat signatures. Validate
    // the current domain plus structural links before opening a new timeline.
    return saved;
  }
  function restore(input, command) {
    guard(command);
    const saved = inspectSave(input);
    requireValue(
      saved.revision < Number.MAX_SAFE_INTEGER - 2,
      "REVISION_LIMIT",
      "Checkpoint revision is exhausted.",
    );
    const abandonedBranch = current.branchId;
    saved.branchId = randomUUID();
    saved.revision += 1;
    saved.proposal = null;
    record(saved, "checkpoint_restored", {
      sourceBranch: input.branchId,
      abandonedBranch,
    });
    return commit(saved);
  }
  if (checkpoint !== undefined) current = inspectSave(checkpoint);
  return Object.freeze({
    snapshot,
    context,
    stage,
    accept,
    step,
    change,
    restore,
    inspectSave,
  });
}
