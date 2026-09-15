import {
  createRegistry,
  createRuntime,
  RuntimeError,
} from "@off-script/runtime-story";
const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const int = (max) => ({ type: "integer", minimum: 0, maximum: max });
const bool = { type: "boolean" };
const ids = ["camp", "grove", "bridge", "den", "ruins", "shrine", "ferry"];
const place = { type: "string", enum: ids };
export const places = {
  camp: {
    name: "Lantern Camp",
    x: 2,
    y: 8,
    kind: "camp",
    description:
      "A warm fire. Rest here to recover fully. Bring Lark and the Dawnseed home.",
  },
  grove: {
    name: "Moonleaf Grove",
    x: 4,
    y: 5,
    kind: "grove",
    description:
      "Two healing herbs grow by the spring. Gather them once. A moonleaf also calms the wolf.",
  },
  bridge: {
    name: "The Old Crossing",
    x: 8,
    y: 7,
    kind: "bridge",
    description:
      "The quickest path to the shrine. Thunder shakes its old stonework.",
  },
  den: {
    name: "Wolf Hollow",
    x: 5,
    y: 2,
    kind: "wolf",
    description:
      "An ash wolf guards the northern trail. Fight, sneak past, or offer a moonleaf.",
  },
  ruins: {
    name: "Watchtower Ruins",
    x: 10,
    y: 2,
    kind: "ruins",
    description:
      "Lark is trapped behind fallen beams. Free her to gain a companion and unlock the ferry route.",
  },
  shrine: {
    name: "Dawnseed Shrine",
    x: 12,
    y: 5,
    kind: "sentinel",
    description:
      "A stone sentinel guards the Dawnseed. Defeat it or slip past, then claim the relic.",
  },
  ferry: {
    name: "Reed Ferry",
    x: 11,
    y: 9,
    kind: "ferry",
    description:
      "Lark knows the hidden river route. Once rescued, she can guide you home from here.",
  },
};
export const baseEdges = [
  ["camp", "grove"],
  ["camp", "bridge"],
  ["grove", "bridge"],
  ["grove", "den"],
  ["den", "ruins"],
  ["ruins", "shrine"],
  ["shrine", "bridge"],
  ["shrine", "ferry"],
];
export const edges = (s) => [
  ...baseEdges.filter(
    ([a, b]) =>
      !s.flooded || ![a, b].includes("bridge") || ![a, b].includes("shrine"),
  ),
  ...(s.rescued ? [["ferry", "camp"]] : []),
];
export const initialState = {
  location: "camp",
  hp: 14,
  focus: 6,
  potions: 2,
  herbs: 0,
  potionsUsed: 0,
  gathered: false,
  rescued: false,
  relic: false,
  flooded: false,
  wolfHp: 8,
  wolfTurn: 0,
  wolfCalmed: false,
  wolfBypassed: false,
  sentinelHp: 10,
  sentinelTurn: 0,
  sentinelBypassed: false,
  turns: 0,
  log: [],
};
export const defaultTerms = {
  rescue: true,
  recoverRelic: true,
  returnToCamp: true,
  spareWolf: false,
  maxPotions: 2,
  minHealth: 1,
};
const need = (condition, message) => {
  if (!condition)
    throw new RuntimeError("HOST_REJECTED", message, { ruleCode: "RPG_RULE" });
};
const livingEnemy = (s) =>
  s.location === "den" && s.wolfHp > 0 && !s.wolfCalmed && !s.wolfBypassed
    ? "wolf"
    : s.location === "shrine" && s.sentinelHp > 0 && !s.sentinelBypassed
      ? "sentinel"
      : null;
