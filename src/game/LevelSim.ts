// PURE: one course's gameplay simulation (balloon, hazards, zones, pickups, landing).
// Shared verbatim by the game, Endless/Daily/Party, and the level-solvability bot.
import { GAMEPLAY, PHYSICS } from '../config';
import { circleCircle, circlePolygon, circleRect } from '../engine/Collision';
import { DEFAULT_PHYSICS, stepBody, type PhysicsParams } from '../engine/Physics';
import type { Course, Hazard, PowerUpType } from './levels/schema';

export const EV = {
  STAR: 1,
  COIN: 2,
  POWERUP: 4,
  HIT: 8,
  GROUND: 16,
  LANDED: 32,
  SHIELD_BREAK: 64,
  FAILED: 128,
  CHUNK_END: 256,
} as const;

export interface SimState {
  /** Game time (s), slowed by slow-mo. */
  t: number;
  /** Real time (s). */
  rt: number;
  x: number;
  y: number;
  vy: number;
  hearts: number;
  hits: number;
  invuln: number;
  shield: boolean;
  magnet: number;
  slow: number;
  stars: number;
  coins: number;
  /** Flags per item (stars, then coins, then power-ups). */
  collected: Uint8Array;
  done: boolean;
  failed: boolean;
  landVy: number;
  gentle: boolean;
  hazardCursor: number;
}

export interface SimOptions {
  easy?: boolean;
  /** Hearts at the start (Infinity in easy mode). */
  hearts?: number;
  physics?: PhysicsParams;
}

const R = PHYSICS.balloonRadius;
const BRAKE_DIST = 420;

interface CompiledHazard {
  h: Hazard;
  minX: number;
  maxX: number;
  jitter: Float64Array;
}

export function hazardExtent(h: Hazard): [number, number] {
  switch (h.type) {
    case 'tree':
      return [h.x, h.x + h.w];
    case 'cloud':
      return [h.x - h.r, h.x + h.r];
    case 'bird':
    case 'bee':
      return [h.x - h.r - h.ax, h.x + h.r + h.ax];
    case 'asteroid':
      return [h.x - h.r, h.x + h.r];
  }
}

/** Position of a moving hazard's centre at game time t (trees: centre of the trunk top). */
export function hazardPos(h: Hazard, t: number, out: { x: number; y: number }): void {
  switch (h.type) {
    case 'tree':
      out.x = h.x + h.w / 2;
      out.y = h.h;
      return;
    case 'cloud':
      out.x = h.x;
      out.y = h.y;
      return;
    case 'bird':
    case 'bee': {
      const w = 2 * Math.PI * h.freq * t + h.phase;
      out.x = h.x + h.ax * Math.sin(w * 0.5);
      out.y = h.y + h.amp * Math.sin(w);
      return;
    }
    case 'asteroid':
      out.x = h.x;
      out.y = h.y + h.amp * Math.sin(2 * Math.PI * h.freq * t + h.phase);
      return;
  }
}

/** Deterministic per-asteroid vertex jitter so rocks look lumpy but stay convex-ish. */
export function asteroidJitter(h: Hazard & { type: 'asteroid' }, out: Float64Array): void {
  let s = Math.floor(h.x * 13 + h.y * 7) >>> 0;
  for (let i = 0; i < h.sides; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = 0.82 + 0.18 * (s / 4294967296);
  }
}

const scratchX = new Float64Array(12);
const scratchY = new Float64Array(12);
const tmp = { x: 0, y: 0 };
const circle: { x: number; y: number; r: number } = { x: 0, y: 0, r: R };
const rect = { x: 0, y: 0, w: 0, h: 0 };
const other = { x: 0, y: 0, r: 0 };

/** Does a circle at (cx, cy, r) touch hazard h at game time t? */
export function hazardHits(
  h: Hazard,
  jitter: Float64Array | null,
  cx: number,
  cy: number,
  r: number,
  t: number,
): boolean {
  circle.x = cx;
  circle.y = cy;
  circle.r = r;
  switch (h.type) {
    case 'tree':
      rect.x = h.x;
      rect.y = 0;
      rect.w = h.w;
      rect.h = h.h;
      return circleRect(circle, rect);
    case 'cloud':
      other.x = h.x;
      other.y = h.y;
      other.r = h.r;
      return circleCircle(circle, other);
    case 'bird':
    case 'bee':
      hazardPos(h, t, other);
      other.r = h.r;
      return circleCircle(circle, other);
    case 'asteroid': {
      hazardPos(h, t, tmp);
      const dx = cx - tmp.x;
      const dy = cy - tmp.y;
      const rr = h.r + r;
      if (dx * dx + dy * dy > rr * rr) return false;
      const rot = h.spin * t;
      for (let i = 0; i < h.sides; i++) {
        const a = rot + (i / h.sides) * Math.PI * 2;
        const k = h.r * (jitter ? (jitter[i] ?? 1) : 1);
        scratchX[i] = tmp.x + Math.cos(a) * k;
        scratchY[i] = tmp.y + Math.sin(a) * k;
      }
      return circlePolygon(circle, scratchX, scratchY, h.sides);
    }
  }
}

