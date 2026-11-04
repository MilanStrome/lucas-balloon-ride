// Calibration state machine: quiet -> big blow -> validate. Pure: time is passed in.
import { CALIBRATION, DETECTOR } from '../config';
import type { CalibrationValues, DetectorConfig } from './BreathDetector';
import { isCandidateFrame } from './BreathDetector';
import type { Features } from './features';

export type CalibrationPhase = 'idle' | 'quiet' | 'blow' | 'done' | 'failed';
export type FailReason = 'lowRange' | 'noBlow' | null;

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx] ?? 0;
}

/** Robust standard deviation (1.4826 × median absolute deviation). */
export function robustStd(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = median(values);
  return 1.4826 * median(values.map((v) => Math.abs(v - m)));
}

/** Noise floor = median + 2 standard deviations of the quiet-phase rmsDb. */
export function noiseFloorFrom(rmsDbs: readonly number[]): number {
  return median(rmsDbs) + 2 * robustStd(rmsDbs);
}

export class Calibration {
  phase: CalibrationPhase = 'idle';
  failures = 0;
  failReason: FailReason = null;
  result: CalibrationValues | null = null;
  private phaseStart = 0;
  private quiet: number[] = [];
  private blow: number[] = [];
  private floor: number = DETECTOR.defaultNoiseFloorDb;
  private readonly cfg: DetectorConfig;

  constructor(cfg: Partial<DetectorConfig> = {}) {
    this.cfg = { ...DETECTOR, ...cfg };
  }

  get offerFallback(): boolean {
    return this.failures >= CALIBRATION.maxFailuresBeforeFallback;
  }

  start(tMs: number): void {
    this.phase = 'quiet';
    this.phaseStart = tMs;
    this.quiet = [];
    this.blow = [];
    this.result = null;
    this.failReason = null;
  }

  /** 0..1 progress through the current phase. */
  progress(tMs: number): number {
    const len =
      this.phase === 'quiet' ? CALIBRATION.quietMs : this.phase === 'blow' ? CALIBRATION.blowMs : 1;
    if (this.phase !== 'quiet' && this.phase !== 'blow') return 1;
    return Math.max(0, Math.min(1, (tMs - this.phaseStart) / len));
  }

  feed(f: Features, tMs: number): CalibrationPhase {
    if (this.phase === 'quiet') {
      if (f.rmsDb > -119) this.quiet.push(f.rmsDb);
      if (tMs - this.phaseStart >= CALIBRATION.quietMs) {
        this.floor = this.quiet.length ? noiseFloorFrom(this.quiet) : DETECTOR.defaultNoiseFloorDb;
        this.phase = 'blow';
        this.phaseStart = tMs;
      }
    } else if (this.phase === 'blow') {
      if (isCandidateFrame(f, this.floor, this.cfg)) this.blow.push(f.rmsDb);
      if (tMs - this.phaseStart >= CALIBRATION.blowMs) this.finish();
    }
    return this.phase;
  }

  private finish(): void {
    if (this.blow.length < CALIBRATION.minCandidateFrames) {
      this.fail('noBlow');
      return;
    }
    const max = percentile(this.blow, 90);
    if (max - this.floor < CALIBRATION.minDynamicRangeDb) {
      this.fail('lowRange');
      return;
    }
    this.result = { noiseFloorDb: this.floor, maxBlowDb: max };
    this.phase = 'done';
  }

  private fail(reason: FailReason): void {
    this.failures++;
    this.failReason = reason;
    this.phase = 'failed';
  }

  /** Floor measured during the quiet phase (valid once the blow phase has started). */
  get measuredFloor(): number {
    return this.floor;
  }
}

/** Quick per-player floor re-check (Party Mode): collect for quickFloorMs then report. */
export class QuickFloor {
  private samples: number[] = [];
  private start = -1;
  done = false;
  floor: number = DETECTOR.defaultNoiseFloorDb;

  feed(f: Features, tMs: number): boolean {
    if (this.done) return true;
    if (this.start < 0) this.start = tMs;
    if (f.rmsDb > -119) this.samples.push(f.rmsDb);
    if (tMs - this.start >= CALIBRATION.quickFloorMs) {
      this.floor = this.samples.length
        ? noiseFloorFrom(this.samples)
        : DETECTOR.defaultNoiseFloorDb;
      this.done = true;
    }
    return this.done;
  }
}

/** Adjust a stored calibration to a freshly measured floor, keeping its dynamic range. */
export function rebaseCalibration(cal: CalibrationValues, newFloor: number): CalibrationValues {
  const range = cal.maxBlowDb - cal.noiseFloorDb;
  const floor = Math.max(cal.noiseFloorDb, newFloor);
  return {
    noiseFloorDb: floor,
    maxBlowDb: Math.max(
      cal.maxBlowDb,
      floor + Math.max(range * 0.8, CALIBRATION.minDynamicRangeDb),
    ),
  };
}

export function shouldSuggestRecalibration(
  stored: CalibrationValues,
  sessionFloor: number,
): boolean {
  return Math.abs(sessionFloor - stored.noiseFloorDb) > CALIBRATION.floorShiftSuggestDb;
}
