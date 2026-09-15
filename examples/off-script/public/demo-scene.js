import { actingSheets, characterPoses } from "./character-acting.mjs";
// Layered 2D presentation. Only setWorld receives canonical gameplay state.
// Camera movement and visual actor positions cannot grant access or execute actions.
const asset = (name) => `/demo/assets/${name}.png`;
const load = (src) =>
  new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`Could not load scene art: ${src}`));
    im.src = src;
  });
const lerp = (a, b, t) => a + (b - a) * t;

export class StoryScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.world = null;
    this.room = "warehouse";
    this.target = null;
    this.title = true;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.camera = { x: 0, y: 0 };
    this.pointer = { x: 0, y: 0 };
    this.actors = {
      ivo: { x: 0.4, y: 0.64 },
      sera: { x: 0.69, y: 0.62 },
      mara: { x: 0.84, y: 0.55 },
    };
    this.ready = Promise.all(
      [
        "warehouse",
        "warehouse-open",
        "warehouse-morning",
        "office",
        "office-morning",
        "quay",
        "cast-matte",
        ...new Set(
          Object.values(actingSheets).flatMap((sheet) => [
            sheet.file,
            ...Object.values(sheet.poses)
              .map((pose) => pose.sheet)
              .filter(Boolean),
          ]),
        ),
      ].map(async (name) => [name, await load(asset(name))]),
    ).then((entries) => {
      this.images = Object.fromEntries(entries);
      this.sprites = this.makeSprites(this.images["cast-matte"]);
      this.acting = Object.fromEntries(
        Object.entries(actingSheets).map(([id, sheet]) => {
          const poses = {};
          for (const file of new Set([
            sheet.file,
            ...Object.values(sheet.poses)
              .map((p) => p.sheet)
              .filter(Boolean),
          ])) {
            const regions = Object.fromEntries(
              Object.entries(sheet.poses)
                .filter(([, spec]) => (spec.sheet || sheet.file) === file)
                .map(([pose, spec]) => [pose, spec.rect]),
            );
            Object.assign(poses, this.makeSprites(this.images[file], regions));
          }
          return [id, poses];
        }),
      );
    });
    this.particles = Array.from({ length: 38 }, (_, i) => ({
      x: ((i * 71) % 101) / 100,
      y: ((i * 37) % 97) / 100,
      s: 0.4 + (i % 5) * 0.3,
    }));
    this.resize = () => {
      const box = canvas.getBoundingClientRect();
      this.w = box.width;
      this.h = box.height;
      const d = Math.min(devicePixelRatio || 1, 2);
      canvas.width = this.w * d;
      canvas.height = this.h * d;
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    new ResizeObserver(this.resize).observe(canvas);
    this.resize();
    canvas.parentElement.addEventListener("pointermove", (e) => {
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      this.pointer = {
        x:
          (Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) - 0.5) *
          9,
        y:
          (Math.max(0, Math.min(1, (e.clientY - box.top) / box.height)) - 0.5) *
          5,
      };
    });
    canvas.parentElement.addEventListener("pointerleave", () => {
      this.pointer = { x: 0, y: 0 };
    });
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }
  makeSprites(atlas, regions) {
    // Runtime chroma compositing of the generated flat-magenta sprite atlas.
    // This leaves all supplied originals untouched and preserves skin/clothing.
    const surface = document.createElement("canvas");
    surface.width = atlas.width;
    surface.height = atlas.height;
    const c = surface.getContext("2d", { willReadFrequently: true });
    c.drawImage(atlas, 0, 0);
    const pixels = c.getImageData(0, 0, surface.width, surface.height),
      d = pixels.data;
    for (let p = 0; p < d.length; p += 4) {
      const key = Math.min(d[p], d[p + 2]) - d[p + 1];
      if (key > 18 && d[p] > 35 && d[p + 2] > 35) {
        d[p + 3] = Math.max(0, 255 - (key - 18) * 10);
        if (d[p + 3]) {
          d[p] = Math.min(d[p], d[p + 1] + 8);
          d[p + 2] = Math.min(d[p + 2], d[p + 1] + 8);
        }
      }
    }
    c.putImageData(pixels, 0, 0);
    const bounds = regions || {
      ivo: [111, 15, 427, 981],
      sera: [548, 23, 494, 972],
      mara: [1120, 29, 405, 967],
    };
    const result = {};
    for (const [id, [x, y, bw, bh]] of Object.entries(bounds)) {
      const s = document.createElement("canvas");
      s.width = bw;
      s.height = bh;
      s.getContext("2d").drawImage(surface, x, y, bw, bh, 0, 0, bw, bh);
      result[id] = s;
    }
    return result;
  }
  async travel(destination) {
    if (this.reduced) return;
    const from = { ...this.actors.ivo };
    const point =
      this.room === "office"
        ? [0.16, 0.66]
        : destination === "office"
          ? [0.84, 0.65]
          : destination === "outside"
            ? [0.53, 0.55]
            : [0.42, 0.66];
    this.walk = {
      from,
      to: { x: point[0], y: point[1] },
      start: performance.now(),
      duration: 1200,
    };
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (this.walk) this.walk.done = true;
  }
  setWorld(world) {
    if (this.room !== world.entities.ivo.location) {
      this.walk = null;
      const point =
        world.entities.ivo.location === "office"
          ? [0.65, 0.65]
          : world.entities.ivo.location === "outside"
            ? [0.57, 0.68]
            : [0.41, 0.66];
      this.actors.ivo = { x: point[0], y: point[1] };
    }
    const poses = characterPoses(world);
    this.poseChanges ||= {};
    for (const [id, pose] of Object.entries(poses)) {
      if (this.poses?.[id] && this.poses[id] !== pose)
        this.poseChanges[id] = {
          from: this.poses[id],
          start: performance.now(),
        };
    }
    this.poses = poses;
    this.world = world;
    this.room = world.entities.ivo.location;
  }
  setPresentation({ target, title, reduced }) {
    this.target = target;
    this.title = title;
    this.reduced = reduced;
  }
  getAnchors() {
    if (this.room === "office")
      return {
        office: [0.82, 0.4],
        ivo: [0.65, 0.48],
        sera: [0.32, 0.48],
        gate: [0.18, 0.46],
        desk: [0.32, 0.51],
      };
    if (this.room === "outside")
      return { ivo: [0.57, 0.5], gate: [0.78, 0.45] };
    return {
      ivo: [0.41, 0.44],
      sera: [0.69, 0.43],
      mara: [0.84, 0.37],
      desk: [0.21, 0.52],
      office: [0.86, 0.41],
      gate: [0.53, 0.34],
    };
  }
  portrait(canvas, id) {
    const c = canvas.getContext("2d");
    c.clearRect(0, 0, canvas.width, canvas.height);
    const pose =
      this.poses?.[id] === "resolved" && this.speakingId === id
        ? "speaking"
        : this.poses?.[id];
    const s = this.acting?.[id]?.[pose] || this.sprites?.[id];
    if (!s) return;
    const face = actingSheets[id]?.poses[pose]?.face;
    if (face) c.drawImage(s, ...face, 0, 0, canvas.width, canvas.height);
    else {
      const side = Math.min(s.width, s.height * 0.34);
      c.drawImage(
        s,
        (s.width - side) / 2,
        0,
        side,
        side,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    }
  }

  effect(kind) {
    this.effectAt = performance.now();
    this.effectKind = kind;
  }
  frame(time) {
    requestAnimationFrame(this.frame);
    if (document.hidden || !this.images) return;
    const { ctx: c, w, h } = this;
    if (!w || !h) return;
    const t = this.reduced ? 0 : time * 0.001;
    this.camera.x = this.reduced
      ? 0
      : lerp(this.camera.x, this.pointer.x, 0.025);
    this.camera.y = this.reduced
      ? 0
      : lerp(this.camera.y, this.pointer.y, 0.025);
    c.clearRect(0, 0, w, h);
    const room = this.room === "outside" ? "quay" : this.room;
    const backgroundName =
      room === "warehouse"
        ? this.world?.clock === "morning"
          ? "warehouse-morning"
          : this.world?.exitOpen || this.title
            ? "warehouse-open"
            : "warehouse"
        : room === "office" && this.world?.clock === "morning"
          ? "office-morning"
          : room;
    const bg = this.images[backgroundName] || this.images.warehouse;
    const scale = Math.max(w / bg.width, h / bg.height) * 1.035,
      bw = bg.width * scale,
      bh = bg.height * scale;
    const dx = (w - bw) / 2 + this.camera.x,
      dy = (h - bh) * 0.35 + this.camera.y;
    c.drawImage(bg, dx, dy, bw, bh);

    // Door artwork switches only with confirmed host access/time state.
    if (!this.title && room === "warehouse") this.drawGate(c, w, h);
    if (!this.title) {
      const desired =
        room === "office"
          ? { ivo: [0.65, 0.65], sera: [0.32, 0.65] }
          : room === "quay"
            ? { ivo: [0.57, 0.68] }
            : { ivo: [0.41, 0.66], sera: [0.69, 0.65], mara: [0.84, 0.7] };
      for (const [id, [x, y]] of Object.entries(desired)) {
        const a = this.actors[id];
        if (id === "ivo" && this.walk) {
          const f = Math.min(1, (time - this.walk.start) / this.walk.duration),
            ease = f * f * (3 - 2 * f);
          a.x = lerp(this.walk.from.x, this.walk.to.x, ease);
          a.y = lerp(this.walk.from.y, this.walk.to.y, ease);
        } else {
          a.x = lerp(a.x, x, this.reduced ? 1 : 0.065);
          a.y = lerp(a.y, y, this.reduced ? 1 : 0.065);
        }
        // Sera's office portrait may speak remotely, but Sera's actual host entity
        // remains in the warehouse. Do not paint her as physically in the office.
        if (room === "office" && id === "sera") continue;
        this.drawActor(
          c,
          id,
          a.x * w,
          a.y * h,
          Math.min(h * (id === "mara" ? 0.34 : 0.37), w * 0.42),
          t,
        );
      }
      const copies = Object.values(this.world?.documents || {}).filter(
        (d) => !d.original,
      );
      if (room === "warehouse" && copies.length) {
        const delivered = copies.some((d) => d.owner === "sera");
        this.drawCopy(
          c,
          (delivered ? 0.655 : 0.25) * w,
          (delivered ? 0.515 : 0.57) * h,
          delivered,
        );
      }
    }
    c.save();
    c.globalCompositeOperation = "screen";
    for (const p of this.particles) {
      const x = ((p.x * w + t * p.s * 3) % (w + 20)) - 10,
        y = (((p.y * h - t * p.s * 2) % (h + 20)) + h + 20) % (h + 20);
      c.globalAlpha =
        (0.12 + Math.sin(t + p.x * 5) * 0.06) * (room === "quay" ? 0.6 : 1);
      c.fillStyle = "#ffd99b";
      c.beginPath();
      c.arc(x, y, p.s, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    if (this.effectAt && time - this.effectAt < 1400) {
      const f = 1 - (time - this.effectAt) / 1400;
      c.fillStyle =
        this.effectKind === "setback"
          ? `rgba(179,77,41,${f * 0.13})`
          : `rgba(244,214,135,${f * 0.1})`;
      c.fillRect(0, 0, w, h);
    }
  }
  drawActor(c, id, x, y, height, t) {
    const walking =
      id === "ivo" && this.walk && !this.walk.done && !this.reduced;
    const pose = walking
      ? `walk${Math.floor((performance.now() - this.walk.start) / 150) % 4}`
      : this.poses?.[id] === "resolved" && this.speakingId === id
        ? "speaking"
        : this.poses?.[id];
    const sprite = this.acting?.[id]?.[pose] || this.sprites[id];
    if (!sprite) return;
    const scale = actingSheets[id]?.poses[pose]?.scale || 1;
    const bob = this.reduced
      ? 0
      : Math.sin(t * (walking ? 16 : 1.2) + (id === "ivo" ? 0 : 2)) *
        (walking ? 3 : 0.9);
    c.save();
    c.fillStyle = "#040c0c70";
    c.beginPath();
    c.ellipse(x, y - 2, height * 0.13, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.shadowColor = "#0009";
    c.shadowBlur = 8;
    const transition = walking ? null : this.poseChanges?.[id];
    const mix =
      !transition || this.reduced
        ? 1
        : Math.min(1, (performance.now() - transition.start) / 280);
    const paint = (image, factor, alpha, paintedPose) => {
      const sh = height * factor,
        sw = (sh * image.width) / image.height;
      c.globalAlpha = alpha;
      const pivot = actingSheets[id]?.poses[paintedPose]?.pivot ?? 0.5;
      c.save();
      c.translate(x, y + bob);
      if (walking && this.walk.to.x < this.walk.from.x) c.scale(-1, 1);
      c.drawImage(image, -sw * pivot, -sh, sw, sh);
      c.restore();
    };
    if (mix < 1) {
      const old = this.acting[id][transition.from];
      paint(
        old,
        actingSheets[id].poses[transition.from].scale || 1,
        1 - mix,
        transition.from,
      );
    }
    paint(sprite, scale, mix, pose);
    c.restore();
  }

  drawGate(c, w, h) {
    const open = this.world?.exitOpen;
    c.save();
    c.translate(w * 0.525, h * 0.345);
    c.fillStyle = open ? "#183931ed" : "#432f29ed";
    c.strokeStyle = open ? "#9cbea680" : "#e1ac7b";
    c.lineWidth = 1;
    c.fillRect(-42, -15, 84, 27);
    c.strokeRect(-42, -15, 84, 27);
    c.fillStyle = open ? "#c0d8bc" : "#f0c39b";
    c.font = "9px Arial";
    c.textAlign = "center";
    c.fillText(open ? "EXIT · OPEN" : "EXIT · LOCKED", 0, 2);
    c.restore();
  }
  drawCopy(c, x, y, delivered) {
    c.save();
    c.translate(x, y);
    c.rotate(delivered ? 0.1 : -0.08);
    c.fillStyle = "#0005";
    c.fillRect(-16, -20, 37, 47);
    c.fillStyle = "#f1e7ce";
    c.fillRect(-18, -23, 34, 44);
    c.strokeStyle = "#8e8d6d";
    c.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(-12, -13 + i * 6);
      c.lineTo(10, -13 + i * 6);
      c.stroke();
    }
    c.fillStyle = "#7b9e88";
    c.beginPath();
    c.arc(8, 12, 4, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}
