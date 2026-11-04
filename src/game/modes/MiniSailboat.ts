// Sailboat Race: intensity pushes the boat right across gentle waves; drag slows it.
import { MINI } from '../../config';
import type { MiniGame } from './minis';

export const DOCK_X = 1000;

export class MiniSailboat implements MiniGame {
  readonly kind = 'sailboat' as const;
  x = 0;
  v = 0;
  timeLeft: number = MINI.boatTimeSec;
  won = false;
  private endT = 0;
  done = false;

  get score(): number {
    return this.won ? Math.max(1, Math.round(this.timeLeft)) : Math.round((this.x / DOCK_X) * 10);
  }

  update(dt: number, intensity: number): 'cheer' | null {
    if (this.won || this.timeLeft <= 0) {
      this.endT += dt;
      if (this.endT > 2.5) this.done = true;
      return null;
    }
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.v += (intensity * 120 - this.v * 0.9) * dt;
    if (this.v < 0) this.v = 0;
    this.x = Math.min(DOCK_X, this.x + this.v * dt);
    if (this.x >= DOCK_X) {
      this.won = true;
      return 'cheer';
    }
    return null;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#8fd3ff');
    g.addColorStop(1, '#e3f6ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const sea = h * 0.62;
    ctx.fillStyle = '#3d8bfd';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 20) ctx.lineTo(x, sea + Math.sin(x / 60 + t * 1.5) * 8);
    ctx.lineTo(w, h);
    ctx.fill();
    const left = w * 0.08;
    const span = w * 0.78;
    // Dock
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(left + span + 20, sea - 20, w * 0.14, 24);
    ctx.fillRect(left + span + 30, sea, 10, h * 0.2);
    // Boat
    const bx = left + (this.x / DOCK_X) * span;
    const by = sea + Math.sin(bx / 60 + t * 1.5) * 8 - 6;
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.moveTo(bx - 50, by);
    ctx.lineTo(bx + 50, by);
    ctx.lineTo(bx + 34, by + 26);
    ctx.lineTo(bx - 34, by + 26);
    ctx.fill();
    ctx.fillStyle = '#fff';
    const puff = Math.min(1, this.v / 80);
    ctx.beginPath();
    ctx.moveTo(bx - 2, by - 6);
    ctx.quadraticCurveTo(bx + 20 + 30 * puff, by - 50, bx - 2, by - 100);
    ctx.fill();
    ctx.fillStyle = '#23345c';
    ctx.fillRect(bx - 4, by - 104, 5, 100);
  }
}
