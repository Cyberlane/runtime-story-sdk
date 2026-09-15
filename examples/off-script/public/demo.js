import { StoryScene } from "./demo-scene.js";
import { Soundscape } from "./demo-audio.mjs";
import {
  activeDeal,
  nextInteraction,
  observations,
  guideView,
  storyGuide,
  suggestedRequests,
  shelterRequest,
  proposedOutcome,
  actionText,
} from "./play-state.mjs";

const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const storeKey = "off-script-judge-checkpoint-v2";
const safeRead = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const state = {
  world: null,
  provider: null,
  started: false,
  intro: 0,
  busy: false,
  composing: false,
  draft: "",
  audit: [],
  checkpoint: safeRead(storeKey, null),
  reduced: safeRead(
    "off-script-reduced",
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  ),
  retry: null,
};
const scene = new StoryScene($("stage")),
  sound = new Soundscape();
let typing,
  receiptTimer,
  waitTimer,
  lastLine = "",
  lastFocus = null;
window.offScriptDemo = {
  getSnapshot: () => structuredClone(state.world),
  getAudit: () => structuredClone(state.audit),
  getPresentation: () => ({
    started: state.started,
    intro: state.intro,
    room: scene.room,
    busy: state.busy,
  }),
  getArtStatus: () => ({ loaded: !!scene.sprites }),
};

