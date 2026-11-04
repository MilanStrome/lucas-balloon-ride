import { describe, expect, it } from 'vitest';
import { BreathDetector, clampSensitivity, mapIntensity } from '../../src/audio/BreathDetector';
import { DETECTOR } from '../../src/config';
import * as S from '../helpers/signals';
import { runDetector } from '../helpers/runDetector';

const SR = 48000;
const FRAME = 1000 / 60;
const blowing = (r: ReturnType<typeof runDetector>) => r.filter((x) => x.isBlowing).length;

describe('BreathDetector', () => {
  it('detects a blow within onsetMs + 1 frame', () => {
    for (const sr of [44100, 48000]) {
      const x = S.concat(S.silence(sr, 0.5), S.blow(sr, 1, -20));
      const r = runDetector(x, sr);
      // Onset is measured from the first frame whose window contains enough blow to be a candidate.
      const firstCand = r.find((f) => f.features.rmsDb > -54 && f.t > 500);
      const first = r.find((f) => f.isBlowing);
      expect(first).toBeDefined();
      expect(firstCand).toBeDefined();
      expect(first!.t - firstCand!.t).toBeLessThanOrEqual(DETECTOR.onsetMs + FRAME);
      expect(first!.t - 500).toBeLessThanOrEqual(DETECTOR.onsetMs + 2 * FRAME);
      expect(r.at(-1)!.intensity).toBeGreaterThan(0.3);
    }
  });

  it('does not detect speech-like harmonic tones', () => {
    expect(blowing(runDetector(S.speech(SR, 6, -22), SR))).toBe(0);
  });

  it('does not detect singing or music', () => {
    expect(blowing(runDetector(S.singing(SR, 4, -20), SR))).toBe(0);
    expect(blowing(runDetector(S.music(SR, 6, -20), SR))).toBe(0);
  });

  it('does not detect 20 ms impulses (claps)', () => {
    expect(blowing(runDetector(S.claps(SR, 4, -18), SR))).toBe(0);
  });

  it('does not detect silence or room noise', () => {
    expect(blowing(runDetector(S.silence(SR, 2), SR))).toBe(0);
    expect(blowing(runDetector(S.roomNoise(SR, 3, -64), SR))).toBe(0);
  });

  it('still detects a blow over music', () => {
    const x = S.mix(S.music(SR, 2, -36), S.blow(SR, 2, -18));
    expect(blowing(runDetector(x, SR))).toBeGreaterThan(80);
  });

  it('holds across a 60 ms gap without flicker', () => {
    const x = S.concat(S.blow(SR, 0.8, -20), S.silence(SR, 0.06), S.blow(SR, 0.8, -20, 4));
    const r = runDetector(x, SR);
    const firstOn = r.findIndex((f) => f.isBlowing);
    const lastOn = r.length - 1 - [...r].reverse().findIndex((f) => f.isBlowing);
    for (let i = firstOn; i <= lastOn; i++) expect(r[i]!.isBlowing).toBe(true);
  });

  it('releases after a long gap', () => {
    const x = S.concat(S.blow(SR, 0.8, -20), S.silence(SR, 0.6));
    const r = runDetector(x, SR);
    expect(r.at(-1)!.isBlowing).toBe(false);
    expect(r.at(-1)!.intensity).toBeLessThan(0.05);
  });

  it('intensity is monotonic with input level and clamped to 0..1', () => {
    let prev = -1;
    for (const db of [-44, -38, -32, -26, -20, -14, -8, -2]) {
      const r = runDetector(S.blow(SR, 1, db), SR);
      const v = r.at(-1)!.intensity;
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
    expect(prev).toBeGreaterThan(0.95);
  });

  it('sensitivity scales intensity and is clamped', () => {
    const cal = { noiseFloorDb: -60, maxBlowDb: -10 };
    const base = mapIntensity(-40, cal, 6, 1);
    expect(mapIntensity(-40, cal, 6, 2)).toBeCloseTo(Math.min(1, base * 2), 6);
    expect(mapIntensity(-40, cal, 6, 0.5)).toBeCloseTo(base * 0.5, 6);
    expect(clampSensitivity(5)).toBe(2);
    expect(clampSensitivity(0.1)).toBe(0.5);
    expect(clampSensitivity(Number.NaN)).toBe(1);
    const lo = runDetector(S.blow(SR, 1, -30), SR, undefined, 0.5).at(-1)!.intensity;
    const hi = runDetector(S.blow(SR, 1, -30), SR, undefined, 2).at(-1)!.intensity;
    expect(hi).toBeGreaterThan(lo * 2);
  });

  it('exposes calibration and resets cleanly', () => {
    const d = new BreathDetector();
    d.setCalibration({ noiseFloorDb: -50, maxBlowDb: -10 });
    expect(d.getCalibration().noiseFloorDb).toBe(-50);
    d.setSensitivity(1.5);
    expect(d.getSensitivity()).toBe(1.5);
    d.reset();
    expect(d.state.isBlowing).toBe(false);
    expect(d.state.intensity).toBe(0);
  });
});
