// Deterministic synthetic test signals, shared by unit tests and `npm run gen:audio`.
import { mulberry32 } from '../../src/engine/Rng';

export type Signal = Float32Array;

export function dbToAmp(db: number): number {
  return Math.pow(10, db / 20);
}

function normalizeRms(x: Float32Array, targetDb: number, from = 0, to = x.length): void {
  let s = 0;
  for (let i = from; i < to; i++) s += (x[i] ?? 0) ** 2;
  const r = Math.sqrt(s / Math.max(1, to - from));
  if (r <= 0) return;
  const g = dbToAmp(targetDb) / r;
  for (let i = from; i < to; i++) x[i] = (x[i] ?? 0) * g;
}

export function silence(sr: number, sec: number, ditherDb = -96, seed = 1): Signal {
  const rng = mulberry32(seed);
  const n = Math.round(sr * sec);
  const x = new Float32Array(n);
  const a = dbToAmp(ditherDb);
  for (let i = 0; i < n; i++) x[i] = (rng() * 2 - 1) * a;
  return x;
}

export function whiteNoise(sr: number, sec: number, db: number, seed = 2): Signal {
  const rng = mulberry32(seed);
  const n = Math.round(sr * sec);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rng() * 2 - 1;
  normalizeRms(x, db);
  return x;
}

/** One-pole low-pass, applied `stages` times. */
export function lowPass(x: Signal, sr: number, cutoffHz: number, stages = 1): Signal {
  const a = Math.exp((-2 * Math.PI * cutoffHz) / sr);
  for (let s = 0; s < stages; s++) {
    let y = 0;
    for (let i = 0; i < x.length; i++) {
      y = (1 - a) * (x[i] ?? 0) + a * y;
      x[i] = y;
    }
  }
  return x;
}

export function highPass(x: Signal, sr: number, cutoffHz: number): Signal {
  const a = Math.exp((-2 * Math.PI * cutoffHz) / sr);
  let lp = 0;
  for (let i = 0; i < x.length; i++) {
    lp = (1 - a) * (x[i] ?? 0) + a * lp;
    x[i] = (x[i] ?? 0) - lp;
  }
  return x;
}

/** Breath on a mic: low-frequency turbulence with slow gusting. */
export function blow(sr: number, sec: number, db: number, seed = 3): Signal {
  const rng = mulberry32(seed);
  const n = Math.round(sr * sec);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rng() * 2 - 1;
  lowPass(x, sr, 380, 1);
  highPass(x, sr, 25);
  // Gusty amplitude modulation (±20%), plus 15 ms fade in/out.
  const fade = Math.round(sr * 0.015);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const gust = 1 + 0.2 * Math.sin(2 * Math.PI * 3.1 * t) * Math.sin(2 * Math.PI * 0.7 * t + 1);
    const env = Math.min(1, i / fade, (n - 1 - i) / fade);
    x[i] = (x[i] ?? 0) * gust * Math.max(0, env);
  }
  normalizeRms(x, db);
  return x;
}

export function sine(sr: number, sec: number, freq: number, db: number): Signal {
  const n = Math.round(sr * sec);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * freq * i) / sr);
  normalizeRms(x, db);
  return x;
}

function formantGain(f: number, formants: readonly number[]): number {
  let g = 0.02;
  for (const F of formants) {
    const bw = 90 + F * 0.08;
    g += 1 / (1 + ((f - F) / bw) ** 2);
  }
  return g;
}

/** Harmonic voiced tone with formants and a pitch glide (speech/singing-like). */
export function voiced(
  sr: number,
  sec: number,
  f0Start: number,
  f0End: number,
  formants: readonly number[],
  db: number,
  vibratoHz = 0,
): Signal {
  const n = Math.round(sr * sec);
  const x = new Float32Array(n);
  let phase = 0;
  const maxH = 40;
  const fade = Math.round(sr * 0.02);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const vib = vibratoHz > 0 ? 1 + 0.02 * Math.sin(2 * Math.PI * vibratoHz * t) : 1;
    const f0 = (f0Start + (f0End - f0Start) * (i / n)) * vib;
    phase += (2 * Math.PI * f0) / sr;
    let v = 0;
    for (let h = 1; h <= maxH; h++) {
      const fh = f0 * h;
      if (fh > 4500) break;
      v += (formantGain(fh, formants) / h) * Math.sin(h * phase);
    }
    const env = Math.min(1, i / fade, (n - 1 - i) / fade);
    x[i] = v * Math.max(0, env);
  }
  normalizeRms(x, db);
  return x;
}

