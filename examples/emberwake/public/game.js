import { EmberwakeScene, scenery } from "./scene.js";
const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const readPreference = (key, fallback = null) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const writePreference = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Playing does not require browser storage. */
  }
};
let data = null,
  busy = false,
  started = false,
  reduced =
    readPreference(
      "emberwake-reduced",
      String(matchMedia("(prefers-reduced-motion: reduce)").matches),
    ) === "true",
  endingShown = false;
let toastTimer, planTimer;
const scene = new EmberwakeScene($("map"));
const names = {
  travel: "Travel",
  gather: "Gather moonleaf",
  attack: "Attack",
  sneak: "Slip past",
  calm_wolf: "Offer moonleaf",
  heal: "Heal",
  rest: "Rest by the fire",
  rescue: "Free Lark",
  claim_relic: "Take the Dawnseed",
};
const same = (a, b) =>
  a?.action === b?.action &&
  JSON.stringify(a?.arguments) === JSON.stringify(b?.arguments);
const active = () => data?.snapshot.plans.find((p) => p.status === "active");
const nextStep = () => {
  const p = active();
  return p?.plan.steps[p.nextStep];
};
const actionLabel = (a) =>
  a.action === "travel"
    ? `Travel to ${data.places[a.arguments.destination].name}`
    : a.action === "attack"
      ? {
          strike: "Quick strike",
          power: "Power slash",
          guard: "Guard counter",
        }[a.arguments.style]
      : a.action === "heal"
        ? `Use ${a.arguments.item === "herb" ? "moonleaf" : "a potion"}`
        : names[a.action];
const actionCost = (a) =>
  a.action === "attack"
    ? {
        strike: `${3 + (data?.snapshot.state.rescued ? 1 : 0)} damage · no focus`,
        power: `${5 + (data?.snapshot.state.rescued ? 1 : 0)} damage · 2 focus`,
        guard: `${2 + (data?.snapshot.state.rescued ? 1 : 0)} damage · 1 focus`,
      }[a.arguments.style]
    : a.action === "sneak"
      ? "2 focus · no killing"
      : a.action === "calm_wolf"
        ? "1 herb · lasting peace"
        : a.action === "heal"
          ? a.arguments.item === "potion"
            ? "+7 HP · +2 focus"
            : "+4 HP"
          : a.action === "rescue"
            ? "+1 damage · ferry route"
            : a.action === "gather"
              ? "+2 moonleaf herbs"
              : "";
