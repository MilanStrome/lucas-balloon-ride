// PURE: per-frame audio features. Plain arrays in, plain numbers out.

export interface Features {
  rmsDb: number;
  lowBandRatio: number;
  flatness: number;
  tonality: number;
  pitchHz: number;
}

export const SILENT_DB = -120;

export function rms(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return samples.length > 0 ? Math.sqrt(sum / samples.length) : 0;
}

export function toDb(amplitude: number): number {
  return amplitude > 1e-6 ? 20 * Math.log10(amplitude) : SILENT_DB;
}

/** Frequency of bin k for an FFT of `fftSize` points. Never assumes a sample rate. */
export function binFrequency(k: number, sampleRate: number, fftSize: number): number {
  return (k * sampleRate) / fftSize;
}

/** Nearest bin index for `freq`, clamped to the valid half-spectrum. */
export function binIndex(freq: number, sampleRate: number, fftSize: number): number {
  const k = Math.round((freq * fftSize) / sampleRate);
  return Math.max(0, Math.min(fftSize / 2 - 1, k));
}

/** Sum of linear power over [loHz, hiHz] from a dB spectrum (AnalyserNode layout). */
export function bandEnergy(
  freqDb: ArrayLike<number>,
  sampleRate: number,
  loHz: number,
  hiHz: number,
): number {
  const fftSize = freqDb.length * 2;
  const lo = binIndex(loHz, sampleRate, fftSize);
  const hi = binIndex(hiHz, sampleRate, fftSize);
  let e = 0;
  for (let k = lo; k <= hi; k++) {
    const db = freqDb[k] ?? SILENT_DB;
    e += Math.pow(10, db / 10);
  }
  return e;
}

export function lowBandRatio(freqDb: ArrayLike<number>, sampleRate: number): number {
  const total = bandEnergy(freqDb, sampleRate, 20, 4000);
  if (total <= 0) return 0;
  return bandEnergy(freqDb, sampleRate, 20, 500) / total;
}

/** Geometric mean ÷ arithmetic mean of power over [loHz, hiHz]. 1 = flat noise, 0 = pure tone. */
export function spectralFlatness(
  freqDb: ArrayLike<number>,
  sampleRate: number,
  loHz = 100,
  hiHz = 4000,
): number {
  if (freqDb.length === 0) return 0;
  const fftSize = freqDb.length * 2;
  const lo = binIndex(loHz, sampleRate, fftSize);
  const hi = binIndex(hiHz, sampleRate, fftSize);
  let logSum = 0;
  let sum = 0;
  let n = 0;
  for (let k = lo; k <= hi; k++) {
    const db = Math.max(freqDb[k] ?? SILENT_DB, SILENT_DB);
    const p = Math.pow(10, db / 10);
    logSum += (db / 10) * Math.LN10;
    sum += p;
    n++;
  }
  if (n === 0 || sum <= 0) return 0;
  const geo = Math.exp(logSum / n);
  const arith = sum / n;
  return Math.min(1, geo / arith);
}

/**
 * Reusable scratch space so per-frame feature extraction allocates nothing.
 * Holds the FFT and autocorrelation buffers for one fftSize.
 */
export class FeatureExtractor {
  readonly fftSize: number;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly window: Float64Array;
  private readonly down: Float64Array;
  private readonly energy: Float64Array;
  readonly freqDb: Float32Array;
  readonly out: Features = {
    rmsDb: SILENT_DB,
    lowBandRatio: 0,
    flatness: 0,
    tonality: 0,
    pitchHz: 0,
  };

  constructor(fftSize = 2048) {
    if ((fftSize & (fftSize - 1)) !== 0) throw new Error('fftSize must be a power of two');
    this.fftSize = fftSize;
    this.re = new Float64Array(fftSize);
    this.im = new Float64Array(fftSize);
    this.window = new Float64Array(fftSize);
    // Blackman window, the same one AnalyserNode uses.
    for (let i = 0; i < fftSize; i++) {
      const a = (2 * Math.PI * i) / fftSize;
      this.window[i] = 0.42 - 0.5 * Math.cos(a) + 0.08 * Math.cos(2 * a);
    }
    this.down = new Float64Array(fftSize / 2);
    this.energy = new Float64Array(fftSize / 2 + 1);
    this.freqDb = new Float32Array(fftSize / 2);
  }

