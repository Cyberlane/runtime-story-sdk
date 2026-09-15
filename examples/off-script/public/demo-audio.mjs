// Original score and synthesized effects for Off Script. No sampled recordings.
// Music uses one 16-bar phrase, with orchestration following confirmed story state.
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const beat = 60 / 68;
const harmony = [
  [50, 57, 60, 64],
  [50, 57, 60, 65],
  [46, 53, 57, 60],
  [46, 53, 57, 64],
  [53, 60, 64, 69],
  [53, 60, 65, 69],
  [48, 55, 62, 64],
  [45, 52, 58, 61],
  [50, 57, 60, 65],
  [50, 57, 64, 69],
  [43, 50, 57, 58],
  [46, 53, 60, 65],
  [53, 60, 64, 69],
  [48, 55, 60, 64],
  [45, 52, 58, 61],
  [50, 57, 60, 64],
];
const melody = [
  [74, 69, 65],
  [null, 64, 65],
  [69, 65, 62],
  [null, 64, 65],
  [72, 69, 67],
  [null, 65, 64],
  [67, 64, 62],
  [61, null, 69],
  [74, 77, 76],
  [74, null, 69],
  [70, 69, 65],
  [null, 65, 69],
  [72, 77, 76],
  [72, null, 67],
  [69, 73, 76],
  [74, null, null],
];
const modes = {
  title: { music: 0.7, melody: 0.7, rain: 0.3 },
  night: { music: 0.55, melody: 0.45, rain: 0.5 },
  setback: { music: 0.45, melody: 0.2, rain: 0.6 },
  shelter: { music: 0.5, melody: 0.6, rain: 0.16 },
  morning: { music: 0.65, melody: 0.85, rain: 0.06 },
  ending: { music: 0.8, melody: 1, rain: 0.04 },
};

function note(c, bus, midi, at, length, level, kind = "felt", pan = 0) {
  const envelope = c.createGain(),
    panner = c.createStereoPanner();
  panner.pan.value = pan;
  envelope.connect(panner).connect(bus);
  const soft = kind === "pad";
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(level, at + (soft ? 0.7 : 0.018));
  envelope.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, level * (soft ? 0.55 : 0.13)),
    at + length * 0.7,
  );
  envelope.gain.linearRampToValueAtTime(0, at + length);
  const partials = soft
    ? [
        [1, 1],
        [1.003, 0.3],
      ]
    : [
        [1, 1],
        [2, 0.22],
        [3, 0.045],
      ];
  partials.forEach(([ratio, gain], index) => {
    const oscillator = c.createOscillator(),
      partial = c.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = hz(midi) * ratio;
    partial.gain.value = gain;
    oscillator.connect(partial).connect(envelope);
    oscillator.start(at);
    oscillator.stop(at + length + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      partial.disconnect();
      if (index === partials.length - 1) {
        envelope.disconnect();
        panner.disconnect();
      }
    };
  });
}

function scoreBar(c, bus, bar, at, mode) {
  const chord = harmony[bar % harmony.length],
    mood = modes[mode];
  chord
    .slice(0, 3)
    .forEach((n, i) =>
      note(c, bus, n, at, beat * 4.8, 0.024 * mood.music, "pad", (i - 1) * 0.4),
    );
  note(c, bus, chord[0] - 12, at, beat * 3, 0.08 * mood.music, "felt", -0.1);
  [0, 1, 2, 3, 2, 1].forEach((index, i) => {
    note(
      c,
      bus,
      chord[index] + 12,
      at + i * beat * 0.5,
      beat * 1.9,
      0.028 * mood.music * (i % 2 ? 0.7 : 1),
      "felt",
      ((i % 3) - 1) * 0.25,
    );
  });
  melody[bar % melody.length].forEach((n, i) => {
    if (n !== null)
      note(
        c,
        bus,
        n,
        at + [0, 1.5, 2.5][i] * beat,
        beat * 2.4,
        0.052 * mood.melody,
        "felt",
        0.13,
      );
  });
}