function notify(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 6500);
}
function lock(value) {
  busy = value;
  document.querySelectorAll("button").forEach((b) => {
    b.disabled = value || b.dataset.unavailable === "true";
  });
  $("intent").disabled = value;
}
async function refresh() {
  const r = await fetch("/state");
  if (!r.ok) throw new Error("The RPG host is not responding.");
  data = await r.json();
  scene.setWorld(data, reduced);
  render();
}
async function command(path, body = {}) {
  if (busy) return;
  lock(true);
  $("error").hidden = true;
  const before = data.snapshot.state,
    plannedStep = nextStep();
  const startedAt = performance.now();
  if (path === "propose") {
    $("elapsed").textContent = "0 seconds · live inference";
    $("planning").hidden = false;
    planTimer = setInterval(
      () =>
        ($("elapsed").textContent =
          `${Math.floor((performance.now() - startedAt) / 1000)} seconds · live inference`),
      250,
    );
  }
  try {
    const response = await fetch("/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branchId: data.snapshot.branchId,
        expectedRevision: data.snapshot.revision,
        ...body,
      }),
    });
    const payload = await response.json();
    if (payload.snapshot) data = payload;
    if (!response.ok)
      throw new Error(
        payload.error?.message || "The action could not be completed.",
      );
    const after = data.snapshot.state;
    scene.setWorld(data, reduced);
    if (!["propose", "accept", "reset", "load"].includes(path))
      await scene.play(
        data,
        before,
        path === "step"
          ? plannedStep
          : { action: body.action ?? path, arguments: body.arguments ?? {} },
      );
    if (payload.result?.worldEvent)
      notify(
        "THE CROSSING FALLS · The world changed. Your collected relic remains. Find another way home.",
      );
    else if (path === "propose")
      notify(
        data.snapshot.proposal.plan.status === "ready"
          ? "A new route, checked against your actual world. Review it before you agree."
          : "No invented shortcut. Read the planner’s response and revise your request.",
      );
    else if (path === "accept")
      notify(
        "Terms accepted. Now play the route. Nothing has moved or been spent yet.",
      );
    else
      notify(
        payload.result?.text ||
          payload.result?.receipt?.result?.text ||
          after.log.at(-1) ||
          "World confirmed.",
      );
    if (path === "reset") {
      endingShown = false;
      started = true;
      writePreference("emberwake-started", "true");
      $("intent").value = "";
    }
    render();
    if (path === "propose" && payload.evidenceWarning)
      notify(`Evidence was not saved. ${payload.evidenceWarning.message}`);
    if (path === "propose")
      $("plan").scrollIntoView({
        block: "start",
        behavior: reduced ? "instant" : "smooth",
      });
  } catch (error) {
    let recovered = false;
    try {
      await refresh();
      recovered = true;
    } catch {
      /* Retain the last confirmed scene until reconnect. */
    }
    render();
    $("error").textContent = error.message;
    $("error").hidden = false;
    notify(
      recovered
        ? "The request or animation failed. The current host state is shown; check it before continuing."
        : "Connection lost. The action may have completed. Reconnect and refresh before continuing.",
    );
  } finally {
    clearInterval(planTimer);
    $("planning").hidden = true;
    lock(false);
  }
}
async function act(action) {
  const p = active(),
    step = nextStep();
  if (p && same(step, action))
    await command("step", { planId: p.id, stepId: p.stepIds[p.nextStep] });
  else
    await command("act", {
      commandId: crypto.randomUUID(),
      action: action.action,
      arguments: action.arguments,
    });
}
function locationDescription(s) {
  if (s.location === "ruins" && s.rescued)
    return "The fallen beams are cleared. Lark walks beside you and knows the ferry route home.";
  if (s.location === "grove" && s.gathered)
    return "You gathered the moonleaf here. The spring is quiet, and the northern trail leads through Wolf Hollow.";
  if (s.location === "shrine" && !s.relic && s.sentinelHp === 0)
    return "The sentinel lies still. The Dawnseed waits on the pedestal. Take it, then bring its light home.";
  if (s.location === "shrine" && !s.relic && s.sentinelBypassed)
    return "You slipped beyond the sentinel’s watch. The Dawnseed is within reach. Take it, then choose your way home.";
  if (s.location === "den" && s.wolfBypassed)
    return "You found a quiet way around the wolf. It remains unharmed, and you can follow the northern trail.";
  if (s.location === "den" && s.wolfCalmed)
    return "The wolf rests peacefully. It remembers your moonleaf offering and lets your party pass.";
  if (s.location === "den" && s.wolfHp === 0)
    return "The ash wolf has fallen. The northern trail is open, and that choice stays with this expedition.";
  if (s.location === "shrine" && s.relic)
    return s.rescued
      ? "The Dawnseed glows in your pack. The broken crossing is closed. Choose the northern trail or Lark’s ferry."
      : "The Dawnseed glows in your pack. The crossing is closed. Lark is still at the ruins, and rescuing her opens the ferry route.";
  if (s.location === "bridge" && s.flooded)
    return "The shrine crossing has collapsed. The camp and grove trails remain open.";
  return data.places[s.location].description;
}
function render() {
  if (!data) return;
  scene.setWorld(data, reduced);
  const s = data.snapshot.state,
    p = active(),
    next = nextStep();
  document.body.classList.toggle("reduced", reduced);
  $("reduced").checked = reduced;
  $("hpText").textContent = `Health ${s.hp} / 14`;
  $("hp").value = s.hp;
  $("focusText").textContent = `Focus ${s.focus} / 6`;
  $("focus").value = s.focus;
  $("pack").innerHTML = `◈ ${s.potions} potions<br>❧ ${s.herbs} moonleaf`;
  $("companion").textContent = s.rescued ? "+ Lark" : "";
  $("larkPortrait").hidden = !s.rescued;
  for (const [id, done, label] of [
    ["questLark", s.rescued, "Lark rescued"],
    ["questRelic", s.relic, "Dawnseed recovered"],
    ["questHome", s.location === "camp" && (s.relic || s.rescued), "Home safe"],
  ]) {
    $(id).classList.toggle("done", done);
    $(id).textContent =
      `${done ? "◆" : "◇"} ${done ? label : id === "questLark" ? "Rescue Lark" : id === "questRelic" ? "Recover the Dawnseed" : "Return home"}`;
  }
  const location = data.places[s.location];
  $("locationKind").textContent = data.encounter
    ? "TACTICAL ENCOUNTER"
    : s.rescued
      ? "ROWAN & LARK"
      : "EXPLORATION";
  $("locationName").textContent = location.name;
  $("locationText").textContent = locationDescription(s);
  $("weather").textContent = s.flooded
    ? "THE STORM HAS BROKEN THE CROSSING"
    : "LANTERN REACH · BEFORE THE STORM";
  $("places").innerHTML = Object.entries(data.places)
    .map(([id, place]) => {
      const a = data.actions.find(
        (a) => a.action === "travel" && a.arguments.destination === id,
      );
      return `<button class="map-spot ${id === s.location ? "current" : a?.enabled ? "connected" : ""}" data-place="${id}" title="${esc(locationDescription({ ...s, location: id }))}">${id === s.location ? "◆ " : a?.enabled ? "↟ " : ""}${esc(place.name)}</button>`;
    })
    .join("");
  $("places")
    .querySelectorAll("button")
    .forEach((b) => {
      const place = scenery[b.dataset.place];
      b.style.left = `${place.x * 100}%`;
      b.style.top = `${place.labelY * 100}%`;
      b.addEventListener("click", () => {
        const a = data.actions.find(
          (a) =>
            a.action === "travel" &&
            a.arguments.destination === b.dataset.place,
        );
        if (a?.enabled) act(a);
        else
          notify(
            locationDescription({
              ...data.snapshot.state,
              location: b.dataset.place,
            }) + (a?.reason ? " " + a.reason : ""),
          );
      });
    });
  for (const a of data.actions) {
    if (a.enabled) {
      const terms = data.snapshot.plans.map((p) => p.plan.terms);
      if (
        a.action === "heal" &&
        a.arguments.item === "potion" &&
        terms.some((t) => s.potionsUsed >= t.maxPotions)
      ) {
        a.enabled = false;
        a.reason = "Reserved by your accepted potion promise.";
      }
      if (
        a.action === "attack" &&
        data.encounter?.id === "wolf" &&
        terms.some((t) => t.spareWolf) &&
        s.wolfHp <=
          { strike: 3, power: 5, guard: 2 }[a.arguments.style] +
            (s.rescued ? 1 : 0)
      ) {
        a.enabled = false;
        a.reason = "This would kill the wolf you promised to spare.";
      }
    }
  }
  const relevant = data.actions.filter(
    (a) =>
      a.action !== "travel" &&
      (a.enabled ||
        (a.action === "attack" && data.encounter) ||
        a.reason === "Reserved by your accepted potion promise."),
  );
  $("actions").innerHTML = relevant
    .map(
      (a, i) =>
        `<button data-local="${i}" data-unavailable="${!a.enabled}" ${!a.enabled ? "disabled" : ""} class="${same(a, next) ? "plan-action" : ""}" title="${esc(a.reason || "")}">${esc(actionLabel(a))}<span class="cost">${esc(actionCost(a))}</span></button>`,
    )
    .join("");
  $("actions")
    .querySelectorAll("button")
    .forEach((b) =>
      b.addEventListener("click", () => act(relevant[Number(b.dataset.local)])),
    );
  $("battle").hidden = !data.encounter;
  if (data.encounter) {
    const e = data.encounter;
    $("toast").hidden = true;
    $("battle").innerHTML =
      `<h3>${esc(e.name)} <small>${e.hp} / ${e.maxHp} HP</small></h3><p class="telegraph">${e.heavy ? "Winding up a heavy blow · 4 damage. Power interrupts it." : "Watching for an opening · 2 damage. Guard blocks it."}</p><p>1 Strike · 2 Power · 3 Guard ${s.rescued ? "· Lark adds +1 damage" : ""}</p><div class="enemy-hp"><i></i></div>`;
    $("battle").querySelector("i").style.width = `${(e.hp / e.maxHp) * 100}%`;
  }
  renderPlan();
  $("events").innerHTML =
    [...s.log]
      .reverse()
      .slice(0, 4)
      .map((t) => `<li>${esc(t)}</li>`)
      .join("") ||
    "<li>The campfire is warm. Your expedition has not begun.</li>";
  if (
    started &&
    !endingShown &&
    !active() &&
    s.rescued &&
    s.relic &&
    s.location === "camp"
  )
    showEnding();
}
function renderPlan() {
  const snap = data.snapshot,
    p = active() ?? snap.plans.at(-1),
    proposal = snap.proposal,
    plan = proposal?.plan ?? p?.plan;
  const section = $("plan");
  section.hidden = !plan;
  if (!plan) return;
  const candidate = Boolean(proposal),
    ready = plan.status === "ready",
    provenance = proposal?.provenance ?? p?.provenance,
    interrupted = !candidate && p?.status === "interrupted";
  const t = plan.terms;
  const tags = t
    ? [
        t.spareWolf ? "Spare the wolf" : "Combat allowed",
        `≤ ${t.maxPotions} potions used`,
        `Finish ≥ ${t.minHealth} HP`,
        ...(t.rescue ? ["Rescue Lark"] : []),
        ...(t.recoverRelic ? ["Recover relic"] : []),
        ...(t.returnToCamp ? ["Return home"] : []),
      ]
    : [];
  section.innerHTML = `<small>${candidate ? "INTENT → CHECKED CANDIDATE" : interrupted ? "WORLD CHANGED → REVISE" : p?.status === "fulfilled" ? "ACCEPTED GOALS FULFILLED" : "ACCEPTED PLAN → PLAY IT"}</small><h3>${esc(plan.title)}</h3><div class="plan-controls">${candidate && ready ? '<button id="accept" class="primary">Accept these terms</button>' : !candidate && p.status === "active" ? `<button id="next" class="primary">${esc(actionLabel(p.plan.steps[p.nextStep]))} →</button><p class="hint">Or use the matching map/combat control. A different action changes the remaining route.</p>` : ""}</div><p>${esc(plan.interpretation)}</p>${plan.question ? `<p>${esc(plan.question)}</p>` : ""}<div class="terms">${tags.map((x) => `<span>${esc(x)}</span>`).join("")}</div>${interrupted ? '<div class="interrupted">Your completed actions remain. Write what should happen next using the current world.</div>' : ""}<ol class="plan-steps">${plan.steps.map((s, i) => `<li class="${!candidate && i < p.nextStep ? "finished" : !candidate && p.status === "active" && i === p.nextStep ? "next" : ""}">${!candidate && i < p.nextStep ? "✓" : i + 1 + "."} ${esc(actionLabel(s))}</li>`).join("")}</ol><p class="provenance">${provenance?.live ? `Live ${esc(provenance.model)} · ${((provenance.totalDurationMs ?? provenance.durationMs) / 1000).toFixed(1)}s · ${provenance.repairCount ?? 0} corrections` : "Not a live model response"} · ${snap.receipts.length} confirmed planned actions</p>`;
  section
    .querySelector("#accept")
    ?.addEventListener("click", () =>
      command("accept", { proposalId: data.snapshot.proposal.id }),
    );
  section
    .querySelector("#next")
    ?.addEventListener("click", () => act(nextStep()));
}
function showEnding() {
  endingShown = true;
  const s = data.snapshot.state;
  $("endingText").textContent =
    `Lark tends the fire while the Dawnseed lights Lantern Camp. ${s.wolfHp > 0 ? "The ash wolf still lives." : "The hollow is quiet after your battle."} ${s.sentinelHp === 0 ? "The sentinel fell to your party." : "You slipped past the sentinel."} The storm changed the road, but it did not erase what you did.`;
  $("endingStats").innerHTML =
    `<span><b>${s.hp}/14</b>Health</span><span><b>${s.potionsUsed}</b>Potions used</span><span><b>${s.turns}</b>Real actions</span><span><b>${data.snapshot.receipts.length}</b>Planned steps played</span>`;
  const live = data.snapshot.plans.filter((p) => p.provenance.live).length;
  $("endingTool").textContent = live
    ? `${live} accepted live plans shaped this expedition. Your route was composed from registered mechanics, and every consequence was committed by the host.`
    : "You completed this expedition through manual RPG controls. No live plan was accepted. The same mechanics work without AI; free-form route composition is the additional capability.";
  $("ending").showModal();
}
$("intentForm").addEventListener("submit", (e) => {
  e.preventDefault();
  command("propose", { intent: $("intent").value });
});
document.querySelectorAll("[data-intent]").forEach((b) =>
  b.addEventListener("click", () => {
    $("intent").value = b.dataset.intent;
    $("intent").focus();
  }),
);
$("explain").onclick = () => $("about").showModal();
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
function openJournal() {
  $("journalEntries").innerHTML = [...data.snapshot.state.log]
    .reverse()
    .map((t) => `<p>${esc(t)}</p>`)
    .join("");
  $("journal").showModal();
}
$("menu").onclick = openJournal;
$("endingJournal").onclick = () => {
  $("ending").close();
  openJournal();
};
$("begin").onclick = () => {
  started = true;
  writePreference("emberwake-started", "true");
  $("intro").close();
  notify(
    "Start with a connected trail, or write your expedition goal. Your choices are real.",
  );
};
$("save").onclick = () => {
  try {
    localStorage.setItem("emberwake-checkpoint", JSON.stringify(data.snapshot));
    $("saveStatus").textContent =
      "Checkpoint saved: world, promises and completed effects.";
  } catch {
    $("saveStatus").textContent =
      "The browser could not store this checkpoint. Check its storage permissions and available space.";
  }
};
$("load").onclick = () => {
  try {
    const raw = localStorage.getItem("emberwake-checkpoint");
    if (!raw) throw new Error("Save a checkpoint first.");
    const checkpoint = JSON.parse(raw);
    $("journal").close();
    endingShown = false;
    command("load", { checkpoint });
  } catch (e) {
    $("saveStatus").textContent = e.message;
  }
};
for (const id of ["restart", "endingRestart"])
  $(id).onclick = () => {
    $("journal").close();
    $("ending").close();
    $("confirmReset").showModal();
  };
