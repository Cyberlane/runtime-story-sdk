import { registry, initialState } from "../game.mjs";

// Bounded goal search supplies the comparison without a language model.
export function planFromForm(
  terms,
  { state = initialState, maxExpanded = 100000 } = {},
) {
  const started = performance.now();
  const targetSurvey = new Set(terms.surveySectors);
  const targetTransmit = new Set(terms.transmitSectors);
  const goal = (s) =>
    s.surveyed.length === targetSurvey.size &&
    s.surveyed.every((x) => targetSurvey.has(x)) &&
    s.transmitted.length === targetTransmit.size &&
    s.transmitted.every((x) => targetTransmit.has(x)) &&
    s.battery >= terms.minBattery &&
    s.heat <= terms.maxHeat &&
    s.metal >= terms.minMetal;
  if (
    state.surveyed.some((x) => !targetSurvey.has(x)) ||
    state.transmitted.some((x) => !targetTransmit.has(x)) ||
    [...targetTransmit].some((x) => !targetSurvey.has(x))
  )
    return {
      plan: null,
      exhausted: true,
      expanded: 0,
      durationMs: performance.now() - started,
    };
  const needs = (s) => ({
    scanner: targetSurvey.size > s.surveyed.length && !s.scanner,
    radio: targetTransmit.size > s.transmitted.length && !s.radio,
  });
  function heuristic(s) {
    const need = needs(s);
    const repairs = Number(need.scanner) + Number(need.radio);
    const kits = Math.max(0, repairs - s.kits);
    const surveys = terms.surveySectors.filter(
      (x) => !s.surveyed.includes(x),
    ).length;
    const sends = terms.transmitSectors.filter(
      (x) => !s.transmitted.includes(x),
    ).length;
    const energy = 2 * kits + repairs + 2 * surveys + sends + terms.minBattery;
    return (
      repairs +
      Number(kits > 0) +
      surveys +
      sends +
      Math.ceil(Math.max(0, energy - s.battery) / 6) +
      Number(s.heat > terms.maxHeat)
    );
  }
  function actions(s) {
    const result = [];
    const add = (action, args) =>
      result.push({
        action,
        arguments: args,
        description: "Composed by deterministic goal search",
      });
    if (s.heat < 8)
      for (let units = 1; units <= Math.min(6, 12 - s.battery); units++)
        add("solar_charge", { units });
    if (s.battery >= 1)
      for (let units = 1; units <= s.heat; units++)
        add("radiator_cool", { units });
    const need = needs(s);
    const kitsNeeded = Number(need.scanner) + Number(need.radio) - s.kits;
    for (let units = 1; units <= kitsNeeded; units++) {
      if (
        s.metal - 2 * units >= terms.minMetal &&
        s.battery >= units * 2 &&
        s.heat + 2 * units <= 8
      )
        add("fabricate_kit", { units });
    }
    if (s.kits > 0 && s.battery > 0 && s.heat < 8)
      for (const subsystem of ["scanner", "radio"])
        if (need[subsystem]) add("repair_subsystem", { subsystem });
    if (s.scanner && s.battery >= 2 && s.heat < 8)
      for (const sector of targetSurvey)
        if (!s.surveyed.includes(sector)) add("survey_sector", { sector });
    if (s.radio && s.battery >= 1 && s.heat < 8)
      for (const sector of targetTransmit)
        if (s.surveyed.includes(sector) && !s.transmitted.includes(sector))
          add("transmit_survey", { sector });
    return result;
  }
  const key = (s) =>
    JSON.stringify([
      s.battery,
      s.heat,
      s.metal,
      s.kits,
      s.scanner,
      s.radio,
      [...s.surveyed].sort(),
      [...s.transmitted].sort(),
    ]);
  const heap = [];
  function push(node) {
    heap.push(node);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (heap[parent].score <= node.score) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = node;
  }
  function pop() {
    const first = heap[0];
    const last = heap.pop();
    if (heap.length) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (
          child + 1 < heap.length &&
          heap[child + 1].score < heap[child].score
        )
          child++;
        if (heap[child].score >= last.score) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
    }
    return first;
  }
  push({ state, steps: [], score: heuristic(state) });
  const best = new Map([[key(state), 0]]);
  let expanded = 0;
  while (heap.length && expanded < maxExpanded) {
    const node = pop();
    if (node.steps.length > best.get(key(node.state))) continue;
    expanded++;
    if (goal(node.state) && node.steps.length) {
      const plan = {
        status: "ready",
        title: "Explicit goal form plan",
        interpretation:
          "The developer-authored form supplies these exact goals.",
        question: "",
        terms,
        steps: node.steps,
      };
      registry.simulate(state, plan);
      return {
        plan,
        expanded,
        exhausted: false,
        durationMs: performance.now() - started,
      };
    }
    if (node.steps.length >= 24) continue;
    for (const step of actions(node.state)) {
      const next = registry.execute(node.state, step, terms).state;
      const depth = node.steps.length + 1;
      const identity = key(next);
      if ((best.get(identity) ?? Infinity) <= depth) continue;
      best.set(identity, depth);
      push({
        state: next,
        steps: [...node.steps, step],
        score: depth + heuristic(next),
      });
    }
  }
  return {
    plan: null,
    expanded,
    exhausted: heap.length === 0,
    durationMs: performance.now() - started,
  };
}