function noise(c) {
  const buffer = c.createBuffer(1, c.sampleRate * 8, c.sampleRate),
    data = buffer.getChannelData(0);
  let seed = 271828,
    previous = 0;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    previous = previous * 0.78 + ((seed / 4294967296) * 2 - 1) * 0.22;
    const fade = Math.min(1, i / 512, (data.length - 1 - i) / 512);
    data[i] = previous * fade;
  }
  return buffer;
}

export class Soundscape {
  constructor() {
    this.enabled = false;
    this.mode = "title";
    this.volume = 0.55;
    this.events = [];
    this.lastCue = new Map();
  }
  initialize() {
    this.context = new AudioContext();
    const c = this.context;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 12;
    limiter.ratio.value = 4;
    this.master.connect(limiter).connect(c.destination);
    this.output = limiter;
    this.music = c.createGain();
    this.music.gain.value = 1.8;
    this.effects = c.createGain();
    this.effects.gain.value = 0.6;
    this.music.connect(this.master);
    this.effects.connect(this.master);
    // A short filtered echo gives the score a room without a sampled impulse.
    const echo = c.createDelay(1),
      feedback = c.createGain(),
      filter = c.createBiquadFilter();
    echo.delayTime.value = beat * 0.75;
    feedback.gain.value = 0.14;
    filter.type = "lowpass";
    filter.frequency.value = 1600;
    this.music.connect(echo).connect(filter).connect(feedback).connect(echo);
    feedback.connect(this.master);
    this.noiseBuffer = noise(c);
    const rain = c.createBufferSource(),
      rainFilter = c.createBiquadFilter();
    rain.buffer = this.noiseBuffer;
    rain.loop = true;
    rainFilter.type = "lowpass";
    rainFilter.frequency.value = 1700;
    this.rain = c.createGain();
    this.rain.gain.value = modes[this.mode].rain * 0.12;
    rain.connect(rainFilter).connect(this.rain).connect(this.master);
    rain.start();
    this.bar = 0;
    this.nextBar = c.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 100);
  }
  async toggle() {
    if (!this.context) this.initialize();
    this.enabled = !this.enabled;
    await (this.enabled ? this.context.resume() : this.context.suspend());
    if (this.enabled) this.schedule();
    return this.enabled;
  }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.master)
      this.master.gain.setTargetAtTime(
        this.volume,
        this.context.currentTime,
        0.05,
      );
  }
  setScene({ title, world }) {
    const mode = title
      ? "title"
      : world.entities.ivo.location === "outside"
        ? "ending"
        : world.clock === "morning"
          ? "morning"
          : world.entities.ivo.location === "office"
            ? "shelter"
            : world.setbackOccurred
              ? "setback"
              : "night";
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.rain)
      this.rain.gain.setTargetAtTime(
        modes[mode].rain * 0.12,
        this.context.currentTime,
        1.2,
      );
    this.events.push({ type: "scene", mode });
    if (this.events.length > 200) this.events.shift();
  }
  schedule() {
    if (!this.enabled || this.context.state !== "running") return;
    const now = this.context.currentTime;
    // Returning from a throttled background tab resumes at the next phrase beat.
    if (this.nextBar < now - 0.5) this.nextBar = now + 0.05;
    if (this.nextBar < now + 0.25) {
      scoreBar(this.context, this.music, this.bar++, this.nextBar, this.mode);
      this.nextBar += beat * 4;
    }
  }
  rustle(at, length, level, cutoff = 1600) {
    const c = this.context,
      source = c.createBufferSource(),
      filter = c.createBiquadFilter(),
      gain = c.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    source.connect(filter).connect(gain).connect(this.effects);
    source.start(at, 1.2, length);
    source.stop(at + length + 0.01);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
  cue(kind) {
    if (!this.enabled) return;
    const c = this.context,
      t = c.currentTime + 0.005;
    if (
      t - (this.lastCue.get(kind) ?? -10) <
      (kind === "navigate" ? 0.16 : 0.09)
    )
      return;
    this.lastCue.set(kind, t);
    this.events.push({ type: "cue", kind, at: t });
    if (this.events.length > 200) this.events.shift();
    const chime = (notes, level = 0.11) =>
      notes.forEach((n, i) =>
        note(c, this.effects, n, t + i * 0.09, 0.9, level),
      );
    switch (kind) {
      case "navigate":
        this.rustle(t, 0.065, 0.1, 2200);
        break;
      case "dialogue":
        this.rustle(t, 0.15, 0.07, 1200);
        break;
      case "planning":
        chime([62, 69], 0.065);
        break;
      case "proposal":
        chime([62, 65, 69, 74]);
        break;
      case "accept":
        chime([50, 57, 65], 0.13);
        break;
      case "create_document":
        [0, 0.13, 0.32].forEach((d) => this.rustle(t + d, 0.2, 0.35, 1900));
        break;
      case "deliver_document":
        this.rustle(t, 0.25, 0.3);
        note(c, this.effects, 45, t + 0.16, 0.18, 0.23);
        break;
      case "setback":
        chime([38, 45], 0.2);
        this.rustle(t, 0.9, 0.38, 480);
        break;
      case "error":
        chime([50, 49], 0.065);
        break;
      case "footstep":
        this.rustle(t, 0.12, 0.4, 340);
        note(c, this.effects, 35, t, 0.12, 0.12);
        break;
      case "grant_shelter":
        chime([53, 60, 65], 0.08);
        break;
      case "grant_passage":
        chime([57, 62, 69], 0.08);
        break;
      case "wait_until_morning":
        chime([65, 69, 72, 77], 0.075);
        break;
      case "success":
        chime([53, 60, 65, 69, 77], 0.12);
        break;
      case "transition":
        this.rustle(t, 0.8, 0.07, 650);
        break;
    }
  }
  diagnostics() {
    return {
      enabled: this.enabled,
      state: this.context?.state,
      mode: this.mode,
      volume: this.volume,
      barsScheduled: this.bar ?? 0,
      events: [...this.events],
    };
  }
  startRecording() {
    if (!this.enabled || this.recorder)
      throw new Error("Enable sound before recording.");
    const capture = this.context.createMediaStreamDestination();
    const chunks = [];
    let recorder;
    try {
      recorder = new MediaRecorder(capture.stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.start();
      this.output.connect(capture);
    } catch (error) {
      if (recorder && recorder.state !== "inactive") recorder.stop();
      capture.stream.getTracks().forEach((track) => track.stop());
      throw error;
    }
    this.capture = capture;
    this.chunks = chunks;
    this.recorder = recorder;
  }
  stopRecording() {
    if (this.recordingStop) return this.recordingStop;
    if (!this.recorder) throw new Error("No audio recording is active.");
    this.recordingStop = new Promise((resolve) => {
      const recorder = this.recorder;
      recorder.onstop = () => {
        this.output.disconnect(this.capture);
        this.capture.stream.getTracks().forEach((track) => track.stop());
        this.recorder = null;
        this.recordingStop = null;
        resolve(new Blob(this.chunks, { type: recorder.mimeType }));
      };
      recorder.stop();
    });
    return this.recordingStop;
  }
}

// Developer audition uses the same score scheduler, rendered to a real audio buffer.
export async function renderScorePreview(mode = "night", bars = 16) {
  if (!modes[mode]) throw new Error("Unknown score chapter.");
  const c = new OfflineAudioContext(
    2,
    Math.ceil((bars * 4 * beat + 5) * 44100),
    44100,
  );
  const bus = c.createGain();
  bus.gain.value = 0.4;
  bus.connect(c.destination);
  for (let bar = 0; bar < bars; bar++)
    scoreBar(c, bus, bar, 0.1 + bar * 4 * beat, mode);
  return c.startRendering();
}
