// PURE: steady tonal hum (80–400 Hz) detection, the accessibility fallback to breath.
import { DETECTOR, HUM } from '../config';
import type { CalibrationValues } from './BreathDetector';
import { mapIntensity } from './BreathDetector';
import type { Features } from './features';

export interface HumState {
  isHumming: boolean;
  intensity: number;
}

export class HumDetector {
  private cal: CalibrationValues;
  private since = -1;
  private lastHit = -Infinity;
  private sensitivity = 1;
  readonly state: HumState = { isHumming: false, intensity: 0 };

  constructor(cal?: CalibrationValues) {
    this.cal = cal ?? {
      noiseFloorDb: DETECTOR.defaultNoiseFloorDb,
      maxBlowDb: DETECTOR.defaultMaxBlowDb,
    };
  }

  setCalibration(cal: CalibrationValues): void {
    this.cal = { ...cal };
  }

  setSensitivity(s: number): void {
    this.sensitivity = s;
  }

  reset(): void {
    this.since = -1;
    this.lastHit = -Infinity;
    this.state.isHumming = false;
    this.state.intensity = 0;
  }

  isHumFrame(f: Features): boolean {
    return (
      f.rmsDb > this.cal.noiseFloorDb + DETECTOR.marginDb &&
      f.tonality >= HUM.tonalityMin &&
      f.pitchHz >= HUM.pitchMinHz &&
      f.pitchHz <= HUM.pitchMaxHz
    );
  }

  update(f: Features, tMs: number): HumState {
    const s = this.state;
    if (this.isHumFrame(f)) {
      if (this.since < 0) this.since = tMs;
      this.lastHit = tMs;
      if (tMs - this.since >= HUM.sustainMs) s.isHumming = true;
      if (s.isHumming)
        s.intensity = mapIntensity(f.rmsDb, this.cal, DETECTOR.marginDb, this.sensitivity);
    } else {
      this.since = -1;
      if (s.isHumming && tMs - this.lastHit >= HUM.releaseMs) s.isHumming = false;
    }
    if (!s.isHumming) s.intensity = 0;
    return s;
  }
}
