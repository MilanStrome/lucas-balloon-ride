// e2e-only test hooks (window.__lbr). Never bundled in production: main.ts imports this file
// only when import.meta.env.MODE === 'e2e', which Vite resolves at build time.
import type { App } from './App';
import { gameRef } from './ui/screens/Game';

export function installTestHooks(app: App): void {
  let script: { at: number; values: number[]; stepMs: number } | null = null;
  const tick = (now: number) => {
    if (script) {
      const i = Math.floor((now - script.at) / script.stepMs);
      if (i >= script.values.length) {
        script = null;
        app.input.testOverride = null;
      } else app.input.testOverride = script.values[i] ?? 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const state = {
    get screen() {
      return app.router.top?.id ?? null;
    },
    get game() {
      return gameRef.current?.() ?? null;
    },
    get isBlowing() {
      return app.input.isBlowing;
    },
    get intensity() {
      return app.input.intensity;
    },
    get features() {
      return { ...app.input.features };
    },
    get calibration() {
      return app.input.detector.getCalibration();
    },
    get micState() {
      return app.micState;
    },
    get audioState() {
      return app.mic.ctx?.state ?? 'none';
    },
    get resumeCalls() {
      return app.mic.resumeCalls;
    },
    get sampleRate() {
      return app.mic.sampleRate;
    },
    get save() {
      return JSON.parse(JSON.stringify(app.store.data)) as unknown;
    },
    get quality() {
      return app.quality;
    },
  };
  const control = {
    /** Force a fixed intensity (null = real input). */
    setIntensity(v: number | null) {
      script = null;
      app.input.testOverride = v;
    },
    /** Play a scripted intensity sequence, one value per `stepMs`. */
    script(values: number[], stepMs = 100) {
      script = { at: performance.now(), values, stepMs };
    },
    flush() {
      app.store.flush();
    },
    /** Simulate iOS suspending audio in the background. */
    async suspendAudio() {
      await app.mic.ctx?.suspend();
    },
  };
  Object.defineProperty(window, '__lbr', {
    value: Object.freeze({ state, control }),
    configurable: false,
    writable: false,
  });
}
