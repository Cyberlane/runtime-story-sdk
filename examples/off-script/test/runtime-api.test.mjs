import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server.mjs";
import { createRuntimeApi } from "../src/runtime-api.mjs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function fixtureProvider() {
  return {
    info: () => ({ kind: "test-fixture", live: false }),
    async generate({ context }) {
      const state = context.state;
      const p = state.policy;
      const action = (id, actor, target, factIds) => ({
        action: id,
        arguments: { actor, target, ...(factIds ? { factIds } : {}) },
        description: "Test fixture",
      });
      const interrupted = !state.exitOpen;
      return {
        output: {
          status: "ready",
          title: "Test fixture",
          interpretation: "Deterministic test provider, not live AI",
          question: "",
          terms: {
            priority: interrupted ? "safety" : "leave_now",
            keepOriginal: true,
            protectedFactIds: ["worker_names", "mara_signature"],
          },
          steps: interrupted
            ? [
                action("grant_shelter", p.authorityId, p.beneficiaryId),
                action("move_person", p.beneficiaryId, p.shelterRoomId),
                action("wait_until_morning", "player", ""),
                action("move_person", p.beneficiaryId, p.originRoomId),
                action("grant_passage", p.authorityId, p.beneficiaryId),
                action("move_person", p.beneficiaryId, p.exitRoomId),
              ]
            : [
                action(
                  "create_document",
                  "player",
                  "http_copy",
                  p.evidenceFactIds,
                ),
                action("deliver_document", "http_copy", p.authorityId),
                action("grant_passage", p.authorityId, p.beneficiaryId),
                action("move_person", p.beneficiaryId, p.exitRoomId),
              ],
        },
        provenance: { live: false, provider: "fixture" },
      };
    },
  };
}

async function host(provider, task) {
  const app = createApp({ sdkProvider: provider, artifactDirectory: null });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.address().port}/api/runtime/`;
  const get = async (path) => (await fetch(base + path)).json();
  const post = async (path, body) => {
    const response = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, ...(await response.json()) };
  };
  try {
    await task({ get, post });
  } finally {
    app.closeAllConnections();
    await new Promise((resolve) => app.close(resolve));
  }
}
const guard = (world) => ({
  expectedBranchId: world.branchId,
  expectedRevision: world.revision,
});

test("playable HTTP client uses package receipts, atomic curfew, checkpoint and actual revised ending", async () => {
  await host(fixtureProvider(), async ({ get, post }) => {
    let { world } = await get("state");
    assert.equal(world.sdk.adapter.id, "off-script.ledger");
    ({ world } = await post("propose", {
      ...guard(world),
      text: "Private proof for departure",
    }));
    ({ world } = await post("accept", {
      ...guard(world),
      proposalId: world.proposal.id,
    }));
    const first = { ...guard(world), ...world.sdk.nextStep };
    ({ world } = await post("play-step", first));
    const repeated = await post("play-step", first);
    assert.equal(repeated.replayed, true);
    assert.deepEqual(repeated.world, world);
    const delivery = { ...guard(world), ...world.sdk.nextStep };
    ({ world } = await post("play-step", delivery));
    assert.equal(world.documents.http_copy.owner, "sera");
    assert.equal(world.exitOpen, false);
    assert.deepEqual(
      world.events.slice(-2).map((event) => event.type),
      ["action_executed", "setback"],
    );
    assert.deepEqual((await post("play-step", delivery)).world, world);
    assert.equal((await post("play-step", {})).status, 400);
    ({ world } = await post("propose", {
      ...guard(world),
      text: "Shelter, then leave tomorrow",
    }));
    ({ world } = await post("accept", {
      ...guard(world),
      proposalId: world.proposal.id,
    }));
    ({ world } = await post("play-step", {
      ...guard(world),
      ...world.sdk.nextStep,
    }));
    ({ world } = await post("play-step", {
      ...guard(world),
      ...world.sdk.nextStep,
    }));
    const checkpoint = await get("save");
    const oldBranch = world.branchId;
    ({ world } = await post("load", { ...guard(world), snapshot: checkpoint }));
    assert.notEqual(world.branchId, oldBranch);
    for (let index = 0; index < 4; index += 1)
      ({ world } = await post("play-step", {
        ...guard(world),
        ...world.sdk.nextStep,
      }));
    assert.equal(world.entities.ivo.location, "outside");
    assert.equal(world.clock, "morning");
    assert.equal(world.resources.paper, 2);
    assert.equal(world.agreements.at(-1).status, "fulfilled");
    assert.equal((await get("save")).receipts.length, 8);
  });
});

test("new HTTP endpoint refuses unguarded mutations and reports stale inference after reset", async () => {
  let release, started;
  const waiting = new Promise((resolve) => {
    started = resolve;
  });
  const deferred = new Promise((resolve) => {
    release = resolve;
  });
  const provider = fixtureProvider();
  const original = provider.generate;
  provider.generate = async (request) => {
    started();
    await deferred;
    return original(request);
  };
  await host(provider, async ({ get, post }) => {
    const { world } = await get("state");
    assert.equal((await post("reset", {})).status, 409);
    const generating = post("propose", {
      ...guard(world),
      text: "Private proof for departure",
    });
    await waiting;
    const reset = await post("reset", { ...guard(world), scenarioId: "lab" });
    release();
    const stale = await generating;
    assert.equal(stale.code, "STALE_PROPOSAL");
    assert.equal(stale.busy, false);
    assert.deepEqual(stale.world, reset.world);
  });
});

test("optional evidence failure reports a warning without hiding plan success or original errors", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "off-script-evidence-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const blocked = join(directory, "file");
  await writeFile(blocked, "fixture");
  for (const fails of [false, true]) {
    const provider = fixtureProvider();
    if (fails)
      provider.generate = async () => {
        throw Object.assign(new Error("Test provider limit"), {
          code: "PROVIDER_LIMIT",
        });
      };
    const handle = createRuntimeApi({ provider, artifactDirectory: blocked });
    const {
      body: { world },
    } = await handle("GET", "state");
    const result = await handle("POST", "propose", {
      ...guard(world),
      text: "Private proof for departure",
    });
    assert.equal(result.status, fails ? 400 : 200);
    assert.equal(result.body.evidenceWarning.code, "EVIDENCE_WRITE_FAILED");
    assert.equal(result.body.busy, false);
    if (fails) {
      assert.equal(result.body.code, "PROVIDER_LIMIT");
      assert.deepEqual(result.body.world, world);
    } else assert.equal(result.body.world.proposal.status, "proposal");
  }
});

test("Off Script privacy rule feedback can correct a candidate without executing either attempt", async () => {
  const provider = fixtureProvider();
  const generate = provider.generate;
  let calls = 0;
  provider.generate = async (request) => {
    calls++;
    const result = await generate(request);
    if (calls === 1)
      result.output.steps[0].arguments.factIds.push("worker_names");
    else {
      assert.equal(request.feedback.error.code, "HOST_REJECTED");
      assert.equal(
        request.feedback.error.details.ruleCode,
        "PROTECTED_DISCLOSURE",
      );
    }
    return result;
  };
  await host(provider, async ({ get, post }) => {
    const { world } = await get("state");
    const result = await post("propose", {
      ...guard(world),
      text: "Keep worker identities private and get Ivo outside tonight.",
    });
    assert.equal(result.status, 200);
    assert.equal(calls, 2);
    assert.equal(result.world.proposal.provenance.repairCount, 1);
    assert.equal(result.world.resources.paper, 3);
    assert.deepEqual(result.world.knowledge.sera, []);
  });
});
