// PURE: trajectory-first course generation.
// 1) place zones, 2) fly a kid-like reference breathing pattern through them with the real
// LevelSim, 3) put stars on that path and hazards only where they keep clear of it.
// Every course therefore has a known fair solution; the level bot re-verifies independently.
import { PHYSICS } from '../config';
import { mulberry32, randRange, type Rng } from '../engine/Rng';
import { LevelSim, hazardExtent, hazardHits, type SimState } from './LevelSim';
import type { Course, Hazard, Point, PowerUpDef, Zone } from './levels/schema';

export interface Mechanics {
  trees: boolean;
  wind: boolean;
  birds: boolean;
  bees: boolean;
  rain: boolean;
  darkClouds: boolean;
  night: boolean;
  asteroids: boolean;
  powerups: boolean;
}

export const NO_MECHANICS: Mechanics = {
  trees: false,
  wind: false,
  birds: false,
  bees: false,
  rain: false,
  darkClouds: false,
  night: false,
  asteroids: false,
  powerups: false,
};

/** Mechanics introduced by each world (cumulative helpers below). */
export function worldMechanics(world: number, level: number): Mechanics {
  const m = { ...NO_MECHANICS };
  if (world === 1) m.trees = level >= 3;
  if (world === 2) {
    m.wind = true;
    m.trees = level >= 2;
  }
  if (world === 3) {
    m.birds = true;
    m.bees = level >= 3;
    m.trees = true;
  }
  if (world === 4) {
    m.rain = true;
    m.darkClouds = level >= 2;
    m.wind = level >= 4;
  }
  if (world === 5) {
    m.night = true;
    m.birds = level >= 2;
    m.trees = true;
  }
  if (world === 6) {
    m.asteroids = true;
  }
  m.powerups = world >= 2;
  return m;
}

/** Union of mechanics for a set of worlds (Daily mixes the unlocked worlds). */
export function mixMechanics(worlds: number[]): Mechanics {
  const m = { ...NO_MECHANICS };
  for (const w of worlds) {
    const wm = worldMechanics(w, 4);
    for (const k of Object.keys(m) as (keyof Mechanics)[]) m[k] = m[k] || wm[k];
  }
  // Night and space change the whole course; in a mix they only contribute their objects.
  m.night = false;
  return m;
}

export interface GenOptions {
  id: string;
  seed: number;
  world: number;
  speed: number;
  lengthSec: number;
  mechanics: Mechanics;
  /** 0..1 */
  difficulty: number;
  gravityScale?: number;
  startY?: number;
  startVy?: number;
  pad: boolean;
}

export interface GenResult {
  course: Course;
  /** Reference trajectory (x, y) sampled every tick. */
  pathX: Float64Array;
  pathY: Float64Array;
  pathT: Float64Array;
  exitY: number;
  exitVy: number;
}

const R = PHYSICS.balloonRadius;
const PAD_W = 340;
const EDGE_FREE = 320;

/** A kid-like breathing controller: exhale 1.6–3.4 s steering to a target, inhale 0.5–1.1 s. */
class BreathingPilot {
  private target: number;
  private phaseLeft: number;
  private exhaling = true;
  private nextTargetX: number;
  private held = 0;

  constructor(
    private readonly rng: Rng,
    startY: number,
    private readonly lo: number,
    private readonly hi: number,
  ) {
    this.target = Math.max(lo, Math.min(hi, startY));
    this.phaseLeft = randRange(rng, 1.6, 3.0);
    this.nextTargetX = 0;
  }

