import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { planIntent, RuntimeError } from "@off-script/runtime-story";
import { StructuredProvider } from "@off-script/runtime-story/providers";
import { createOffScriptAdapter, toGamePlan } from "./off-script-adapter.mjs";
import { scenarios } from "./scenarios.mjs";

export function projectGameWorld(snapshot) {
  const state = structuredClone(snapshot.state);
  const definition = structuredClone(
    scenarios.find((item) => item.id === state.scenarioId),
  );
  const p = definition.policy;
  const aliases = new Map(
    snapshot.plans.map((plan, index) => [plan.id, `agreement_${index + 1}`]),
  );
  const protectedFacts = new Set();
  const agreements = snapshot.plans.map((accepted) => {
    const plan = toGamePlan(accepted.plan);
    for (const id of plan.protectedFactIds) protectedFacts.add(id);
    plan.protectedFactIds = [...protectedFacts];
    const id = aliases.get(accepted.id);
    const consents = [
      {
        actorId: p.beneficiaryId,
        decision: "accepted",
        basis: "host_policy",
        policyId: p.beneficiaryConsent.policyId,
        conditions: [
          "Original remains with its owner.",
          "Declared and prior privacy promises remain binding.",
        ],
        evaluatedAtRevision: accepted.command.expectedRevision,
        renewedForAgreement: id,
        conditional: false,
      },
    ];
    if (
      plan.steps.some((step) =>
        ["grant_passage", "grant_shelter"].includes(step.kind),
      )
    )
      consents.push({
        actorId: p.authorityId,
        decision: "accepted",
        basis: "host_policy",
        policyId: p.authorityConsent.policyId,
        conditions: [
          "Protection requires actual receipt of the agreed evidence and an available route or shelter.",
        ],
        evaluatedAtRevision: accepted.command.expectedRevision,
        renewedForAgreement: id,
        conditional: true,
      });
    return {
      ...plan,
      id,
      runtimePlanId: accepted.id,
      proposalId: accepted.proposalId,
      status: accepted.status,
      nextStep: accepted.nextStep,
      completedStepIds: Array.from(
        { length: accepted.nextStep },
        (_, index) => index,
      ),
      acceptedAtRevision: accepted.acceptedAtRevision,
      provenance: accepted.provenance,
      consents,
    };
  });
  const events = [
    {
      id: "event_1",
      type: "world_created",
      description: definition.description,
      revision: 0,
      details: {},
    },
  ];
  for (const item of snapshot.history) {
    let event;
    if (item.type === "plan_proposed")
      event = {
        type: `proposal_${item.data.status === "ready" ? "proposal" : item.data.status === "needs_context" ? "clarify" : item.data.status}`,
        description: `Proposed intention: ${item.data.intent}. No action executed.`,
        details: { proposalId: item.data.proposalId },
      };
    if (item.type === "plan_accepted")
      event = {
        type: "agreement_accepted",
        description: `Recorded ${aliases.get(item.data.planId)} after host policy checks. Actions remain to be executed.`,
        details: { agreementId: aliases.get(item.data.planId) },
      };
    if (item.type === "step_executed")
      event = {
        type: "action_executed",
        description: item.data.result.description,
        details: item.data.result.details,
      };
    if (item.type === "world_changed")
      event = { type: "setback", description: item.data.reason, details: {} };
    if (event)
      events.push({
        id: `event_${events.length + 1}`,
        revision: item.revision,
        ...event,
      });
  }
  const proposal = snapshot.proposal
    ? {
        ...toGamePlan(snapshot.proposal.plan),
        id: snapshot.proposal.id,
        branchId: snapshot.branchId,
        basedOnRevision: snapshot.proposal.basedOnRevision,
        stagedAtRevision: snapshot.proposal.stagedAtRevision,
        provenance: snapshot.proposal.provenance,
      }
    : null;
  const active = snapshot.plans.find((plan) => plan.status === "active");
  return {
    ...state,
    schemaVersion: 2,
    branchId: snapshot.branchId,
    revision: snapshot.revision,
    definition,
    agreements,
    proposal,
    events,
    sdk: {
      adapter: snapshot.adapter,
      nextStep: active
        ? { planId: active.id, stepId: active.stepIds[active.nextStep] }
        : null,
    },
  };
}

