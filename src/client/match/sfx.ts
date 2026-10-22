// Synthesised sound effects (Web Audio, no files): thunder, shield clang, the
// last-seconds tick, the hit thud, the win fanfare, plus a crack for Nemesis,
// a whoosh for quick power-ups and a short sting for a loss. The context is
// created and resumed on the first tap, as browsers require.

import type { SoundName } from "./cues";

type Ctx = AudioContext;

class Sfx {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  enabled = true;

  /** Call from a user gesture. Safe to call often. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC: typeof AudioContext | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.7;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  play(name: SoundName, intensity = 1): void {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || ctx.state !== "running") return;
    try {
      const t = ctx.currentTime + 0.005;
      switch (name) {
        case "thunder":
          return this.thunder(ctx, out, t);
        case "shield":
          return this.shield(ctx, out, t);
        case "crack":
          return this.crack(ctx, out, t);
        case "whoosh":
          return this.whoosh(ctx, out, t);
        case "tick":
          return this.tick(ctx, out, t, 1150, 0.18);
        case "tickLast":
          return this.tick(ctx, out, t, 1650, 0.24);
        case "thud":
          return this.thud(ctx, out, t, intensity);
        case "fanfare":
          return this.fanfare(ctx, out, t);
        case "sting":
          return this.sting(ctx, out, t);
      }
    } catch {
      // Audio is decoration; never let it break the match.
    }
  }

  private noiseBuffer(ctx: Ctx): AudioBuffer {
    if (this.noise) return this.noise;
    const len = Math.floor(ctx.sampleRate * 2.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Brown-ish noise: deeper than white noise, good for rumble.
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.04 * white) / 1.04;
      data[i] = last * 3.2 + white * 0.15;
    }
    this.noise = buf;
    return buf;
  }

  private env(ctx: Ctx, t: number, peak: number, attack: number, decay: number): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private noiseSource(ctx: Ctx, t: number, dur: number): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur);
    return src;
  }

  private thunder(ctx: Ctx, out: AudioNode, t: number): void {
    // The crack: bright noise burst.
    const crack = this.noiseSource(ctx, t, 0.25);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const cg = this.env(ctx, t, 0.9, 0.004, 0.2);
    crack.connect(hp).connect(cg).connect(out);
    // The rumble: low-passed noise sweeping down, with a second roll.
    const rumble = this.noiseSource(ctx, t, 2.3);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 1.8);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.exponentialRampToValueAtTime(1.2, t + 0.05);
    rg.gain.exponentialRampToValueAtTime(0.35, t + 0.5);
    rg.gain.exponentialRampToValueAtTime(0.7, t + 0.75);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    rumble.connect(lp).connect(rg).connect(out);
  }

  private shield(ctx: Ctx, out: AudioNode, t: number): void {
    // Inharmonic partials of struck bronze.
    for (const [f, a, d] of [
      [430, 0.35, 0.9],
      [1094, 0.22, 0.6],
      [1720, 0.14, 0.45],
      [2610, 0.08, 0.3],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(f * 1.02, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      const g = this.env(ctx, t, a, 0.003, d);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + d + 0.05);
    }
    const n = this.noiseSource(ctx, t, 0.06);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3200;
    n.connect(bp).connect(this.env(ctx, t, 0.5, 0.002, 0.05)).connect(out);
  }

  private crack(ctx: Ctx, out: AudioNode, t: number): void {
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.045;
      const n = this.noiseSource(ctx, at, 0.08);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2400 - i * 500;
      bp.Q.value = 2;
      n.connect(bp).connect(this.env(ctx, at, 0.7, 0.002, 0.07)).connect(out);
    }
  }

  private whoosh(ctx: Ctx, out: AudioNode, t: number): void {
    const n = this.noiseSource(ctx, t, 0.6);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(3000, t + 0.35);
    n.connect(bp).connect(this.env(ctx, t, 0.45, 0.12, 0.4)).connect(out);
  }

  private tick(ctx: Ctx, out: AudioNode, t: number, freq: number, peak: number): void {
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3000;
    o.connect(lp).connect(this.env(ctx, t, peak, 0.002, 0.045)).connect(out);
    o.start(t);
    o.stop(t + 0.06);
  }

  private thud(ctx: Ctx, out: AudioNode, t: number, intensity: number): void {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.28);
    o.connect(this.env(ctx, t, 0.6 + 0.6 * intensity, 0.005, 0.32)).connect(out);
    o.start(t);
    o.stop(t + 0.4);
    const n = this.noiseSource(ctx, t, 0.12);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600;
    n.connect(lp).connect(this.env(ctx, t, 0.5 * intensity + 0.2, 0.003, 0.1)).connect(out);
  }

  private fanfare(ctx: Ctx, out: AudioNode, t: number): void {
    // C5 E5 G5, then a held C6 chord.
    const notes: [number, number, number][] = [
      [523.25, 0, 0.14],
      [659.25, 0.13, 0.14],
      [783.99, 0.26, 0.14],
      [1046.5, 0.4, 0.9],
      [783.99, 0.4, 0.9],
      [659.25, 0.4, 0.9],
    ];
    for (const [f, at, d] of notes) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2600;
      o.connect(lp).connect(this.env(ctx, t + at, 0.12, 0.02, d)).connect(out);
      o.start(t + at);
      o.stop(t + at + d + 0.05);
    }
  }

  private sting(ctx: Ctx, out: AudioNode, t: number): void {
    for (const [f, at] of [
      [392, 0],
      [311.13, 0.22],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.connect(this.env(ctx, t + at, 0.22, 0.02, 0.5)).connect(out);
      o.start(t + at);
      o.stop(t + at + 0.6);
    }
  }
}

export const sfx = new Sfx();
