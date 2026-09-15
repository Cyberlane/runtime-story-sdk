import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StructuredProvider, providerSchema } from "../src/provider.mjs";
import { game } from "./fixtures.mjs";

const request = () => ({
  requestId: "transport-test",
  intent: "Charge to three",
  context: { branchId: "test", revision: 0 },
  feedback: [],
  schema: game().schema(),
});

test("provider schema conversion preserves host-only constraints in the original", () => {
  const schema = {
    type: "object",
    properties: {
      values: { type: "array", uniqueItems: true, items: { type: "string" } },
    },
    required: ["values"],
    additionalProperties: false,
  };
  assert.equal(providerSchema(schema).properties.values.uniqueItems, undefined);
  assert.equal(schema.properties.values.uniqueItems, true);
  assert.throws(() => providerSchema({ ...schema, required: [] }), {
    code: "PROVIDER_SCHEMA",
  });
});

test("missing executable fails with an actionable error and releases its call slot", async () => {
  const provider = new StructuredProvider({
    kind: "codex-cli",
    binary: "/nonexistent/runtime-story-test-codex",
    limit: 1,
  });
  await assert.rejects(provider.generate(request()), {
    code: "PROVIDER_START",
  });
  assert.equal(provider.inFlight, 0);
  await assert.rejects(provider.generate(request()), {
    code: "PROVIDER_LIMIT",
  });
});

test("already cancelled inference never starts or consumes a call", async () => {
  const provider = new StructuredProvider({
    kind: "codex-cli",
    binary: "/nonexistent/runtime-story-test-codex",
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    provider.generate({ ...request(), signal: controller.signal }),
    { name: "AbortError" },
  );
  assert.equal(provider.calls, 0);
  assert.equal(provider.inFlight, 0);
});

test("Responses transport handles refusal, incomplete output and retryable HTTP failure", async (t) => {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-not-a-credential";
  t.after(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });
  let response = {
    status: "completed",
    output: [
      { type: "message", content: [{ type: "refusal", refusal: "No" }] },
    ],
  };
  let status = 200;
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
      return new Response(JSON.stringify(response), { status });
    },
  );
  const provider = new StructuredProvider({ kind: "openai" });
  await assert.rejects(provider.generate(request()), {
    code: "PROVIDER_REFUSAL",
  });
  response = { status: "incomplete" };
  await assert.rejects(provider.generate(request()), {
    code: "INCOMPLETE_RESPONSE",
  });
  status = 503;
  await assert.rejects(provider.generate(request()), {
    code: "RETRYABLE_PROVIDER_ERROR",
  });
  status = 401;
  await assert.rejects(provider.generate(request()), {
    code: "PROVIDER_REQUEST",
  });
  assert.equal(fetchMock.mock.callCount(), 4);
  assert.equal(provider.inFlight, 0);
});

test("provider configuration rejects invalid model and transport values", () => {
  for (const options of [
    { model: " " },
    { model: 12 },
    { binary: "" },
    { apiKey: {} },
    { limit: 0 },
  ]) {
    assert.throws(() => new StructuredProvider(options), {
      code: "PROVIDER_CONFIG",
    });
  }
});

test("provider schema rejects unsupported composition and open nullable objects", () => {
  const unsupported = {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
    allOf: [],
  };
  assert.throws(() => providerSchema(unsupported), { code: "PROVIDER_SCHEMA" });
  assert.throws(
    () =>
      providerSchema({
        type: ["object", "null"],
        properties: { value: { type: "string" } },
      }),
    { code: "PROVIDER_SCHEMA" },
  );
});

test("Responses transport reads bounded text and preserves explicit credential configuration", async (t) => {
  const provider = new StructuredProvider({
    kind: "openai",
    apiKey: "test-key-for-transport-only",
    model: "test-model",
  });
  let response = new Response("{invalid", { status: 200 });
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.equal(
      options.headers.Authorization,
      "Bearer test-key-for-transport-only",
    );
    return response;
  });
  await assert.rejects(provider.generate(request()), {
    code: "MALFORMED_OUTPUT",
  });
  response = new Response(
    JSON.stringify({
      status: "completed",
      output: [
        { type: "message", content: [{ type: "output_text", text: {} }] },
      ],
    }),
  );
  await assert.rejects(provider.generate(request()), {
    code: "MALFORMED_OUTPUT",
  });
  response = new Response("x".repeat(2000001));
  await assert.rejects(provider.generate(request()), { code: "OUTPUT_LIMIT" });
  response = new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "x".repeat(512001) }],
        },
      ],
    }),
  );
  await assert.rejects(provider.generate(request()), { code: "OUTPUT_LIMIT" });
  response = new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: '{"valid":true}' }],
        },
      ],
      usage: { output_tokens: 3 },
    }),
  );
  const result = await provider.generate(request());
  assert.equal(result.output, '{"valid":true}');
  assert.equal(result.provenance.usage.output_tokens, 3);
  assert.equal(provider.inFlight, 0);
  assert.equal(JSON.stringify(provider).includes("test-key"), false);
});

