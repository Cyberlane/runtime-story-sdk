import test from "node:test";
import assert from "node:assert/strict";
import { StoryScene } from "../public/demo-scene.js";
import { Soundscape } from "../public/demo-audio.mjs";

function replaceGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, name, original);
    else delete globalThis[name];
  });
}

test("parallax follows canvas-local pointer coordinates and recenters on leave", (t) => {
  replaceGlobal(t, "Image", class {});
  replaceGlobal(
    t,
    "ResizeObserver",
    class {
      observe() {}
    },
  );
  replaceGlobal(t, "requestAnimationFrame", () => 0);
  replaceGlobal(t, "matchMedia", () => ({ matches: false }));
  replaceGlobal(t, "devicePixelRatio", 1);
  const listeners = {};
  const canvas = {
    getContext: () => ({ setTransform() {} }),
    getBoundingClientRect: () => ({
      left: 200,
      top: 100,
      width: 400,
      height: 300,
    }),
    parentElement: {
      addEventListener: (name, handler) => {
        listeners[name] = handler;
      },
    },
  };
  const scene = new StoryScene(canvas);
  listeners.pointermove({ clientX: 400, clientY: 250 });
  assert.deepEqual(scene.pointer, { x: 0, y: 0 });
  listeners.pointermove({ clientX: 900, clientY: 600 });
  assert.deepEqual(scene.pointer, { x: 4.5, y: 2.5 });
  listeners.pointerleave();
  assert.deepEqual(scene.pointer, { x: 0, y: 0 });
});

test("a completed walk uses the same idle position as a stationary actor", () => {
  const scene = Object.create(StoryScene.prototype);
  const translations = [];
  const context = {
    save() {},
    restore() {},
    beginPath() {},
    ellipse() {},
    fill() {},
    drawImage() {},
    translate: (x, y) => translations.push([x, y]),
  };
  Object.assign(scene, {
    reduced: false,
    poses: { ivo: "guarded" },
    sprites: { ivo: { width: 20, height: 50 } },
  });
  scene.drawActor(context, "ivo", 100, 200, 80, 2.1);
  scene.walk = { done: true };
  scene.drawActor(context, "ivo", 100, 200, 80, 2.1);
  assert.deepEqual(translations[0], translations[1]);
});

test("audio diagnostics stay bounded across repeated scene and checkpoint changes", () => {
  const sound = new Soundscape();
  const world = {
    entities: { ivo: { location: "warehouse" } },
    clock: "night",
  };
  for (let i = 0; i < 250; i++) sound.setScene({ title: i % 2 === 0, world });
  assert.equal(sound.diagnostics().events.length, 200);
  assert.equal(sound.diagnostics().events.at(-1).mode, "night");
});

test("failed audio recorder initialization closes its capture tracks", (t) => {
  replaceGlobal(
    t,
    "MediaRecorder",
    class {
      constructor() {
        throw new Error("Recording unavailable");
      }
    },
  );
  const sound = new Soundscape();
  let stopped = 0;
  sound.enabled = true;
  sound.context = {
    createMediaStreamDestination: () => ({
      stream: { getTracks: () => [{ stop: () => stopped++ }] },
    }),
  };
  assert.throws(() => sound.startRecording(), /Recording unavailable/);
  assert.equal(stopped, 1);
  assert.equal(sound.recorder, undefined);
});

test("repeated recording stop requests share completion and release the capture once", async () => {
  const sound = new Soundscape();
  let stops = 0;
  let disconnects = 0;
  let trackStops = 0;
  const recorder = { mimeType: "audio/webm", stop: () => stops++ };
  sound.recorder = recorder;
  sound.chunks = [new Blob(["audio"])];
  sound.output = { disconnect: () => disconnects++ };
  sound.capture = {
    stream: { getTracks: () => [{ stop: () => trackStops++ }] },
  };
  const first = sound.stopRecording();
  const second = sound.stopRecording();
  assert.equal(first, second);
  assert.equal(stops, 1);
  recorder.onstop();
  assert.equal((await first).type, "audio/webm");
  assert.equal(disconnects, 1);
  assert.equal(trackStops, 1);
  assert.equal(sound.recorder, null);
});