export function createState(course: Course, nItems: number, hearts: number): SimState {
  return {
    t: 0,
    rt: 0,
    x: 0,
    y: course.startY,
    vy: course.startVy,
    hearts,
    hits: 0,
    invuln: 0,
    shield: false,
    magnet: 0,
    slow: 0,
    stars: 0,
    coins: 0,
    collected: new Uint8Array(nItems),
    done: false,
    failed: false,
    landVy: 0,
    gentle: false,
    hazardCursor: 0,
  };
}

export function copyState(dst: SimState, src: SimState): void {
  dst.t = src.t;
  dst.rt = src.rt;
  dst.x = src.x;
  dst.y = src.y;
  dst.vy = src.vy;
  dst.hearts = src.hearts;
  dst.hits = src.hits;
  dst.invuln = src.invuln;
  dst.shield = src.shield;
  dst.magnet = src.magnet;
  dst.slow = src.slow;
  dst.stars = src.stars;
  dst.coins = src.coins;
  dst.collected.set(src.collected);
  dst.done = src.done;
  dst.failed = src.failed;
  dst.landVy = src.landVy;
  dst.gentle = src.gentle;
  dst.hazardCursor = src.hazardCursor;
}

export class LevelSim {
  readonly course: Course;
  readonly hazards: CompiledHazard[];
  /** Item i: stars [0, nStars), coins [nStars, nStars+nCoins), power-ups after. */
  readonly itemX: Float64Array;
  readonly itemY: Float64Array;
  readonly nStars: number;
  readonly nCoins: number;
  readonly nItems: number;
  readonly easy: boolean;
  readonly physics: PhysicsParams;
  readonly gravityScale: number;
  state: SimState;
  /** Items collected during the last step (indices), for particles/SFX. */
  readonly stepItems: number[] = [];
  /** Where the last hit happened (world coords) for bounce effects. */
  lastHitX = 0;
  lastHitY = 0;
  private readonly itemOrder: Int32Array;

  constructor(course: Course, opts: SimOptions = {}) {
    this.course = course;
    this.easy = !!opts.easy;
    this.physics = opts.physics ?? DEFAULT_PHYSICS;
    this.gravityScale = course.gravityScale * (this.easy ? PHYSICS.easyGravityScale : 1);
    this.hazards = course.hazards
      .map((h) => {
        const [minX, maxX] = hazardExtent(h);
        const jitter = new Float64Array(12);
        if (h.type === 'asteroid') asteroidJitter(h, jitter);
        return { h, minX, maxX, jitter };
      })
      .sort((a, b) => a.minX - b.minX);
    this.nStars = course.stars.length;
    this.nCoins = course.coins.length;
    this.nItems = this.nStars + this.nCoins + course.powerups.length;
    this.itemX = new Float64Array(this.nItems);
    this.itemY = new Float64Array(this.nItems);
    let i = 0;
    for (const [x, y] of course.stars) {
      this.itemX[i] = x;
      this.itemY[i++] = y;
    }
    for (const [x, y] of course.coins) {
      this.itemX[i] = x;
      this.itemY[i++] = y;
    }
    for (const p of course.powerups) {
      this.itemX[i] = p.x;
      this.itemY[i++] = p.y;
    }
    this.itemOrder = Int32Array.from({ length: this.nItems }, (_, k) => k).sort(
      (a, b) => (this.itemX[a] ?? 0) - (this.itemX[b] ?? 0),
    );
    const hearts = this.easy ? Infinity : (opts.hearts ?? GAMEPLAY.hearts);
    this.state = createState(course, this.nItems, hearts);
  }

  newState(): SimState {
    return createState(this.course, this.nItems, this.state.hearts);
  }

  itemKind(i: number): 'star' | 'coin' | PowerUpType {
    if (i < this.nStars) return 'star';
    if (i < this.nStars + this.nCoins) return 'coin';
    return this.course.powerups[i - this.nStars - this.nCoins]?.type ?? 'shield';
  }

  /** Puff-to-hop impulse. */
  hop(impulse: number = PHYSICS.hopImpulse): void {
    this.state.vy = Math.min(this.physics.vMax, Math.max(this.state.vy, 0) + impulse);
  }

  /** Zone forces at x: [vertical accel, speed multiplier]. */
  zoneAt(x: number, y: number): [number, number] {
    let accel = 0;
    let mul = 1;
    for (const z of this.course.zones) {
      if (x < z.x || x > z.x + z.w) continue;
      if (z.type === 'wind') {
        accel += z.fy;
        mul *= 1 + z.fx;
      } else {
        accel -= z.weight;
      }
    }
    void y;
    return [accel, mul];
  }

