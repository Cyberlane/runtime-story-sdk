import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { planIntent, RuntimeError } from "@off-script/runtime-story";
import { StructuredProvider } from "@off-script/runtime-story/providers";
import {
  createSession,
  registry,
  places,
  edges,
  availableActions,
  encounter,
  defaultTerms,
} from "./game.mjs";

export function createRpgServer({
  provider = new StructuredProvider(),
  evidenceDirectory,
} = {}) {
  let runtime = createSession(),
    planning = false,
    progress = null;
  let evidenceWarning = null;
  const manualReceipts = new Map();
  const state = () => {
    const snapshot = runtime.snapshot();
    return {
      snapshot,
      places,
      edges: edges(snapshot.state),
      actions: availableActions(snapshot.state),
      encounter: encounter(snapshot.state),
      planning,
      progress,
      evidenceWarning,
      provider: provider.info(),
    };
  };
  const guard = (body) => {
    const s = runtime.snapshot();
    if (body.branchId !== s.branchId || body.expectedRevision !== s.revision)
      throw new RuntimeError(
        "STALE_CONTEXT",
        "The world changed. Read its current state and choose again.",
      );
  };
  const retain = async (name, data) => {
    if (evidenceDirectory) {
      try {
        await mkdir(evidenceDirectory, { recursive: true });
        await writeFile(
          resolve(evidenceDirectory, randomUUID() + ".json"),
          JSON.stringify({ kind: name, ...data }, null, 2),
          { mode: 0o600 },
        );
      } catch {
        evidenceWarning = {
          code: "EVIDENCE_WRITE_FAILED",
          message:
            "The optional evidence file could not be saved. The response shows the current world.",
        };
      }
    }
  };
  const flood = (draft) => {
    const s = draft.snapshot();
    if (s.state.relic && !s.state.flooded) {
      draft.change(
        {
          ...s.state,
          flooded: true,
          log: [
            ...s.state.log,
            "WORLD EVENT: The storm breaks the old crossing. Lark’s ferry or the northern trail can still get you home.",
          ].slice(-100),
        },
        {
          branchId: s.branchId,
          expectedRevision: s.revision,
          reason:
            "Authored storm closes the bridge-shrine trail. Recheck the remaining expedition.",
        },
      );
      return true;
    }
    return false;
  };
  const server = createServer(async (req, res) => {
    const send = (status, value) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(value));
    };
    try {
      const authority = `127.0.0.1:${server.address().port}`;
      if (
        req.headers.host !== authority ||
        (req.headers.origin && req.headers.origin !== `http://${authority}`)
      ) {
        send(403, {
          error: { message: "Loopback and same-origin requests only." },
        });
        return;
      }
      const path = new URL(req.url, `http://${authority}`).pathname;
      if (req.method === "GET") {
        const files = {
          "/": ["index.html", "text/html"],
          "/game.js": ["game.js", "text/javascript"],
          "/style.css": ["style.css", "text/css"],
        };
        files["/scene.js"] = ["scene.js", "text/javascript"];
        for (const name of [
          "rowan-walk-rig-v2",
          "lark-walk-rig-v2",
          "lantern-reach-v1",
          "lantern-reach-storm-v1",
          "rowan-atlas-v1",
          "lark-atlas-v1",
          "wolf-atlas-v1",
          "sentinel-atlas-v1",
          "wolf-hollow-arena-v1",
          "shrine-arena-v1",
          "party-portraits-v1",
          "ferry-river-storm-v1",
          "ferry-atlas-v1",
          "ferry-river-calm-v1",
        ])
          files["/art/" + name + ".png"] = [
            "art/" + name + ".png",
            "image/png",
          ];
        if (files[path]) {
          const [file, type] = files[path];
          const bytes = await readFile(
            new URL("./public/" + file, import.meta.url),
          );
          res.writeHead(200, {
            "Content-Type": type,
            "Cache-Control": "no-store",
            "Content-Security-Policy":
              "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'",
          });
          res.end(bytes);
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
        send(404, { error: { message: "Unknown route." } });
        return;
      }
      if (
        req.method !== "POST" ||
        req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
          "application/json"
      ) {
        send(415, { error: { message: "Send an application/json POST." } });
        return;
      }
      let bytes = 0;
      const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 524288)
          throw new RuntimeError("BODY_LIMIT", "Request exceeds 512 KiB.");
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new RuntimeError("INVALID_REQUEST", "Expected an object.");
      if (planning)
        throw new RuntimeError(
          "PLANNING_BUSY",
          "A live plan is being checked.",
        );
      let result;
      if (path === "/propose") {
        guard(body);
        planning = true;
        evidenceWarning = null;
        const context = runtime.context();
        try {
          result = await planIntent(
            runtime,
            registry,
            (r) => provider.generate(r),
            body.intent,
            {
              onProgress: (e) => {
                progress = e;
              },
            },
          );
          await retain(result.snapshot.proposal.provenance.requestId, {
            intent: body.intent,
            context,
            ...result,
          });
        } catch (e) {
          await retain("failure-" + Date.now(), {
            intent: body.intent,
            context,
            code: e.code,
            message: e.message,
            attempts: e.attempts ?? [],
          });
          throw e;
        } finally {
          planning = false;
        }
      } else if (path === "/accept") {
        result = runtime.accept({
          branchId: body.branchId,
          expectedRevision: body.expectedRevision,
          proposalId: body.proposalId,
        });
      } else if (path === "/step") {
        const draft = createSession(runtime.snapshot());
        result = draft.step({
          branchId: body.branchId,
          expectedRevision: body.expectedRevision,
          planId: body.planId,
          stepId: body.stepId,
        });
        result.worldEvent = !result.replayed && flood(draft);
        runtime = draft;
      } else if (path === "/act") {
        if (
          typeof body.commandId !== "string" ||
          !/^[a-zA-Z0-9-]{8,80}$/.test(body.commandId)
        )
          throw new RuntimeError(
            "INVALID_COMMAND",
            "A unique command ID is required.",
          );
        const key = body.branchId + ":" + body.commandId;
        const signature = JSON.stringify({
          revision: body.expectedRevision,
          action: body.action,
          arguments: body.arguments,
        });
        if (manualReceipts.has(key)) {
          const previous = manualReceipts.get(key);
          if (previous.signature !== signature)
            throw new RuntimeError(
              "COMMAND_REUSED",
              "This command ID was used for another action.",
            );
          send(200, {
            ...state(),
            result: { ...previous.result, replayed: true },
          });
          return;
        }
        guard(body);
        const before = runtime.snapshot();
        const draft = createSession(before);
        const outcome = registry.execute(
          before.state,
          {
            action: body.action,
            arguments: body.arguments,
            description: "Player-selected RPG action",
          },
          defaultTerms,
          before.history,
        );
        for (const p of before.plans) {
          if (p.plan.terms.spareWolf && outcome.state.wolfHp === 0)
            throw new RuntimeError(
              "PROMISE",
              "Your accepted expedition promised to spare the wolf.",
            );
          if (outcome.state.potionsUsed > p.plan.terms.maxPotions)
            throw new RuntimeError(
              "PROMISE",
              "That would break the accepted potion limit.",
            );
        }
        draft.change(outcome.state, {
          branchId: before.branchId,
          expectedRevision: before.revision,
          reason: "Player action: " + outcome.result.text,
        });
        const worldEvent = flood(draft);
        runtime = draft;
        result = { ...outcome.result, worldEvent, manual: true };
        manualReceipts.set(key, { signature, result });
        if (manualReceipts.size > 200)
          manualReceipts.delete(manualReceipts.keys().next().value);
      } else if (path === "/load") {
        guard(body);
        runtime.restore(body.checkpoint, {
          branchId: body.branchId,
          expectedRevision: body.expectedRevision,
        });
        manualReceipts.clear();
        result = {
          text: "Checkpoint restored. Your companions, inventory and accepted promises remain.",
        };
      } else if (path === "/reset") {
        guard(body);
        runtime = createSession();
        manualReceipts.clear();
        progress = null;
        evidenceWarning = null;
        result = { text: "A new expedition begins." };
      } else {
        send(404, { error: { message: "Unknown command." } });
        return;
      }
      send(200, { ...state(), result });
    } catch (e) {
      send(
        [
          "STALE_CONTEXT",
          "STALE_BRANCH",
          "STALE_REVISION",
          "PLANNING_BUSY",
        ].includes(e.code)
          ? 409
          : e.code === "BODY_LIMIT"
            ? 413
            : 400,
        {
          ...state(),
          error: {
            code: e.code ?? "INVALID_REQUEST",
            message: e.message,
            attempts: e.attempts ?? [],
          },
        },
      );
    }
  });
  return server;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT ?? 4340);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer from 1 to 65535.");
  const server = createRpgServer();
  server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`Emberwake RPG: http://127.0.0.1:${server.address().port}`),
  );
}
