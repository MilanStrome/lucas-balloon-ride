import { BreathDetector, type CalibrationValues } from '../../src/audio/BreathDetector';
import { FeatureExtractor, type Features } from '../../src/audio/features';

export interface FrameResult {
  t: number;
  isBlowing: boolean;
  intensity: number;
  features: Features;
}

/** Run frames at 60 fps (trailing 2048-sample window) through a feature extractor. */
export function analyze(x: Float32Array, sr: number, fps = 60): { t: number; f: Features }[] {
  const fx = new FeatureExtractor(2048);
  const hop = sr / fps;
  const out: { t: number; f: Features }[] = [];
  const win = new Float32Array(2048);
  for (let k = 1; ; k++) {
    const end = Math.round(k * hop);
    if (end > x.length) break;
    const start = Math.max(0, end - 2048);
    win.fill(0);
    win.set(x.subarray(start, end), 2048 - (end - start));
    out.push({ t: (end / sr) * 1000, f: { ...fx.compute(win, sr) } });
  }
  return out;
}

export function runDetector(
  x: Float32Array,
  sr: number,
  cal: CalibrationValues = { noiseFloorDb: -60, maxBlowDb: -14 },
  sensitivity = 1,
): FrameResult[] {
  const d = new BreathDetector({}, cal);
  d.setSensitivity(sensitivity);
  return analyze(x, sr).map(({ t, f }) => {
    const s = d.update(f, t);
    return { t, isBlowing: s.isBlowing, intensity: s.intensity, features: f };
  });
}