  /** Advance one fixed step with the given breath intensity. Returns EV bit flags. */
  step(intensity: number, dtMs: number = 1000 / 60, s: SimState = this.state): number {
    this.stepItems.length = 0;
    if (s.done || s.failed) return 0;
    let ev = 0;
    const dtReal = dtMs / 1000;
    const scale = s.slow > 0 ? GAMEPLAY.slowMoScale : 1;
    const dt = dtReal * scale;
    s.rt += dtReal;
    s.t += dt;
    if (s.invuln > 0) s.invuln = Math.max(0, s.invuln - dtReal);
    if (s.magnet > 0) s.magnet = Math.max(0, s.magnet - dtReal);
    if (s.slow > 0) s.slow = Math.max(0, s.slow - dtReal);

    const [accel, mul] = this.zoneAt(s.x, s.y);
    stepBody(s, intensity, dt, this.physics, this.gravityScale, accel);

    let speed = this.course.speed * mul;
    const pad = this.course.pad;
    if (pad) {
      const remaining = pad.x - s.x;
      if (remaining < BRAKE_DIST)
        speed = Math.min(speed, this.course.speed * Math.max(0.0, remaining / BRAKE_DIST) + 8);
      s.x = Math.min(pad.x, s.x + speed * dt);
    } else {
      s.x += speed * dt;
      if (s.x >= this.course.length) {
        s.done = true;
        ev |= EV.CHUNK_END;
      }
    }

    // Ground: landing pad = success, elsewhere = a bump (heart) and a bounce.
    if (s.y - R <= PHYSICS.groundY) {
      s.y = PHYSICS.groundY + R;
      if (pad && Math.abs(s.x - pad.x) <= pad.w / 2) {
        s.done = true;
        s.landVy = s.vy;
        s.gentle = s.vy >= GAMEPLAY.gentleLandingVy;
        s.vy = 0;
        return ev | EV.LANDED;
      }
      s.vy = GAMEPLAY.groundBounceSpeed;
      this.lastHitX = s.x;
      this.lastHitY = 0;
      ev |= EV.GROUND | this.takeHit(s);
    }

    // Hazards (broad phase via the sorted cursor).
    const hz = this.hazards;
    while (s.hazardCursor < hz.length && (hz[s.hazardCursor]?.maxX ?? 0) < s.x - R)
      s.hazardCursor++;
    if (s.invuln <= 0) {
      for (let k = s.hazardCursor; k < hz.length; k++) {
        const c = hz[k];
        if (!c || c.minX > s.x + R) break;
        if (c.maxX < s.x - R) continue;
        if (hazardHits(c.h, c.jitter, s.x, s.y, R, s.t)) {
          hazardPos(c.h, s.t, tmp);
          const hy = c.h.type === 'tree' ? Math.min(s.y, c.h.h) : tmp.y;
          const dir = s.y >= hy ? 1 : -1;
          s.vy = dir * GAMEPLAY.bounceSpeed;
          this.lastHitX = s.x;
          this.lastHitY = hy;
          ev |= this.takeHit(s);
          break;
        }
      }
    }
    if (s.failed) return ev | EV.FAILED;

    // Pickups.
    const order = this.itemOrder;
    const pickR = R + GAMEPLAY.starRadius;
    const reach = s.magnet > 0 ? GAMEPLAY.magnetRadius : pickR;
    for (let k = 0; k < order.length; k++) {
      const i = order[k] ?? 0;
      const ix = this.itemX[i] ?? 0;
      if (ix < s.x - reach) continue;
      if (ix > s.x + reach) break;
      if (s.collected[i]) continue;
      const isPower = i >= this.nStars + this.nCoins;
      const r = isPower ? R + GAMEPLAY.powerUpRadius : reach;
      const dx = ix - s.x;
      const dy = (this.itemY[i] ?? 0) - s.y;
      if (dx * dx + dy * dy > r * r) continue;
      s.collected[i] = 1;
      this.stepItems.push(i);
      if (i < this.nStars) {
        s.stars++;
        ev |= EV.STAR;
      } else if (i < this.nStars + this.nCoins) {
        s.coins += GAMEPLAY.coinValue;
        ev |= EV.COIN;
      } else {
        const type = this.itemKind(i);
        if (type === 'shield') s.shield = true;
        else if (type === 'magnet') s.magnet = GAMEPLAY.magnetMs / 1000;
        else s.slow = GAMEPLAY.slowMoMs / 1000;
        ev |= EV.POWERUP;
      }
    }
    return ev;
  }

  private takeHit(s: SimState): number {
    if (s.invuln > 0) return 0;
    s.invuln = GAMEPLAY.invulnMs / 1000;
    if (s.shield) {
      s.shield = false;
      return EV.SHIELD_BREAK;
    }
    s.hits++;
    if (Number.isFinite(s.hearts)) {
      s.hearts--;
      if (s.hearts <= 0) {
        s.hearts = 0;
        s.failed = true;
      }
    }
    return EV.HIT;
  }
}

/** Stars earned (0–3) for a collected fraction. */
export function starRating(got: number, total: number): number {
  if (total <= 0) return 3;
  const f = got / total;
  const [a, b, c] = GAMEPLAY.starThresholds;
  return f >= c ? 3 : f >= b ? 2 : f >= a ? 1 : 0;
}