function persistIntro() {
  try {
    sessionStorage.setItem(
      `off-script-demo-${state.world.branchId}`,
      JSON.stringify({
        intro: state.intro,
        started: state.started,
        draft: state.draft,
      }),
    );
  } catch {
    /* Playback does not require storage. */
  }
}
async function api(path, body) {
  if (body !== undefined && state.world)
    body = {
      ...body,
      expectedBranchId: state.world.branchId,
      expectedRevision: state.world.revision,
      ...(["step", "play-step"].includes(path)
        ? state.world.sdk?.nextStep
        : {}),
    };
  const record = { path, body, startedAt: new Date().toISOString() };
  state.audit.push(record);
  try {
    const response = await fetch(
      `/api/runtime/${path}`,
      body === undefined
        ? { cache: "no-store" }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    const data = await response.json();
    Object.assign(record, {
      status: response.status,
      finishedAt: new Date().toISOString(),
      response: data,
    });
    if (data.world) {
      state.world = data.world;
      state.provider = data.provider;
    }
    if (!response.ok)
      throw new Error(data.error || "The action could not be completed.");
    return data;
  } catch (error) {
    record.error = error.message;
    if (error instanceof TypeError || error instanceof SyntaxError) {
      let recovered = false;
      try {
        const r = await fetch("/api/runtime/state", { cache: "no-store" });
        const data = await r.json();
        if (r.ok && data.world) {
          state.world = data.world;
          state.provider = data.provider;
          recovered = true;
        }
      } catch {
        /* Keep the last known world visible until reconnect succeeds. */
      }
      const failure = new Error(
        recovered
          ? "The connection interrupted this action. The current story has been recovered. Check the next action before continuing."
          : "The local story server is not responding. Reconnect it, then check the story. Your last confirmed state is still shown.",
      );
      failure.retry = () =>
        locked(async () => {
          await api("state");
        });
      throw failure;
    }
    throw error;
  }
}
function showError(error, retry) {
  sound.cue("error");
  state.retry = retry;
  $("errorText").textContent = error.message;
  $("retry").hidden = !retry;
  $("error").hidden = false;
  $("dismissError").focus();
}
async function locked(task, { retry } = {}) {
  if (state.busy) return;
  state.busy = true;
  setBusy(true);
  try {
    await task();
  } catch (error) {
    showError(error, error.retry || retry);
  } finally {
    state.busy = false;
    setBusy(false);
    render();
  }
}
function setBusy(value) {
  document
    .querySelectorAll(
      "#conversation button,#hotspots button,#begin,#resume,#confirmRestart,#save,#load,#restart",
    )
    .forEach((b) => (b.disabled = value));
  const input = $("intention");
  if (input) input.disabled = value;
  $("menu").disabled = value;
  $("load").disabled = value || !state.checkpoint;
}
function announce(title, text) {
  clearTimeout(receiptTimer);
  $("receipt").innerHTML = `<strong>${esc(title)}</strong><p>${esc(text)}</p>`;
  $("receipt").hidden = false;
  receiptTimer = setTimeout(() => ($("receipt").hidden = true), 6200);
}
const button = (label, action, style = "primary") =>
  `<button type="button" class="${style}" data-action="${action}">${esc(label)}</button>`;
const labels = {
  false_invoices: "Missing shipments",
  missing_wages: "Stolen wages",
  mara_signature: "Mara’s signature",
  worker_names: "Workers’ names",
};
const compactStep = (step) =>
  ({
    create_document: "Prepare evidence",
    deliver_document: "Deliver copy",
    grant_passage: "Grant passage",
    grant_shelter: "Agree shelter",
    wait_until_morning: "Wait until morning",
    move_person:
      step.target === "outside"
        ? "Walk outside"
        : step.target === "office"
          ? "Enter office"
          : "Return to warehouse",
  })[step.kind];
function speakerId(guide) {
  return /^(Ivo|Sera|Mara) ·/.exec(guide.speaker)?.[1].toLowerCase() ?? null;
}
function setDialogue(guide) {
  const remoteSera =
    speakerId(guide) === "sera" &&
    state.world.entities.ivo.location === "office" &&
    state.world.entities.sera.location === "warehouse";
  $("speaker").textContent = remoteSera
    ? "Sera · calling from the warehouse"
    : guide.speaker;
  $("lineTitle").textContent = guide.title;
  scene.speakingId = speakerId(guide);
  $("portrait").hidden = !scene.speakingId;
  if (scene.speakingId) scene.portrait($("portrait"), scene.speakingId);
  const line = guide.body;
  if (line === lastLine) return;
  lastLine = line;
  if (state.started) sound.cue("dialogue");
  clearInterval(typing);
  $("lineText").textContent = "";
  $("lineText").setAttribute("aria-label", line);
  $("lineTitle").classList.remove("enter-line");
  void $("lineTitle").offsetWidth;
  $("lineTitle").classList.add("enter-line");
  if (state.reduced) {
    $("lineText").textContent = line;
    return;
  }
  let index = 0;
  typing = setInterval(() => {
    index += 4;
    $("lineText").textContent = line.slice(0, index);
    if (index >= line.length) clearInterval(typing);
  }, 16);
}

function render() {
  const w = state.world;
  if (!w) return;
  if (w.scenarioId !== "ledger") {
    state.started = false;
    $("titleScreen").hidden = false;
    $("conversation").hidden = true;
    $("objective").hidden = true;
    $("hotspots").innerHTML = "";
    $("bootStatus").textContent =
      "Another local tab selected a different story. Enter the warehouse to start this adventure.";
    $("begin").disabled = false;
    return;
  }
  scene.setWorld(w);
  sound.setScene({ title: !state.started, world: w });
  scene.setPresentation({
    title: !state.started,
    target: null,
    reduced: state.reduced,
  });
  document.body.classList.toggle("reduced", state.reduced);
  $("titleScreen").hidden = state.started;
  $("conversation").hidden = !state.started;
  $("objective").hidden = !state.started;
  $("resume").hidden = !w.agreements.length && !w.proposal;
  $("begin").disabled = state.busy;
  $("load").disabled = state.busy || !state.checkpoint;
  $("reduceMotion").checked = state.reduced;
  $("providerInfo").textContent =
    `Current transport: ${state.provider?.label || "unavailable"} · ${state.provider?.model || ""}. Live requests used: ${state.provider?.callsUsed ?? 0}/${state.provider?.callLimit ?? "?"}. Calls may take several seconds. No stored-response fallback is presented as live.`;
  if (!state.started) {
    $("hotspots").innerHTML = "";
    return;
  }
  if (w.scenarioId !== "ledger") {
    showError(
      new Error(
        "Another local tab selected a different story. Start a new warehouse story to continue.",
      ),
      () => restart(),
    );
    return;
  }
  let guide = storyGuide(w, state.intro);
  if (state.composing)
    guide = {
      ...guide,
      mode: "compose",
      speaker: "You · the mediator",
      title: w.setbackOccurred
        ? "Change the plan. Keep the promise."
        : "What will you promise?",
      body: w.setbackOccurred
        ? "The copy is already with Sera. Write what should happen next, and what must stay unchanged."
        : "Describe what to share, what to protect, and what Ivo should get in return.",
    };
  if (guide.mode === "complete")
    guide = {
      ...guide,
      title: "A promise kept.",
      body: `“${w.shelteredOvernight ? "We made it through the night. " : ""}And the ledger is still mine.” ${observations(w).workersPrivate ? "The workers’ names stayed out of the exchange." : "The workers’ names were disclosed in the exchange."}`,
    };
  setDialogue(guide);
  $("conversation").dataset.mode = guide.mode;
  const hasResponse =
    guide.mode === "proposal" ||
    (["choices", "compose"].includes(guide.mode) && !!w.proposal);
  const live = hasResponse && w.proposal?.provenance?.live === true;
  $("origin").className = `origin${live ? " live" : ""}`;
  $("origin").textContent =
    guide.mode === "proposal"
      ? `${live ? "LIVE" : "CHECKED"} PLAN · AWAITING YOUR AGREEMENT`
      : guide.mode === "action"
        ? "EXECUTING THE ACCEPTED PLAN"
        : guide.mode === "compose"
          ? "YOUR WORDS → LIVE OPENAI"
          : guide.mode === "complete"
            ? "CONFIRMED WORLD OUTCOME"
            : hasResponse
              ? live
                ? "LIVE MODEL RESPONSE"
                : "CHECKED RESPONSE"
              : "AUTHORED STORY";
  const chapter =
    w.clock === "morning"
      ? "IV · A BRIGHTER MORNING"
      : w.entities.ivo.location === "office"
        ? "III · A PLACE TO STAY"
        : w.setbackOccurred
          ? "II · A CHANGE OF PLAN"
          : "I · THE LAST LEDGER";
  $("chapter").textContent = chapter;
  $("actLabel").textContent = w.exitOpen
    ? `${w.clock.toUpperCase()} · PASSAGE ${w.passageGrants.includes("ivo") ? "AUTHORIZED" : "NOT YET AUTHORIZED"}`
    : "NIGHT WATCH · EXIT LOCKED";
  $("objectiveText").textContent =
    guide.mode === "complete"
      ? "Ivo is outside. Your promise is kept."
      : guide.mode === "action"
        ? nextInteraction(w).label
        : guide.mode === "proposal"
          ? "Review the exchange before agreeing."
          : w.setbackOccurred
            ? "Find a safe way through the night."
            : "Help Ivo leave with his ledger.";
  $("content").innerHTML = "";
  $("actions").innerHTML = "";
  $("conversation").classList.toggle(
    "expanded",
    ["evidence", "choices", "compose", "proposal", "complete"].includes(
      guide.mode,
    ),
  );
  if (guide.mode === "evidence") renderEvidence(w);
  if (guide.mode === "choices") renderChoices(w);
  if (guide.mode === "compose") renderComposer(w);
  if (guide.mode === "proposal") renderProposal(w);
  if (guide.mode === "complete") renderEnding(w);
  if (["intro", "evidence", "action"].includes(guide.mode))
    $("actions").innerHTML =
      button(guide.button, "next") +
      (guide.mode === "action"
        ? '<span class="hint">Or click the marked place in the scene.</span>'
        : "");
  renderHotspots(guide);
  setBusy(state.busy);
  if (
    !state.busy &&
    !state.composing &&
    !document.querySelector("dialog[open]") &&
    document.activeElement === document.body
  ) {
    const nextButton =
      $("actions").querySelector("button") ||
      $("content").querySelector("button");
    nextButton?.focus({ preventScroll: true });
  }
}
function renderEvidence(w) {
  $("content").innerHTML = `<div class="evidence-grid">${Object.entries(
    w.definition.facts,
  )
    .map(
      ([id, fact]) =>
        `<article class="evidence ${["worker_names", "mara_signature"].includes(id) ? "identity" : ""}"><span class="eyebrow">${id === "worker_names" ? "INNOCENT PEOPLE" : id === "mara_signature" ? "WHO SIGNED" : "PROOF OF THE THEFT"}</span><b>${esc(labels[id])}</b><p>${esc(fact.text)}</p></article>`,
    )
    .join("")}</div>`;
}
function renderChoices(w) {
  if (w.setbackOccurred || w.agreements.length) {
    $("content").innerHTML =
      `<div class="choice-row"><button class="choice" data-action="shelter"><strong>A safe night, then a way out</strong><span>Keep the delivered evidence and privacy promises. Ask for shelter until morning.</span></button><button class="choice" data-action="custom"><strong>Find your own words ↗</strong><span>Change your priorities. The new plan must respect what already happened.</span></button></div>`;
  } else {
    $("content").innerHTML =
      `<div class="choice-row"><button class="choice" data-action="private"><strong>Expose the theft. Protect every name.</strong><span>Share the two financial facts, withholding names and signatures.</span></button><button class="choice" data-action="signed"><strong>Name the person responsible.</strong><span>Include Mara’s signature, keeping the innocent workers anonymous.</span></button></div>`;
    $("actions").innerHTML = button(
      "Or write your own deal ↗",
      "custom",
      "text-button",
    );
  }
}
function renderComposer() {
  $("content").innerHTML =
    `<form id="composeForm" class="composer"><label for="intention">Your proposed deal · edit freely</label><textarea id="intention" maxlength="4000" required minlength="3" placeholder="Ivo keeps the original. Give Sera…">${esc(state.draft)}</textarea><div class="actions"><button class="primary" type="submit">Send to live OpenAI <span>✦</span></button>${button("Back", "cancel-compose", "quiet")}<span class="hint">The model chooses evidence and composes supported actions. You review the plan before anything happens.</span></div></form>`;
  $("intention").addEventListener("input", (e) => {
    state.draft = e.target.value;
    persistIntro();
  });
  $("composeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    propose();
  });
}
function renderProposal(w) {
  const p = w.proposal,
    facts = p.steps
      .filter((s) => s.kind === "create_document")
      .flatMap((s) => s.factIds),
    protectedIds = [
      ...new Set([
        ...w.agreements.flatMap((a) => a.protectedFactIds),
        ...p.protectedFactIds,
      ]),
    ];
  const delivered = Object.values(w.documents).filter(
    (d) => !d.original && d.owner === "sera",
  );
  $("content").innerHTML =
    `<div class="deal-summary"><div><span class="eyebrow">WHAT THIS PLAN WILL DO</span><p>${esc(proposedOutcome(w, p))}</p><p>${facts.length ? `Copy: ${esc(facts.map((id) => labels[id]).join(" · "))}.` : "No new evidence copy is requested."}</p></div><div class="kept"><span class="eyebrow">WHAT STAYS PROTECTED</span><p>Ivo keeps his original ledger.</p><p>${protectedIds.length ? `Withheld: ${esc(protectedIds.map((id) => labels[id]).join(" · "))}.` : "No additional facts are promised private."}</p>${delivered.length ? `<p>✓ ${delivered.length} delivered ${delivered.length === 1 ? "copy stays" : "copies stay"} with Sera.</p>` : ""}</div></div><div class="route" aria-label="Proposed action sequence">${p.steps.map((s) => `<span>${esc(compactStep(s))}</span>`).join("")}</div><p class="provenance">✦ ${p.provenance.live ? "Generated live" : "Non-live proposal"} · ${esc(p.provenance.model || "unknown model")} · ${((p.provenance.totalDurationMs || p.provenance.durationMs || 0) / 1000).toFixed(1)}s · ${p.provenance.repairCount || 0} corrections. Checked against the game’s rules. Nothing executed.</p><details><summary>Read the exact actions and model interpretation</summary><p>${esc(p.summary)}</p><ol>${p.steps.map((s) => `<li class="small">${esc(actionText(w, s))}</li>`).join("")}</ol></details>`;
  $("actions").innerHTML =
    button("Agree to this deal", "accept") +
    button("Change my request", "custom", "quiet");
}
function renderEnding(w) {
  const o = observations(w),
    calls = w.agreements.filter((a) => a.provenance?.live).length;
  $("content").innerHTML =
    `<div class="end-stats"><div><b>Original retained</b><span>IVO KEPT HIS LEDGER</span></div><div><b>${o.workersPrivate ? "Names protected" : "Names disclosed"}</b><span>ACTUAL EVIDENCE SHARED</span></div><div><b>${w.investigationOpen ? "Investigation opened" : "Anonymous evidence"}</b><span>${w.investigationOpen ? "MARA’S SIGNATURE WAS DELIVERED" : "NO NAMED INVESTIGATION OPENED"}</span></div></div><p class="provenance">${calls} accepted live ${calls === 1 ? "plan" : "plans"} shaped this route. ${w.agreements.length > 1 ? "The later agreement preserved the completed exchange." : "Every action followed the accepted terms."}</p>`;
  $("actions").innerHTML =
    button("See what your words changed", "journal") +
    button("Play another way", "restart", "quiet") +
    button("How the tool works", "about", "text-button");
}
function renderHotspots(guide) {
  const anchors = scene.getAnchors(),
    target =
      guide.mode === "action"
        ? nextInteraction(state.world)?.target
        : ["intro", "evidence"].includes(guide.mode)
          ? guide.target
          : null;
  scene.setPresentation({
    target,
    title: !state.started,
    reduced: state.reduced,
  });
  if (!target || !anchors[target] || state.composing) {
    $("hotspots").innerHTML = "";
    return;
  }
  const remoteSera =
    target === "sera" &&
    state.world.entities.ivo.location === "office" &&
    state.world.entities.sera.location === "warehouse";
  const [x, y] = remoteSera ? [0.16, 0.43] : anchors[target];
  const names = {
    ivo: "Ivo · ledger keeper",
    sera: remoteSera ? "Call to Sera · warehouse" : "Sera · dock supervisor",
    mara: "Mara · warehouse owner",
    desk: "The copying desk",
    office:
      state.world.entities.ivo.location === "office"
        ? "Stay until morning"
        : "Sera’s office",
    gate: "The way outside",
  };
  const hotspot = document.createElement("button");
  hotspot.className = "hotspot target";
  hotspot.dataset.action = "next";
  hotspot.style.left = `${x * 100}%`;
  hotspot.style.top = `${y * 100}%`;
  hotspot.textContent = names[target];
  $("hotspots").replaceChildren(hotspot);
}
async function next() {
  if (state.busy) return;
  const guide = guideView(state.world, state.intro);
  if (["intro", "evidence"].includes(guide.mode)) {
    state.intro = Math.min(3, state.intro + 1);
    persistIntro();
    render();
    return;
  }
  if (guide.mode !== "action") return;
  return locked(async () => {
    if (state.world.proposal?.status === "proposal")
      throw new Error(
        "Review the replacement deal before carrying out another action.",
      );
    const previous = state.world,
      step = nextInteraction(previous).step,
      before = previous.events.length;
    await api("play-step", {});
    const events = state.world.events.slice(before),
      setback = events.some((e) => e.type === "setback");
    const roomChanged =
        previous.entities.ivo.location !== state.world.entities.ivo.location,
      timeChanged = previous.clock !== state.world.clock;
    if (roomChanged) {
      document.body.classList.add("traveling");
      sound.cue("footstep");
      const footstepTimer = setInterval(() => sound.cue("footstep"), 310);
      try {
        await scene.travel(step.target);
      } finally {
        clearInterval(footstepTimer);
        document.body.classList.remove("traveling");
      }
    }
    if (roomChanged || timeChanged) {
      await transition(
        timeChanged
          ? "Morning finds you safe."
          : state.world.entities.ivo.location === "office"
            ? "A place to stay."
            : state.world.entities.ivo.location === "outside"
              ? "A brighter morning."
              : "Back through the warehouse.",
      );
    }
    scene.effect(setback ? "setback" : step.kind);
    sound.cue(
      setback
        ? "setback"
        : state.world.entities.ivo.location === "outside"
          ? "success"
          : step.kind,
    );
    if (setback)
      announce(
        "The night watch has locked the exit.",
        "Your copy stays delivered. The unfinished deal needs a new plan.",
      );
    else if (step.kind === "create_document")
      announce(
        "A new copy, exactly as agreed.",
        `Only ${step.factIds.map((id) => labels[id]).join(" and ")}. Ivo keeps the original.`,
      );
    else if (step.kind === "deliver_document")
      announce(
        "The evidence changed hands.",
        `${state.world.entities[step.target].name} now has this copy and knows its contents.`,
      );
    else if (step.kind === "grant_shelter")
      announce(
        "Shelter agreed.",
        "Ivo may enter Sera’s office. He has not moved yet.",
      );
    else if (step.kind === "wait_until_morning")
      announce(
        "The gate has reopened.",
        "The same copy stays with Sera. Ivo still holds his ledger.",
      );
    else if (step.kind === "grant_passage")
      announce(
        "Permission to leave.",
        "The exit is open. Now carry out the agreed route.",
      );
  });
}
async function transition(text) {
  sound.cue("transition");
  const el = $("transition");
  el.querySelector("span").textContent = text;
  if (state.reduced) {
    scene.setWorld(state.world);
    return;
  }
  el.classList.add("show");
  await new Promise((r) => setTimeout(r, 550));
  scene.setWorld(state.world);
  render();
  await new Promise((r) => setTimeout(r, 600));
  el.classList.remove("show");
}
function compose(which) {
  state.composing = true;
  state.draft =
    which === "shelter"
      ? shelterRequest(state.world)
      : suggestedRequests[which] || state.draft;
  render();
  $("intention")?.focus();
}
async function propose() {
  const text = state.draft.trim();
  if (text.length < 3 || state.busy) return;
  return locked(
    async () => {
      $("error").hidden = true;
      $("elapsed").textContent = "0s";
      $("waitText").textContent =
        "Waiting for a live plan. The game will check it before showing it.";
      $("liveWait").hidden = false;
      sound.cue("planning");
      const started = performance.now();
      waitTimer = setInterval(() => {
        const elapsed = Math.floor((performance.now() - started) / 1000);
        $("elapsed").textContent = `${elapsed}s`;
      }, 250);
      try {
        const result = await api("propose", { text });
        if (result.evidenceWarning)
          announce("Evidence was not saved.", result.evidenceWarning.message);
        state.composing = false;
        state.draft = text;
        persistIntro();
        sound.cue("proposal");
      } finally {
        clearInterval(waitTimer);
        $("liveWait").hidden = true;
      }
    },
    { retry: propose },
  );
}
async function accept() {
  return locked(async () => {
    await api("accept", { proposalId: state.world.proposal.id });
    state.composing = false;
    sound.cue("accept");
    announce(
      "A deal, not yet a deed.",
      "The terms are accepted. Follow the marked action to make them real.",
    );
  });
}
async function restart() {
  return locked(async () => {
    await api("reset", { scenarioId: "ledger" });
    state.started = true;
    state.intro = 0;
    state.composing = false;
    state.draft = "";
    lastLine = "";
    $("receipt").hidden = true;
    $("error").hidden = true;
    persistIntro();
    await transition("The last ledger.");
  });
}
function openDialog(id) {
  lastFocus = document.activeElement;
  $(id).showModal();
}
function journal() {
  $("pauseDialog").close();
  const w = state.world;
  $("journalContent").innerHTML =
    `<p>The ledger is with ${esc(w.entities[w.documents.ledger_original.owner].name)}. Ivo is in ${esc(w.entities[w.entities.ivo.location].name)}. ${w.resources.paper} blank sheets remain.</p>` +
    w.agreements
      .map(
        (a) =>
          `<article><strong>${esc(a.title)} · ${esc(a.status)}</strong><p>${esc(a.summary)}</p><p>${a.completedStepIds.length}/${a.steps.length} agreed actions executed. ${a.provenance?.live ? "Generated live with " + esc(a.provenance.model) : "Non-live provenance"}.</p><ol>${a.steps.map((s, i) => `<li class="small">${i < a.nextStep ? "✓ " : ""}${esc(actionText(w, s))}</li>`).join("")}</ol></article>`,
      )
      .join("") +
    `<details><summary>Confirmed game events</summary>${w.events.map((e) => `<p>${esc(e.description)}</p>`).join("")}</details>`;
  openDialog("journalDialog");
}
const handlers = {
  next,
  accept,
  private: () => compose("private"),
  signed: () => compose("signed"),
  shelter: () => compose("shelter"),
  custom: () => compose(),
  "cancel-compose": () => {
    state.composing = false;
    render();
  },
  journal,
  restart: () => openDialog("restartDialog"),
  about: () => openDialog("aboutDialog"),
};
document.addEventListener("click", (e) => {
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (action && !state.busy) handlers[action]?.();
  const close = e.target.closest("[data-close]")?.dataset.close;
  if (close) $(close).close();
});
document
  .querySelectorAll("dialog")
  .forEach((dialog) =>
    dialog.addEventListener(
      "close",
      () => lastFocus?.isConnected && lastFocus.focus(),
    ),
  );
