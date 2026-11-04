import { describe, expect, it } from 'vitest';
import { HumDetector } from '../../src/audio/HumDetector';
import * as S from '../helpers/signals';
import { analyze } from '../helpers/runDetector';

const SR = 48000;

function run(x: Float32Array) {
  const h = new HumDetector({ noiseFloorDb: -60, maxBlowDb: -14 });
  return analyze(x, SR).map(({ t, f }) => ({ t, ...h.update(f, t) }));
}

describe('HumDetector', () => {
  it('accepts a steady 80-400 Hz hum after 150 ms', () => {
    const r = run(S.concat(S.silence(SR, 0.3), S.voiced(SR, 1, 180, 180, [500, 1000], -22)));
    const first = r.find((x) => x.isHumming);
    expect(first).toBeDefined();
    expect(first!.t - 300).toBeGreaterThanOrEqual(150);
    expect(r.at(-1)!.intensity).toBeGreaterThan(0.2);
  });

  it('rejects breath, silence, and a hum that is too short', () => {
    expect(run(S.blow(SR, 1, -20)).some((x) => x.isHumming)).toBe(false);
    expect(run(S.silence(SR, 1)).some((x) => x.isHumming)).toBe(false);
    const short = S.concat(S.voiced(SR, 0.1, 180, 180, [500], -22), S.silence(SR, 0.5));
    expect(run(short).some((x) => x.isHumming)).toBe(false);
  });

  it('releases after the hum stops and resets', () => {
    const r = run(S.concat(S.voiced(SR, 0.8, 200, 200, [600], -22), S.silence(SR, 0.5)));
    expect(r.at(-1)!.isHumming).toBe(false);
    const h = new HumDetector();
    h.setCalibration({ noiseFloorDb: -50, maxBlowDb: -10 });
    h.setSensitivity(1.2);
    h.reset();
    expect(h.state.intensity).toBe(0);
  });
});
