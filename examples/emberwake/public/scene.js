// Production presentation only. Game state and legal actions remain owned by the host.
export const scenery = {
  camp: { x: 0.17, y: 0.66, labelY: 0.725 },
  grove: { x: 0.29, y: 0.455, labelY: 0.49 },
  bridge: { x: 0.375, y: 0.515, labelY: 0.572 },
  den: { x: 0.3, y: 0.19, labelY: 0.24 },
  ruins: { x: 0.675, y: 0.235, labelY: 0.285 },
  shrine: { x: 0.795, y: 0.5, labelY: 0.55 },
  ferry: { x: 0.72, y: 0.795, labelY: 0.86 },
};
const W = 1536,
  H = 1024,
  clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (t) => t * t * (3 - 2 * t),
  mix = (a, b, t) => a + (b - a) * t;
const paths = {
  "camp:grove": [
    [0.17, 0.66],
    [0.24, 0.61],
    [0.25, 0.53],
    [0.29, 0.455],
  ],
  "camp:bridge": [
    [0.17, 0.66],
    [0.25, 0.6],
    [0.31, 0.535],
    [0.375, 0.515],
  ],
  "grove:bridge": [
    [0.29, 0.455],
    [0.31, 0.49],
    [0.375, 0.515],
  ],
  "grove:den": [
    [0.29, 0.455],
    [0.285, 0.37],
    [0.25, 0.29],
    [0.3, 0.19],
  ],
  "den:ruins": [
    [0.3, 0.19],
    [0.38, 0.165],
    [0.46, 0.165],
    [0.58, 0.165],
    [0.675, 0.235],
  ],
  "ruins:shrine": [
    [0.675, 0.235],
    [0.72, 0.29],
    [0.775, 0.37],
    [0.795, 0.5],
  ],
  "shrine:bridge": [
    [0.795, 0.5],
    [0.68, 0.5],
    [0.58, 0.55],
    [0.49, 0.54],
    [0.375, 0.515],
  ],
  "shrine:ferry": [
    [0.795, 0.5],
    [0.78, 0.63],
    [0.77, 0.71],
    [0.72, 0.795],
  ],
  "ferry:camp": [
    [0.72, 0.795],
    [0.62, 0.79],
    [0.55, 0.73],
    [0.45, 0.73],
    [0.36, 0.71],
    [0.25, 0.69],
    [0.17, 0.66],
  ],
};
function route(a, b) {
  return (
    paths[a + ":" + b] ??
    paths[b + ":" + a]?.toReversed() ?? [
      [scenery[a].x, scenery[a].y],
      [scenery[b].x, scenery[b].y],
    ]
  );
}
function along(points, t) {
  const lengths = points
      .slice(1)
      .map((p, i) =>
        Math.hypot((p[0] - points[i][0]) * W, (p[1] - points[i][1]) * H),
      ),
    total = lengths.reduce((a, b) => a + b, 0);
  let distance = clamp(t) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const f = clamp(distance / lengths[i]);
      return {
        x: mix(points[i][0], points[i + 1][0], f) * W,
        y: mix(points[i][1], points[i + 1][1], f) * H,
        right: points[i + 1][0] >= points[i][0],
      };
    }
    distance -= lengths[i];
  }
  return { x: points[0][0] * W, y: points[0][1] * H, right: true };
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load game art: " + src));
    img.src = src;
  });
}

