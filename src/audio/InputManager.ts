// Merges breath (primary), hum, tap/hold, debug keys and test overrides into one intensity.
import { BreathDetector, type CalibrationValues } from './BreathDetector';
import { FeatureExtractor, type Features } from './features';
import { HumDetector } from './HumDetector';
import type { MicInput } from './MicInput';

export type InputSource = 'none' | 'breath' | 'hum' | 'tap' | 'debug' | 'test';

export const TAP_INTENSITY = 0.7;

export class InputManager {
  readonly fx = new FeatureExtractor(2048);
  readonly detector = new BreathDetector();
  readonly hum = new HumDetector();
  intensity = 0;
  isBlowing = false;
  source: InputSource = 'none';
  features: Features = this.fx.out;
  humEnabled = false;
  tapEnabled = false;
  tapHeld = false;
  debugLevel: number | null = null;
  testOverride: number | null = null;
  /** Rising edge of isBlowing this frame (for puff-to-hop). */
  onsetThisFrame = false;
  private wasBlowing = false;
  /** Listeners for each processed frame (calibration, meters, debug overlay). */
  readonly frameListeners = new Set<(f: Features, now: number) => void>();

  constructor(private readonly mic: MicInput) {}

  setCalibration(cal: CalibrationValues): void {
    this.detector.setCalibration(cal);
    this.hum.setCalibration(cal);
  }

  setSensitivity(s: number): void {
    this.detector.setSensitivity(s);
    this.hum.setSensitivity(s);
  }

  update(nowMs: number): void {
    let intensity = 0;
    let blowing = false;
    let source: InputSource = 'none';
    if (this.mic.read()) {
      const f = this.fx.compute(this.mic.time, this.mic.sampleRate, this.mic.freq);
      this.features = f;
      const b = this.detector.update(f, nowMs);
      if (b.isBlowing) {
        intensity = b.intensity;
        blowing = true;
        source = 'breath';
      } else if (b.intensity > 0) {
        intensity = b.intensity;
      }
      if (this.humEnabled) {
        const hs = this.hum.update(f, nowMs);
        if (hs.isHumming && hs.intensity > intensity) {
          intensity = hs.intensity;
          blowing = true;
          source = 'hum';
        }
      }
      for (const l of this.frameListeners) l(f, nowMs);
    }
    if (this.tapEnabled && this.tapHeld && TAP_INTENSITY > intensity) {
      intensity = TAP_INTENSITY;
      blowing = true;
      source = 'tap';
    }
    if (this.debugLevel !== null) {
      intensity = this.debugLevel;
      blowing = this.debugLevel > 0;
      source = 'debug';
    }
    if (this.testOverride !== null) {
      intensity = this.testOverride;
      blowing = this.testOverride > 0;
      source = 'test';
    }
    this.intensity = Math.max(0, Math.min(1, intensity));
    this.isBlowing = blowing;
    this.source = source;
    this.onsetThisFrame = blowing && !this.wasBlowing;
    this.wasBlowing = blowing;
  }

  reset(): void {
    this.detector.reset();
    this.hum.reset();
    this.intensity = 0;
    this.isBlowing = false;
    this.wasBlowing = false;
  }
}
