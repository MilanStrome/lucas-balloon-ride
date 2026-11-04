// DPR-aware canvas renderer: background layers, course entities, balloon, particles, night mask.
import { GAMEPLAY, PHYSICS } from '../config';
import { computeView, gameplayAlpha, type View } from '../engine/Camera';
import type { CharacterRegistry, Pose } from '../game/Characters';
import type { CourseRunner } from '../game/CourseRunner';
import { hazardPos, type LevelSim } from '../game/LevelSim';
import { skinDef } from '../game/skins';
import { drawBalloon } from './art/balloon';
import { drawBackground, drawGround } from './art/background';
import {
  drawCoin,
  drawFirefly,
  drawHazard,
  drawPad,
  drawPowerUp,
  drawStar,
  drawZone,
} from './art/entities';
import { theme as themeFor } from './art/palette';
import { Particles } from './Particles';

export interface RenderPrefs {
  quality: 'high' | 'low';
  reduceMotion: boolean;
  colorblind: boolean;
}

export interface BalloonVisual {
  skin: string;
  character: string;
  intensity: number;
  isBlowing: boolean;
  pose: Pose;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  view: View;
  readonly particles = new Particles();
  prefs: RenderPrefs = { quality: 'high', reduceMotion: false, colorblind: false };
  registry: CharacterRegistry | null = null;
  private squash = 0;
  private wobble = 0;
  private readonly tmp = { x: 0, y: 0 };
  /** Offscreen canvas for the night-sky visibility mask. */
  private mask: HTMLCanvasElement | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.view = computeView(1, 1, 1);
    this.resize();
  }

  /** Match the canvas backing store to its CSS size × DPR (capped). Safe to call often. */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.prefs.quality === 'low' ? 1 : window.devicePixelRatio;
    this.view = computeView(
      rect.width || window.innerWidth,
      rect.height || window.innerHeight,
      dpr,
    );
    const w = Math.round(this.view.cssW * this.view.dpr);
    const h = Math.round(this.view.cssH * this.view.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  hit(): void {
    this.wobble = 0.35;
  }

  render(r: CourseRunner, alpha: number, timeSec: number, b: BalloonVisual): void {
    const ctx = this.ctx;
    const v = this.view;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const s = v.scale;
    const W = v.cssW;
    const H = v.cssH;
    const bx = r.prevX + (r.worldX - r.prevX) * alpha;
    const by = r.prevY + (r.state.y - r.prevY) * alpha;
    const camLeft = bx - v.balloonScreenX;
    const toX = (x: number) => (x - camLeft) * s;
    const toY = (y: number) => (PHYSICS.worldHeight - y) * s;
    const low = this.prefs.quality === 'low';
    const sim = r.cur;
    const th = themeFor(sim.course.world, sim.course.night);
    drawBackground(ctx, W, H, camLeft, s, th, {
      parallax: !low,
      timeSec,
      reduceMotion: this.prefs.reduceMotion,
    });

    this.drawSim(sim, r.curOffset, bx, toX, toY, timeSec);
    if (r.next) this.drawSim(r.next, r.curOffset + sim.course.length, bx, toX, toY, timeSec);
    drawGround(ctx, W, H, s, th);
    const pad = sim.course.pad;
    if (pad) drawPad(ctx, toX(r.curOffset + pad.x), H - 4 * s, pad.w * s, s);

    // Balloon feel: squash on lift, wobble on hit, flame = intensity.
    const st = r.state;
    const targetSquash = b.isBlowing ? Math.min(0.08, b.intensity * 0.1) : 0;
    this.squash += (targetSquash - this.squash) * 0.2;
    this.wobble *= 0.9;
    const blink = st.invuln > 0 && Math.floor(st.invuln * 10) % 2 === 0;
    const sx = toX(bx);
    const sy = toY(by);
    const rr = PHYSICS.balloonRadius * s;
    if (b.isBlowing && !low && this.particles.enabled) {
      if (Math.random() < 0.6) {
        this.particles.emit(
          bx - 40 + Math.random() * 10,
          by - 70,
          -60 - Math.random() * 60,
          -40 - Math.random() * 40,
          0.6,
          7 + b.intensity * 6,
          'rgba(255,255,255,0.8)',
          0,
        );
      }
    }
    // Drawn bigger than the (forgiving) collision circle; the basket bottom sits on the
    // circle's bottom so it touches the ground exactly when the physics does.
    const br = rr * 0.9;
    drawBalloon(ctx, sx, sy + rr - 2.17 * br, br, {
      skin: skinDef(b.skin),
      character: this.registry?.get(b.character) ?? { id: b.character, label: '', price: 0 },
      registry: this.registry,
      pose: b.pose,
      flame: b.intensity,
      squash: this.squash,
      wobble: this.prefs.reduceMotion ? 0 : Math.sin(timeSec * 30) * this.wobble,
      alpha: blink ? 0.45 : 1,
      shield: st.shield,
      timeSec,
    });
    if (!low) this.particles.draw(ctx, toX, toY, s);

    if (sim.course.night) this.nightMask(sim, r.curOffset, sx, sy, toX, toY, W, H, s);
  }

  private drawSim(
    sim: LevelSim,
    offset: number,
    bx: number,
    toX: (x: number) => number,
    toY: (y: number) => number,
    t: number,
  ): void {
    const ctx = this.ctx;
    const v = this.view;
    const s = v.scale;
    const left = bx - v.balloonScreenX - 200;
    const right = bx + v.viewW;
    const c = sim.course;
    const st = sim.state;
    const motion = this.prefs.reduceMotion ? 0 : t;
    for (const z of c.zones) {
      const x0 = offset + z.x;
      if (x0 > right || x0 + z.w < left) continue;
      ctx.globalAlpha = Math.max(0.15, gameplayAlpha(v, bx, x0));
      drawZone(ctx, z, toX(x0), z.w * s, v.cssH, t, this.prefs.reduceMotion);
    }
    ctx.globalAlpha = 1;
    for (const h of c.hazards) {
      const x0 = offset + h.x;
      if (x0 > right + 300 || x0 < left - 300) continue;
      const a = gameplayAlpha(v, bx, x0);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      hazardPos(h, st.t, this.tmp);
      drawHazard(
        ctx,
        h,
        toX(offset + this.tmp.x),
        toY(this.tmp.y),
        s,
        v.cssH - 4 * s,
        motion,
        this.prefs.colorblind,
      );
    }
    for (let i = 0; i < sim.nItems; i++) {
      if (st.collected[i]) continue;
      const x0 = offset + (sim.itemX[i] ?? 0);
      if (x0 > right || x0 < left) continue;
      const a = gameplayAlpha(v, bx, x0);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      const kind = sim.itemKind(i);
      const px = toX(x0);
      const py = toY(sim.itemY[i] ?? 0);
      if (kind === 'star')
        drawStar(ctx, px, py, GAMEPLAY.starRadius * s, motion + i, this.prefs.colorblind);
      else if (kind === 'coin') drawCoin(ctx, px, py, GAMEPLAY.coinRadius * s, motion + i);
      else drawPowerUp(ctx, kind, px, py, GAMEPLAY.powerUpRadius * s, motion);
    }
    ctx.globalAlpha = 1;
    if (c.night) {
      c.fireflies.forEach(([x, y], i) => {
        const x0 = offset + x;
        if (x0 < left || x0 > right) return;
        drawFirefly(
          ctx,
          toX(x0),
          toY(y + (this.prefs.reduceMotion ? 0 : Math.sin(t * 2 + i) * 10)),
          s,
          motion,
          i,
        );
      });
    }
  }

  /** Night Sky: darkness with light around the balloon and each firefly. */
  private nightMask(
    sim: LevelSim,
    offset: number,
    sx: number,
    sy: number,
    toX: (x: number) => number,
    toY: (y: number) => number,
    W: number,
    H: number,
    s: number,
  ): void {
    const dpr = this.view.dpr;
    if (!this.mask) this.mask = document.createElement('canvas');
    const m = this.mask;
    const mw = Math.round(W);
    const mh = Math.round(H);
    if (m.width !== mw || m.height !== mh) {
      m.width = mw;
      m.height = mh;
    }
    const mc = m.getContext('2d');
    if (!mc) return;
    mc.globalCompositeOperation = 'source-over';
    mc.fillStyle = 'rgba(5,8,25,0.9)';
    mc.fillRect(0, 0, mw, mh);
    mc.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number) => {
      const g = mc.createRadialGradient(x, y, r * 0.35, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      mc.fillStyle = g;
      mc.beginPath();
      mc.arc(x, y, r, 0, Math.PI * 2);
      mc.fill();
    };
    hole(sx, sy, GAMEPLAY.nightVisibilityRadius * s);
    for (const [x, y] of sim.course.fireflies) {
      const px = toX(offset + x);
      if (px < -300 || px > W + 300) continue;
      hole(px, toY(y), GAMEPLAY.fireflyLightRadius * s);
    }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(m, 0, 0, mw * dpr, mh * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