async function fakeCodex(t, source) {
  const directory = await mkdtemp(join(tmpdir(), "runtime-provider-fixture-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const binary = join(directory, "codex-fixture.cjs");
  await writeFile(binary, "#!/usr/bin/env node\n" + source);
  await chmod(binary, 0o700);
  return binary;
}

const unixOnly = {
  skip:
    process.platform === "win32"
      ? "Executable script fixture requires a POSIX host"
      : false,
};

test(
  "Codex transport applies inference restrictions and preserves UTF-8 output",
  unixOnly,
  async (t) => {
    const binary = await fakeCodex(
      t,
      `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    for (const setting of ['shell_tool', 'multi_agent', 'apps', 'memories', 'hooks', 'plugins']) {
      assert.ok(args.some((value, index) => value === '--disable' && args[index + 1] === setting));
    }
    assert.ok(args.includes('approval_policy="never"'));
    assert.ok(args.includes('web_search="disabled"'));
    assert.ok(args.includes('--ignore-user-config'));
    assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
    const answer = args[args.indexOf('--output-last-message') + 1];
    fs.writeFileSync(answer, JSON.stringify({ description: 'Résumé 日本語' }));
    const event = Buffer.from(JSON.stringify({ type: 'turn.completed', usage: { label: '日本語' } }) + '\\n');
    const boundary = event.indexOf(Buffer.from('日本語')) + 1;
    process.stdout.write(event.subarray(0, boundary));
    setTimeout(() => process.stdout.write(event.subarray(boundary)), 5);
    process.stdin.resume();
  `,
    );
    const provider = new StructuredProvider({ kind: "codex-cli", binary });
    const result = await provider.generate(request());
    assert.equal(JSON.parse(result.output).description, "Résumé 日本語");
    assert.equal(result.provenance.usage.label, "日本語");
    assert.equal(provider.inFlight, 0);
  },
);

test(
  "Codex transport rejects oversized answer files before returning output",
  unixOnly,
  async (t) => {
    const binary = await fakeCodex(
      t,
      `
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], 'x'.repeat(512001));
    console.log(JSON.stringify({ type: 'turn.completed' }));
    process.stdin.resume();
  `,
    );
    const provider = new StructuredProvider({ kind: "codex-cli", binary });
    await assert.rejects(provider.generate(request()), {
      code: "OUTPUT_LIMIT",
    });
    assert.equal(provider.inFlight, 0);
  },
);

test(
  "Codex transport discards tool activity and unfinished turns",
  unixOnly,
  async (t) => {
    for (const [event, code] of [
      [
        { type: "item.completed", item: { type: "command_execution" } },
        "UNEXPECTED_TOOL",
      ],
      [{ type: "turn.failed" }, "INCOMPLETE_RESPONSE"],
    ]) {
      const binary = await fakeCodex(
        t,
        `
      const fs = require('node:fs');
      const args = process.argv.slice(2);
      fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], '{}');
      console.log(${JSON.stringify(JSON.stringify(event))});
      process.stdin.resume();
    `,
      );
      const provider = new StructuredProvider({ kind: "codex-cli", binary });
      await assert.rejects(provider.generate(request()), { code });
      assert.equal(provider.inFlight, 0);
    }
  },
);

test(
  "Codex provider timeout stops its child and releases the concurrency slot",
  unixOnly,
  async (t) => {
    const binary = await fakeCodex(
      t,
      "process.stdin.resume(); setInterval(() => {}, 1000);",
    );
    const provider = new StructuredProvider({
      kind: "codex-cli",
      binary,
      timeout: 25,
    });
    await assert.rejects(provider.generate(request()), {
      code: "PROVIDER_TIMEOUT",
    });
    assert.equal(provider.inFlight, 0);
  },
);
