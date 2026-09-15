import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntimeApi } from "./src/runtime-api.mjs";
import manifest from "./design/demo-assets.json" with { type: "json" };

const files = new Map([
  ["/", ["demo.html", "text/html"]],
  ["/play", ["demo.html", "text/html"]],
  ...[
    "demo.js",
    "demo-scene.js",
    "demo-audio.mjs",
    "character-acting.mjs",
    "play-state.mjs",
  ].map((file) => ["/" + file, [file, "text/javascript"]]),
  ["/demo.css", ["demo.css", "text/css"]],
  ...manifest.assets.map(({ file }) => [
    "/demo/assets/" + file,
    ["demo/assets/" + file, "image/png"],
  ]),
]);

/** One trusted local player. A deployed game must provide its own authenticated host. */
export function createApp({ sdkProvider, artifactDirectory } = {}) {
  const handle = createRuntimeApi({ provider: sdkProvider, artifactDirectory });
  const server = createServer(async (request, response) => {
    const json = (status, body) => {
      if (response.destroyed) return;
      response.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(JSON.stringify(body));
    };
    try {
      const authority = `127.0.0.1:${server.address().port}`;
      if (
        request.headers.host !== authority ||
        (request.headers.origin &&
          request.headers.origin !== `http://${authority}`)
      ) {
        json(403, { error: "Loopback and same-origin requests only." });
        return;
      }
      const path = new URL(request.url, `http://${authority}`).pathname;
      if (request.method === "GET" && files.has(path)) {
        const [file, type] = files.get(path);
        const bytes = await readFile(
          new URL("./public/" + file, import.meta.url),
        );
        response.writeHead(200, {
          "Content-Type": type,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
        });
        response.end(bytes);
        return;
      }
      if (!path.startsWith("/api/runtime/")) {
        json(404, { error: "Unknown route." });
        return;
      }
      let body;
      if (request.method === "POST") {
        if (
          request.headers["content-type"]
            ?.split(";")[0]
            .trim()
            .toLowerCase() !== "application/json"
        ) {
          json(415, { error: "Send an application/json POST." });
          return;
        }
        let length = 0;
        const chunks = [];
        for await (const chunk of request) {
          length += chunk.length;
          if (length > 524288) {
            json(413, { error: "Request exceeds 512 KiB." });
            return;
          }
          chunks.push(chunk);
        }
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      }
      const result = await handle(
        request.method,
        path.slice("/api/runtime/".length),
        body,
      );
      json(result.status, result.body);
    } catch (error) {
      json(error.code === "ENOENT" ? 404 : 400, {
        error:
          error instanceof SyntaxError
            ? "Malformed JSON request."
            : error.message,
      });
    }
  });
  return server;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT ?? 4320);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer from 1 to 65535.");
  const server = createApp();
  server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`Off Script: http://127.0.0.1:${port}/play`),
  );
}