$("begin").addEventListener("click", () => {
  if (
    state.world?.scenarioId !== "ledger" ||
    state.world?.agreements.length ||
    state.world?.proposal
  )
    openDialog("restartDialog");
  else {
    state.started = true;
    persistIntro();
    render();
  }
});
$("resume").addEventListener("click", () => {
  state.started = true;
  state.intro = 3;
  persistIntro();
  render();
});
$("confirmRestart").addEventListener("click", () => {
  $("restartDialog").close();
  $("pauseDialog").close();
  restart();
});
$("menu").addEventListener("click", () => openDialog("pauseDialog"));
$("restart").addEventListener("click", () => {
  $("pauseDialog").close();
  openDialog("restartDialog");
});
$("about").addEventListener("click", () => {
  $("pauseDialog").close();
  openDialog("aboutDialog");
});
$("journal").addEventListener("click", journal);
$("save").addEventListener("click", () =>
  locked(async () => {
    const snapshot = await api("save");
    const checkpoint = {
      snapshot,
      intro: state.intro,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(storeKey, JSON.stringify(checkpoint));
    } catch {
      throw new Error(
        "This browser could not store the checkpoint. Free browser storage and try again.",
      );
    }
    state.checkpoint = checkpoint;
    $("saveStatus").textContent =
      "Checkpoint saved, including accepted terms and completed actions.";
  }),
);
$("load").addEventListener("click", () => {
  if (!state.checkpoint) return;
  locked(async () => {
    await api("load", { snapshot: state.checkpoint.snapshot });
    state.intro = state.checkpoint.intro;
    state.started = true;
    state.composing = false;
    persistIntro();
    $("pauseDialog").close();
    await transition("A promise remembered.");
    announce(
      "Checkpoint restored.",
      "Accepted terms and completed effects are preserved. Unaccepted proposals must be made again.",
    );
  });
});
$("reduceMotion").addEventListener("change", (e) => {
  state.reduced = e.target.checked;
  try {
    localStorage.setItem("off-script-reduced", JSON.stringify(state.reduced));
  } catch {}
  lastLine = "";
  render();
});
$("volume").addEventListener("input", (e) => {
  sound.setVolume(Number(e.target.value) / 100);
  $("volumeValue").textContent = `${e.target.value}%`;
});
document.addEventListener("click", (e) => {
  if (e.target.closest("button") && !e.target.closest("#sound"))
    sound.cue("navigate");
});
document.addEventListener("visibilitychange", () => {
  if (!sound.context || !sound.enabled) return;
  (document.hidden ? sound.context.suspend() : sound.context.resume()).catch(
    () => {},
  );
});
$("sound").addEventListener("click", async () => {
  try {
    const enabled = await sound.toggle();
    $("sound").textContent = enabled ? "Sound on" : "Sound off";
    $("sound").setAttribute("aria-pressed", String(enabled));
  } catch {
    announce("Sound is unavailable.", "The story can be played without audio.");
  }
});
$("retry").addEventListener("click", () => {
  $("error").hidden = true;
  state.retry?.();
});
$("dismissError").addEventListener("click", () => {
  $("error").hidden = true;
});
$("export").addEventListener("click", () => {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          {
            format: "off-script-judge-demo-v1",
            exportedAt: new Date().toISOString(),
            world: state.world,
            audit: state.audit,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "off-script-playthrough.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    !document.querySelector("dialog[open]") &&
    !state.busy &&
    state.started &&
    $("error").hidden
  ) {
    openDialog("pauseDialog");
  }
});
async function boot() {
  $("begin").disabled = true;
  try {
    await Promise.all([scene.ready, api("state")]);
    $("bootStatus").textContent = "";
    $("begin").disabled = false;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(`off-script-demo-${state.world.branchId}`) ||
          "null",
      );
      if (saved) {
        state.intro = saved.intro;
        state.started = saved.started;
        state.draft = saved.draft || "";
      }
    } catch {}
    render();
  } catch (error) {
    $("bootStatus").textContent = "The story could not load.";
    showError(error, boot);
  }
}
// Explicit developer QA mode. Absent from the normal judge path.
if (new URLSearchParams(location.search).has("audioReview")) {
  const panel = document.createElement("aside");
  panel.className = "audio-review";
  panel.innerHTML =
    '<strong>Audio review</strong><button id="recordGameAudio">Record game audio</button><output id="audioDiagnostics">Enable sound first. No microphone is used.</output>';
  document.body.append(panel);
  $("recordGameAudio").addEventListener("click", async () => {
    try {
      if (!sound.recorder) {
        sound.startRecording();
        $("recordGameAudio").textContent = "Stop and download audio";
      } else {
        const blob = await sound.stopRecording(),
          url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `off-script-game-audio-${Date.now()}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        $("recordGameAudio").textContent = "Record game audio";
      }
    } catch (error) {
      $("audioDiagnostics").textContent = error.message;
    }
  });
  setInterval(() => {
    const d = sound.diagnostics();
    $("audioDiagnostics").textContent =
      `${d.state || "not started"} · ${d.mode} · ${d.barsScheduled} bars · volume ${Math.round(d.volume * 100)}%${sound.recorder ? " · recording game output" : ""}`;
  }, 500);
}
await boot();