$("resetYes").onclick = () => {
  $("confirmReset").close();
  command("reset");
};
$("reduced").onchange = () => {
  reduced = $("reduced").checked;
  writePreference("emberwake-reduced", String(reduced));
  render();
};
document.addEventListener("keydown", (e) => {
  if (
    busy ||
    !data ||
    document.querySelector("dialog[open]") ||
    ["TEXTAREA", "INPUT"].includes(document.activeElement.tagName)
  )
    return;
  let choice;
  const s = data.snapshot.state;
  if (["1", "2", "3"].includes(e.key))
    choice = data.actions.find(
      (a) =>
        a.enabled &&
        a.action === "attack" &&
        a.arguments.style === { 1: "strike", 2: "power", 3: "guard" }[e.key],
    );
  if (e.key.toLowerCase() === "h")
    choice = data.actions.find(
      (a) => a.enabled && a.action === "heal" && a.arguments.item === "potion",
    );
  if (e.key.toLowerCase() === "e")
    choice = data.actions.find(
      (a) =>
        a.enabled && ["rescue", "claim_relic", "gather"].includes(a.action),
    );
  if (e.key.startsWith("Arrow")) {
    e.preventDefault();
    const origin = data.places[s.location],
      direction = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      }[e.key];
    choice = data.actions
      .filter((a) => a.enabled && a.action === "travel")
      .map((a) => {
        const dest = data.places[a.arguments.destination],
          dx = dest.x - origin.x,
          dy = dest.y - origin.y;
        return {
          a,
          score: (dx * direction[0] + dy * direction[1]) / Math.hypot(dx, dy),
        };
      })
      .filter((x) => x.score > 0.25)
      .sort((a, b) => b.score - a.score)[0]?.a;
  }
  if (choice) {
    e.preventDefault();
    act(choice);
  }
});
lock(true);
try {
  await scene.load();
  await refresh();
  lock(false);
  $("loading").hidden = true;
  started = readPreference("emberwake-started") === "true";
  if (!started) $("intro").showModal();
  else render();
} catch (e) {
  $("loading").innerHTML =
    `<h2>Lantern Reach could not load.</h2><p>${esc(e.message)}</p><button id="retryLoading">Try again</button>`;
  $("retryLoading").onclick = () => location.reload();
}
