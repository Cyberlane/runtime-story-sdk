import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const manifest = JSON.parse(
  await readFile(
    new URL("../design/demo-assets.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(
  manifest.assets.length,
  12,
  "Three places with variants, fallback cast and three acting sheets and idle/motion sheets are required.",
);
for (const asset of manifest.assets) {
  assert.match(asset.file, /^[a-z0-9-]+\.png$/);
  const bytes = await readFile(
    new URL(`../public/demo/assets/${asset.file}`, import.meta.url),
  );
  assert.equal(
    bytes.subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
    asset.file,
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    asset.sha256,
    asset.file,
  );
  assert.equal(bytes.readUInt32BE(16), asset.width, asset.file);
  assert.equal(bytes.readUInt32BE(20), asset.height, asset.file);
}
console.log(
  `Demo art: ${manifest.assets.length} selected production files match their recorded dimensions and hashes. Visual compositing is verified separately in the browser.`,
);
