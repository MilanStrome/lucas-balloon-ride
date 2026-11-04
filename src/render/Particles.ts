// Pooled particles (breath stream, sparkles, pops). Nothing is allocated after construction.
import { Pool } from '../engine/Pool';

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 0 | 1 | 2; // 0 = puff, 1 = sparkle, 2 = confetti
}

export class Particles {
  readonly pool = new Pool<Particle>(260, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 1,
    color: '#fff',
    kind: 0,
  }));
  enabled = true;

  emit(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    kind: Particle['kind'],
  ): void {
    if (!this.enabled) return;
    const p = this.pool.acquire();
    if (!p) return;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.color = color;
    p.kind = kind;
  }

  /** World-space burst (units). */
  sparkle(x: number, y: number, color = '#ffe066', n = 10): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.emit(x, y, Math.cos(a) * 160, Math.sin(a) * 160, 0.5, 10, color, 1);
    }
  }

  confetti(x: number, y: number, n = 30): void {
    const cols = ['#ff6b6b', '#ffd23f', '#4cc36b', '#3d8bfd', '#9b6bff'];
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.2 + 0.6 * (i / n));
      this.emit(
        x,
        y,
        Math.cos(a) * 300 * (0.5 + (i % 5) / 5),
        Math.sin(a) * 420,
        1.6,
        12,
        cols[i % cols.length] ?? '#fff',
        2,
      );
    }
  }

  update(dt: number): void {
    for (const p of this.pool.items) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 2) p.vy -= 600 * dt;
      else p.vy *= 0.96;
      p.vx *= 0.96;
    }
  }

  clear(): void {
    this.pool.releaseAll();
  }

  /** Draw with a world->screen mapping. */
  draw(
    ctx: CanvasRenderingContext2D,
    toX: (x: number) => number,
    toY: (y: number) => number,
    s: number,
  ): void {
    for (const p of this.pool.items) {
      if (!p.active) continue;
      const a = p.life / p.maxLife;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const sz = p.size * s * (p.kind === 0 ? 1 + (1 - a) * 1.5 : 1);
      const x = toX(p.x);
      const y = toY(p.y);
      if (p.kind === 2) ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz * 0.6);
      else {
        ctx.beginPath();
        ctx.arc(x, y, sz, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
