// Course (level) data shape + validation. Invalid levels fail the build and fail at load.
import { PHYSICS } from '../../config';

export type Point = [number, number];

export type Hazard =
  | { type: 'tree'; x: number; w: number; h: number }
  | { type: 'cloud'; x: number; y: number; r: number }
  | {
      type: 'bird' | 'bee';
      x: number;
      y: number;
      r: number;
      amp: number;
      freq: number;
      phase: number;
      ax: number;
    }
  | {
      type: 'asteroid';
      x: number;
      y: number;
      r: number;
      sides: number;
      spin: number;
      amp: number;
      freq: number;
      phase: number;
    };

export type Zone =
  | { type: 'wind'; x: number; w: number; fx: number; fy: number }
  | { type: 'rain'; x: number; w: number; weight: number };

export type PowerUpType = 'shield' | 'magnet' | 'slowmo';
export interface PowerUpDef {
  type: PowerUpType;
  x: number;
  y: number;
}

export interface Course {
  id: string;
  world: number;
  speed: number;
  length: number;
  gravityScale: number;
  night: boolean;
  startY: number;
  startVy: number;
  stars: Point[];
  coins: Point[];
  hazards: Hazard[];
  zones: Zone[];
  powerups: PowerUpDef[];
  fireflies: Point[];
  /** Landing pad (centre x, width). Null for endless chunks. */
  pad: { x: number; w: number } | null;
}

export interface WorldFile {
  world: number;
  levels: Course[];
}

const H = PHYSICS.worldHeight;

export class LevelValidationError extends Error {}

function fin(v: unknown, path: string, lo = -Infinity, hi = Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) {
    throw new LevelValidationError(`${path}: expected number in [${lo}, ${hi}], got ${String(v)}`);
  }
  return v;
}

function points(v: unknown, path: string, len: number): Point[] {
  if (!Array.isArray(v)) throw new LevelValidationError(`${path}: expected array`);
  return v.map((p, i) => {
    if (!Array.isArray(p) || p.length !== 2)
      throw new LevelValidationError(`${path}[${i}]: expected [x, y]`);
    return [fin(p[0], `${path}[${i}].x`, 0, len), fin(p[1], `${path}[${i}].y`, 0, H)] as Point;
  });
}

const obj = (v: unknown, path: string): Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v))
    throw new LevelValidationError(`${path}: expected object`);
  return v as Record<string, unknown>;
};

function hazard(v: unknown, path: string, len: number): Hazard {
  const o = obj(v, path);
  const x = fin(o['x'], `${path}.x`, 0, len);
  switch (o['type']) {
    case 'tree':
      return {
        type: 'tree',
        x,
        w: fin(o['w'], `${path}.w`, 10, 600),
        h: fin(o['h'], `${path}.h`, 10, H * 0.7),
      };
    case 'cloud':
      return {
        type: 'cloud',
        x,
        y: fin(o['y'], `${path}.y`, 0, H),
        r: fin(o['r'], `${path}.r`, 10, 250),
      };
    case 'bird':
    case 'bee':
      return {
        type: o['type'],
        x,
        y: fin(o['y'], `${path}.y`, 0, H),
        r: fin(o['r'], `${path}.r`, 10, 120),
        amp: fin(o['amp'], `${path}.amp`, 0, 400),
        freq: fin(o['freq'], `${path}.freq`, 0, 3),
        phase: fin(o['phase'], `${path}.phase`, -100, 100),
        ax: fin(o['ax'], `${path}.ax`, 0, 200),
      };
    case 'asteroid':
      return {
        type: 'asteroid',
        x,
        y: fin(o['y'], `${path}.y`, 0, H),
        r: fin(o['r'], `${path}.r`, 10, 200),
        sides: Math.round(fin(o['sides'], `${path}.sides`, 5, 9)),
        spin: fin(o['spin'], `${path}.spin`, -3, 3),
        amp: fin(o['amp'], `${path}.amp`, 0, 300),
        freq: fin(o['freq'], `${path}.freq`, 0, 2),
        phase: fin(o['phase'], `${path}.phase`, -100, 100),
      };
    default:
      throw new LevelValidationError(`${path}.type: unknown hazard ${String(o['type'])}`);
  }
}

