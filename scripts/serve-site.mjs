import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../site/", import.meta.url));
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".json": "application/json",
  ".ico": "image/x-icon",
};
const port = Number(process.env.PORT ?? 4350);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer from 1 to 65535.");
createServer(async (request, response) => {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405);
      response.end();
      return;
    }
    let path = decodeURIComponent(
      new URL(request.url, "http://127.0.0.1").pathname,
    );
    if (path === "/runtime-story-sdk") path += "/";
    if (path.startsWith("/runtime-story-sdk/"))
      path = path.slice("/runtime-story-sdk".length);
    const file = resolve(
      root,
      "." + (path.endsWith("/") ? path + "index.html" : path),
    );
    if (!file.startsWith(resolve(root) + sep) || !types[extname(file)]) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, {
      "Content-Type": types[extname(file)],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : bytes);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Site preview: http://127.0.0.1:${port}/runtime-story-sdk/`),
);
