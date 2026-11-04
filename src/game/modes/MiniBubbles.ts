// Bubble Blower: a gentle blow grows the bubble, too hard pops it, stopping releases it.
import { MINI } from '../../config';
import type { MiniGame } from './minis';

interface Floating {
  x: number;
  y: number;
  r: number;
  vx: number;
}

export const SESSION_SEC = 60;
const MIN_RELEASE_R = 0.15;

export class MiniBubbles implements MiniGame {
  readonly kind = 'bubbles' as const;
  size = 0;
  released = 0;
  bonus = 0;
  popped = 0;
  timeLeft = SESSION_SEC;
  private hardMs = 0;
  private quietMs = 0;
  private popT = 0;
  private endT = 0;
  readonly floating: Floating[] = [];
  done = false;

  get score(): number {
    return this.released + this.bonus;
  }

  update(dt: number, intensity: number, isBlowing: boolean): 'pop' | 'chime' | null {
    if (this.popT > 0) this.popT -= dt;
    for (const f of this.floating) {
      f.y -= dt * 0.12;
      f.x += f.vx * dt;
    }
    while (this.floating.length && (this.floating[0]?.y ?? 0) < -0.3) this.floating.shift();
    if (this.timeLeft <= 0) {
      this.endT += dt;
      if (this.endT > 2) this.done = true;
      return null;
    }
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (isBlowing && intensity >= MINI.bubblePopThreshold) {
      this.hardMs += dt * 1000;
      if (this.hardMs > 150 && this.size > 0) {
        this.size = 0;
        this.hardMs = 0;
        this.popped++;
        this.popT = 0.5;
        return 'pop';
      }
    } else this.hardMs = 0;
    if (isBlowing && intensity >= MINI.bubbleGrowThreshold) {
      this.quietMs = 0;
      this.size = Math.min(1, this.size + dt * 0.35 * (0.5 + intensity));
    } else {
      this.quietMs += dt * 1000;
      if (this.quietMs > 250 && this.size >= MIN_RELEASE_R) {
        this.released++;
        // Size bonus: big bubbles are worth more.
        this.bonus += this.size > 0.8 ? 2 : this.size > 0.5 ? 1 : 0;
        if (this.floating.length < 12)
          this.floating.push({
            x: 0.5,
            y: 0.45,
            r: this.size,
            vx: (((this.released * 37) % 10) - 5) / 50,
          });
        this.size = 0;
        return 'chime';
      }
      if (this.quietMs > 250) this.size = 0;
    }
    return null;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#b8f0ff');
    g.addColorStop(1, '#f2fdff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const unit = Math.min(w, h) * 0.3;
    const bubble = (x: number, y: number, r: number) => {
      ctx.strokeStyle = 'rgba(120,140,255,0.8)';
      ctx.fillStyle = 'rgba(200,230,255,0.35)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const f of this.floating)
      bubble(f.x * w + Math.sin(t * 2 + f.r * 10) * 10, f.y * h, Math.max(8, f.r * unit));
    // Wand
    const wx = w / 2;
    const wy = h * 0.62;
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(wx, wy + 30);
    ctx.lineTo(wx, h * 0.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(wx, wy, 30, 0, Math.PI * 2);
    ctx.stroke();
    if (this.size > 0) bubble(wx, wy - this.size * unit, Math.max(20, this.size * unit));
    if (this.popT > 0) {
      ctx.fillStyle = '#ff8fb1';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const d = (0.5 - this.popT) * 300;
        ctx.beginPath();
        ctx.arc(wx + Math.cos(a) * d, wy - 60 + Math.sin(a) * d, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
