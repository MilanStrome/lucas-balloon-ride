// Procedural drawings for stars, coins, hazards, zones, power-ups, fireflies and the pad.
import { asteroidJitter } from '../../game/LevelSim';
import type { Hazard, PowerUpType, Zone } from '../../game/levels/schema';
import { cloudShape } from './background';

export function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  t: number,
  colorblind: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 2) * 0.15);
  ctx.fillStyle = colorblind ? '#f0e442' : '#ffd23f';
  ctx.strokeStyle = '#e0a800';
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawCoin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  t: number,
): void {
  const squeeze = Math.abs(Math.cos(t * 3));
  ctx.fillStyle = '#ffc93c';
  ctx.strokeStyle = '#d99a00';
  ctx.lineWidth = Math.max(2, r * 0.15);
  ctx.beginPath();
  ctx.ellipse(x, y, r * (0.3 + 0.7 * squeeze), r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function bird(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  t: number,
  bee: boolean,
): void {
  const flap = Math.sin(t * (bee ? 40 : 12));
  ctx.save();
  ctx.translate(x, y);
  if (bee) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, -r * 0.8, r * 0.5, r * (0.3 + 0.2 * flap), -0.4, 0, Math.PI * 2);
    ctx.ellipse(r * 0.3, -r * 0.8, r * 0.5, r * (0.3 + 0.2 * flap), 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.1, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#23345c';
    ctx.fillRect(-r * 0.35, -r * 0.8, r * 0.25, r * 1.6);
    ctx.fillRect(r * 0.15, -r * 0.8, r * 0.25, r * 1.6);
  } else {
    ctx.fillStyle = '#ff7b54';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.1, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e85d3a';
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, 0);
    ctx.lineTo(r * 0.4, -r * (0.3 + 1.1 * flap));
    ctx.lineTo(r * 0.8, 0);
    ctx.fill();
    ctx.fillStyle = '#ffb000';
    ctx.beginPath();
    ctx.moveTo(-r * 1.05, -r * 0.1);
    ctx.lineTo(-r * 1.6, r * 0.1);
    ctx.lineTo(-r * 1.05, r * 0.25);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-r * 0.55, -r * 0.2, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(-r * 0.6, -r * 0.2, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const jitter = new Float64Array(12);

/** Draw a hazard; `pos` is its current centre (screen px), `s` = px per unit. */
export function drawHazard(
  ctx: CanvasRenderingContext2D,
  h: Hazard,
  px: number,
  py: number,
  s: number,
  groundY: number,
  t: number,
  colorblind: boolean,
): void {
  switch (h.type) {
    case 'tree': {
      const w = h.w * s;
      const top = groundY - h.h * s;
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(px - w * 0.14, top + w * 0.4, w * 0.28, groundY - top - w * 0.4);
      ctx.fillStyle = colorblind ? '#009e73' : '#3fa34d';
      ctx.beginPath();
      ctx.arc(px, top + w * 0.45, w * 0.5, 0, Math.PI * 2);
      ctx.arc(px - w * 0.25, top + w * 0.7, w * 0.35, 0, Math.PI * 2);
      ctx.arc(px + w * 0.25, top + w * 0.7, w * 0.35, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'cloud': {
      ctx.fillStyle = '#5b6278';
      cloudShape(ctx, px, py, h.r * s * 0.78);
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      const z = h.r * s;
      ctx.moveTo(px - z * 0.1, py + z * 0.4);
      ctx.lineTo(px + z * 0.15, py + z * 0.4);
      ctx.lineTo(px - z * 0.05, py + z * 0.75);
      ctx.lineTo(px + z * 0.2, py + z * 0.75);
      ctx.lineTo(px - z * 0.15, py + z * 1.15);
      ctx.lineTo(px, py + z * 0.85);
      ctx.lineTo(px - z * 0.25, py + z * 0.85);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'bird':
    case 'bee':
      bird(ctx, px, py, h.r * s, t, h.type === 'bee');
      break;
    case 'asteroid': {
      asteroidJitter(h, jitter);
      const rot = h.spin * t;
      ctx.fillStyle = '#9c8f84';
      ctx.strokeStyle = '#6c625a';
      ctx.lineWidth = Math.max(2, 4 * s);
      ctx.beginPath();
      for (let i = 0; i < h.sides; i++) {
        const a = rot + (i / h.sides) * Math.PI * 2;
        const k = h.r * s * (jitter[i] ?? 1);
        // Screen y is flipped relative to world y.
        ctx.lineTo(px + Math.cos(a) * k, py - Math.sin(a) * k);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#857a70';
      ctx.beginPath();
      ctx.arc(px + h.r * s * 0.25, py - h.r * s * 0.2, h.r * s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

export function drawZone(
  ctx: CanvasRenderingContext2D,
  z: Zone,
  sx: number,
  w: number,
  h: number,
  t: number,
  reduceMotion: boolean,
): void {
  const tt = reduceMotion ? 0 : t;
  if (z.type === 'rain') {
    ctx.fillStyle = 'rgba(80,100,140,0.18)';
    ctx.fillRect(sx, 0, w, h);
    ctx.strokeStyle = 'rgba(120,160,230,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < Math.ceil(w / 18); i++) {
      const x = sx + ((i * 37) % Math.max(1, w));
      const y = (((i * 91 + tt * 600) % h) + h) % h;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 16);
    }
    ctx.stroke();
    return;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(sx, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 3;
  const dirX = z.fx;
  const dirY = -z.fy / 300;
  const len = 40;
  for (let i = 0; i < Math.ceil(w / 90) * 4; i++) {
    const baseX = sx + ((i * 53) % Math.max(1, w));
    const baseY = (i * 137) % h;
    const phase = (tt * 1.2 + i * 0.37) % 1;
    const x = baseX + dirX * 120 * phase;
    const y = baseY + dirY * 120 * phase;
    ctx.globalAlpha = Math.sin(phase * Math.PI);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + (dirX * len + 10) * 0.5,
      y + dirY * len * 0.5 - 8,
      x + dirX * len + (dirX === 0 ? 0 : 6),
      y + dirY * len,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawPowerUp(
  ctx: CanvasRenderingContext2D,
  type: PowerUpType,
  x: number,
  y: number,
  r: number,
  t: number,
): void {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 3) * r * 0.15);
  ctx.fillStyle = type === 'shield' ? '#7ad7ff' : type === 'magnet' ? '#ff6b6b' : '#c9b6ff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = r * 0.18;
  if (type === 'shield') {
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.55);
    ctx.lineTo(r * 0.45, -r * 0.3);
    ctx.quadraticCurveTo(r * 0.4, r * 0.4, 0, r * 0.6);
    ctx.quadraticCurveTo(-r * 0.4, r * 0.4, -r * 0.45, -r * 0.3);
    ctx.closePath();
    ctx.fill();
  } else if (type === 'magnet') {
    ctx.beginPath();
    ctx.arc(0, -r * 0.05, r * 0.4, Math.PI, 0, true);
    ctx.stroke();
  } else {
    cloudShape(ctx, 0, 0, r * 0.32);
  }
  ctx.restore();
}

export function drawFirefly(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
  i: number,
): void {
  const glow = 0.6 + 0.4 * Math.sin(t * 3 + i);
  ctx.fillStyle = `rgba(255,240,140,${0.25 * glow})`;
  ctx.beginPath();
  ctx.arc(x, y, 26 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff59a';
  ctx.beginPath();
  ctx.arc(x, y, 7 * s, 0, Math.PI * 2);
  ctx.fill();
}

export function drawPad(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  w: number,
  s: number,
): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - w / 2, groundY - 16 * s, w, 16 * s);
  ctx.fillStyle = '#ff6b6b';
  for (let i = 0; i < 6; i++)
    if (i % 2 === 0) ctx.fillRect(x - w / 2 + (i * w) / 6, groundY - 16 * s, w / 6, 16 * s);
  ctx.fillStyle = '#23345c';
  ctx.fillRect(x - 3 * s, groundY - 200 * s, 6 * s, 184 * s);
  ctx.fillStyle = '#4cc36b';
  ctx.beginPath();
  ctx.moveTo(x + 3 * s, groundY - 200 * s);
  ctx.lineTo(x + 70 * s, groundY - 175 * s);
  ctx.lineTo(x + 3 * s, groundY - 150 * s);
  ctx.fill();
}