  /** Decide the next 0.1 s intensity (quantized to 0.1, never above 0.8). */
  decide(sim: LevelSim, s: SimState, landing: boolean): number {
    if (s.x >= this.nextTargetX) {
      this.target = randRange(this.rng, this.lo, this.hi);
      this.nextTargetX = s.x + randRange(this.rng, 500, 1100);
    }
    const [accel] = sim.zoneAt(s.x, s.y);
    const g = sim.physics.gravity * sim.gravityScale - accel;
    const lift = sim.physics.liftMax;
    if (landing) {
      // Gentle descent onto the pad.
      const vDes = s.y > 300 ? -150 : -90;
      const want = (g + sim.physics.drag * s.vy + (vDes - s.vy) * 3) / lift;
      return quantize(Math.max(0, Math.min(0.8, want)));
    }
    this.phaseLeft -= 0.1;
    if (this.phaseLeft <= 0) {
      // Only take a breath when there is room to sink.
      if (this.exhaling && s.y > this.lo + 60 && s.vy > -60) {
        this.exhaling = false;
        this.phaseLeft = randRange(this.rng, 0.5, 1.1);
      } else {
        this.exhaling = true;
        this.phaseLeft = randRange(this.rng, 1.6, 3.4);
      }
    }
    if (!this.exhaling && s.y < this.lo - 40) {
      this.exhaling = true;
      this.phaseLeft = randRange(this.rng, 1.6, 3.4);
    }
    if (!this.exhaling) return 0;
    const vDes = Math.max(-170, Math.min(170, (this.target - s.y) * 1.1));
    const want = (g + sim.physics.drag * s.vy + (vDes - s.vy) * 2.5) / lift;
    this.held++;
    return quantize(Math.max(0.1, Math.min(0.8, want)));
  }
}

const quantize = (v: number) => Math.round(v * 10) / 10;

function emptyCourse(o: GenOptions, length: number): Course {
  return {
    id: o.id,
    world: o.world,
    speed: o.speed,
    length,
    gravityScale: o.gravityScale ?? 1,
    night: o.mechanics.night,
    startY: o.startY ?? 520,
    startVy: o.startVy ?? 0,
    stars: [],
    coins: [],
    hazards: [],
    zones: [],
    powerups: [],
    fireflies: [],
    pad: o.pad ? { x: length - 260, w: PAD_W } : null,
  };
}

function placeZones(rng: Rng, o: GenOptions, length: number): Zone[] {
  const zones: Zone[] = [];
  const kinds: ('wind' | 'rain')[] = [];
  if (o.mechanics.wind) kinds.push('wind');
  if (o.mechanics.rain) kinds.push('rain');
  if (!kinds.length) return zones;
  let x = 900 + rng() * 500;
  const end = length - 1100;
  while (x < end) {
    const w = randRange(rng, 520, 950);
    if (x + w > end) break;
    const kind = kinds[Math.floor(rng() * kinds.length)] ?? 'wind';
    if (kind === 'wind') {
      const dirs = [
        [0, 220],
        [0, -200],
        [0.35, 0],
        [-0.25, 0],
        [0.25, 150],
      ];
      const d = dirs[Math.floor(rng() * dirs.length)] ?? [0, 200];
      const k = 0.7 + 0.5 * o.difficulty;
      zones.push({
        type: 'wind',
        x: Math.round(x),
        w: Math.round(w),
        fx: Math.round((d[0] ?? 0) * k * 100) / 100,
        fy: Math.round((d[1] ?? 0) * k),
      });
    } else {
      zones.push({ type: 'rain', x: Math.round(x), w: Math.round(w), weight: PHYSICS.rainWeight });
    }
    x += w + randRange(rng, 700, 1500) * (1.2 - 0.5 * o.difficulty);
  }
  return zones;
}

function interpY(px: Float64Array, py: Float64Array, n: number, x: number): number {
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((px[mid] ?? 0) < x) lo = mid + 1;
    else hi = mid;
  }
  return py[lo] ?? 500;
}

