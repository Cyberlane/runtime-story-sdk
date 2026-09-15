import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../site/", import.meta.url));
const walk = async (directory) =>
  (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true }))
        .filter(
          (entry) =>
            !entry.name.startsWith(".") && entry.name !== "generated-originals",
        )
        .map((entry) =>
          entry.isDirectory()
            ? walk(resolve(directory, entry.name))
            : resolve(directory, entry.name),
        ),
    )
  ).flat();
const files = await walk(root);
const html = await readFile(resolve(root, "index.html"), "utf8");
assert.match(
  html,
  /https:\/\/youtu\.be\/0kfqFjjUfLY|youtube(?:-nocookie)?\.com\/embed\/0kfqFjjUfLY/,
  "The developer video must be linked.",
);
assert.match(html, /OpenAI/, "The event attribution must be present.");
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(
  (match) => match[1],
);
assert.equal(new Set(ids).size, ids.length, "HTML IDs must be unique.");
let links = 0;
for (const file of files.filter((file) =>
  [".html", ".css"].includes(extname(file)),
)) {
  const source = await readFile(file, "utf8");
  const references = [
    ...source.matchAll(
      /(?:src|href)=["']([^"']+)["']|url\(["']?([^\s)'";]+)["']?\)/g,
    ),
  ].map((match) => match[1] ?? match[2]);
  for (const reference of references) {
    if (/^(?:https?:|data:|mailto:|tel:)/.test(reference)) continue;
    if (reference === "#") continue;
    if (reference.startsWith("#")) {
      if (file.endsWith("index.html"))
        assert.ok(
          ids.includes(reference.slice(1)),
          `Missing anchor ${reference}`,
        );
      continue;
    }
    assert.ok(
      !reference.startsWith("/"),
      `Use relative paths for project Pages: ${reference}`,
    );
    const target = resolve(
      dirname(file),
      decodeURIComponent(reference.split(/[?#]/)[0]),
    );
    const info = await stat(target).catch(() => null);
    assert.ok(info?.isFile(), `${file}: missing asset ${reference}`);
    links += 1;
  }
}
for (const file of files) {
  const info = await stat(file);
  assert.ok(
    info.size < 5 * 1024 * 1024,
    `Optimize large public asset: ${file}`,
  );
}
console.log(
  `Site: ${files.length} files, ${links} local references and ${ids.length} anchors checked. Visual and interaction review is separate.`,
);
