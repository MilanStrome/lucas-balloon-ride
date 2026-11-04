// Birthday Candles: a sustained blow (≥400 ms above threshold) puts out the candle under the cursor.
import { MINI } from '../../config';
import type { MiniGame } from './minis';

export class MiniCandles implements MiniGame {
  readonly kind = 'candles' as const;
  readonly lit: boolean[];
  cursor = 0;
  private holdMs = 0;
  private celebrateT = 0;
  done = false;

  constructor(readonly count: number) {
    this.lit = Array.from({ length: Math.max(3, Math.min(8, count)) }, () => true);
  }

  get score(): number {
    return this.lit.filter((l) => !l).length;
  }

  get allOut(): boolean {
    return this.lit.every((l) => !l);
  }

  update(dt: number, intensity: number, isBlowing: boolean): 'blowout' | 'cheer' | null {
    if (this.allOut) {
      this.celebrateT += dt;
      if (this.celebrateT > 2.5) this.done = true;
      return null;
    }
    if (isBlowing && intensity >= MINI.candleThreshold) this.holdMs += dt * 1000;
    else this.holdMs = Math.max(0, this.holdMs - dt * 2000);
    if (this.holdMs >= MINI.candleHoldMs) {
      this.holdMs = 0;
      this.lit[this.cursor] = false;
      if (this.allOut) return 'cheer';
      // Move the cursor to the next candle that is still lit.
      for (let k = 1; k <= this.lit.length; k++) {
        const i = (this.cursor + k) % this.lit.length;
        if (this.lit[i]) {
          this.cursor = i;
          break;
        }
      }
      return 'blowout';
    }
    return null;
  }

  /** 0..1 progress of the current blow on the cursor candle. */
  get flicker(): number {
    return this.holdMs / MINI.candleHoldMs;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    ctx.fillStyle = '#ffe9f2';
    ctx.fillRect(0, 0, w, h);
    const cw = Math.min(w * 0.8, 700);
    const cx = w / 2;
    const top = h * 0.55;
    ctx.fillStyle = '#f7b2c8';
    ctx.beginPath();
    ctx.roundRect(cx - cw / 2, top, cw, h * 0.3, 30);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(cx - cw / 2, top, cw, h * 0.06, 30);
    ctx.fill();
    const n = this.lit.length;
    const gap = cw / (n + 1);
    for (let i = 0; i < n; i++) {
      const x = cx - cw / 2 + gap * (i + 1);
      const ch = h * 0.14;
      ctx.fillStyle = ['#3d8bfd', '#ffd23f', '#4cc36b', '#9b6bff'][i % 4] ?? '#3d8bfd';
      ctx.fillRect(x - 9, top - ch, 18, ch);
      if (this.lit[i]) {
        const bend = i === this.cursor ? this.flicker * 0.8 : 0;
        const fy = top - ch - 4;
        ctx.save();
        ctx.translate(x, fy);
        ctx.rotate(bend + Math.sin(t * 9 + i) * 0.08);
        ctx.fillStyle = '#ffb100';
        ctx.beginPath();
        ctx.ellipse(0, -16, 10 * (1 - bend * 0.4), 18 * (1 - bend * 0.4), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff5a1f';
        ctx.beginPath();
        ctx.ellipse(0, -12, 5, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(120,120,140,0.5)';
        ctx.beginPath();
        ctx.arc(
          x + Math.sin(t * 2 + i) * 6,
          top - ch - 20 - ((t * 20 + i * 7) % 40),
          6,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      if (i === this.cursor && !this.allOut) {
        ctx.fillStyle = '#23345c';
        ctx.beginPath();
        ctx.moveTo(x, top - ch - 70);
        ctx.lineTo(x - 14, top - ch - 92);
        ctx.lineTo(x + 14, top - ch - 92);
        ctx.fill();
      }
    }
    if (this.allOut) {
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = ['#ff6b6b', '#ffd23f', '#4cc36b', '#3d8bfd', '#9b6bff'][i % 5] ?? '#fff';
        const x = (((i * 97 + t * 60 * (1 + (i % 3))) % w) + w) % w;
        const y = (((i * 53 + this.celebrateT * 200 * (1 + (i % 4) * 0.3)) % h) + h) % h;
        ctx.fillRect(x, y, 10, 6);
      }
    }
  }
}