export function generateCourse(o: GenOptions): GenResult {
  const rng = mulberry32(o.seed);
  const length = Math.round(o.speed * o.lengthSec);
  const course = emptyCourse(o, length);
  course.zones = placeZones(rng, o, length);
  const lo = o.mechanics.trees ? 330 : 260;
  const hi = 780;

  // 2) Fly the reference pilot through the zones.
  const sim = new LevelSim(course, { hearts: 1e9 });
  const pilot = new BreathingPilot(rng, course.startY, lo, hi);
  const cap = Math.ceil((o.lengthSec + 40) * 60);
  const px = new Float64Array(cap);
  const py = new Float64Array(cap);
  const pt = new Float64Array(cap);
  let n = 0;
  let intensity = 0;
  const s = sim.state;
  for (let tick = 0; tick < cap && !s.done; tick++) {
    if (tick % 6 === 0) {
      const landing = !!course.pad && s.x > course.pad.x - course.pad.w / 2 - 260;
      intensity = pilot.decide(sim, s, landing);
    }
    sim.step(intensity);
    px[n] = s.x;
    py[n] = s.y;
    pt[n] = s.t;
    n++;
  }
  const pathX = px.subarray(0, n);
  const pathY = py.subarray(0, n);
  const pathT = pt.subarray(0, n);
  const lastX = course.pad ? course.pad.x - course.pad.w / 2 - 200 : length - 120;

  // 3) Stars along the path.
  const spacing = 330 + rng() * 60;
  const stars: Point[] = [];
  for (let x = 380; x < lastX; x += spacing)
    stars.push([Math.round(x), Math.round(interpY(pathX, pathY, n, x))]);
  course.stars = stars;

  // 4) Hazards that keep clear of the reference path.
  const margin = 62 - 18 * o.difficulty;
  const clear = (h: Hazard): boolean => {
    const [minX, maxX] = hazardExtent(h);
    if (minX < EDGE_FREE || maxX > lastX + 100) return false;
    for (let i = 0; i < n; i++) {
      const x = pathX[i] ?? 0;
      if (x < minX - R - margin) continue;
      if (x > maxX + R + margin) break;
      if (hazardHits(h, null, x, pathY[i] ?? 0, R + margin, pathT[i] ?? 0)) return false;
    }
    for (const [sx, sy] of stars) {
      if (sx < minX - 80 || sx > maxX + 80) continue;
      if (h.type === 'tree' && sy < h.h + 60 && sx > h.x - 40 && sx < h.x + h.w + 40) return false;
      if (h.type === 'cloud' && Math.hypot(sx - h.x, sy - h.y) < h.r + 50) return false;
    }
    return true;
  };
  const kinds: Hazard['type'][] = [];
  const m = o.mechanics;
  if (m.trees) kinds.push('tree');
  if (m.birds) kinds.push('bird', 'bird');
  if (m.bees) kinds.push('bee');
  if (m.darkClouds) kinds.push('cloud', 'cloud');
  if (m.asteroids) kinds.push('asteroid', 'asteroid');
  const hazards: Hazard[] = [];
  if (kinds.length) {
    const gap = 820 - 420 * o.difficulty;
    for (let x = EDGE_FREE + 300 + rng() * 300; x < lastX - 200; x += gap * (0.75 + rng() * 0.6)) {
      const kind = kinds[Math.floor(rng() * kinds.length)] ?? 'tree';
      for (let attempt = 0; attempt < 10; attempt++) {
        const h = proposeHazard(kind, rng, x + (rng() - 0.5) * 120, pathX, pathY, n, o.difficulty);
        if (h && clear(h)) {
          hazards.push(h);
          break;
        }
      }
    }
  }
  course.hazards = hazards;

  // 5) Coins in risk-reward spots, just off the path.
  const coins: Point[] = [];
  for (let i = 1; i < stars.length; i += 2) {
    const a = stars[i - 1];
    const b = stars[i];
    if (!a || !b) continue;
    const cx = Math.round((a[0] + b[0]) / 2);
    const off = (rng() < 0.5 ? -1 : 1) * (95 + rng() * 60);
    const cy = Math.round(Math.max(90, Math.min(900, interpY(pathX, pathY, n, cx) + off)));
    if (!hazards.some((h) => hazardHits(h, null, cx, cy, 40, 0))) coins.push([cx, cy]);
  }
  course.coins = coins;

  // 6) Power-ups on the path, between stars.
  const powerups: PowerUpDef[] = [];
  if (m.powerups && stars.length > 6) {
    const types: PowerUpDef['type'][] = ['shield', 'magnet', 'slowmo'];
    const count = 1 + (rng() < 0.5 ? 1 : 0);
    for (let k = 0; k < count; k++) {
      const idx = Math.floor((stars.length * (k + 1)) / (count + 1));
      const a = stars[idx];
      const b = stars[idx + 1];
      if (!a || !b) continue;
      const x = Math.round((a[0] + b[0]) / 2);
      powerups.push({
        type: types[Math.floor(rng() * 3)] ?? 'shield',
        x,
        y: Math.round(interpY(pathX, pathY, n, x)),
      });
    }
  }
  course.powerups = powerups;

  // 7) Fireflies light the way at night.
  if (m.night) {
    const ff: Point[] = [];
    for (let x = 250; x < lastX; x += 420) {
      ff.push([
        Math.round(x),
        Math.round(Math.max(60, Math.min(940, interpY(pathX, pathY, n, x) + (rng() - 0.5) * 140))),
      ]);
    }
    course.fireflies = ff;
  }

  return {
    course,
    pathX,
    pathY,
    pathT,
    exitY: s.y,
    exitVy: s.vy,
  };
}

