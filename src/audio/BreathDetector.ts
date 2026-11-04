// PURE: features + timestamp in -> breath state out. No Web Audio, no clocks.
import { DETECTOR } from '../config';
import type { Features } from './features';

export interface DetectorConfig {
  marginDb: number;
  flatnessMin: number;
  lowBandMin: number;
  tonalityMax: number;
  onsetMs: number;
  releaseMs: number;
  attackTauMs: number;
  releaseTauMs: number;
}

export interface BreathState {
  isBlowing: boolean;
  /** Smoothed 0..1. */
  intensity: number;
  /** Unsmoothed 0..1 mapping of the current frame. */
  rawIntensity: number;
  candidate: boolean;
  raw: Features;
}

export interface CalibrationValues {
  noiseFloorDb: number;
  maxBlowDb: number;
}

export function clampSensitivity(s: number): number {
  if (!Number.isFinite(s)) return 1;
  return Math.max(DETECTOR.sensitivityMin, Math.min(DETECTOR.sensitivityMax, s));
}

/** Is this one frame breath-like, given a noise floor? Shared with Calibration. */
export function isCandidateFrame(f: Features, noiseFloorDb: number, cfg: DetectorConfig): boolean {
  return (
    f.rmsDb > noiseFloorDb + cfg.marginDb &&
    f.flatness > cfg.flatnessMin &&
    f.lowBandRatio > cfg.lowBandMin &&
    f.tonality < cfg.tonalityMax
  );
}

/** Linear map of rmsDb from [floor+margin, max] to [0,1], scaled by sensitivity, clamped. */
export function mapIntensity(
  rmsDb: number,
  cal: CalibrationValues,
  marginDb: number,
  sensitivity: number,
): number {
  const lo = cal.noiseFloorDb + marginDb;
  const span = Math.max(1, cal.maxBlowDb - lo);
  const v = ((rmsDb - lo) / span) * clampSensitivity(sensitivity);
  return Math.max(0, Math.min(1, v));
}

export class BreathDetector {
  readonly cfg: DetectorConfig;
  private cal: CalibrationValues;
  private sensitivity = 1;
  private candidateSince = -1;
  private lastCandidateAt = -Infinity;
  private lastT = -1;
  readonly state: BreathState;

  constructor(cfg: Partial<DetectorConfig> = {}, cal?: CalibrationValues) {
    this.cfg = { ...DETECTOR, ...cfg };
    this.cal = cal ?? {
      noiseFloorDb: DETECTOR.defaultNoiseFloorDb,
      maxBlowDb: DETECTOR.defaultMaxBlowDb,
    };
    this.state = {
      isBlowing: false,
      intensity: 0,
      rawIntensity: 0,
      candidate: false,
      raw: { rmsDb: -120, lowBandRatio: 0, flatness: 0, tonality: 0, pitchHz: 0 },
    };
  }

  setCalibration(cal: CalibrationValues): void {
    this.cal = { ...cal };
  }

  getCalibration(): CalibrationValues {
    return { ...this.cal };
  }

  setSensitivity(s: number): void {
    this.sensitivity = clampSensitivity(s);
  }

  getSensitivity(): number {
    return this.sensitivity;
  }

  reset(): void {
    this.candidateSince = -1;
    this.lastCandidateAt = -Infinity;
    this.lastT = -1;
    this.state.isBlowing = false;
    this.state.intensity = 0;
    this.state.rawIntensity = 0;
    this.state.candidate = false;
  }

  /** Feed one frame. Returns the shared state object. */
  update(f: Features, tMs: number): BreathState {
    const s = this.state;
    const dt = this.lastT < 0 ? 0 : Math.max(0, tMs - this.lastT);
    this.lastT = tMs;
    const cand = isCandidateFrame(f, this.cal.noiseFloorDb, this.cfg);
    s.candidate = cand;
    if (cand) {
      if (this.candidateSince < 0) this.candidateSince = tMs;
      this.lastCandidateAt = tMs;
      if (!s.isBlowing && tMs - this.candidateSince >= this.cfg.onsetMs) s.isBlowing = true;
    } else {
      this.candidateSince = -1;
      if (s.isBlowing && tMs - this.lastCandidateAt >= this.cfg.releaseMs) s.isBlowing = false;
    }
    // While held across a short gap the intensity keeps its last mapped level.
    if (cand) s.rawIntensity = mapIntensity(f.rmsDb, this.cal, this.cfg.marginDb, this.sensitivity);
    const target = s.isBlowing ? s.rawIntensity : 0;
    const tau = target > s.intensity ? this.cfg.attackTauMs : this.cfg.releaseTauMs;
    const k = dt <= 0 ? 0 : 1 - Math.exp(-dt / tau);
    s.intensity += (target - s.intensity) * k;
    if (s.intensity < 1e-4) s.intensity = 0;
    s.intensity = Math.max(0, Math.min(1, s.intensity));
    s.raw.rmsDb = f.rmsDb;
    s.raw.lowBandRatio = f.lowBandRatio;
    s.raw.flatness = f.flatness;
    s.raw.tonality = f.tonality;
    s.raw.pitchHz = f.pitchHz;
    return s;
  }
}