export const encounter = (s) => {
  const id = livingEnemy(s);
  if (!id) return null;
  return {
    id,
    name: id === "wolf" ? "Ash Wolf" : "Stone Sentinel",
    hp: s[id + "Hp"],
    maxHp: id === "wolf" ? 8 : 10,
    heavy: s[id + "Turn"] % 2 === 1,
    damage: s[id + "Turn"] % 2 === 1 ? 4 : 2,
  };
};
const finish = (s, event, text) => ({
  state: { ...s, turns: s.turns + 1, log: [...s.log, text].slice(-100) },
  result: { event, text },
});
export const actions = [
  {
    id: "travel",
    description:
      "Walk along one currently open map edge. Cannot leave a living unbypassed hostile enemy. Travel has no resource cost.",
    parameters: object({ destination: place }),
    reduce(state, { destination }) {
      const s = structuredClone(state);
      need(
        !livingEnemy(s),
        "Resolve this encounter before leaving: fight, sneak, or calm the wolf.",
      );
      need(
        edges(s).some(
          ([a, b]) =>
            (a === s.location && b === destination) ||
            (b === s.location && a === destination),
        ),
        "That trail is not connected or the bridge has flooded.",
      );
      s.location = destination;
      return finish(s, "travel", `Arrived at ${places[destination].name}.`);
    },
  },
  {
    id: "gather",
    description:
      "At the grove, gather exactly two moonleaf herbs once per expedition.",
    parameters: object({}),
    reduce(state) {
      const s = structuredClone(state);
      need(
        s.location === "grove" && !s.gathered,
        "Gather moonleaf once at the grove.",
      );
      s.herbs += 2;
      s.gathered = true;
      return finish(
        s,
        "gather",
        "Gathered two moonleaf herbs. Heal with them, or offer one to the wolf.",
      );
    },
  },
  {
    id: "attack",
    description:
      "Fight the current hostile enemy. Strike deals 3 damage. Power costs 2 focus, deals 5 and interrupts a heavy attack. Guard costs 1 focus, deals 2 and blocks all retaliation. Otherwise surviving enemies retaliate for 2 damage, or 4 on odd enemy turns. Lark adds 1 attack damage after rescue. Defeated enemies never retaliate.",
    parameters: object({
      style: { type: "string", enum: ["strike", "power", "guard"] },
    }),
    reduce(state, { style }) {
      const s = structuredClone(state),
        enemy = livingEnemy(s);
      need(enemy, "There is no hostile encounter here.");
      const cost = style === "power" ? 2 : style === "guard" ? 1 : 0;
      need(
        s.focus >= cost,
        "Not enough focus. Strike costs no focus, or use a potion to restore focus.",
      );
      s.focus -= cost;
      const heavy = s[enemy + "Turn"] % 2 === 1;
      const damage =
        (style === "power" ? 5 : style === "guard" ? 2 : 3) +
        (s.rescued ? 1 : 0);
      s[enemy + "Hp"] = Math.max(0, s[enemy + "Hp"] - damage);
      const retaliation =
        s[enemy + "Hp"] === 0 ||
        style === "guard" ||
        (style === "power" && heavy)
          ? 0
          : heavy
            ? 4
            : 2;
      s.hp -= retaliation;
      s[enemy + "Turn"]++;
      need(
        s.hp > 0,
        "That attack would knock you out. Guard, heal, or sneak instead.",
      );
      return finish(
        s,
        "attack",
        `${style === "power" ? "Power slash" : style === "guard" ? "Guard counter" : "Quick strike"}: ${damage} damage. ${s[enemy + "Hp"] === 0 ? "Enemy defeated!" : retaliation ? `You take ${retaliation}.` : "Their attack is stopped."}`,
      );
    },
  },
  {
    id: "sneak",
    description:
      "Bypass the current hostile enemy without killing it. Costs 2 focus. The bypass lasts for this expedition.",
    parameters: object({}),
    reduce(state) {
      const s = structuredClone(state),
        enemy = livingEnemy(s);
      need(
        enemy && s.focus >= 2,
        "Sneaking needs a hostile encounter and 2 focus.",
      );
      s.focus -= 2;
      s[enemy + "Bypassed"] = true;
      return finish(
        s,
        "sneak",
        "Slipped past unseen. The trail is open, and the creature lives.",
      );
    },
  },
  {
    id: "calm_wolf",
    description:
      "At wolf hollow, offer one herb to permanently calm the living wolf. No fight or focus required.",
    parameters: object({}),
    reduce(state) {
      const s = structuredClone(state);
      need(
        s.location === "den" && s.wolfHp > 0 && !s.wolfCalmed && s.herbs > 0,
        "Calming requires a living wolf and one moonleaf herb at its hollow.",
      );
      s.herbs--;
      s.wolfCalmed = true;
      return finish(
        s,
        "calm",
        "The wolf lowers its head. A moonleaf buys peace for this expedition.",
      );
    },
  },
  {
    id: "heal",
    description:
      "Use a potion anywhere to restore up to 7 HP and 2 focus, or one herb to restore up to 4 HP. Maximum HP 14 and focus 6. No enemy retaliation.",
    parameters: object({ item: { type: "string", enum: ["potion", "herb"] } }),
    reduce(state, { item }) {
      const s = structuredClone(state);
      need(
        item === "potion" ? s.potions > 0 : s.herbs > 0,
        "That healing item is not in your pack.",
      );
      if (item === "potion") {
        s.potions--;
        s.potionsUsed++;
        s.hp = Math.min(14, s.hp + 7);
        s.focus = Math.min(6, s.focus + 2);
      } else {
        s.herbs--;
        s.hp = Math.min(14, s.hp + 4);
      }
      return finish(
        s,
        "heal",
        item === "potion"
          ? "Drank a tonic: health and focus restored."
          : "Moonleaf mends your wounds.",
      );
    },
  },
  {
    id: "rest",
    description:
      "Rest at camp to refill health to 14 and focus to 6. Does not refill consumables.",
    parameters: object({}),
    reduce(state) {
      const s = structuredClone(state);
      need(s.location === "camp", "Rest at Lantern Camp.");
      s.hp = 14;
      s.focus = 6;
      return finish(
        s,
        "rest",
        "The fire restores your health and focus. Your choices remain.",
      );
    },
  },
  {
    id: "rescue",
    description:
      "At the ruins, free Lark once. She adds 1 damage to every later attack and unlocks the ferry-camp trail.",
    parameters: object({}),
    reduce(state) {
      const s = structuredClone(state);
      need(
        s.location === "ruins" && !s.rescued,
        "Lark can be rescued once at the ruins.",
      );
      s.rescued = true;
      return finish(
        s,
        "rescue",
        "Lark joins you. +1 attack damage. She marks a hidden ferry route home.",
      );
    },
  },
  {
    id: "claim_relic",
    description:
      "At the shrine, take the Dawnseed after defeating or bypassing its sentinel. Once only. The host may apply an authored flood event afterward, invalidating the remaining plan.",
    parameters: object({}),
    reduce(state) {
      const s = structuredClone(state);
      need(
        s.location === "shrine" && !s.relic && !livingEnemy(s),
        "Resolve the shrine sentinel before taking the Dawnseed.",
      );
      s.relic = true;
      return finish(
        s,
        "relic",
        "The Dawnseed is yours. Its light draws the storm over the crossing.",
      );
    },
  },
];
export const registry = createRegistry({
  id: "emberwake-rpg",
  version: "1",
  maxSteps: 36,
  stateSchema: object({
    location: place,
    hp: { type: "integer", minimum: 1, maximum: 14 },
    focus: int(6),
    potions: int(2),
    herbs: int(2),
    potionsUsed: int(2),
    gathered: bool,
    rescued: bool,
    relic: bool,
    flooded: bool,
    wolfHp: int(8),
    wolfTurn: int(100),
    wolfCalmed: bool,
    wolfBypassed: bool,
    sentinelHp: int(10),
    sentinelTurn: int(100),
    sentinelBypassed: bool,
    turns: int(1000),
    log: {
      type: "array",
      items: { type: "string", maxLength: 1000 },
      maxItems: 100,
    },
  }),
  termsSchema: object({
    rescue: bool,
    recoverRelic: bool,
    returnToCamp: bool,
    spareWolf: bool,
    maxPotions: int(2),
    minHealth: { type: "integer", minimum: 1, maximum: 14 },
  }),
  context: (s) => ({
    state: s,
    places,
    openTrails: edges(s),
    encounter: encounter(s),
    rules: [
      "You are planning this RPG expedition from the actual current state. Use only registered mechanics. Never invent teleporting, resurrection, weapons or item trades.",
      "Plan terms are final goals: rescue/recoverRelic/returnToCamp true require those outcomes. False leaves that goal optional. spareWolf true requires wolfHp > 0. maxPotions is total expedition consumption including prior turns. minHealth is final health.",
      "Any prior accepted promise to spare the wolf or limit potion use remains binding after a revision. Never undo rescued companions, collected relics, spent items or enemy damage.",
      "Rest at camp is allowed at the end to meet final health. Travel is free but enemies at den/shrine block exit until defeated, bypassed or calmed.",
      "Attacks are deterministic. You can calculate every HP/focus change. Plan cannot knock the hero out. Healing causes no enemy retaliation.",
      "The relic triggers an authored flood AFTER its real execution. It closes only bridge-shrine, interrupts the current plan, and then a new intent can adapt to the new trails. Do not narrate the event as model-created.",
      "Lark opens ferry-camp and adds one attack damage. She is at ruins and needs no item or battle to free her. The sentinel is at shrine, the wolf is at den.",
      "Player may ask for one goal or several. Respect exact requests and explicitly decline unsupported mechanics. Do not call a prewritten story branch generated.",
    ],
  }),
  validateState(s) {
    need(s.potions + s.potionsUsed === 2, "Potion conservation failed.");
    need(!s.flooded || s.relic, "The flood only follows the relic event.");
    need(!s.wolfCalmed || s.wolfHp > 0, "A dead wolf cannot be calmed.");
    return true;
  },
  validatePlan({ after, plan, history }) {
    const t = plan.terms;
    const prior = history
      .filter((e) => e.type === "plan_accepted")
      .map((e) => e.data?.plan?.terms)
      .filter(Boolean);
    need(!t.rescue || after.rescued, "The plan does not rescue Lark.");
    need(
      !t.recoverRelic || after.relic,
      "The plan does not recover the Dawnseed.",
    );
    need(
      !t.returnToCamp || after.location === "camp",
      "The plan must return to camp.",
    );
    need(
      !t.spareWolf || after.wolfHp > 0,
      "The plan kills the wolf despite the promise.",
    );
    need(
      after.potionsUsed <= t.maxPotions,
      "The plan exceeds the total potion limit.",
    );
    need(after.hp >= t.minHealth, "The final health reserve is too low.");
    for (const p of prior) {
      need(
        !p.spareWolf || t.spareWolf,
        "Preserve the earlier promise to spare the wolf.",
      );
      need(
        t.maxPotions <= p.maxPotions,
        "Do not loosen the earlier potion limit.",
      );
    }
    return true;
  },
  actions,
});
export const createSession = (checkpoint) =>
  createRuntime(registry, initialState, checkpoint ? { checkpoint } : {});
export function availableActions(s) {
  const candidates = actions.flatMap((a) =>
    a.id === "travel"
      ? ids.map((destination) => ({ action: a.id, arguments: { destination } }))
      : a.id === "attack"
        ? ["strike", "power", "guard"].map((style) => ({
            action: a.id,
            arguments: { style },
          }))
        : a.id === "heal"
          ? ["potion", "herb"].map((item) => ({
              action: a.id,
              arguments: { item },
            }))
          : [{ action: a.id, arguments: {} }],
  );
  return candidates.map((step) => {
    try {
      registry.execute(s, { ...step, description: step.action }, defaultTerms);
      return { ...step, enabled: true };
    } catch (e) {
      return { ...step, enabled: false, reason: e.message };
    }
  });
}