function proposeHazard(
  kind: Hazard['type'],
  rng: Rng,
  x: number,
  px: Float64Array,
  py: Float64Array,
  n: number,
  difficulty: number,
): Hazard | null {
  const pathY = interpY(px, py, n, x);
  const above = rng() < 0.5;
  switch (kind) {
    case 'tree': {
      const w = 70 + rng() * 60;
      // Height up to just under the path (checked precisely by clear()).
      let minY = Infinity;
      for (let i = 0; i < n; i++) {
        const xi = px[i] ?? 0;
        if (xi < x - 200) continue;
        if (xi > x + w + 200) break;
        minY = Math.min(minY, py[i] ?? 0);
      }
      const maxH = minY - R - 80;
      if (maxH < 90) return null;
      return {
        type: 'tree',
        x: Math.round(x),
        w: Math.round(w),
        h: Math.round(Math.min(560, 90 + rng() * (maxH - 90))),
      };
    }
    case 'cloud': {
      const r = 60 + rng() * 40;
      const off = (r + R + 90 + rng() * 120) * (above ? 1 : -1);
      const y = pathY + off;
      if (y - r < 60 || y + r > 1000) return null;
      return { type: 'cloud', x: Math.round(x), y: Math.round(y), r: Math.round(r) };
    }
    case 'bird':
    case 'bee': {
      const r = kind === 'bird' ? 34 : 24;
      const amp = (kind === 'bird' ? 60 : 30) + rng() * (40 + 60 * difficulty);
      const off = (r + R + amp + 70 + rng() * 80) * (above ? 1 : -1);
      const y = pathY + off;
      if (y - amp - r < 40 || y + amp + r > 990) return null;
      return {
        type: kind,
        x: Math.round(x),
        y: Math.round(y),
        r,
        amp: Math.round(amp),
        freq: Math.round((0.25 + rng() * 0.35) * 100) / 100,
        phase: Math.round(rng() * 628) / 100,
        ax: kind === 'bee' ? 30 : 0,
      };
    }
    case 'asteroid': {
      const r = 45 + rng() * 45;
      const amp = rng() * 40;
      const off = (r + R + amp + 80 + rng() * 110) * (above ? 1 : -1);
      const y = pathY + off;
      if (y - r - amp < 40 || y + r + amp > 990) return null;
      return {
        type: 'asteroid',
        x: Math.round(x),
        y: Math.round(y),
        r: Math.round(r),
        sides: 6 + Math.floor(rng() * 3),
        spin: Math.round((rng() - 0.5) * 100) / 100,
        amp: Math.round(amp),
        freq: Math.round((0.1 + rng() * 0.2) * 100) / 100,
        phase: Math.round(rng() * 628) / 100,
      };
    }
  }
}

