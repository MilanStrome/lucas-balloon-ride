import { describe, expect, it } from 'vitest';
import {
  FeatureExtractor,
  bandEnergy,
  binFrequency,
  binIndex,
  lowBandRatio,
  rms,
  spectralFlatness,
  toDb,
} from '../../src/audio/features';
import * as S from '../helpers/signals';

const RATES = [44100, 48000, 16000, 96000];

describe('features', () => {
  it('rms and dB of a known sine', () => {
    const x = new Float32Array(48000);
    for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / 48000);
    expect(rms(x)).toBeCloseTo(0.5 / Math.SQRT2, 3);
    expect(toDb(rms(x))).toBeCloseTo(20 * Math.log10(0.5 / Math.SQRT2), 2);
    expect(toDb(0)).toBe(-120);
    expect(rms(new Float32Array(0))).toBe(0);
  });

  it('rms dB of white noise matches its target level', () => {
    const x = S.whiteNoise(48000, 1, -20);
    expect(toDb(rms(x))).toBeCloseTo(-20, 1);
  });

  it('bin math uses the real sample rate', () => {
    for (const sr of RATES) {
      const f = binFrequency(binIndex(1000, sr, 2048), sr, 2048);
      expect(Math.abs(f - 1000)).toBeLessThanOrEqual(sr / 2048 / 2 + 1e-9);
      expect(binIndex(1e9, sr, 2048)).toBe(1023);
      expect(binIndex(-5, sr, 2048)).toBe(0);
    }
  });

  it('flatness ~1 for white noise (averaged spectrum) and ~0 for a pure tone', () => {
    for (const sr of [44100, 48000]) {
      const fx = new FeatureExtractor(2048);
      const x = S.whiteNoise(sr, 2, -20);
      const acc = new Float64Array(1024);
      let n = 0;
      for (const f of S.frames(x, 2048, 1024)) {
        const db = fx.spectrum(f);
        for (let k = 0; k < 1024; k++) acc[k]! += Math.pow(10, db[k]! / 10);
        n++;
      }
      const avgDb = Array.from(acc, (p) => 10 * Math.log10(p / n));
      expect(spectralFlatness(avgDb, sr)).toBeGreaterThan(0.9);
      // A single unaveraged frame of white noise is still clearly noise-like.
      expect(spectralFlatness(fx.spectrum(x.subarray(0, 2048)), sr)).toBeGreaterThan(0.45);
      const tone = S.sine(sr, 0.1, 1000, -20);
      expect(spectralFlatness(fx.spectrum(tone.subarray(0, 2048)), sr)).toBeLessThan(0.02);
    }
  });

  it('band ratios are correct at 44.1k and 48k', () => {
    for (const sr of [44100, 48000]) {
      const fx = new FeatureExtractor(2048);
      const low = fx.spectrum(S.sine(sr, 0.1, 200, -20).subarray(0, 2048));
      expect(lowBandRatio(low, sr)).toBeGreaterThan(0.99);
      const high = fx.spectrum(S.sine(sr, 0.1, 2000, -20).subarray(0, 2048));
      expect(lowBandRatio(high, sr)).toBeLessThan(0.01);
      // White noise: roughly (500-20)/(4000-20) of the band energy is low.
      const wn = fx.spectrum(S.whiteNoise(sr, 0.1, -20).subarray(0, 2048));
      expect(lowBandRatio(wn, sr)).toBeGreaterThan(0.05);
      expect(lowBandRatio(wn, sr)).toBeLessThan(0.25);
      expect(bandEnergy(wn, sr, 20, 4000)).toBeGreaterThan(0);
    }
  });

  it('lowBandRatio and flatness handle an empty spectrum', () => {
    const silentSpec = new Float32Array(1024).fill(-240);
    expect(lowBandRatio(silentSpec, 48000)).toBeGreaterThanOrEqual(0);
    expect(spectralFlatness(new Float32Array(0), 48000)).toBe(0);
  });

  it('tonality is high for hums/voice and low for noise, with correct pitch', () => {
    for (const sr of RATES) {
      const fx = new FeatureExtractor(2048);
      const hum = S.voiced(sr, 0.2, 160, 160, [500, 1500], -20);
      const [t1, p1] = fx.tonality(hum.subarray(1000, 3048), sr);
      expect(t1).toBeGreaterThan(0.85);
      expect(p1).toBeGreaterThan(150);
      expect(p1).toBeLessThan(170);
      const [t2] = fx.tonality(S.blow(sr, 0.2, -20).subarray(1000, 3048), sr);
      expect(t2).toBeLessThan(0.4);
    }
  });

  it('compute() returns a silent result for digital silence and rejects bad fft sizes', () => {
    const fx = new FeatureExtractor(2048);
    const f = fx.compute(new Float32Array(2048), 48000);
    expect(f.rmsDb).toBe(-120);
    expect(f.tonality).toBe(0);
    expect(() => new FeatureExtractor(1000)).toThrow();
  });

  it('compute() accepts an external analyser spectrum', () => {
    const fx = new FeatureExtractor(2048);
    const x = S.blow(48000, 0.1, -20).subarray(0, 2048);
    const spec = new FeatureExtractor(2048).spectrum(x);
    const a = { ...fx.compute(x, 48000, spec) };
    const b = { ...fx.compute(x, 48000) };
    expect(a.flatness).toBeCloseTo(b.flatness, 6);
  });
});
