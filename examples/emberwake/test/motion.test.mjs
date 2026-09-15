import test from "node:test";
import assert from "node:assert/strict";
import { walkingLeg, EmberwakeScene } from "../public/scene.js";

test("human gait keeps a support foot planted and limbs at constant length", () => {
  for (let i = 0; i < 1200; i++) {
    const phase = i / 1200,
      hip = -510 + Math.cos(phase * Math.PI * 4) * 13;
    const legs = [walkingLeg(phase, hip), walkingLeg(phase + 0.5, hip)];
    assert.ok(
      legs.some((l) => l.stance),
      "Walking must never become a floating run",
    );
    for (const leg of legs) {
      if (leg.stance) {
        assert.equal(leg.ankle.y, -52);
        assert.equal(leg.footAngle, 0);
      }
      assert.ok(leg.ankle.y <= -52, "A foot must not penetrate the floor");
      assert.ok(
        Math.abs(Math.hypot(leg.knee.x, leg.knee.y - hip) - 245) < 1e-6,
      );
      assert.ok(
        Math.abs(
          Math.hypot(leg.ankle.x - leg.knee.x, leg.ankle.y - leg.knee.y) - 230,
        ) < 1e-6,
      );
    }
  }
});
test("gait loops continuously and stance contact cancels forward travel", () => {
  const a = walkingLeg(0, -497),
    b = walkingLeg(1, -497);
  assert.deepEqual(a, b);
  const before = walkingLeg(1 - 1e-7, -497);
  assert.ok(
    Math.hypot(before.ankle.x - a.ankle.x, before.ankle.y - a.ankle.y) < 0.001,
  );
  const phaseA = 0.15,
    phaseB = 0.45;
  const xA = walkingLeg(phaseA).ankle.x + 450 * phaseA,
    xB = walkingLeg(phaseB).ankle.x + 450 * phaseB;
  assert.ok(
    Math.abs(xA - xB) < 1e-8,
    "Planted foot must not slide as the body advances",
  );
});

test("the mercy interaction never translates an idle human across the ground", () => {
  const scene = Object.create(EmberwakeScene.prototype),
    poses = [];
  const state = {
    hp: 20,
    wolfHp: 8,
    wolfCalmed: true,
    rescued: false,
    flooded: false,
  };
  Object.assign(scene, {
    canvas: { clientWidth: 1536 },
    ctx: { drawImage() {} },
    assets: { forest: {} },
    data: { snapshot: { state } },
    reduced: false,
  });
  for (const name of ["shadow", "glow", "text", "ambient"])
    scene[name] = () => {};
  scene.sprite = (name, frame, x, y) => {
    if (name === "rowan") poses.push({ frame, x, y });
  };
  for (let n = 0; n <= 30; n++)
    scene.drawBattle(
      n * 57,
      { kind: "calm_wolf", before: { ...state, wolfCalmed: false } },
      n / 30,
      "wolf",
    );
  assert.equal(poses.length, 31);
  assert.ok(
    poses.every(
      (p) => p.frame === 0 && p.x === poses[0].x && p.y === poses[0].y,
    ),
    "A planted calming pose must stay at its ground position",
  );
});

test("scene accessibility updates on mode changes and identifies ferry travel", (t) => {
  for (const [name, value] of [
    ["requestAnimationFrame", () => 0],
    ["document", { body: { dataset: {} } }],
  ]) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  const labels = [];
  const scene = Object.create(EmberwakeScene.prototype);
  Object.assign(scene, {
    ready: true,
    reduced: true,
    lastMode: null,
    animation: null,
    data: { snapshot: { state: { location: "camp" } } },
    canvas: { setAttribute: (name, value) => labels.push({ name, value }) },
    ctx: {
      clearRect() {},
      save() {},
      restore() {},
      fillRect() {},
      createRadialGradient: () => ({ addColorStop() {} }),
    },
    drawMap() {},
    drawFerry() {},
  });
  scene.frame(0);
  scene.frame(16);
  assert.equal(labels.length, 1);
  assert.match(labels[0].value, /Forest map/);
  scene.animation = {
    kind: "ferry",
    before: { location: "ferry" },
    start: 0,
    duration: 3500,
  };
  scene.frame(32);
  scene.frame(48);
  assert.equal(labels.length, 2);
  assert.match(labels[1].value, /Crossing the river/);
  assert.equal(document.body.dataset.scene, "ferry");
});
