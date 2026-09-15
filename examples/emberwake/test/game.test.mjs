import test from "node:test";
import assert from "node:assert/strict";
import {
  registry,
  initialState,
  defaultTerms,
  createSession,
} from "../game.mjs";
import { createRpgServer } from "../server.mjs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const step = (action, args = {}) => ({
  action,
  arguments: args,
  description: action,
});
const guard = (r) => ({
  branchId: r.snapshot().branchId,
  expectedRevision: r.snapshot().revision,
});
const plan = {
  status: "ready",
  title: "Peaceful fixture",
  interpretation: "Deterministic test only",
  question: "",
  terms: { ...defaultTerms, spareWolf: true, maxPotions: 0, minHealth: 14 },
  steps: [
    step("travel", { destination: "grove" }),
    step("gather"),
    step("travel", { destination: "den" }),
    step("calm_wolf"),
    step("travel", { destination: "ruins" }),
    step("rescue"),
    step("travel", { destination: "shrine" }),
    step("sneak"),
    step("claim_relic"),
    step("travel", { destination: "ferry" }),
    step("travel", { destination: "camp" }),
  ],
};
test("peaceful RPG plan composes mechanics and preserves exact receipts", () => {
  const r = createSession();
  r.stage(plan, { ...guard(r), intent: "Test fixture" });
  r.accept({ ...guard(r), proposalId: r.snapshot().proposal.id });
  assert.deepEqual(r.snapshot().state, initialState);
  for (let i = 0; i < plan.steps.length; i++) {
    const p = r.snapshot().plans[0],
      cmd = { ...guard(r), planId: p.id, stepId: p.stepIds[p.nextStep] };
    r.step(cmd);
    const saved = r.snapshot();
    assert.equal(r.step(cmd).replayed, true);
    assert.deepEqual(r.snapshot(), saved);
  }
  const s = r.snapshot().state;
  assert.equal(s.location, "camp");
  assert.ok(s.rescued && s.relic && s.wolfCalmed);
  assert.equal(s.potionsUsed, 0);
  assert.equal(s.wolfHp, 8);
});
test("telegraphed power interrupts heavy retaliation, guard blocks and defeat stops retaliation", () => {
  let s = { ...initialState, location: "den" };
  s = registry.execute(
    s,
    step("attack", { style: "strike" }),
    defaultTerms,
  ).state;
  assert.equal(s.hp, 12);
  assert.equal(s.wolfHp, 5);
  s = registry.execute(
    s,
    step("attack", { style: "power" }),
    defaultTerms,
  ).state;
  assert.equal(s.hp, 12);
  assert.equal(s.wolfHp, 0);
  s = registry.execute(
    { ...initialState, location: "shrine", sentinelTurn: 1 },
    step("attack", { style: "power" }),
    defaultTerms,
  ).state;
  assert.equal(s.hp, 14);
  assert.equal(s.sentinelHp, 5);
  assert.throws(
    () =>
      registry.execute(
        { ...initialState, location: "den", hp: 1 },
        step("attack", { style: "strike" }),
        defaultTerms,
      ),
    /knock you out/,
  );
});
test("honest promises reject unsupported goal outcomes and missing resources", () => {
  const bad = structuredClone(plan);
  bad.steps = bad.steps.filter((s) => s.action !== "rescue");
  assert.throws(() => registry.simulate(initialState, bad));
  assert.throws(
    () =>
      registry.execute(
        { ...initialState, location: "den" },
        step("calm_wolf"),
        defaultTerms,
      ),
    /moonleaf/,
  );
  assert.throws(
    () =>
      registry.execute(
        { ...initialState, location: "bridge", relic: true, flooded: true },
        step("travel", { destination: "shrine" }),
        defaultTerms,
      ),
    /flooded/,
  );
});
test("host applies real flood, guards manual retries, and restores preserved RPG state", async (t) => {
  const host = createRpgServer({
    provider: {
      info: () => ({ live: false }),
      generate: async () => ({ output: plan, provenance: { live: false } }),
    },
  });
  await new Promise((r) => host.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => host.close(r)));
  const url = `http://127.0.0.1:${host.address().port}`;
  let s = await fetch(url + "/save").then((r) => r.json());
  const post = async (path, body = {}) => {
    const res = await fetch(url + "/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branchId: s.branchId,
        expectedRevision: s.revision,
        ...body,
      }),
    });
    const value = await res.json();
    assert.equal(res.status, 200, JSON.stringify(value.error));
    s = value.snapshot;
    return value;
  };
  const cmd = {
    commandId: "test-move-001",
    action: "travel",
    arguments: { destination: "grove" },
    branchId: s.branchId,
    expectedRevision: s.revision,
  };
  await post("act", cmd);
  const first = s;
  assert.ok((await post("act", cmd)).result.replayed);
  assert.deepEqual(s, first);
  // A fresh reset lets the known non-live fixture prove interruption separately.
  await post("reset");
  await post("propose", { intent: "Fixture" });
  await post("accept", { proposalId: s.proposal.id });
  for (let i = 0; i < 9; i++) {
    const p = s.plans[0];
    await post("step", { planId: p.id, stepId: p.stepIds[p.nextStep] });
  }
  assert.ok(s.state.flooded);
  assert.equal(s.plans[0].status, "interrupted");
  assert.equal(s.receipts.length, 9);
  const save = structuredClone(s);
  await post("reset");
  await post("load", { checkpoint: save });
  assert.notEqual(s.branchId, save.branchId);
  assert.deepEqual(s.state, save.state);
  assert.deepEqual(s.receipts, save.receipts);
});