/** The browser consumes the same generic runtime as other game adapters. */
export function createRuntimeApi({
  provider = new StructuredProvider(),
  artifactDirectory,
} = {}) {
  let adapter = createOffScriptAdapter();
  let runtime = adapter.createSession();
  let pending = false;
  let progress = null;
  let evidenceWarning = null;
  const response = (extra) => ({
    world: projectGameWorld(runtime.snapshot()),
    provider: provider.info(),
    busy: pending,
    progress,
    evidenceWarning,
    ...extra,
  });
  function guard(body) {
    const current = runtime.snapshot();
    if (
      body.expectedBranchId !== current.branchId ||
      body.expectedRevision !== current.revision
    )
      throw new RuntimeError(
        "STALE_ACTION",
        "The story changed or this request omitted its context. Read the current scene and try again.",
      );
  }
  async function retain(name, data) {
    if (!artifactDirectory) return;
    try {
      await mkdir(artifactDirectory, { recursive: true });
      await writeFile(
        join(artifactDirectory, `${randomUUID()}.json`),
        JSON.stringify({ kind: name, ...data }, null, 2),
        { mode: 0o600 },
      );
    } catch {
      evidenceWarning = {
        code: "EVIDENCE_WRITE_FAILED",
        message:
          "The optional evidence file could not be saved. The response shows the current world.",
      };
    }
  }
  return async function handle(method, path, body = {}) {
    try {
      if (method === "GET") {
        if (path === "state") return { status: 200, body: response() };
        if (path === "save") return { status: 200, body: runtime.snapshot() };
        if (path === "scenarios") return { status: 200, body: { scenarios } };
        return { status: 404, body: { error: "Unknown runtime route." } };
      }
      if (method !== "POST")
        return { status: 405, body: { error: "Use GET or POST." } };
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new RuntimeError("INVALID_REQUEST", "A JSON object is required.");
      if (!["step", "play-step", "accept"].includes(path)) guard(body);
      const command = {
        branchId: body.expectedBranchId,
        expectedRevision: body.expectedRevision,
      };
      let extra = {};
      switch (path) {
        case "reset":
          adapter = createOffScriptAdapter(body.scenarioId ?? "ledger");
          runtime = adapter.createSession();
          progress = null;
          evidenceWarning = null;
          break;
        case "load": {
          const snapshot = body.snapshot;
          if (!snapshot?.adapter || !snapshot?.state?.scenarioId)
            throw new RuntimeError(
              "SAVE_VERSION",
              "This checkpoint predates the extracted runtime. The original checkpoint is retained. Start a new run to create a compatible save.",
            );
          const nextAdapter = createOffScriptAdapter(snapshot.state.scenarioId);
          const nextRuntime = nextAdapter.createSession();
          const fresh = nextRuntime.snapshot();
          nextRuntime.restore(snapshot, {
            branchId: fresh.branchId,
            expectedRevision: fresh.revision,
          });
          adapter = nextAdapter;
          runtime = nextRuntime;
          progress = null;
          break;
        }
        case "accept": {
          extra = {
            acceptance: runtime.accept({
              ...command,
              proposalId: body.proposalId,
            }).plan.id,
          };
          break;
        }
        case "step":
        case "play-step": {
          // Fork an exact validated checkpoint so delivery plus authored curfew
          // commits as one visible HTTP operation, including on a failed callback.
          const draft = adapter.createSession(runtime.snapshot());
          const result = draft.step({
            ...command,
            planId: body.planId,
            stepId: body.stepId,
          });
          const p = scenarios.find(
            (item) => item.id === result.snapshot.state.scenarioId,
          ).policy;
          const delivered =
            result.receipt.result.details.kind === "deliver_document" &&
            result.receipt.result.details.target === p.authorityId;
          if (
            path === "play-step" &&
            !result.replayed &&
            delivered &&
            !result.snapshot.state.setbackOccurred &&
            result.snapshot.state.clock === "night" &&
            result.snapshot.state.entities[p.beneficiaryId].location !==
              p.exitRoomId
          )
            adapter.applySetback(draft);
          runtime = draft;
          extra = { receipt: result.receipt, replayed: result.replayed };
          break;
        }
        case "setback":
          adapter.applySetback(runtime);
          break;
        case "propose": {
          if (pending)
            throw new RuntimeError(
              "PLANNING_BUSY",
              "A proposal is already being considered.",
            );
          const target = runtime;
          const targetRegistry = adapter.registry;
          const context = target.context();
          pending = true;
          evidenceWarning = null;
          try {
            const result = await planIntent(
              target,
              targetRegistry,
              (request) => provider.generate(request),
              body.text,
              {
                onProgress: (event) => {
                  if (runtime === target) progress = event;
                },
              },
            );
            await retain(
              `${result.snapshot.proposal.provenance.requestId}.json`,
              {
                request: body.text,
                context,
                schema: targetRegistry.schema(),
                ...result,
              },
            );
            if (runtime !== target)
              throw new RuntimeError(
                "STALE_PROPOSAL",
                "The world changed during planning. This response was discarded.",
              );
          } catch (error) {
            await retain(`failed-${Date.now()}-${context.branchId}.json`, {
              request: body.text,
              context,
              error: { code: error.code, message: error.message },
              attempts: error.attempts ?? [],
            });
            throw error;
          } finally {
            pending = false;
          }
          break;
        }
        default:
          return { status: 404, body: { error: "Unknown runtime route." } };
      }
      return { status: 200, body: response(extra) };
    } catch (error) {
      const stale = [
        "STALE_ACTION",
        "STALE_BRANCH",
        "STALE_REVISION",
        "STALE_PROPOSAL",
        "PLANNING_BUSY",
      ].includes(error.code);
      return {
        status: stale ? 409 : 400,
        body: response({
          error: error.message,
          code: error.code ?? "REQUEST_FAILED",
        }),
      };
    }
  };
}
