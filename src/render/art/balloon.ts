// The hot-air balloon: patterned envelope, basket, burner flame (follows intensity), rider.
import type { CharacterDef, CharacterRegistry, Pose } from '../../game/Characters';
import type { SkinDef } from '../../game/skins';

export interface BalloonLook {
  skin: SkinDef;
  character: CharacterDef;
  registry: CharacterRegistry | null;
  pose: Pose;
  /** 0..1 burner flame size. */
  flame: number;
  /** Vertical squash amount (−0.1..0.1). */
  squash: number;
  /** Hit wobble angle (radians). */
  wobble: number;
  /** 0..1 opacity (blinks while invulnerable). */
  alpha: number;
  shield: boolean;
  timeSec: number;
}

function pattern(
  ctx: CanvasRenderingContext2D,
  s: SkinDef,
  rx: number,
  ry: number,
  t: number,
): void {
  const [a, b] = s.colors;
  ctx.fillStyle = b;
  switch (s.pattern) {
    case 'stripes':
      // Nested gores: a | b | a | b | a from the outside in.
      [0.78, 0.5, 0.2].forEach((k, i) => {
        ctx.fillStyle = i % 2 === 0 ? b : a;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx * k, ry * 1.2, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    case 'dots':
      for (let i = 0; i < 9; i++) {
        const ang = i * 2.39;
        const rr = Math.sqrt(i / 9) * 0.8;
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * rx * rr, Math.sin(ang) * ry * rr, rx * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'zigzag':
      ctx.lineWidth = rx * 0.16;
      ctx.strokeStyle = b;
      for (let row = -1; row <= 1; row++) {
        ctx.beginPath();
        for (let k = -4; k <= 4; k++)
          ctx.lineTo((k / 4) * rx, row * ry * 0.45 + (k % 2 ? -1 : 1) * ry * 0.1);
        ctx.stroke();
      }
      break;
    case 'hearts':
    case 'stars':
      for (let i = 0; i < 6; i++) {
        const x = ((i % 3) - 1) * rx * 0.55;
        const y = (Math.floor(i / 3) - 0.5) * ry * 0.7;
        ctx.beginPath();
        if (s.pattern === 'hearts') {
          const k = rx * 0.13;
          ctx.moveTo(x, y + k);
          ctx.bezierCurveTo(x - 2 * k, y - k * 0.5, x - k, y - 2 * k, x, y - k * 0.7);
          ctx.bezierCurveTo(x + k, y - 2 * k, x + 2 * k, y - k * 0.5, x, y + k);
        } else {
          for (let p = 0; p < 10; p++) {
            const r = p % 2 ? rx * 0.06 : rx * 0.15;
            const an = -Math.PI / 2 + (p * Math.PI) / 5 + t * 0.3;
            ctx.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r);
          }
        }
        ctx.fill();
      }
      break;
    case 'checks': {
      const n = 6;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          if ((i + j) % 2 === 0)
            ctx.fillRect(
              -rx + (i * 2 * rx) / n,
              -ry + (j * 2 * ry) / n,
              (2 * rx) / n,
              (2 * ry) / n,
            );
      break;
    }
    case 'rainbow': {
      const cols = ['#ff6b6b', '#ff9a3c', '#ffd23f', '#4cc36b', '#3d8bfd', '#9b6bff'];
      cols.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(-rx + (i * 2 * rx) / cols.length, -ry, (2 * rx) / cols.length + 1, 2 * ry);
      });
      break;
    }
    case 'swirl':
      ctx.lineWidth = rx * 0.14;
      ctx.strokeStyle = b;
      ctx.beginPath();
      for (let k = 0; k < 40; k++) {
        const an = k * 0.45;
        const r = (k / 40) * rx * 0.9;
        ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r * (ry / rx));
      }
      ctx.stroke();
      break;
    case 'solid':
      break;
  }
}

