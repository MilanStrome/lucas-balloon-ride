// Procedural 3-layer parallax backgrounds (far hills, mid hills/trees, near grass + clouds).
import type { Theme } from './palette';

/** Cheap deterministic hash in [0,1) for repeating decorations. */
export function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const gradientCache = new Map<string, CanvasGradient>();

function sky(ctx: CanvasRenderingContext2D, w: number, h: number, th: Theme): void {
  const key = `${th.skyTop}|${th.skyBottom}|${h}`;
  let g = gradientCache.get(key);
  if (!g) {
    g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, th.skyTop);
    g.addColorStop(1, th.skyBottom);
    if (gradientCache.size > 32) gradientCache.clear();
    gradientCache.set(key, g);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function hills(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  camX: number,
  factor: number,
  base: number,
  amp: number,
  period: number,
  color: string,
  scale: number,
): void {
  const off = camX * factor;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  const step = 24;
  for (let sx = 0; sx <= w + step; sx += step) {
    const wx = (sx / scale + off) / period;
    const y = base - amp * (0.6 * Math.sin(wx * 2.1) + 0.4 * Math.sin(wx * 4.7 + 1.3));
    ctx.lineTo(sx, h - y * scale);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

export function cloudShape(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.arc(x + r * 0.9, y + r * 0.2, r * 0.75, 0, Math.PI * 2);
  ctx.arc(x - r * 0.9, y + r * 0.25, r * 0.7, 0, Math.PI * 2);
  ctx.arc(x + r * 0.3, y - r * 0.45, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

export interface BgOptions {
  parallax: boolean;
  timeSec: number;
  reduceMotion: boolean;
}

/** Draw the background for a camera at world x `camX` (left edge), `scale` px per unit. */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  camX: number,
  scale: number,
  th: Theme,
  o: BgOptions,
): void {
  sky(ctx, w, h, th);
  if (th.stars) {
    ctx.fillStyle = '#ffffff';
    const tw = o.reduceMotion ? 0 : o.timeSec;
    for (let i = 0; i < 70; i++) {
      const px = (((hash01(i) * 4000 - camX * 0.05 * scale) % w) + w) % w;
      const py = hash01(i + 99) * h * 0.75;
      const a = 0.5 + 0.5 * Math.sin(tw * (1 + hash01(i + 7) * 2) + i);
      ctx.globalAlpha = 0.4 + 0.6 * a;
      ctx.fillRect(px, py, 2.2, 2.2);
    }
    ctx.globalAlpha = 1;
  }
  if (th.sun) {
    ctx.fillStyle = th.sun;
    ctx.beginPath();
    ctx.arc(w * 0.82, h * 0.16, 60 * scale + 20, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!o.parallax) {
    hills(ctx, w, h, camX, 0, 140, 30, 900, th.mid, scale);
    return;
  }
  // Far clouds drift slowly.
  ctx.fillStyle = th.cloud;
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < 6; i++) {
    const period = 2600;
    const wx = hash01(i + 40) * period;
    const sx =
      (((wx - camX * 0.15 - (o.reduceMotion ? 0 : o.timeSec * 6)) % period) + period) % period;
    cloudShape(
      ctx,
      (sx - 300) * scale,
      (120 + hash01(i + 3) * 260) * scale,
      (34 + hash01(i + 5) * 24) * scale,
    );
  }
  ctx.globalAlpha = 1;
  hills(ctx, w, h, camX, 0.2, 260, 60, 700, th.far, scale);
  hills(ctx, w, h, camX, 0.45, 170, 45, 420, th.mid, scale);
  hills(ctx, w, h, camX, 0.7, 90, 20, 260, th.near, scale);
}

export function drawGround(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scale: number,
  th: Theme,
): void {
  const gh = 18 * scale;
  ctx.fillStyle = th.ground;
  ctx.fillRect(0, h - gh, w, gh);
  ctx.fillStyle = th.groundTop;
  ctx.fillRect(0, h - gh, w, Math.max(2, 5 * scale));
}
