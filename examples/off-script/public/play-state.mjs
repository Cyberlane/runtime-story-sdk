// Presentation only. All permissions, actions and saves are owned by the host.
export function activeDeal(world) {
  return world?.agreements.findLast((deal) => deal.status === "active");
}

export function actionText(world, step) {
  const name = (id) =>
    world.entities[id]?.name || world.documents[id]?.title || id;
  switch (step.kind) {
    case "create_document":
      return `Copy only: ${step.factIds.map((id) => world.definition.facts[id].text).join(" ")}`;
    case "deliver_document":
      return `Deliver the copy ${name(step.actor)} to ${name(step.target)}.`;
    case "grant_passage":
      return `${name(step.actor)} authorizes ${name(step.target)} to leave, once the evidence is received and the gate is open.`;
    case "grant_shelter":
      return `${name(step.actor)} grants ${name(step.target)} shelter in the office after receiving the required evidence.`;
    case "move_person":
      return `Move ${name(step.actor)} to ${name(step.target)}.`;
    case "wait_until_morning":
      return "Spend the night in authorized shelter. Advance to morning and reopen the gate.";
    default:
      return "Unsupported action.";
  }
}

export function nextInteraction(world) {
  const deal = activeDeal(world);
  const step = deal?.steps[deal.nextStep];
  if (!step) return null;
  const policy = world.definition.policy;
  const choices = {
    create_document: ["desk", "Copy the selected pages"],
    deliver_document: [
      step.target,
      `Hand over the copy to ${world.entities[step.target]?.name}`,
    ],
    grant_passage: ["sera", "Ask Sera to authorize passage"],
    grant_shelter: ["sera", "Ask Sera for shelter"],
    wait_until_morning: ["office", "Stay safely until morning"],
    move_person: [
      step.target === policy.exitRoomId
        ? "gate"
        : step.target === policy.shelterRoomId
          ? "office"
          : "ivo",
      step.target === policy.exitRoomId
        ? "Walk Ivo outside"
        : step.target === "warehouse"
          ? "Return through the warehouse"
          : `Walk Ivo to ${world.entities[step.target]?.name}`,
    ],
  };
  const [target, label] = choices[step.kind];
  return { target, label, step, index: deal.nextStep };
}

export function canRingCurfew(world) {
  const policy = world?.definition.policy;
  return Boolean(
    policy &&
      !world.setbackOccurred &&
      world.clock === "night" &&
      world.entities[policy.beneficiaryId].location !== policy.exitRoomId &&
      Object.values(world.documents).some(
        (doc) => !doc.original && doc.owner === policy.authorityId,
      ),
  );
}

export function observations(world) {
  const p = world.definition.policy;
  const copies = Object.values(world.documents).filter((doc) => !doc.original);
  const authorityFacts = world.knowledge[p.authorityId];
  return {
    originalOwner:
      world.entities[world.documents[p.originalDocumentId].owner].name,
    copyOwners: copies.map((doc) => world.entities[doc.owner].name),
    workersPrivate:
      !authorityFacts.includes("worker_names") &&
      !world.knowledge[p.antagonistId].includes("worker_names"),
    ivoLocation: world.entities[p.beneficiaryId].location,
    ivoLocationName:
      world.entities[world.entities[p.beneficiaryId].location].name,
    safelyDeparted: world.entities[p.beneficiaryId].location === p.exitRoomId,
    safelySheltered:
      world.entities[p.beneficiaryId].location === p.shelterRoomId &&
      world.shelterGrants.includes(p.beneficiaryId),
    copies: copies.length,
  };
}

export function objective(world) {
  const next = nextInteraction(world);
  if (next) return next.label;
  if (world.proposal?.status === "proposal")
    return "Read the proposed deal, then accept it.";
  const state = observations(world);
  if (state.safelyDeparted)
    return `Ivo is outside with the original${world.shelteredOvernight ? ", after a safe night" : ""}.`;
  if (state.safelySheltered) return "Ivo has reached the agreed shelter.";
  if (world.setbackOccurred && world.clock === "night")
    return "The gate is locked. Propose a different way to keep Ivo safe.";
  if (world.agreements.at(-1)?.status === "fulfilled")
    return "The agreed actions are complete. Inspect what changed or propose another deal.";
  return "Inspect the ledger, then describe a deal in your own words.";
}