function riderPlaceholder(
  ctx: CanvasRenderingContext2D,
  c: CharacterDef,
  pose: Pose,
  r: number,
): void {
  const p = c.placeholder ?? { body: '#ffb347', accent: '#c96f00', ears: 'round' as const };
  ctx.fillStyle = p.accent;
  if (p.ears === 'round') {
    ctx.beginPath();
    ctx.arc(-r * 0.7, -r * 0.75, r * 0.35, 0, Math.PI * 2);
    ctx.arc(r * 0.7, -r * 0.75, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.ears === 'long') {
    ctx.beginPath();
    ctx.ellipse(-r * 0.4, -r * 1.2, r * 0.22, r * 0.6, -0.2, 0, Math.PI * 2);
    ctx.ellipse(r * 0.4, -r * 1.2, r * 0.22, r * 0.6, 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.ears === 'pointy') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, -r * 0.3);
    ctx.lineTo(-r * 0.6, -r * 1.2);
    ctx.lineTo(-r * 0.1, -r * 0.8);
    ctx.moveTo(r * 0.9, -r * 0.3);
    ctx.lineTo(r * 0.6, -r * 1.2);
    ctx.lineTo(r * 0.1, -r * 0.8);
    ctx.fill();
  }
  ctx.fillStyle = p.body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#222';
  const eyeY = -r * 0.15;
  if (pose === 'hit') {
    ctx.lineWidth = r * 0.12;
    ctx.strokeStyle = '#222';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * r * 0.5, eyeY - r * 0.12);
      ctx.lineTo(sx * r * 0.25, eyeY + r * 0.12);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.arc(-r * 0.35, eyeY, r * 0.13, 0, Math.PI * 2);
    ctx.arc(r * 0.35, eyeY, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#222';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  if (pose === 'happy') ctx.arc(0, r * 0.15, r * 0.35, 0.1 * Math.PI, 0.9 * Math.PI);
  else if (pose === 'hit') ctx.arc(0, r * 0.55, r * 0.22, 1.15 * Math.PI, 1.85 * Math.PI);
  else ctx.arc(0, r * 0.2, r * 0.25, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
}

/** Draw the balloon centred on the envelope at (x, y) in screen px; `r` = envelope radius px. */
export function drawBalloon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  look: BalloonLook,
): void {
  ctx.save();
  ctx.globalAlpha = look.alpha;
  ctx.translate(x, y);
  ctx.rotate(look.wobble);
  const sx = 1 - look.squash;
  const sy = 1 + look.squash;
  const rx = r * sx;
  const ry = r * 1.12 * sy;
  // Ropes
  ctx.strokeStyle = '#6b4a2b';
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath();
  ctx.moveTo(-rx * 0.55, ry * 0.75);
  ctx.lineTo(-r * 0.32, ry + r * 0.55);
  ctx.moveTo(rx * 0.55, ry * 0.75);
  ctx.lineTo(r * 0.32, ry + r * 0.55);
  ctx.stroke();
  // Flame
  if (look.flame > 0.02) {
    const fh = r * (0.25 + 0.75 * look.flame) * (0.9 + 0.1 * Math.sin(look.timeSec * 40));
    ctx.fillStyle = '#ffb100';
    ctx.beginPath();
    ctx.moveTo(-r * 0.12, ry + r * 0.5);
    ctx.quadraticCurveTo(0, ry + r * 0.5 - fh * 1.2, r * 0.12, ry + r * 0.5);
    ctx.fill();
    ctx.fillStyle = '#ff5a1f';
    ctx.beginPath();
    ctx.moveTo(-r * 0.06, ry + r * 0.5);
    ctx.quadraticCurveTo(0, ry + r * 0.5 - fh * 0.7, r * 0.06, ry + r * 0.5);
    ctx.fill();
  }
  // Envelope
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, ry);
  ctx.bezierCurveTo(-rx * 1.35, ry * 0.25, -rx * 1.1, -ry, 0, -ry);
  ctx.bezierCurveTo(rx * 1.1, -ry, rx * 1.35, ry * 0.25, 0, ry);
  ctx.closePath();
  ctx.fillStyle = look.skin.colors[0];
  ctx.fill();
  ctx.clip();
  pattern(ctx, look.skin, rx, ry, look.timeSec);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(-rx * 0.4, -ry * 0.45, rx * 0.22, ry * 0.32, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.strokeStyle = 'rgba(35,52,92,0.55)';
  ctx.beginPath();
  ctx.moveTo(0, ry);
  ctx.bezierCurveTo(-rx * 1.35, ry * 0.25, -rx * 1.1, -ry, 0, -ry);
  ctx.bezierCurveTo(rx * 1.1, -ry, rx * 1.35, ry * 0.25, 0, ry);
  ctx.stroke();
  // Rider (sits in the basket, head above the rim)
  const by = ry + r * 0.55;
  const riderR = r * 0.32;
  const img = look.registry?.image(look.character.id, look.pose) ?? null;
  ctx.save();
  ctx.translate(0, by - riderR * 0.2);
  if (img) ctx.drawImage(img, -riderR * 1.2, -riderR * 1.3, riderR * 2.4, riderR * 2.4);
  else riderPlaceholder(ctx, look.character, look.pose, riderR);
  ctx.restore();
  // Basket
  ctx.fillStyle = '#b5773a';
  ctx.strokeStyle = '#7a4c22';
  ctx.lineWidth = Math.max(1.5, r * 0.06);
  const bw = r * 0.78;
  const bh = r * 0.5;
  ctx.beginPath();
  ctx.roundRect(-bw / 2, by, bw, bh, r * 0.1);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-bw / 2, by + bh * 0.5);
  ctx.lineTo(bw / 2, by + bh * 0.5);
  ctx.stroke();
  if (look.shield) {
    ctx.strokeStyle = 'rgba(120,220,255,0.85)';
    ctx.lineWidth = Math.max(3, r * 0.1);
    ctx.beginPath();
    ctx.ellipse(0, r * 0.3, r * 1.45, r * 1.85, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
