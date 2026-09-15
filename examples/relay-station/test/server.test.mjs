import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeError } from "@off-script/runtime-story";
import { request as httpRequest } from "node:http";
import { createStationServer } from "../server.mjs";

test("HTTP checkpoint load strips transport fields from the SDK guard", async (t) => {
  const server = createStationServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const checkpoint = await fetch(base + "/save").then((r) => r.json());
  const response = await fetch(base + "/load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      branchId: checkpoint.branchId,
      expectedRevision: checkpoint.revision,
      checkpoint,
    }),
  });
  const restored = await response.json();
  assert.equal(response.status, 200, JSON.stringify(restored.error));
  assert.notEqual(restored.snapshot.branchId, checkpoint.branchId);
  assert.deepEqual(restored.snapshot.state, checkpoint.state);
  const resumed = createStationServer({ checkpoint: restored.snapshot });
  await new Promise((resolve) => resumed.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => resumed.close(resolve)));
  assert.deepEqual(
    await fetch(`http://127.0.0.1:${resumed.address().port}/save`).then((r) =>
      r.json(),
    ),
    restored.snapshot,
  );
});

const unsupported = {
  status: "unsupported",
  title: "Offline test",
  interpretation: "This test does not call a model.",
  question: "",
  terms: null,
  steps: [],
};
const fixtureProvider = (generate) => ({
  info: () => ({ kind: "test", live: false }),
  generate,
});

async function station(t, options) {
  const server = createStationServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const checkpoint = await fetch(`${base}/save`).then((response) =>
    response.json(),
  );
  const post = (path, body) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return { base, checkpoint, post };
}

const command = (snapshot) => ({
  branchId: snapshot.branchId,
  expectedRevision: snapshot.revision,
});

test("evidence write failure is a warning and does not reverse successful staging", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "relay-evidence-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const blocked = join(directory, "existing-file");
  await writeFile(blocked, "fixture");
  const { checkpoint, post } = await station(t, {
    provider: fixtureProvider(async () => ({ output: unsupported })),
    evidenceDirectory: blocked,
  });
  const response = await post("/propose", {
    ...command(checkpoint),
    intent: "Test evidence failure",
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.snapshot.proposal.plan.status, "unsupported");
  assert.equal(body.snapshot.revision, 1);
  assert.equal(body.evidenceWarning.code, "EVIDENCE_WRITE_FAILED");
  assert.equal(body.planning, false);
});

test("evidence write failure preserves the original planning error", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "relay-error-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const blocked = join(directory, "existing-file");
  await writeFile(blocked, "fixture");
  const { checkpoint, post } = await station(t, {
    provider: fixtureProvider(async () => {
      throw new RuntimeError("PROVIDER_LIMIT", "Test limit");
    }),
    evidenceDirectory: blocked,
  });
  const response = await post("/propose", {
    ...command(checkpoint),
    intent: "Test failure",
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error.code, "PROVIDER_LIMIT");
  assert.equal(body.error.attempts.length, 1);
  assert.equal(body.evidenceWarning.code, "EVIDENCE_WRITE_FAILED");
  assert.deepEqual(body.snapshot, checkpoint);
});

test("local server rejects foreign origins, wrong hosts and malformed request bodies", async (t) => {
  const { base, checkpoint } = await station(t);
  assert.equal(
    (
      await fetch(`${base}/state`, {
        headers: { Origin: "https://attacker.invalid" },
      })
    ).status,
    403,
  );
  const hostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(
      `${base}/state`,
      { headers: { Host: "attacker.invalid" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on("error", reject);
    request.end();
  });
  assert.equal(hostStatus, 403);
  assert.equal(
    (
      await fetch(`${base}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json-invalid" },
        body: JSON.stringify(command(checkpoint)),
      })
    ).status,
    415,
  );
  for (const body of ["{broken", "null", "[]"]) {
    assert.equal(
      (
        await fetch(`${base}/reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        })
      ).status,
      400,
    );
  }
  assert.deepEqual(
    await fetch(`${base}/save`).then((response) => response.json()),
    checkpoint,
  );
});

test("reset cancels in-flight inference and discards a provider's late response", async (t) => {
  let begin;
  const started = new Promise((resolve) => {
    begin = resolve;
  });
  let finish;
  let providerSignal;
  const { base, checkpoint, post } = await station(t, {
    provider: fixtureProvider((request) => {
      providerSignal = request.signal;
      begin();
      return new Promise((resolve) => {
        finish = resolve;
      });
    }),
  });
  const planning = post("/propose", {
    ...command(checkpoint),
    intent: "Start pending test",
  });
  await started;
  const reset = await post("/reset", command(checkpoint)).then((response) =>
    response.json(),
  );
  assert.notEqual(reset.snapshot.branchId, checkpoint.branchId);
  const response = await planning;
  assert.equal((await response.json()).error.code, "CANCELLED");
  assert.equal(providerSignal.aborted, true);
  finish({ output: unsupported });
  await new Promise((resolve) => setImmediate(resolve));
  const current = await fetch(`${base}/state`).then((response) =>
    response.json(),
  );
  assert.equal(current.snapshot.proposal, null);
  assert.equal(current.planning, false);
  assert.equal(current.snapshot.branchId, reset.snapshot.branchId);
});