export const suggestedRequests = {
  private:
    "Give Sera a copy proving the false shipments and stolen wages, without any names or signatures. Ivo keeps the original ledger. In exchange, have him actually leave through the outside exit tonight after Sera receives the copy.",
  signed:
    "Give Sera a copy proving the false shipments and stolen wages and include Mara’s signature so she can verify who authorized it. Keep the uninvolved workers anonymous. Ivo keeps the original and actually leaves through the outside exit tonight after Sera receives the copy.",
  shelter:
    "Use the evidence already delivered to Sera. Keep Ivo safe in her office overnight, then have him actually walk outside in the morning. Preserve every privacy promise and keep the original with Ivo. Do not create or deliver another copy.",
};

export function proposedOutcome(world, proposal) {
  const destination = proposal.steps
    .filter((step) => step.kind === "move_person" && step.actor === "ivo")
    .at(-1)?.target;
  if (destination === "outside")
    return proposal.steps.some((step) => step.kind === "wait_until_morning")
      ? "Ivo shelters overnight, then walks outside in the morning."
      : `Ivo walks outside ${world.clock === "night" ? "tonight" : "now"}.`;
  if (destination === "office")
    return "Ivo moves into Sera’s office for shelter.";
  if (destination)
    return `Ivo moves to ${world.entities[destination]?.name || destination}.`;
  return "Ivo does not move in this plan. Check the actions below for any evidence or permission changes.";
}

export function missingEvidence(world) {
  const policy = world.definition.policy;
  return policy.evidenceFactIds.filter(
    (id) => !world.knowledge[policy.authorityId].includes(id),
  );
}

export function shelterRequest(world) {
  return missingEvidence(world).length
    ? "Give Sera the missing evidence of false shipments and stolen wages she still needs, preserving the facts already delivered and all prior privacy promises. Then arrange a safe night in her office for Ivo and actual departure through the warehouse in the morning. Keep the original with Ivo. Do not repeat completed actions."
    : suggestedRequests.shelter;
}

export function guideView(world, introStep = 0) {
  const next = nextInteraction(world);
  const observation = observations(world);
  if (world.proposal?.status === "proposal")
    return {
      phase: 2,
      speaker: "The proposed deal",
      title: "Check what you are agreeing to.",
      body: "Read what will be shared and what Ivo gets in return. Nothing happens until you agree and carry it out.",
      target: "sera",
      mode: "proposal",
    };
  if (next) {
    const instructions = {
      create_document: [
        "You · mediator",
        "Make the copy.",
        "The deal is agreed, but the copy does not exist yet. Use the lit desk to prepare exactly the evidence you promised.",
      ],
      deliver_document: [
        "You · mediator",
        "Hand over the evidence.",
        `You are holding the copy. Give it to ${world.entities[next.step.target]?.name || "the recipient"} so they can read it.`,
      ],
      grant_shelter: [
        "Sera · dock supervisor",
        "Confirm the safe room.",
        "Sera already has the evidence. Ask her to honor the new shelter agreement.",
      ],
      grant_passage: [
        "Sera · dock supervisor",
        "Get permission to leave.",
        "The gate is open. Sera must now authorize Ivo’s passage.",
      ],
      wait_until_morning: [
        "Ivo · ledger keeper",
        "Stay until the lock reopens.",
        "Ivo is inside the agreed shelter. Spend the night here, then continue in the morning.",
      ],
      move_person: [
        "You · mediator",
        next.step.target === "outside"
          ? "Lead Ivo out."
          : next.step.target === "office"
            ? "Take Ivo to safety."
            : "Return to the warehouse.",
        next.step.target === "outside"
          ? "The gate is open and passage is authorized. Ivo can finally walk outside with his ledger."
          : next.step.target === "office"
            ? "Shelter is agreed. Click the office to bring Ivo inside."
            : "The office opens into the warehouse. Bring Ivo back through it to reach the outside gate.",
      ],
    };
    const [speaker, title, body] = instructions[next.step.kind];
    return {
      phase: world.setbackOccurred ? 3 : 2,
      speaker,
      title,
      body,
      target: next.target,
      mode: "action",
      button: next.label,
    };
  }
  if (observation.safelyDeparted)
    return {
      phase: 4,
      speaker: "Ivo is safe",
      title: "You found a way out.",
      body: `Ivo is outside with his original ledger${world.shelteredOvernight ? " after a safe night" : ""}. ${observation.workersPrivate ? "The uninvolved workers stayed anonymous." : "The workers’ names were disclosed."} Your accepted deal changed what happened.`,
      target: null,
      mode: "complete",
      button: "Start a new story",
    };
  if (world.proposal && world.proposal.status !== "proposal")
    return {
      phase: world.setbackOccurred ? 3 : 2,
      speaker: "A limit to this plan",
      title: "That approach needs a change.",
      body: world.proposal.question || world.proposal.summary,
      target: "sera",
      mode: "choices",
    };
  if (world.setbackOccurred && world.clock === "night") {
    const missing = missingEvidence(world);
    const interrupted = world.agreements.some(
      (deal) => deal.status === "interrupted",
    );
    const offer = missing.length
      ? "I still need the missing evidence before I can offer shelter."
      : "I can offer Ivo my office for the night.";
    return {
      phase: 3,
      speaker: "Sera · dock supervisor",
      title: "The gate has locked.",
      body: `“The night watch has locked us in until morning. I still have your copy. ${offer}” ${interrupted ? "The earlier deal cannot finish." : "Your earlier report is complete, but Ivo is still inside."} Choose what to ask for now.`,
      target: "sera",
      mode: "choices",
    };
  }
  if (world.agreements.length)
    return {
      phase: 3,
      speaker: observation.safelySheltered
        ? "Ivo is sheltered"
        : "The agreed actions are complete",
      title: observation.safelySheltered
        ? "Safe, but still inside."
        : "What happens next?",
      body: "Look at what changed in the scene. You can suggest another deal if you want a different next step.",
      target: "sera",
      mode: "choices",
    };
  const opening = [
    {
      speaker: "You are the mediator",
      title: "Help Ivo get out safely.",
      body: "Ivo found proof that dockworkers’ wages were stolen. He needs your help getting out with the ledger. Sera controls passage through the exit.",
      target: "ivo",
      mode: "intro",
      button: "Talk to Ivo",
    },
    {
      speaker: "Ivo · ledger keeper",
      title: "“I’m keeping this ledger.”",
      body: "“It proves our wages were stolen. But it also names workers who did nothing wrong. I need a way out without putting them in trouble.”",
      target: "ivo",
      mode: "intro",
      button: "Look inside the ledger",
    },
    {
      speaker: "Inside Ivo’s ledger",
      title: "Evidence and identities.",
      body: "The first two entries prove the theft. The others identify people. You can share selected pages while Ivo keeps the original.",
      target: "sera",
      mode: "evidence",
      button: "Ask Sera what she needs",
    },
    {
      speaker: "Sera · dock supervisor",
      title: "“Show me the evidence.”",
      body: "“Bring me a copy of the missing shipments and stolen wages. Then I can let Ivo leave. He can keep the original.” What will you offer?",
      target: "sera",
      mode: "choices",
    },
  ];
  return { phase: introStep < 2 ? 0 : 1, ...opening[Math.min(introStep, 3)] };
}

