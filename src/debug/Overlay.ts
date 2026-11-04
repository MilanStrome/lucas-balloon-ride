// ?debug=1 overlay: live detector graph, thresholds, fps, state, and mic log.
import type { App } from '../App';
import { DETECTOR } from '../config';
import { gameRef } from '../ui/screens/Game';

const N = 240;

export class DebugOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly db = new Float32Array(N);
  private readonly inten = new Float32Array(N);
  private readonly cand = new Uint8Array(N);
  private head = 0;
  private last = -1;
  private fps = 60;

  constructor(private readonly app: App) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'debug-overlay';
    this.canvas.width = 360;
    this.canvas.height = 220;
    this.ctx = this.canvas.getContext('2d');
    document.body.append(this.canvas);
  }

  update(now: number): void {
    if (this.last >= 0) {
      const dt = now - this.last;
      if (dt > 0) this.fps += (1000 / dt - this.fps) * 0.05;
    }
    this.last = now;
    const inp = this.app.input;
    this.db[this.head] = inp.features.rmsDb;
    this.inten[this.head] = inp.intensity;
    this.cand[this.head] = inp.detector.state.candidate ? 1 : 0;
    this.head = (this.head + 1) % N;
    const c = this.ctx;
    if (!c) return;
    const W = this.canvas.width;
    c.clearRect(0, 0, W, 220);
    const cal = inp.detector.getCalibration();
    const yDb = (d: number) => 120 - ((d + 100) / 100) * 120;
    c.strokeStyle = '#555';
    c.beginPath();
    c.moveTo(0, yDb(cal.noiseFloorDb + DETECTOR.marginDb));
    c.lineTo(W, yDb(cal.noiseFloorDb + DETECTOR.marginDb));
    c.moveTo(0, yDb(cal.maxBlowDb));
    c.lineTo(W, yDb(cal.maxBlowDb));
    c.stroke();
    for (let i = 0; i < N; i++) {
      const k = (this.head + i) % N;
      const x = (i / N) * W;
      if (this.cand[k]) {
        c.fillStyle = 'rgba(80,255,120,0.25)';
        c.fillRect(x, 0, W / N + 1, 120);
      }
      c.fillStyle = '#6cf';
      c.fillRect(x, yDb(this.db[k] ?? -100), 2, 2);
      c.fillStyle = '#fd3';
      c.fillRect(x, 120 - (this.inten[k] ?? 0) * 118, 2, 2);
    }
    const f = inp.features;
    const g = gameRef.current?.();
    c.fillStyle = '#fff';
    c.font = '11px monospace';
    const lines = [
      `fps ${this.fps.toFixed(0)}  sr ${this.app.mic.sampleRate}  src ${inp.source}  blow ${inp.isBlowing ? 'Y' : 'n'}  i ${inp.intensity.toFixed(2)}`,
      `rms ${f.rmsDb.toFixed(1)} low ${f.lowBandRatio.toFixed(2)} flat ${f.flatness.toFixed(2)} ton ${f.tonality.toFixed(2)} f0 ${f.pitchHz.toFixed(0)}`,
      `floor ${cal.noiseFloorDb.toFixed(1)} max ${cal.maxBlowDb.toFixed(1)} sens ${inp.detector.getSensitivity().toFixed(1)} q ${this.app.quality}`,
      g
        ? `y ${g.y.toFixed(0)} vy ${g.vy.toFixed(0)} hearts ${g.hearts} stars ${g.stars}/${g.starsTotal}`
        : `screen ${this.app.router.top?.id ?? '-'}`,
      ...this.app.mic.log.slice(-3),
    ];
    lines.forEach((l, i) => c.fillText(l.slice(0, 60), 4, 136 + i * 13));
  }
}
