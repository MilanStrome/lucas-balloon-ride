import { describe, expect, it } from 'vitest';
import {
  Calibration,
  QuickFloor,
  median,
  noiseFloorFrom,
  percentile,
  rebaseCalibration,
  robustStd,
  shouldSuggestRecalibration,
} from '../../src/audio/Calibration';
import { CALIBRATION } from '../../src/config';
import * as S from '../helpers/signals';
import { analyze } from '../helpers/runDetector';

const SR = 48000;

function calibrate(c: Calibration, x: Float32Array, t0 = 0) {
  c.start(t0);
  for (const { t, f } of analyze(x, SR)) {
    c.feed(f, t0 + t);
    if (c.phase === 'done' || c.phase === 'failed') break;
  }
  return c;
}

describe('Calibration', () => {
  it('stat helpers', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([], 90)).toBe(0);
    expect(robustStd([5])).toBe(0);
    expect(robustStd([1, 2, 3, 4, 5])).toBeCloseTo(1.4826, 3);
    expect(noiseFloorFrom([-50, -50, -50])).toBe(-50);
  });

  it('finds the correct floor and max', () => {
    const x = S.concat(S.roomNoise(SR, 1.6, -55), S.blow(SR, 2.2, -16));
    const c = calibrate(new Calibration(), x);
    expect(c.phase).toBe('done');
    expect(c.result!.noiseFloorDb).toBeGreaterThan(-57);
    expect(c.result!.noiseFloorDb).toBeLessThan(-52);
    expect(c.result!.maxBlowDb).toBeGreaterThan(-18);
    expect(c.result!.maxBlowDb).toBeLessThan(-12);
    expect(c.progress(1e9)).toBe(1);
  });

  it('rejects a low dynamic range (loud room) and counts failures', () => {
    const x = S.concat(S.roomNoise(SR, 1.6, -30), S.blow(SR, 2.2, -28));
    const c = calibrate(new Calibration(), x);
    expect(c.phase).toBe('failed');
    expect(['lowRange', 'noBlow']).toContain(c.failReason);
    expect(c.failures).toBe(1);
  });

  it('fails when nobody blows, offers fallback after 3 failures, and retries cleanly', () => {
    const c = new Calibration();
    const quiet = S.roomNoise(SR, 4, -55);
    for (let i = 0; i < CALIBRATION.maxFailuresBeforeFallback; i++) {
      expect(c.offerFallback).toBe(false);
      calibrate(c, quiet, i * 10000);
      expect(c.phase).toBe('failed');
      expect(c.failReason).toBe('noBlow');
    }
    expect(c.offerFallback).toBe(true);
    calibrate(c, S.concat(S.roomNoise(SR, 1.6, -55), S.blow(SR, 2.2, -16)), 50000);
    expect(c.phase).toBe('done');
  });

  it('reports phase progress', () => {
    const c = new Calibration();
    c.start(0);
    expect(c.progress(750)).toBeCloseTo(0.5, 2);
    expect(c.measuredFloor).toBeLessThan(0);
  });

  it('quick floor, rebase and recalibration suggestion', () => {
    const q = new QuickFloor();
    let done = false;
    for (const { t, f } of analyze(S.roomNoise(SR, 1.2, -50), SR)) done = q.feed(f, t);
    expect(done).toBe(true);
    expect(q.floor).toBeGreaterThan(-53);
    expect(q.feed(analyze(S.silence(SR, 0.1), SR)[0]!.f, 1e6)).toBe(true);
    const cal = { noiseFloorDb: -60, maxBlowDb: -20 };
    const r = rebaseCalibration(cal, -45);
    expect(r.noiseFloorDb).toBe(-45);
    expect(r.maxBlowDb - r.noiseFloorDb).toBeGreaterThanOrEqual(CALIBRATION.minDynamicRangeDb);
    expect(rebaseCalibration(cal, -70).noiseFloorDb).toBe(-60);
    expect(shouldSuggestRecalibration(cal, -45)).toBe(true);
    expect(shouldSuggestRecalibration(cal, -55)).toBe(false);
  });
});