// The generated sources remain intact. Chroma compositing and connected-component
// slicing are done once at load, so weapons that exceed nominal cell margins are
// kept whole without pulling neighboring figures into an animation frame.
function prepareAtlas(img, columns = 6, rows = 4, baseline = null) {
  const source = document.createElement("canvas");
  source.width = img.width;
  source.height = img.height;
  const c = source.getContext("2d", { willReadFrequently: true });
  c.drawImage(img, 0, 0);
  const pixels = c.getImageData(0, 0, img.width, img.height),
    p = pixels.data,
    n = img.width * img.height,
    foreground = new Uint8Array(n),
    labels = new Uint32Array(n),
    queue = new Int32Array(n);
  const components = [];
  for (let i = 0; i < n; i++) {
    const j = i * 4,
      key = Math.min(p[j], p[j + 2]) - p[j + 1];
    const alpha = clamp((75 - key) / 35);
    p[j + 3] = Math.round(p[j + 3] * alpha);
    foreground[i] = p[j + 3] > 25 ? 1 : 0;
    if (alpha > 0 && alpha < 1) {
      p[j] = Math.min(p[j], p[j + 1] + 55);
      p[j + 2] = Math.min(p[j + 2], p[j + 1] + 55);
    }
  }
  for (let seed = 0; seed < n; seed++) {
    if (!foreground[seed] || labels[seed]) continue;
    const id = components.length + 1;
    let head = 0,
      tail = 1,
      sumX = 0,
      sumY = 0,
      minX = img.width,
      minY = img.height,
      maxX = 0,
      maxY = 0;
    queue[0] = seed;
    labels[seed] = id;
    while (head < tail) {
      const i = queue[head++],
        x = i % img.width,
        y = Math.floor(i / img.width);
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (
            (!dx && !dy) ||
            x + dx < 0 ||
            x + dx >= img.width ||
            y + dy < 0 ||
            y + dy >= img.height
          )
            continue;
          const q = i + dy * img.width + dx;
          if (foreground[q] && !labels[q]) {
            labels[q] = id;
            queue[tail++] = q;
          }
        }
    }
    components.push({
      id,
      count: tail,
      cx: sumX / tail,
      cy: sumY / tail,
      minX,
      minY,
      maxX,
      maxY,
    });
  }
  const groups = Array.from({ length: columns * rows }, () => []),
    cellW = img.width / columns,
    cellH = img.height / rows;
  for (const component of components) {
    if (component.count < 8) continue;
    const col = clamp(Math.floor(component.cx / cellW), 0, columns - 1),
      row = clamp(Math.floor(component.cy / cellH), 0, rows - 1);
    groups[row * columns + col].push(component);
  }
  return groups.map((group, index) => {
    if (!group.length) throw new Error("Missing animation frame " + index);
    const minX = Math.min(...group.map((g) => g.minX)),
      minY = Math.min(...group.map((g) => g.minY)),
      maxX = Math.max(...group.map((g) => g.maxX)),
      maxY = Math.max(...group.map((g) => g.maxY));
    const frame = document.createElement("canvas");
    frame.width = maxX - minX + 3;
    frame.height = maxY - minY + 3;
    const fc = frame.getContext("2d"),
      out = fc.createImageData(frame.width, frame.height),
      ids = new Set(group.map((g) => g.id));
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const i = y * img.width + x;
        if (!ids.has(labels[i])) continue;
        const a = i * 4,
          b = ((y - minY + 1) * frame.width + x - minX + 1) * 4;
        out.data.set(p.subarray(a, a + 4), b);
      }
    fc.putImageData(out, 0, 0);
    return {
      image: frame,
      anchorX: ((index % columns) + 0.5) * cellW - minX + 1,
      anchorY:
        baseline === null
          ? frame.height - 1
          : Math.floor(index / columns) * cellH + baseline - minY + 1,
      cell: cellH,
    };
  });
}
// Bone-ready painted parts are composited at runtime. Originals stay intact.
function prepareRig(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height);
  for (let i = 0; i < data.data.length; i += 4) {
    const p = data.data,
      key = Math.min(p[i], p[i + 2]) - p[i + 1],
      alpha = clamp((75 - key) / 35);
    p[i + 3] *= alpha;
    if (alpha > 0 && alpha < 1) {
      p[i] = Math.min(p[i], p[i + 1] + 55);
      p[i + 2] = Math.min(p[i + 2], p[i + 1] + 55);
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}
export function walkingLeg(phase, hipY = -490) {
  const q = ((phase % 1) + 1) % 1,
    stance = q < 0.6,
    u = stance ? q / 0.6 : (q - 0.6) / 0.4;
  const x = stance ? 135 - 270 * u : -135 + 270 * smooth(u),
    y = stance ? -52 : -52 - Math.sin(u * Math.PI) * 95;
  const dx = x,
    dy = y - hipY,
    d = Math.min(Math.hypot(dx, dy), 474),
    l1 = 245,
    l2 = 230;
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d),
    height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const knee = {
    x: (dx / d) * along + (dy / d) * height,
    y: hipY + (dy / d) * along - (dx / d) * height,
  };
  return {
    hip: { x: 0, y: hipY },
    knee,
    ankle: { x, y },
    stance,
    footAngle: stance ? 0 : -0.24 * Math.sin(u * Math.PI),
  };
}
export class EmberwakeScene {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext("2d");
    this.assets = {};
    this.atlases = {};
    this.rigs = {};
    this.data = null;
    this.animation = null;
    this.reduced = false;
    this.ready = false;
    this.lastMode = null;
    this.modeChanged = 0;
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }
  async load() {
    const files = {
      rowanRig: "rowan-walk-rig-v2.png",
      larkRig: "lark-walk-rig-v2.png",
      riverCalm: "ferry-river-calm-v1.png",
      river: "ferry-river-storm-v1.png",
      boat: "ferry-atlas-v1.png",
      map: "lantern-reach-v1.png",
      storm: "lantern-reach-storm-v1.png",
      forest: "wolf-hollow-arena-v1.png",
      shrine: "shrine-arena-v1.png",
      rowan: "rowan-atlas-v1.png",
      lark: "lark-atlas-v1.png",
      wolf: "wolf-atlas-v1.png",
      sentinel: "sentinel-atlas-v1.png",
    };
    await Promise.all(
      Object.entries(files).map(async ([name, file]) => {
        const img = await loadImage("/art/" + file);
        if (name.endsWith("Rig"))
          this.rigs[name.replace("Rig", "")] = prepareRig(img);
        else if (name === "boat")
          this.atlases.boat = prepareAtlas(img, 3, 2, 356);
        else if (["rowan", "lark", "wolf", "sentinel"].includes(name))
          this.atlases[name] = prepareAtlas(img);
        else this.assets[name] = img;
      }),
    );
    this.ready = true;
  }
  setWorld(data, reduced = false) {
    this.data = data;
    this.reduced = reduced;
  }
  async play(data, before, action) {
    this.data = data;
    if (this.reduced) {
      this.animation = null;
      return;
    }
    const after = data.snapshot.state;
    let kind = action?.action ?? "change";
    if (before.location !== after.location) kind = "travel";
    if (
      kind === "travel" &&
      [before.location, after.location].includes("ferry") &&
      [before.location, after.location].includes("camp")
    )
      kind = "ferry";
    if (!before.flooded && after.flooded) kind = "flood";
    const durations = {
      ferry: 3500,
      travel: 1500,
      attack: 1550,
      calm_wolf: 1700,
      rescue: 1500,
      sneak: 1300,
      flood: 2100,
      heal: 950,
      rest: 1000,
      gather: 850,
      claim_relic: 1200,
    };
    const travelPoints =
      kind === "travel" ? route(before.location, after.location) : [];
    const walkingDuration =
      (travelPoints
        .slice(1)
        .reduce(
          (n, point, i) =>
            n +
            Math.hypot(
              (point[0] - travelPoints[i][0]) * W,
              (point[1] - travelPoints[i][1]) * H,
            ),
          0,
        ) /
        35) *
      1000;
    const duration =
      kind === "travel"
        ? Math.max(1200, walkingDuration)
        : kind === "attack" && action?.arguments?.style === "guard"
          ? 1900
          : (durations[kind] ?? 350);
    await new Promise((resolve) => {
      this.animation = {
        before,
        after,
        action,
        kind,
        start: performance.now(),
        duration,
        resolve,
      };
    });
  }
  sprite(name, index, x, y, size, flip = false, alpha = 1) {
    const human = name === "rowan" || name === "lark";
    const resting = human && index < 6;
    if (human && index >= 6 && index < 12 && this.rigs[name]) {
      this.walkHuman(name, x, y, size, flip, alpha);
      return;
    }
    // One registered rest pose keeps the planted feet fixed. The old generated
    // idle row varies in registration and silhouette, producing visible shuffling.
    const f = this.atlases[name]?.[resting ? 0 : index];
    if (!f) return;
    const c = this.ctx,
      scale = size / f.cell;
    const breath =
      resting && !this.reduced
        ? Math.sin((this.poseTime ?? 0) / 1050 + (name === "lark" ? 1.4 : 0)) *
          0.004
        : 0;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    c.scale(flip ? -1 : 1, 1 + breath);
    c.drawImage(
      f.image,
      -f.anchorX * scale,
      -f.anchorY * scale,
      f.image.width * scale,
      f.image.height * scale,
    );
    c.restore();
  }
  walkHuman(name, x, y, size, flip = false, alpha = 1) {
    const c = this.ctx,
      img = this.rigs[name],
      phase =
        (this.walkDistance != null
          ? this.walkDistance / ((450 * size) / 1160)
          : (this.walkPhase ?? (this.poseTime ?? 0) / 900)) +
        (name === "lark" ? 0.5 : 0),
      hipY = -510 + Math.cos(phase * Math.PI * 4) * 13;
    const lark = name === "lark",
      bodyX = lark ? 482 : 450,
      bodyY = 650;
    const thigh = {
      rect: lark ? [805, 315, 245, 455] : [770, 305, 240, 470],
      pivot: lark ? [929, 381] : [875, 380],
      length: 315,
    };
    const shin = {
      rect: [1150, 468, 240, 332],
      pivot: [1260, 500],
      length: 287,
    };
    const foot = { rect: [1175, 751, 340, 140], pivot: [1267, 787], length: 1 };
    const drawPart = (part, from, to, width = 1) => {
      const dx = to.x - from.x,
        dy = to.y - from.y;
      c.save();
      c.translate(from.x, from.y);
      c.rotate(Math.atan2(dy, dx) - Math.PI / 2);
      c.scale(width, Math.hypot(dx, dy) / part.length);
      c.drawImage(
        img,
        ...part.rect,
        part.rect[0] - part.pivot[0],
        part.rect[1] - part.pivot[1],
        part.rect[2],
        part.rect[3],
      );
      c.restore();
    };
    const leg = (offset, back) => {
      const gait = walkingLeg(phase + offset, hipY);
      c.save();
      if (back) c.filter = "brightness(.72)";
      drawPart(thigh, gait.hip, gait.knee, 0.85);
      drawPart(shin, gait.knee, gait.ankle, 0.86);
      c.save();
      c.translate(gait.ankle.x, gait.ankle.y);
      c.rotate(gait.footAngle);
      c.scale(0.86, 0.75);
      c.drawImage(
        img,
        ...foot.rect,
        foot.rect[0] - foot.pivot[0],
        foot.rect[1] - foot.pivot[1],
        foot.rect[2],
        foot.rect[3],
      );
      c.restore();
      c.restore();
    };
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    c.scale(((flip ? -1 : 1) * size) / 1160, size / 1160);
    leg(0.5, true);
    leg(0, false);
    // The tunic covers the hip joints while the planted feet remain independent.
    c.save();
    c.translate(0, hipY);
    c.rotate(Math.sin(phase * Math.PI * 2) * 0.007);
    c.drawImage(img, 0, 0, 760, 930, -bodyX, -bodyY, 760, 930);
    c.restore();
    c.restore();
  }
  shadow(x, y, w = 26, alpha = 0.35) {
    const c = this.ctx;
    c.save();
    c.fillStyle = `rgba(5,15,16,${alpha})`;
    c.filter = "blur(5px)";
    c.beginPath();
    c.ellipse(x, y, w, w * 0.25, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  glow(x, y, r, color, alpha) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "transparent");
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();
  }
  text(text, x, y, size = 28, color = "#ffe3a4", alpha = 1) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha;
    c.font = `600 ${size}px Georgia`;
    c.textAlign = "center";
    c.lineJoin = "round";
    c.lineWidth = Math.max(3, size * 0.09);
    c.strokeStyle = "#041012";
    c.shadowColor = "#051414";
    c.shadowBlur = 12;
    c.strokeText(text, x, y);
    c.fillStyle = color;
    c.fillText(text, x, y);
    c.restore();
  }
  ambient(time, battle = false) {
    const c = this.ctx,
      s = this.data.snapshot.state,
      t = this.reduced ? 0 : time / 1000;
    c.save();
    for (let i = 0; i < 30; i++) {
      const x = (i * 193.7 + t * (7 + (i % 5))) % W,
        y = (i * 83.9 + Math.sin(t * 0.3 + i) * 25) % H,
        a = 0.07 + (Math.sin(t + i) + 1) * 0.08;
      c.globalAlpha = a;
      c.fillStyle = i % 3 ? "#f5d892" : "#c7e3ce";
      c.beginPath();
      c.arc(x, y, i % 3 === 0 ? 2.5 : 1.2, 0, 7);
      c.fill();
    }
    c.restore();
    if (!battle) {
      this.glow(
        W * 0.145,
        H * 0.63,
        45,
        "#ffba4a",
        0.14 + Math.sin(t * 8) * 0.035,
      );
      if (!this.reduced) {
        c.save();
        c.globalCompositeOperation = "screen";
        c.strokeStyle = s.flooded ? "#c8ecf64a" : "#cfefed2b";
        c.lineWidth = 1.3;
        for (let i = 0; i < 40; i++) {
          const y = (i * 33 + t * (s.flooded ? 62 : 28)) % H,
            x =
              W * (0.46 + Math.max(0, y / H - 0.45) * 0.27) +
              Math.sin(i * 13) * 25;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + 7 + Math.sin(t + i) * 6, y - 3);
          c.stroke();
        }
        c.restore();
      }
    }
    if (s.flooded && !this.reduced) {
      c.save();
      c.strokeStyle = "#bedad03b";
      c.lineWidth = 1;
      for (let i = 0; i < 100; i++) {
        const x = (i * 113.7 + t * 53) % W,
          y = (i * 73.9 + t * 300) % H;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - 5, y + 18);
        c.stroke();
      }
      c.restore();
    }
  }
  drawMap(time, a, p) {
    this.poseTime = time;
    this.walkDistance = null;
    const c = this.ctx,
      s = this.data.snapshot.state,
      base = s.flooded ? this.assets.storm : this.assets.map;
    c.drawImage(base, 0, 0, W, H);
    if (a?.kind === "flood" && p < 1) {
      c.save();
      c.globalAlpha = 1 - smooth(p);
      c.drawImage(this.assets.map, 0, 0, W, H);
      c.restore();
    }
    const idle = this.reduced ? 0 : Math.floor(time / 190) % 6;
    if (s.wolfHp > 0) {
      this.shadow(W * 0.29, H * 0.178, 30);
      this.sprite("wolf", s.wolfCalmed ? 23 : idle, W * 0.29, H * 0.178, 81);
    }
    if (s.sentinelHp > 0) {
      this.shadow(W * 0.815, H * 0.47, 32);
      this.sprite("sentinel", idle, W * 0.815, H * 0.47, 92);
    }
    if (!s.rescued) {
      this.shadow(W * 0.675, H * 0.226, 17);
      this.sprite("lark", 18, W * 0.675, H * 0.226, 66);
    }
    if (!s.relic) {
      const x = W * 0.79,
        y = H * 0.403 + (this.reduced ? 0 : Math.sin(time / 600) * 3);
      this.glow(x, y, 42, "#ffe296", 0.4);
      c.save();
      c.translate(x, y);
      c.rotate(Math.PI / 4);
      c.fillStyle = "#ffe9b5";
      c.shadowColor = "#ffd685";
      c.shadowBlur = 18;
      c.fillRect(-6, -6, 12, 12);
      c.restore();
    }
    let here = {
        x: scenery[s.location].x * W,
        y: scenery[s.location].y * H,
        right: true,
      },
      moving = false;
    if (a?.kind === "travel") {
      const points = route(a.before.location, s.location);
      here = along(points, p);
      const distance = points
        .slice(1)
        .reduce(
          (total, point, i) =>
            total +
            Math.hypot(
              (point[0] - points[i][0]) * W,
              (point[1] - points[i][1]) * H,
            ),
          0,
        );
      this.walkDistance = p * distance;
      this.walkPhase = (p * distance) / 30;
      moving = p < 1;
    }
    this.actorPosition = here;
    const index = moving ? 6 + (Math.floor(time / 115) % 6) : idle;
    this.shadow(here.x, here.y, 21);
    if (s.rescued) {
      const companion =
        a?.kind === "travel"
          ? along(route(a.before.location, s.location), clamp(p - 0.045))
          : { x: here.x - 24, y: here.y - 4, right: here.right };
      this.shadow(companion.x - 13, companion.y + 5, 16);
      this.sprite(
        "lark",
        a?.kind === "rescue" ? 18 + Math.min(5, Math.floor(p * 6)) : index,
        companion.x - 13,
        companion.y + 5,
        72,
        !companion.right,
      );
    }

    this.sprite(
      "rowan",
      index,
      here.x,
      here.y,
      76,
      !here.right,
      a?.kind === "sneak" ? 0.4 : 1,
    );
    if (a?.kind === "heal" || a?.kind === "rest") {
      this.glow(
        here.x,
        here.y - 24,
        85,
        "#a1f0b5",
        Math.sin(p * Math.PI) * 0.35,
      );
      for (let i = 0; i < 9; i++) {
        const angle = i * 2.4;
        this.glow(
          here.x + Math.cos(angle) * 25,
          here.y - p * 75 + i * 3,
          3,
          "#d9ffc6",
          Math.sin(p * Math.PI),
        );
      }
    }
    this.ambient(time);
    if (a?.kind === "flood")
      this.text(
        "THE CROSSING FALLS",
        W / 2,
        H * 0.38,
        44,
        "#ffe4b1",
        Math.sin(p * Math.PI),
      );
    if (a?.kind === "rescue")
      this.text(
        "LARK JOINS YOUR EXPEDITION",
        W / 2,
        H * 0.4,
        37,
        "#e5eff2",
        Math.sin(p * Math.PI),
      );
  }
  drawFerry(time, a, p) {
    const c = this.ctx,
      home = a.after.location === "camp",
      progress = smooth(p);
    c.drawImage(
      a.after.flooded ? this.assets.river : this.assets.riverCalm,
      0,
      0,
      W,
      H,
    );
    const x = mix(
      home ? W * 0.78 : W * 0.22,
      home ? W * 0.22 : W * 0.78,
      progress,
    );
    const y = H * 0.66 + Math.sin(time / 250) * 3;
    c.save();
    c.strokeStyle = "#c6e8e68a";
    c.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const age = (p * 7 + i / 9) % 1;
      c.globalAlpha = (1 - age) * 0.3;
      c.beginPath();
      c.ellipse(
        x + (home ? 1 : -1) * (150 + age * 160),
        y + 6,
        40 + age * 90,
        5 + age * 13,
        0,
        0,
        Math.PI * 2,
      );
      c.stroke();
    }
    c.restore();
    this.sprite("boat", Math.floor(time / 160) % 6, x, y, 570, !home);
    this.ambient(time, true);
    this.text("LARK’S HIDDEN RIVER ROUTE", W / 2, H * 0.32, 34, "#e2d5b6");
    this.text(
      home
        ? "Lantern Camp lies beyond the far bank."
        : "The shrine trail waits beyond the landing.",
      W / 2,
      H * 0.37,
      21,
      "#c4d4ce",
    );
  }
  drawBattle(time, a, p, enemy) {
    this.poseTime = time;
    this.walkPhase = null;
    this.walkDistance = null;
    const c = this.ctx,
      s = this.data.snapshot.state,
      before = a?.before ?? s,
      id = enemy;
    const dead = s[id + "Hp"] === 0,
      idle = this.reduced ? 0 : Math.floor(time / 210) % 6;
    const compact = this.canvas.clientWidth < 600,
      companionY = H * (compact ? 0.87 : 0.705);
    const effects = [];
    c.drawImage(
      id === "wolf" ? this.assets.forest : this.assets.shrine,
      0,
      0,
      W,
      H,
    );
    if (s.flooded) {
      c.fillStyle = "#122f3d40";
      c.fillRect(0, 0, W, H);
    }
    let heroFrame = idle,
      enemyFrame = idle,
      larkFrame = idle;
    let hx = W * 0.29,
      hy = H * (compact ? 0.9 : 0.765),
      ex = W * 0.73,
      ey = H * (compact ? 0.89 : 0.725),
      heroAlpha = 1,
      enemyAlpha = 1;
    if (
      !a &&
      id === "sentinel" &&
      !this.reduced &&
      time - this.modeChanged < 900
    ) {
      enemyFrame =
        18 + Math.min(5, Math.floor((time - this.modeChanged) / 150));
    }
    if (a?.kind === "attack") {
      const guard = a.action?.arguments?.style === "guard";
      const retaliates = s.hp < before.hp;
      const impact = guard ? 0.68 : 0.44;
      if (guard) {
        // Meet the incoming attack, hold the parry, then counter. The hit-reaction
        // poses never play when the host confirms zero damage to Rowan.
        if (p < 0.5) heroFrame = 18 + Math.min(2, Math.floor((p / 0.5) * 3));
        else if (p < 0.62) heroFrame = 20;
        else heroFrame = 12 + Math.min(5, Math.floor(((p - 0.62) / 0.38) * 6));
        const rush = clamp(p / 0.7);
        ex -= Math.sin(rush * Math.PI) * W * 0.27;
        enemyFrame =
          p < 0.58 ? 6 + Math.min(5, Math.floor((p / 0.58) * 6)) : idle;
        if (p > 0.35 && p < 0.65) {
          effects.push(() => {
            this.glow(
              hx + 60,
              hy - 115,
              105,
              "#bdeaf4",
              Math.sin(((p - 0.35) / 0.3) * Math.PI) * 0.35,
            );
            this.text(
              "BLOCKED",
              hx,
              hy - 285,
              26,
              "#c6edf5",
              Math.sin(((p - 0.35) / 0.3) * Math.PI),
            );
          });
        }
        if (p > 0.62) hx += Math.sin(((p - 0.62) / 0.38) * Math.PI) * W * 0.22;
      } else {
        heroFrame = 12 + Math.min(5, Math.floor(p * 6));
        hx += Math.sin(clamp(p / 0.72) * Math.PI) * W * 0.24;
        if (retaliates && !dead && p > 0.6) {
          ex -= Math.sin(((p - 0.6) / 0.4) * Math.PI) * W * 0.25;
          enemyFrame = 6 + Math.min(5, Math.floor(((p - 0.6) / 0.4) * 6));
          if (p > 0.82) heroFrame = 21;
        }
      }
      if (p >= impact && (!retaliates || guard || p < 0.68)) {
        enemyFrame =
          12 +
          Math.min(
            dead ? 5 : 2,
            Math.floor(((p - impact) / (1 - impact)) * (dead ? 6 : 3)),
          );
      }
      if (before.rescued)
        larkFrame =
          12 +
          Math.min(5, Math.floor(clamp((p - (guard ? 0.28 : 0)) / 0.72) * 6));
      if (dead && p > 0.93) enemyAlpha = 1 - clamp((p - 0.93) / 0.07) * 0.4;
      if (p > impact - 0.04 && p < impact + 0.17) {
        const q = (p - impact + 0.04) / 0.21;
        effects.push(() => {
          c.save();
          c.globalAlpha = Math.sin(q * Math.PI);
          c.strokeStyle = "#ffe3a0";
          c.lineWidth = 8;
          c.shadowColor = c.strokeStyle;
          c.shadowBlur = 25;
          c.beginPath();
          c.ellipse(ex, ey - 110, 105, 65, -0.6, -1.4, 1.4);
          c.stroke();
          c.restore();
        });
      }
      if (p > impact) {
        effects.push(() =>
          this.text(
            "−" + (before[id + "Hp"] - s[id + "Hp"]),
            ex,
            ey - (id === "wolf" ? 285 : 355) - (p - impact) * 70,
            45,
            "#ffe4a0",
            clamp((1 - p) * 4),
          ),
        );
      }
      if (p > 0.79 && retaliates) {
        effects.push(() =>
          this.text(
            "−" + (before.hp - s.hp),
            hx,
            hy - 305 - (p - 0.79) * 60,
            38,
            "#ffb399",
            clamp((1 - p) * 5),
          ),
        );
      }
      const arrowStart = guard ? 0.52 : 0.3;
      if (before.rescued && p > arrowStart && p < arrowStart + 0.2) {
        const f = (p - arrowStart) / 0.2;
        effects.push(() => {
          c.save();
          c.strokeStyle = "#e3edf0";
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(mix(W * 0.19, ex, f) - 24, hy - 140);
          c.lineTo(mix(W * 0.19, ex, f) + 20, hy - 140);
          c.stroke();
          c.restore();
        });
      }
    }
    if (a?.kind === "calm_wolf") {
      // Calming is a planted interaction. Translating the idle pose made Rowan
      // skate forward and back without taking a step.
      heroFrame = 0;
      enemyFrame = 18 + Math.min(5, Math.floor(p * 6));
      effects.push(() => {
        this.glow(ex, ey - 50, 100, "#d9e8b0", Math.sin(p * Math.PI) * 0.3);
        if (p > 0.45)
          this.text(
            "TRUST EARNED",
            W / 2,
            H * (compact ? 0.5 : 0.36),
            38,
            "#e7e9c6",
            Math.sin(p * Math.PI),
          );
      });
    }
    if (a?.kind === "sneak") {
      heroFrame = 6 + (Math.floor(time / 120) % 6);
      hx -= p * 160;
      heroAlpha = 1 - p * 0.7;
    }
    if (a?.kind === "heal")
      effects.push(() => {
        this.glow(hx, hy - 100, 170, "#a3e1b9", Math.sin(p * Math.PI) * 0.3);
        this.text(
          "+" + (s.hp - before.hp) + " HEALTH",
          hx,
          hy - 305,
          28,
          "#ccebc9",
          Math.sin(p * Math.PI),
        );
      });
    this.shadow(hx, hy, 59);
    if (before.rescued) {
      this.shadow(W * 0.16, companionY, 47);
      this.sprite("lark", larkFrame, W * 0.16, companionY, 267);
    }
    this.sprite("rowan", heroFrame, hx, hy, 330, false, heroAlpha);
    this.shadow(ex, ey, id === "wolf" ? 90 : 85, 0.4 * enemyAlpha);
    this.sprite(
      id,
      enemyFrame,
      ex,
      ey,
      id === "wolf" ? 340 : 405,
      false,
      enemyAlpha,
    );
    this.ambient(time, true);
    // Readable feedback belongs above the actors, never behind their silhouettes.
    for (const effect of effects) effect();
    if (a?.kind === "attack" && dead && p > 0.76)
      this.text(
        id === "wolf" ? "THE HOLLOW FALLS SILENT" : "THE SENTINEL FALLS",
        W / 2,
        H * (compact ? 0.5 : 0.33),
        38,
        "#ffe4b1",
        smooth((p - 0.76) / 0.24),
      );
  }
  frame(time) {
    requestAnimationFrame(this.frame);
    const c = this.ctx;
    if (!this.ready || !this.data) {
      c.fillStyle = "#101e20";
      c.fillRect(0, 0, W, H);
      this.text("Preparing Lantern Reach…", W / 2, H / 2, 30, "#c8c4ad");
      return;
    }
    const a = this.animation,
      p = a ? clamp((time - a.start) / a.duration) : 0,
      s = this.data.snapshot.state;
    const oldEnemy =
      a &&
      (a.before.location === "den" &&
      a.before.wolfHp > 0 &&
      !a.before.wolfCalmed &&
      !a.before.wolfBypassed
        ? "wolf"
        : a.before.location === "shrine" &&
            a.before.sentinelHp > 0 &&
            !a.before.sentinelBypassed
          ? "sentinel"
          : null);
    const enemy =
      a?.kind === "travel" ? null : (this.data.encounter?.id ?? oldEnemy);
    const mode = a?.kind === "ferry" ? "ferry" : enemy ? "combat" : "map";
    if (mode !== this.lastMode) {
      this.modeChanged = time;
      this.lastMode = mode;
      document.body.dataset.scene = mode;
      this.canvas.setAttribute(
        "aria-label",
        mode === "ferry"
          ? "Crossing the river with Lark. Travel completes at the opposite landing."
          : mode === "combat"
            ? "Tactical encounter. Choose an attack, guard, or peaceful option in the action panel."
            : "Forest map. Use the named location buttons to travel, or arrow keys along connected paths.",
      );
    }
    c.clearRect(0, 0, W, H);
    c.save();
    if (a?.kind === "attack" && p > 0.43 && p < 0.53 && !this.reduced) {
      const strength = a.action?.arguments?.style === "power" ? 7 : 3;
      c.translate(
        Math.sin(time * 0.14) * strength,
        Math.cos(time * 0.19) * strength * 0.5,
      );
    }
    if (a?.kind === "ferry") this.drawFerry(time, a, p);
    else if (enemy) this.drawBattle(time, a, p, enemy);
    else this.drawMap(time, a, p);
    c.restore();
    const vignette = c.createRadialGradient(
      W * 0.5,
      H * 0.46,
      H * 0.24,
      W * 0.5,
      H * 0.46,
      W * 0.65,
    );
    vignette.addColorStop(0, "#03131600");
    vignette.addColorStop(1, "#0313168a");
    c.fillStyle = vignette;
    c.fillRect(0, 0, W, H);
    if (!this.reduced && time - this.modeChanged < 350) {
      c.fillStyle = `rgba(5,16,19,${(1 - (time - this.modeChanged) / 350) * 0.75})`;
      c.fillRect(0, 0, W, H);
    }
    if (a && p === 1) {
      this.animation = null;
      a.resolve();
    }
  }
}