function zone(v: unknown, path: string, len: number): Zone {
  const o = obj(v, path);
  const x = fin(o['x'], `${path}.x`, 0, len);
  const w = fin(o['w'], `${path}.w`, 50, len);
  if (o['type'] === 'wind')
    return {
      type: 'wind',
      x,
      w,
      fx: fin(o['fx'], `${path}.fx`, -0.5, 0.8),
      fy: fin(o['fy'], `${path}.fy`, -500, 500),
    };
  if (o['type'] === 'rain')
    return { type: 'rain', x, w, weight: fin(o['weight'], `${path}.weight`, 0, 500) };
  throw new LevelValidationError(`${path}.type: unknown zone ${String(o['type'])}`);
}

/** Validates unknown JSON into a Course. Throws LevelValidationError with a precise path. */
export function validateCourse(v: unknown, path = 'course'): Course {
  const o = obj(v, path);
  if (typeof o['id'] !== 'string' || !o['id'])
    throw new LevelValidationError(`${path}.id: expected string`);
  const length = fin(o['length'], `${path}.length`, 500, 100_000);
  const arr = (k: string) => {
    const a = o[k];
    if (!Array.isArray(a)) throw new LevelValidationError(`${path}.${k}: expected array`);
    return a as unknown[];
  };
  const padRaw = o['pad'];
  let pad: Course['pad'] = null;
  if (padRaw !== null) {
    const p = obj(padRaw, `${path}.pad`);
    pad = {
      x: fin(p['x'], `${path}.pad.x`, 0, length),
      w: fin(p['w'], `${path}.pad.w`, 120, 1000),
    };
  }
  const powerups = arr('powerups').map((pv, i) => {
    const p = obj(pv, `${path}.powerups[${i}]`);
    const type = p['type'];
    if (type !== 'shield' && type !== 'magnet' && type !== 'slowmo') {
      throw new LevelValidationError(`${path}.powerups[${i}].type: unknown power-up`);
    }
    return {
      type,
      x: fin(p['x'], `${path}.powerups[${i}].x`, 0, length),
      y: fin(p['y'], `${path}.powerups[${i}].y`, 0, H),
    } as PowerUpDef;
  });
  const course: Course = {
    id: o['id'],
    world: Math.round(fin(o['world'], `${path}.world`, 1, 6)),
    speed: fin(o['speed'], `${path}.speed`, 50, 500),
    length,
    gravityScale: fin(o['gravityScale'], `${path}.gravityScale`, 0.2, 2),
    night: o['night'] === true,
    startY: fin(o['startY'], `${path}.startY`, 50, H - 50),
    startVy: fin(o['startVy'] ?? 0, `${path}.startVy`, -500, 500),
    stars: points(o['stars'], `${path}.stars`, length),
    coins: points(o['coins'], `${path}.coins`, length),
    hazards: arr('hazards').map((hz, i) => hazard(hz, `${path}.hazards[${i}]`, length)),
    zones: arr('zones').map((z, i) => zone(z, `${path}.zones[${i}]`, length)),
    powerups,
    fireflies: points(o['fireflies'], `${path}.fireflies`, length),
    pad,
  };
  if (course.stars.length === 0)
    throw new LevelValidationError(`${path}.stars: a level needs at least one star`);
  return course;
}

export function validateWorld(v: unknown, expectWorld: number): WorldFile {
  const o = obj(v, `world-${expectWorld}`);
  if (o['world'] !== expectWorld)
    throw new LevelValidationError(`world-${expectWorld}: wrong world number`);
  const levels = o['levels'];
  if (!Array.isArray(levels) || levels.length !== 5)
    throw new LevelValidationError(`world-${expectWorld}: expected 5 levels`);
  const out = levels.map((l, i) => validateCourse(l, `world-${expectWorld}.levels[${i}]`));
  for (const l of out) {
    if (!l.pad) throw new LevelValidationError(`${l.id}: adventure levels need a landing pad`);
    const dur = l.length / l.speed;
    if (dur < 45 || dur > 90)
      throw new LevelValidationError(`${l.id}: duration ${dur.toFixed(0)} s outside 45–90 s`);
  }
  return { world: expectWorld, levels: out };
}