// ---- Endless / Party ----

export const ENDLESS_CHUNK_SEC = 14;

export function endlessMechanics(index: number): Mechanics {
  const m = { ...NO_MECHANICS, trees: true, powerups: index > 1 };
  if (index >= 2) m.wind = true;
  if (index >= 3) m.birds = true;
  if (index >= 5) m.rain = true;
  if (index >= 6) m.darkClouds = true;
  if (index >= 7) m.bees = true;
  if (index >= 9) m.asteroids = true;
  return m;
}

export interface ChunkCtx {
  seed: number;
  index: number;
  startY: number;
  startVy: number;
}

/** Endless chunk i. Difficulty ramps with distance; speed ramps gently. */
export function generateEndlessChunk(
  c: ChunkCtx,
  baseSpeed: number,
  maxSpeed: number,
  rampPerChunk: number,
): GenResult {
  const speed = Math.min(maxSpeed, baseSpeed + rampPerChunk * c.index);
  return generateCourse({
    id: `endless-${c.seed}-${c.index}`,
    seed: (c.seed ^ Math.imul(c.index + 1, 0x9e3779b1)) >>> 0,
    world: 1 + (Math.floor(c.index / 3) % 4),
    speed,
    lengthSec: ENDLESS_CHUNK_SEC,
    mechanics: endlessMechanics(c.index),
    difficulty: Math.min(0.9, 0.15 + c.index * 0.06),
    startY: c.startY,
    startVy: c.startVy,
    pad: false,
  });
}

/** Deterministic chain of chunks: chunk i starts where chunk i-1's reference path ended. */
export class EndlessCourse {
  private readonly chunks: GenResult[] = [];

  constructor(
    readonly seed: number,
    private readonly baseSpeed: number,
    private readonly maxSpeed: number,
    private readonly ramp: number,
  ) {}

  chunk(i: number): GenResult {
    while (this.chunks.length <= i) {
      const k = this.chunks.length;
      const prev = this.chunks[k - 1];
      this.chunks.push(
        generateEndlessChunk(
          {
            seed: this.seed,
            index: k,
            startY: prev ? prev.exitY : 520,
            startVy: prev ? prev.exitVy : 0,
          },
          this.baseSpeed,
          this.maxSpeed,
          this.ramp,
        ),
      );
    }
    const c = this.chunks[i];
    if (!c) throw new Error('chunk generation failed');
    return c;
  }

  /** Drop chunks before `i` (memory stays flat in long sessions). */
  forgetBefore(i: number): void {
    for (let k = 0; k < i && k < this.chunks.length; k++) {
      const c = this.chunks[k];
      if (c) {
        c.course.hazards.length = 0;
        c.course.stars.length = 0;
        c.course.coins.length = 0;
      }
    }
  }
}

// ---- Daily ----

export function dailyWorlds(unlockedWorlds: number): number[] {
  const n = Math.max(3, Math.min(6, unlockedWorlds));
  return Array.from({ length: n }, (_, i) => i + 1);
}

export function generateDaily(
  seed: number,
  key: string,
  unlockedWorlds: number,
  speed: number,
  lengthSec: number,
): GenResult {
  const worlds = dailyWorlds(unlockedWorlds);
  return generateCourse({
    id: `daily-${key}-${worlds.length}`,
    seed,
    world: 1 + (seed % 4),
    speed,
    lengthSec,
    mechanics: mixMechanics(worlds),
    difficulty: 0.45,
    pad: true,
  });
}
