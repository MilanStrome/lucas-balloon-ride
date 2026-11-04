// Synthesized music loops (one per world + a calm track) with ducking while blowing.
import { AUDIO_OUT } from '../config';

export type TrackId = 'menu' | 'w1' | 'w2' | 'w3' | 'w4' | 'w5' | 'w6' | 'calm' | 'party';

interface Track {
  bpm: number;
  wave: OscillatorType;
  /** Melody in semitones from root; null = rest. 16 steps. */
  melody: (number | null)[];
  /** Bass roots per bar (4 bars). */
  bass: number[];
  root: number;
}

const TRACKS: Record<TrackId, Track> = {
  menu: {
    bpm: 100,
    wave: 'triangle',
    root: 60,
    melody: [0, null, 4, null, 7, null, 4, null, 9, null, 7, null, 4, null, 2, null],
    bass: [0, 5, 7, 5],
  },
  w1: {
    bpm: 108,
    wave: 'triangle',
    root: 62,
    melody: [0, 2, 4, null, 7, null, 4, 2, 0, null, 2, 4, 2, null, null, null],
    bass: [0, 5, 0, 7],
  },
  w2: {
    bpm: 112,
    wave: 'sine',
    root: 64,
    melody: [7, null, 9, 7, 4, null, 2, null, 4, null, 7, null, 9, null, 12, null],
    bass: [0, 9, 5, 7],
  },
  w3: {
    bpm: 104,
    wave: 'triangle',
    root: 57,
    melody: [0, 3, 7, null, 10, null, 7, 3, 5, null, 3, null, 0, null, null, null],
    bass: [0, 8, 3, 10],
  },
  w4: {
    bpm: 92,
    wave: 'sine',
    root: 60,
    melody: [4, null, null, 2, 0, null, null, null, 7, null, null, 5, 4, null, null, null],
    bass: [0, 9, 5, 7],
  },
  w5: {
    bpm: 84,
    wave: 'sine',
    root: 65,
    melody: [0, null, 7, null, 12, null, 7, null, 4, null, 7, null, 11, null, 7, null],
    bass: [0, 5, 9, 7],
  },
  w6: {
    bpm: 96,
    wave: 'square',
    root: 55,
    melody: [0, 7, 12, 7, 3, 10, 15, 10, 5, 12, 17, 12, 7, 14, 19, 14],
    bass: [0, 3, 5, 7],
  },
  calm: {
    bpm: 60,
    wave: 'sine',
    root: 57,
    melody: [0, null, null, null, 7, null, null, null, 4, null, null, null, 2, null, null, null],
    bass: [0, 5, 3, 7],
  },
  party: {
    bpm: 120,
    wave: 'square',
    root: 60,
    melody: [0, 4, 7, 12, 7, 4, 0, null, 2, 5, 9, 14, 9, 5, 2, null],
    bass: [0, 5, 7, 0],
  },
};

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private gain: GainNode | null = null;
  private track: Track | null = null;
  private trackId: TrackId | null = null;
  private nextStepTime = 0;
  private step = 0;
  private volume: number = AUDIO_OUT.defaultMusicVolume;
  private ducked = false;
  enabled = true;

  constructor(private readonly getCtx: () => AudioContext | null) {}

  setVolume(v: number): void {
    this.volume = v;
    this.applyGain();
  }

  private applyGain(): void {
    const ctx = this.getCtx();
    if (!this.gain || !ctx) return;
    const target = this.enabled ? this.volume * 0.25 * (this.ducked ? AUDIO_OUT.duckFactor : 1) : 0;
    this.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
  }

  /** Drop music by duckFactor while the child is blowing. */
  setDucked(d: boolean): void {
    if (d === this.ducked) return;
    this.ducked = d;
    this.applyGain();
  }

  play(id: TrackId | null): void {
    if (id === this.trackId) return;
    this.trackId = id;
    this.track = id ? TRACKS[id] : null;
    this.step = 0;
    const ctx = this.getCtx();
    this.nextStepTime = ctx ? ctx.currentTime + 0.1 : 0;
  }

  get current(): TrackId | null {
    return this.trackId;
  }

  /** Schedule notes slightly ahead. Called every animation frame. */
  tick(): void {
    const ctx = this.getCtx();
    if (!ctx || ctx.state !== 'running' || !this.track) return;
    if (!this.gain || this.gain.context !== ctx) {
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(ctx.destination);
      this.applyGain();
    }
    if (!this.enabled || this.volume <= 0) {
      this.nextStepTime = ctx.currentTime + 0.1;
      return;
    }
    const tr = this.track;
    const stepDur = 60 / tr.bpm / 2;
    if (this.nextStepTime < ctx.currentTime) this.nextStepTime = ctx.currentTime + 0.05;
    while (this.nextStepTime < ctx.currentTime + 0.25) {
      const s = this.step % 16;
      const note = tr.melody[s];
      const t = this.nextStepTime;
      if (note !== null && note !== undefined)
        this.note(ctx, midiHz(tr.root + note), t, stepDur * 1.6, tr.wave, 0.22);
      if (s % 4 === 0) {
        const bar = Math.floor(this.step / 16) % 4;
        this.note(ctx, midiHz(tr.root - 24 + (tr.bass[bar] ?? 0)), t, stepDur * 3.5, 'sine', 0.3);
      }
      this.step++;
      this.nextStepTime += stepDur;
    }
  }

  private note(
    ctx: AudioContext,
    f: number,
    t: number,
    dur: number,
    wave: OscillatorType,
    vol: number,
  ): void {
    if (!this.gain) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.gain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}
