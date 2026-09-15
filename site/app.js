const stages = [
  {
    id: "propose",
    label: "CANDIDATE PLAN",
    badge: "HOST VALIDATED",
    intent:
      "“Rescue Lark. Bring the Dawnseed home.\nSpare the wolf. Keep both potions.”",
    facts: [
      ["WOLF", "PROTECTED"],
      ["POTIONS", "2 / 2"],
      ["LARK", "TO RESCUE"],
    ],
    detail:
      "A proposal is checked against registered mechanics and the current world. Nothing has executed yet.",
    method: "await planIntent(…)",
    icon: "◇",
  },
  {
    id: "accept",
    label: "TERMS ACCEPTED",
    badge: "PLAYER CONFIRMED",
    intent:
      "“Rescue Lark. Bring the Dawnseed home.\nSpare the wolf. Keep both potions.”",
    facts: [
      ["WOLF", "PROTECTED"],
      ["POTIONS", "2 / 2"],
      ["LARK", "TO RESCUE"],
    ],
    detail:
      "Acceptance records the exact plan and its promises. It does not rescue Lark, spend a potion or move the player.",
    method: "runtime.accept(command)",
    icon: "✓",
  },
  {
    id: "execute",
    label: "ACTIONS COMPLETED",
    badge: "RECEIPTS RECORDED",
    intent: "The wolf is calm. Lark is rescued.\nThe Dawnseed is in your pack.",
    facts: [
      ["WOLF", "ALIVE / CALM"],
      ["POTIONS", "2 / 2"],
      ["LARK", "RESCUED"],
    ],
    detail:
      "Play the accepted steps. The host records each committed effect. Retrying an identical command returns its receipt without another effect.",
    method: "runtime.step(command)",
    icon: "◆",
  },
  {
    id: "revise",
    label: "CROSSING INTERRUPTED",
    badge: "PRIOR EFFECTS KEPT",
    intent:
      "“The crossing is gone. Avoid the ferry.\nBring us home by the northern trail.”",
    facts: [
      ["WOLF", "STILL ALIVE"],
      ["POTIONS", "STILL 2 / 2"],
      ["LARK", "STILL RESCUED"],
    ],
    detail:
      "The game’s authored flood interrupts the remaining plan. Propose and accept a new route from the current state. Completed actions and binding promises remain.",
    method: "change(…) → planIntent(…)",
    icon: "↻",
  },
];

const tabs = [...document.querySelectorAll("[data-stage]")];
const panel = document.querySelector("#mission-panel");
const missionConsole = document.querySelector(".mission-console");
const nextButton = document.querySelector("#next-stage");
let currentIndex = 0;

function showStage(index, moveFocus = false) {
  currentIndex = index;
  const stage = stages[index];
  tabs.forEach((tab, tabIndex) => {
    tab.setAttribute("aria-selected", String(tabIndex === index));
    tab.tabIndex = tabIndex === index ? 0 : -1;
  });
  panel.setAttribute("aria-labelledby", tabs[index].id);
  missionConsole.dataset.current = stage.id;
  document.querySelector("#mission-label").textContent = stage.label;
  document.querySelector("#mission-badge").textContent = stage.badge;
  document.querySelector("#mission-intent").textContent = stage.intent;
  document.querySelector("#mission-detail").textContent = stage.detail;
  document.querySelector("#mission-method").textContent = stage.method;
  document.querySelector("#mission-icon").textContent = stage.icon;

  const facts = document.querySelector("#mission-facts");
  facts.replaceChildren(
    ...stage.facts.map(([label, value]) => {
      const fact = document.createElement("span");
      const amount = document.createElement("b");
      fact.textContent = label;
      amount.textContent = value;
      fact.append(amount);
      return fact;
    }),
  );

  nextButton.textContent =
    index === stages.length - 1
      ? "RESTART WALKTHROUGH ↻"
      : `NEXT: ${stages[index + 1].id.toUpperCase()} →`;
  if (moveFocus) tabs[index].focus();
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => showStage(index));
  tab.addEventListener("keydown", (event) => {
    let targetIndex;
    if (event.key === "ArrowRight") targetIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      targetIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") targetIndex = 0;
    if (event.key === "End") targetIndex = tabs.length - 1;
    if (targetIndex !== undefined) {
      event.preventDefault();
      showStage(targetIndex, true);
    }
  });
});

nextButton.addEventListener("click", () =>
  showStage((currentIndex + 1) % stages.length, true),
);

document.querySelector("#load-video").addEventListener("click", (event) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const frame = document.createElement("iframe");
  frame.src =
    "https://www.youtube-nocookie.com/embed/0kfqFjjUfLY?autoplay=1&rel=0";
  frame.title = "Runtime Story SDK developer demo on YouTube";
  frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allowFullscreen = true;
  document.querySelector("#video-frame").replaceChildren(frame);
  frame.focus();
});
