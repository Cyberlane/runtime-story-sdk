import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createRpgServer } from "../examples/emberwake/server.mjs";

const root = new URL("../examples/emberwake/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("art-direction/asset-manifest.json", root), "utf8"),
);
const files = (await readdir(new URL("public/art/", root)))
  .filter((name) => name.endsWith(".png"))
  .sort();
assert.deepEqual(
  manifest.assets.map((asset) => asset.file).sort(),
  files,
  "Every selected PNG must be indexed exactly once.",
);
for (const asset of manifest.assets) {
  const bytes = await readFile(new URL("public/art/" + asset.file, root));
  assert.equal(
    bytes.subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
    asset.file + " is not PNG.",
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    asset.sha256,
    asset.file + " changed without review.",
  );
  assert.equal(bytes.length, asset.bytes, asset.file + " byte count differs.");
  assert.equal(
    bytes.readUInt32BE(16),
    asset.width,
    asset.file + " width differs.",
  );
  assert.equal(
    bytes.readUInt32BE(20),
    asset.height,
    asset.file + " height differs.",
  );
  if (asset.kind === "animation-atlas") {
    assert.equal(
      asset.width / asset.columns,
      asset.height / asset.rows,
      asset.file + " requires square frame cells.",
    );
    assert.ok(
      asset.width / asset.columns >= 256,
      asset.file + " frame resolution is too low.",
    );
  }
}
const renderer = await readFile(new URL("public/scene.js", root), "utf8");
const stylesheet = await readFile(new URL("public/style.css", root), "utf8");

for (const asset of manifest.assets) {
  assert.ok(
    (renderer + stylesheet).includes(asset.file),
    asset.file + " is indexed but not used.",
  );
}
const host = createRpgServer({
  provider: { info: () => ({ live: false, kind: "asset-check" }) },
});
await new Promise((resolve) => host.listen(0, "127.0.0.1", resolve));
try {
  for (const asset of manifest.assets) {
    const response = await fetch(
      `http://127.0.0.1:${host.address().port}/art/${asset.file}`,
    );
    assert.equal(response.status, 200, `${asset.file} must be served`);
    assert.equal(response.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      asset.sha256,
      `${asset.file} HTTP content differs`,
    );
  }
} finally {
  host.closeAllConnections();
  await new Promise((resolve) => host.close(resolve));
}
console.log(
  `Emberwake: ${manifest.assets.length} selected production assets pass integrity, frame-grid, usage and route checks. Visual quality and animation still require the browser review.`,
);
