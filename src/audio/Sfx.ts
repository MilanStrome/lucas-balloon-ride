// Synthesized sound effects (no files, no licensing). Short and tonal so the detector rejects them.

export type SfxName =
  'chime' | 'pop' | 'whoosh' | 'bounce' | 'cheer' | 'hit' | 'click' | 'coin' | 'blowout';

export class Sfx {
  private gain: GainNode | null = null;
  private volume = 0.8;
  private noise: AudioBuffer | null = null;
  private chimeStep = 0;

  constructor(private readonly getCtx: () => AudioContext | null) {}

  setVolume(v: number): void {
    this.volume = v;
    if (this.gain) this.gain.gain.value = v;
  }

  private out(): { ctx: AudioContext; g: GainNode } | null {
    const ctx = this.getCtx();
    if (!ctx || ctx.state !== 'running' || this.volume <= 0) return null;
    if (!this.gain || this.gain.context !== ctx) {
      this.gain = ctx.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(ctx.destination);
    }
    return { ctx, g: this.gain };
  }

  private tone(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    start: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    endFreq?: number,
  ): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(dest);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  private noiseBurst(
    ctx: AudioContext,
    dest: AudioNode,
    start: number,
    dur: number,
    vol: number,
    hp: number,
  ): void {
    if (!this.noise || this.noise.sampleRate !== ctx.sampleRate) {
      const len = Math.floor(ctx.sampleRate * 0.5);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < len; i++) {
        s = (s * 1103515245 + 12345) >>> 0;
        d[i] = (s / 4294967296) * 2 - 1;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  play(name: SfxName): void {
    const o = this.out();
    if (!o) return;
    const { ctx, g } = o;
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case 'chime': {
        // Rising chime: each star in a row climbs the scale a little.
        const scale = [784, 880, 988, 1175, 1319, 1568];
        const f = scale[this.chimeStep++ % scale.length] ?? 880;
        this.tone(ctx, g, f, t, 0.25, 'sine', 0.3);
        this.tone(ctx, g, f * 1.5, t + 0.05, 0.2, 'sine', 0.15);
        break;
      }
      case 'coin':
        this.tone(ctx, g, 988, t, 0.08, 'square', 0.12);
        this.tone(ctx, g, 1319, t + 0.07, 0.18, 'square', 0.12);
        break;
      case 'pop':
        this.tone(ctx, g, 600, t, 0.12, 'sine', 0.4, 120);
        break;
      case 'whoosh':
        this.noiseBurst(ctx, g, t, 0.18, 0.12, 2500);
        break;
      case 'bounce':
        this.tone(ctx, g, 220, t, 0.25, 'triangle', 0.35, 520);
        break;
      case 'hit':
        this.tone(ctx, g, 330, t, 0.3, 'triangle', 0.3, 160);
        break;
      case 'cheer':
        [523, 659, 784, 1047].forEach((f, i) =>
          this.tone(ctx, g, f, t + i * 0.09, 0.35, 'triangle', 0.25),
        );
        break;
      case 'click':
        this.tone(ctx, g, 1200, t, 0.04, 'sine', 0.15);
        break;
      case 'blowout':
        this.tone(ctx, g, 900, t, 0.2, 'sine', 0.2, 400);
        break;
    }
  }

  resetChime(): void {
    this.chimeStep = 0;
  }
}