test("RPG host rejects malformed or oversized bodies and reports optional evidence failure", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "rpg-evidence-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const blocked = join(directory, "file");
  await writeFile(blocked, "fixture");
  const server = createRpgServer({
    provider: {
      info: () => ({ live: false }),
      generate: async () => ({ output: plan }),
    },
    evidenceDirectory: blocked,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const before = await fetch(base + "/save").then((response) =>
    response.json(),
  );
  const post = (path, body, type = "application/json") =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": type },
      body,
    });
  for (const body of ["null", "[]", "{broken"])
    assert.equal((await post("/act", body)).status, 400);
  assert.equal(
    (await post("/act", JSON.stringify({ padding: "x".repeat(530000) })))
      .status,
    413,
  );
  assert.equal(
    (await post("/act", "{}", "application/json-invalid")).status,
    415,
  );
  assert.deepEqual(
    await fetch(base + "/save").then((response) => response.json()),
    before,
  );
  const response = await post(
    "/propose",
    JSON.stringify({
      branchId: before.branchId,
      expectedRevision: before.revision,
      intent: "Fixture",
    }),
    "Application/JSON; charset=utf-8",
  );
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.snapshot.proposal.plan.status, "ready");
  assert.equal(result.evidenceWarning.code, "EVIDENCE_WRITE_FAILED");
  assert.equal(result.planning, false);
});

test("RPG rule failures receive bounded host feedback before a corrected plan stages", async () => {
  const { planIntent } = await import("@off-script/runtime-story");
  const runtime = createSession();
  let calls = 0;
  const result = await planIntent(
    runtime,
    registry,
    async (request) => {
      calls++;
      if (calls === 1)
        return {
          output: { ...plan, steps: [step("calm_wolf"), ...plan.steps] },
        };
      assert.equal(request.feedback.error.code, "HOST_REJECTED");
      assert.equal(request.feedback.error.details.ruleCode, "RPG_RULE");
      return { output: plan };
    },
    "Rescue Lark and recover the relic without harming the wolf.",
  );
  assert.equal(calls, 2);
  assert.equal(result.attempts[0].error.code, "HOST_REJECTED");
  assert.equal(result.snapshot.proposal.provenance.repairCount, 1);
  assert.deepEqual(result.snapshot.state, initialState);
});