export function concat(...parts: Signal[]): Signal {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function mix(a: Signal, b: Signal): Signal {
  const n = Math.max(a.length, b.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

/** Speech-like: syllables of formant-shaped voice, short fricatives and breathy "h" onsets. */
export function speech(sr: number, sec: number, db: number, seed = 5): Signal {
  const rng = mulberry32(seed);
  const vowels = [
    [700, 1220, 2600],
    [300, 2300, 3000],
    [500, 1000, 2500],
    [400, 1900, 2550],
    [600, 1700, 2600],
  ];
  const parts: Signal[] = [];
  let total = 0;
  while (total < sec) {
    const kind = rng();
    if (kind < 0.15) {
      // fricative "s"/"sh": high-passed noise, short
      const len = 0.06 + rng() * 0.05;
      parts.push(highPass(whiteNoise(sr, len, db - 8, Math.floor(rng() * 1e9)), sr, 2500));
      total += len;
    } else if (kind < 0.25) {
      // breathy "h" (laugh onset), short
      const len = 0.05;
      parts.push(lowPass(whiteNoise(sr, len, db - 6, Math.floor(rng() * 1e9)), sr, 1500));
      total += len;
    }
    const len = 0.14 + rng() * 0.16;
    const f0 = 110 + rng() * 110;
    const v = vowels[Math.floor(rng() * vowels.length)] ?? [500, 1500, 2500];
    parts.push(voiced(sr, len, f0, f0 * (0.85 + rng() * 0.3), v, db));
    const gap = 0.04 + rng() * 0.08;
    parts.push(silence(sr, gap, -80, Math.floor(rng() * 1e9)));
    total += len + gap;
  }
  return concat(...parts).subarray(0, Math.round(sr * sec));
}

export function singing(sr: number, sec: number, db: number): Signal {
  const notes = [262, 294, 330, 349, 392, 349, 330, 294];
  const parts: Signal[] = [];
  let total = 0;
  let i = 0;
  while (total < sec) {
    const f = notes[i++ % notes.length] ?? 262;
    parts.push(voiced(sr, 0.6, f, f, [650, 1100, 2700], db, 5.5));
    total += 0.6;
  }
  return concat(...parts).subarray(0, Math.round(sr * sec));
}

/** 20 ms clap impulses every `everySec`. */
export function claps(sr: number, sec: number, db: number, everySec = 0.45, seed = 7): Signal {
  const rng = mulberry32(seed);
  const n = Math.round(sr * sec);
  const x = new Float32Array(n);
  const len = Math.round(sr * 0.02);
  const amp = dbToAmp(db) * 3;
  for (let start = Math.round(sr * 0.1); start + len < n; start += Math.round(sr * everySec)) {
    for (let j = 0; j < len; j++)
      x[start + j] = (rng() * 2 - 1) * amp * Math.exp(-j / (sr * 0.004));
  }
  for (let i = 0; i < n; i++) if (x[i] === 0) x[i] = (rng() * 2 - 1) * dbToAmp(-90);
  return x;
}

/** A short synthesized music loop: chords, melody, bass, soft kick and hats. */
export function music(sr: number, sec: number, db: number, seed = 9): Signal {
  const rng = mulberry32(seed);
  const n = Math.round(sr * sec);
  const x = new Float32Array(n);
  const bpm = 110;
  const beat = 60 / bpm;
  const chords = [
    [262, 330, 392],
    [220, 262, 330],
    [175, 220, 262],
    [196, 247, 294],
  ];
  const melody = [523, 587, 659, 587, 523, 494, 440, 494];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const bar = Math.floor(t / (beat * 4)) % chords.length;
    const chord = chords[bar] ?? [262, 330, 392];
    let v = 0;
    for (const f of chord)
      v += 0.2 * Math.sin(2 * Math.PI * f * t) + 0.06 * Math.sin(4 * Math.PI * f * t);
    const step = Math.floor(t / (beat / 2));
    const mf = melody[step % melody.length] ?? 523;
    const inStep = t - step * (beat / 2);
    v += 0.25 * Math.exp(-inStep * 4) * Math.sin(2 * Math.PI * mf * t);
    const bass = (chord[0] ?? 262) / 2;
    v += 0.3 * Math.sin(2 * Math.PI * bass * t);
    const inBeat = t % beat;
    if (inBeat < 0.08)
      v +=
        0.5 *
        Math.exp(-inBeat * 40) *
        Math.sin(2 * Math.PI * (60 + 80 * Math.exp(-inBeat * 30)) * inBeat);
    const inHalf = (t + beat / 4) % (beat / 2);
    if (inHalf < 0.03) v += 0.08 * (rng() * 2 - 1) * Math.exp(-inHalf * 150);
    x[i] = v;
  }
  normalizeRms(x, db);
  return x;
}

export function roomNoise(sr: number, sec: number, db: number, seed = 11): Signal {
  const x = whiteNoise(sr, sec, 0, seed);
  lowPass(x, sr, 1200, 1);
  normalizeRms(x, db);
  return x;
}

/** Split a signal into consecutive analysis frames of `size` samples, stepping `hop`. */
export function* frames(x: Signal, size: number, hop: number): Generator<Float32Array> {
  for (let s = 0; s + size <= x.length; s += hop) yield x.subarray(s, s + size);
}
