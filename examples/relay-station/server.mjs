import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { planIntent, RuntimeError } from "@off-script/runtime-story";
import { StructuredProvider } from "@off-script/runtime-story/providers";
import { createSession, registry } from "./game.mjs";

export function createStationServer({
  provider = new StructuredProvider(),
  evidenceDirectory,
  checkpoint,
} = {}) {
  let runtime = createSession(checkpoint);
  let planning = false;
  let progress = null;
  let evidenceWarning = null;
  let planningController;
  const state = () => ({
    protocol: "runtime-story-example-v1",
    snapshot: runtime.snapshot(),
    provider: provider.info(),
    planning,
    progress,
    evidenceWarning,
  });
  async function retainEvidence(name, value) {
    if (!evidenceDirectory) return;
    try {
      await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
      await writeFile(
        resolve(evidenceDirectory, name),
        JSON.stringify(value, null, 2),
        {
          mode: 0o600,
          flag: "wx",
        },
      );
    } catch {
      evidenceWarning = {
        code: "EVIDENCE_WRITE_FAILED",
        message:
          "The evidence file could not be saved. The response snapshot remains authoritative.",
      };
    }
  }
  const guard = (command) => {
    const current = runtime.snapshot();
    if (
      command.branchId !== current.branchId ||
      command.expectedRevision !== current.revision
    )
      throw new RuntimeError(
        "STALE_CONTEXT",
        "Read the current station state before issuing this command.",
      );
  };
  const server = createServer(async (request, response) => {
    const send = (status, value) => {
      if (response.destroyed) return;
      response.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(JSON.stringify(value));
    };
    try {
      const authority = `127.0.0.1:${server.address().port}`;
      if (
        request.headers.host !== authority ||
        (request.headers.origin &&
          request.headers.origin !== `http://${authority}`)
      ) {
        send(403, { error: "Loopback host and same-origin requests only." });
        return;
      }
      const path = new URL(request.url, `http://${authority}`).pathname;
      if (request.method === "GET") {
        if (path === "/") {
          const html = await readFile(new URL("./index.html", import.meta.url));
          response.writeHead(200, {
            "Content-Type": "text/html",
            "Cache-Control": "no-store",
            "Content-Security-Policy":
              "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
          });
          response.end(html);
          return;
        }
        if (path === "/state") {
          send(200, state());
          return;
        }
        if (path === "/save") {
          send(200, runtime.snapshot());
          return;
        }
        if (path === "/capabilities") {
          send(200, registry.describe());
          return;
        }
        send(404, { error: "Unknown route." });
        return;
      }
      if (request.method !== "POST") {
        send(405, { error: "Use GET or POST." });
        return;
      }
      if (
        (request.headers["content-type"] ?? "")
          .split(";", 1)[0]
          .trim()
          .toLowerCase() !== "application/json"
      ) {
        send(415, { error: "Send application/json." });
        return;
      }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 524288) {
          send(413, { error: "Request exceeds 512 KiB." });
          return;
        }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new RuntimeError("INVALID_REQUEST", "Expected a JSON object.");
      let extra = {};
      switch (path) {
        case "/propose": {
          guard(body);
          if (planning)
            throw new RuntimeError(
              "PLANNING_BUSY",
              "Another request is being planned.",
            );
          const target = runtime;
          const context = target.context();
          const controller = new AbortController();
          const cancel = () => controller.abort();
          response.once("close", cancel);
          planningController = controller;
          planning = true;
          evidenceWarning = null;
          try {
            const result = await planIntent(
              target,
              registry,
              (request) => provider.generate(request),
              body.intent,
              {
                signal: controller.signal,
                onProgress: (event) => {
                  if (runtime === target) progress = event;
                },
              },
            );
            if (runtime !== target)
              throw new RuntimeError(
                "STALE_CONTEXT",
                "Station reset during planning. Response discarded.",
              );
            await retainEvidence(
              `${result.snapshot.proposal.provenance.requestId}.json`,
              {
                intent: body.intent,
                context,
                schema: registry.schema(),
                ...result,
              },
            );
          } catch (error) {
            await retainEvidence(`failure-${randomUUID()}.json`, {
              intent: body.intent,
              context,
              code: error.code,
              message: error.message,
              attempts: error.attempts ?? [],
            });
            throw error;
          } finally {
            planning = false;
            planningController = undefined;
            response.removeListener("close", cancel);
          }
          break;
        }
        case "/accept":
          extra.acceptance = runtime.accept(body);
          break;
        case "/step":
          extra.execution = runtime.step(body);
          break;
        case "/load":
          guard(body);
          runtime.restore(body.checkpoint, {
            branchId: body.branchId,
            expectedRevision: body.expectedRevision,
          });
          planningController?.abort();
          break;
        case "/reset":
          guard(body);
          planningController?.abort();
          runtime = createSession();
          progress = null;
          break;
        default:
          send(404, { error: "Unknown route." });
          return;
      }
      send(200, { ...state(), ...extra });
    } catch (error) {
      send(
        [
          "STALE_CONTEXT",
          "STALE_BRANCH",
          "STALE_REVISION",
          "PLANNING_BUSY",
        ].includes(error.code)
          ? 409
          : 400,
        {
          ...state(),
          error: {
            code: error.code ?? "INVALID_REQUEST",
            message: error.message,
            attempts: error.attempts ?? [],
          },
        },
      );
    }
  });
  server.on("close", () => planningController?.abort());
  return server;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const checkpoint = process.env.RELAY_CHECKPOINT
    ? JSON.parse(await readFile(process.env.RELAY_CHECKPOINT, "utf8"))
    : undefined;
  const server = createStationServer({
    evidenceDirectory: process.env.RELAY_EVIDENCE_DIR,
    checkpoint,
  });
  server.listen(Number(process.env.PORT ?? 4330), "127.0.0.1", () =>
    console.log(`Relay Station: http://127.0.0.1:${server.address().port}`),
  );
}