export function storyGuide(world, intro) {
  const guide = guideView(world, intro),
    step = nextInteraction(world)?.step;
  if (guide.mode === "proposal")
    return {
      ...guide,
      title: world.agreements.length
        ? "A new way to keep the promise."
        : "Your words became a plan.",
      body: world.agreements.length
        ? "The remaining route can change. The evidence already delivered cannot. Review these new terms."
        : "Review the evidence and Ivo’s route before you agree.",
    };
  if (guide.mode === "action") {
    const lines = {
      create_document: [
        "Ivo · ledger keeper",
        "“Just the pages we agreed.”",
        "Use the copying desk to prepare the promised evidence. My original stays with me.",
      ],
      deliver_document: [
        "You · mediator",
        "The proof is in your hands.",
        `Give the extract to ${world.entities[step.target]?.name || "the agreed recipient"}. Only its selected facts will be shared.`,
      ],
      grant_shelter: [
        "Sera · dock supervisor",
        "“There is room in my office.”",
        "The evidence is here. Ask Sera to confirm the safe room promised in your new deal.",
      ],
      grant_passage: [
        "Sera · dock supervisor",
        "“The watch has opened the gate.”",
        "The agreed evidence is here. Ask Sera for passage, then Ivo can leave.",
      ],
      wait_until_morning: [
        "Ivo · ledger keeper",
        "“For once, we can breathe.”",
        "A dry room. The ledger beside him. Stay safely until morning, when the gate reopens.",
      ],
      move_person: [
        "You · mediator",
        step.target === "office"
          ? "A light left on."
          : step.target === "outside"
            ? "The way is open."
            : "A new morning.",
        step.target === "office"
          ? "Bring Ivo into the office Sera agreed to lend him."
          : step.target === "outside"
            ? "Lead Ivo outside with his ledger. The promise can finally be kept."
            : "Bring Ivo back through the warehouse to reach the gate.",
      ],
    };
    const [speaker, title, body] = lines[step.kind];
    return { ...guide, speaker, title, body };
  }
  return guide;
}