  /** dB magnitude spectrum, scaled like AnalyserNode.getFloatFrequencyData. Writes `this.freqDb`. */
  spectrum(samples: ArrayLike<number>): Float32Array {
    const n = this.fftSize;
    const re = this.re;
    const im = this.im;
    for (let i = 0; i < n; i++) {
      re[i] = (samples[i] ?? 0) * (this.window[i] ?? 0);
      im[i] = 0;
    }
    fftInPlace(re, im);
    for (let k = 0; k < n / 2; k++) {
      const mag = Math.hypot(re[k] ?? 0, im[k] ?? 0) / n;
      this.freqDb[k] = mag > 1e-12 ? 20 * Math.log10(mag) : -240;
    }
    return this.freqDb;
  }

  /**
   * Peak normalized autocorrelation over lags matching 80–400 Hz, on a 2× decimated
   * signal (keeps it cheap enough for low-end phones). Returns [tonality, pitchHz].
   */
  tonality(samples: ArrayLike<number>, sampleRate: number): [number, number] {
    const m = Math.floor(Math.min(samples.length, this.fftSize) / 2);
    const x = this.down;
    let mean = 0;
    for (let i = 0; i < m; i++) {
      const v = ((samples[2 * i] ?? 0) + (samples[2 * i + 1] ?? 0)) * 0.5;
      x[i] = v;
      mean += v;
    }
    mean /= m || 1;
    const e = this.energy;
    e[0] = 0;
    for (let i = 0; i < m; i++) {
      const v = (x[i] ?? 0) - mean;
      x[i] = v;
      e[i + 1] = (e[i] ?? 0) + v * v;
    }
    const sr = sampleRate / 2;
    const minLag = Math.max(1, Math.floor(sr / 400));
    const maxLag = Math.min(m - 16, Math.ceil(sr / 80));
    let best = 0;
    let bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let num = 0;
      const len = m - lag;
      for (let i = 0; i < len; i++) num += (x[i] ?? 0) * (x[i + lag] ?? 0);
      const e1 = e[len] ?? 0;
      const e2 = (e[m] ?? 0) - (e[lag] ?? 0);
      const den = Math.sqrt(e1 * e2);
      if (den <= 1e-12) continue;
      const r = num / den;
      if (r > best) {
        best = r;
        bestLag = lag;
      }
    }
    return [best, bestLag > 0 ? sr / bestLag : 0];
  }

  /**
   * All features for one frame. `freqDb` may come from an AnalyserNode; if omitted it
   * is computed from `samples`. Returns the shared `out` object (no allocation).
   */
  compute(samples: ArrayLike<number>, sampleRate: number, freqDb?: ArrayLike<number>): Features {
    const spec = freqDb ?? this.spectrum(samples);
    const out = this.out;
    out.rmsDb = toDb(rms(samples));
    if (out.rmsDb <= SILENT_DB) {
      out.lowBandRatio = 0;
      out.flatness = 0;
      out.tonality = 0;
      out.pitchHz = 0;
      return out;
    }
    out.lowBandRatio = lowBandRatio(spec, sampleRate);
    out.flatness = spectralFlatness(spec, sampleRate);
    const [t, p] = this.tonality(samples, sampleRate);
    out.tonality = t;
    out.pitchHz = p;
    return out;
  }
}

/** Iterative radix-2 Cooley–Tukey FFT. */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] ?? 0;
      re[i] = re[j] ?? 0;
      re[j] = tr;
      const ti = im[i] ?? 0;
      im[i] = im[j] ?? 0;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j;
        const b = a + len / 2;
        const br = re[b] ?? 0;
        const bi = im[b] ?? 0;
        const xr = br * cr - bi * ci;
        const xi = br * ci + bi * cr;
        re[b] = (re[a] ?? 0) - xr;
        im[b] = (im[a] ?? 0) - xi;
        re[a] = (re[a] ?? 0) + xr;
        im[a] = (im[a] ?? 0) + xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}
