import { describe, expect, it } from 'vitest';
import {
  cameraLeft,
  computeView,
  gameplayAlpha,
  worldToScreenX,
  worldToScreenY,
} from '../../src/engine/Camera';
import {
  circleCircle,
  circlePolygon,
  circleRect,
  closestOnRect,
  regularPolygon,
} from '../../src/engine/Collision';
import { FixedLoop } from '../../src/engine/Loop';
import { DEFAULT_PHYSICS, equilibriumIntensity, stepBody } from '../../src/engine/Physics';
import { Pool } from '../../src/engine/Pool';
import { GAMEPLAY, PHYSICS } from '../../src/config';

const DT = 1 / 60;

describe('Physics', () => {
  it('zero intensity falls', () => {
    const b = { y: 500, vy: 0 };
    for (let i = 0; i < 60; i++) stepBody(b, 0, DT, DEFAULT_PHYSICS);
    expect(b.y).toBeLessThan(400);
    expect(b.vy).toBeLessThan(0);
  });

  it('equilibrium intensity hovers within ±2 units over 10 s', () => {
    const eq = equilibriumIntensity(DEFAULT_PHYSICS);
    const b = { y: 500, vy: 0 };
    for (let i = 0; i < 600; i++) {
      stepBody(b, eq, DT, DEFAULT_PHYSICS);
      expect(Math.abs(b.y - 500)).toBeLessThanOrEqual(2);
    }
    expect(equilibriumIntensity(DEFAULT_PHYSICS, 0.5, 100)).toBeCloseTo(
      (DEFAULT_PHYSICS.gravity * 0.5 + 100) / DEFAULT_PHYSICS.liftMax,
    );
  });

  it('full intensity rises; velocity is clamped to ±vMax', () => {
    const b = { y: 100, vy: 0 };
    const p = { ...DEFAULT_PHYSICS, drag: 0 };
    for (let i = 0; i < 300; i++) {
      stepBody(b, 1, DT, p);
      expect(Math.abs(b.vy)).toBeLessThanOrEqual(p.vMax);
    }
    const d = { y: 900, vy: 0 };
    for (let i = 0; i < 300; i++) {
      stepBody(d, 0, DT, p, 3);
      expect(d.vy).toBeGreaterThanOrEqual(-p.vMax);
    }
    expect(d.vy).toBe(-p.vMax);
  });

  it('soft ceiling pushes back and never exceeds the top', () => {
    const b = { y: 900, vy: 0 };
    for (let i = 0; i < 600; i++) {
      stepBody(b, 1, DT, DEFAULT_PHYSICS);
      expect(b.y).toBeLessThanOrEqual(DEFAULT_PHYSICS.topY);
    }
    expect(b.y).toBeGreaterThan(DEFAULT_PHYSICS.ceilingY);
    const top = { y: DEFAULT_PHYSICS.topY, vy: 400 };
    stepBody(top, 1, DT, { ...DEFAULT_PHYSICS, ceilingPush: 0 });
    expect(top.vy).toBe(0);
  });

  it('intensity is clamped and zone accel applies', () => {
    const a = { y: 500, vy: 0 };
    const b = { y: 500, vy: 0 };
    stepBody(a, 5, DT, DEFAULT_PHYSICS);
    stepBody(b, 1, DT, DEFAULT_PHYSICS);
    expect(a).toEqual(b);
    const c = { y: 500, vy: 0 };
    stepBody(c, -1, DT, DEFAULT_PHYSICS, 1, 600);
    expect(c.vy).toBeGreaterThan(0);
  });
});

describe('Collision', () => {
  const cases: [
    string,
    { x: number; y: number; r: number },
    { x: number; y: number; r: number },
    boolean,
  ][] = [
    ['separate', { x: 0, y: 0, r: 1 }, { x: 3, y: 0, r: 1 }, false],
    ['tangent', { x: 0, y: 0, r: 1 }, { x: 2, y: 0, r: 1 }, true],
    ['overlap', { x: 0, y: 0, r: 1 }, { x: 1, y: 1, r: 1 }, true],
    ['inside', { x: 0, y: 0, r: 5 }, { x: 1, y: 0, r: 1 }, true],
    ['same center', { x: 2, y: 2, r: 1 }, { x: 2, y: 2, r: 1 }, true],
  ];
  it.each(cases)('circle-circle %s', (_n, a, b, hit) => expect(circleCircle(a, b)).toBe(hit));

  const rect = { x: 0, y: 0, w: 10, h: 10 };
  const rectCases: [string, { x: number; y: number; r: number }, boolean][] = [
    ['far', { x: 20, y: 5, r: 2 }, false],
    ['tangent side', { x: 12, y: 5, r: 2 }, true],
    ['inside', { x: 5, y: 5, r: 1 }, true],
    ['corner miss', { x: 12, y: 12, r: 2 }, false],
    ['corner hit', { x: 11, y: 11, r: 2 }, true],
    ['corner tangent', { x: 13, y: 14, r: 5 }, true],
    ['below', { x: 5, y: -3, r: 2 }, false],
  ];
  it.each(rectCases)('circle-rect %s', (_n, c, hit) => expect(circleRect(c, rect)).toBe(hit));

  it('closest point on rect', () => {
    const o = { x: 0, y: 0 };
    closestOnRect(-5, 5, rect, o);
    expect(o).toEqual({ x: 0, y: 5 });
    closestOnRect(15, 15, rect, o);
    expect(o).toEqual({ x: 10, y: 10 });
  });

  const tri = { xs: [0, 10, 0], ys: [0, 0, 10] };
  const polyCases: [string, { x: number; y: number; r: number }, boolean][] = [
    ['inside', { x: 2, y: 2, r: 0.5 }, true],
    ['edge tangent', { x: 5, y: -1, r: 1 }, true],
    ['hypotenuse near', { x: 6, y: 6, r: 1.5 }, true],
    ['hypotenuse miss', { x: 7, y: 7, r: 1 }, false],
    ['vertex tangent', { x: 13, y: 0, r: 3 }, true],
    ['far', { x: -5, y: -5, r: 1 }, false],
  ];
  it.each(polyCases)('circle-polygon %s', (_n, c, hit) =>
    expect(circlePolygon(c, tri.xs, tri.ys)).toBe(hit),
  );

  it('degenerate polygon never hits; regular polygon builder', () => {
    expect(circlePolygon({ x: 0, y: 0, r: 5 }, [0, 1], [0, 1])).toBe(false);
    const xs = new Float64Array(6);
    const ys = new Float64Array(6);
    regularPolygon(0, 0, 10, 6, 0, xs, ys);
    expect(xs[0]).toBeCloseTo(10);
    expect(circlePolygon({ x: 0, y: 0, r: 1 }, xs, ys, 6)).toBe(true);
    regularPolygon(0, 0, 10, 4, 0, xs, ys, [1, 0.5, 1, 0.5]);
    expect(ys[1]).toBeCloseTo(5);
    expect(circlePolygon({ x: 0, y: 8, r: 1 }, xs, ys, 4)).toBe(false);
  });
});

describe('Loop', () => {
  it('runs fixed 60 Hz steps with interpolation alpha', () => {
    const updates: number[] = [];
    const alphas: number[] = [];
    const loop = new FixedLoop(
      (dt) => updates.push(dt),
      (a) => alphas.push(a),
    );
    loop.frame(0);
    expect(loop.frame(1000 / 60)).toBe(1);
    expect(loop.frame(1000 / 60 + 25)).toBe(1);
    expect(alphas.at(-1)).toBeGreaterThan(0);
    expect(alphas.at(-1)).toBeLessThan(1);
    expect(updates.every((d) => Math.abs(d - 1000 / 60) < 1e-9)).toBe(true);
  });

  it('clamps a huge delta to 100 ms (no teleport) and resets the clock', () => {
    let n = 0;
    const loop = new FixedLoop(
      () => n++,
      () => undefined,
    );
    loop.frame(0);
    loop.frame(60_000);
    expect(n).toBe(6);
    loop.resetClock();
    expect(loop.frame(120_000)).toBe(0);
    expect(loop.frame(120_000 - 5)).toBe(0);
    loop.paused = true;
    expect(loop.frame(130_000)).toBe(0);
    expect(loop.steps).toBe(6);
  });
});

describe('Camera', () => {
  it('fits 1000 units of world height and caps look-ahead on wide screens', () => {
    const phone = computeView(740, 360, 3);
    const wide = computeView(1920, 1080, 1);
    const ultra = computeView(3440, 1000, 1);
    expect(phone.scale).toBeCloseTo(0.36);
    expect(phone.dpr).toBe(2);
    expect(wide.lookAhead).toBeLessThanOrEqual(GAMEPLAY.lookAheadMax);
    expect(ultra.lookAhead).toBe(GAMEPLAY.lookAheadMax);
    expect(ultra.viewW).toBeGreaterThan(ultra.lookAhead + ultra.balloonScreenX);
    const portrait = computeView(360, 740, 2);
    expect(portrait.portrait).toBe(true);
    expect(portrait.lookAhead).toBeGreaterThan(0);
    expect(computeView(0, 0, 0).dpr).toBe(1);
  });

  it('gameplay alpha fades at the look-ahead cap', () => {
    const v = computeView(3440, 1000, 1);
    expect(gameplayAlpha(v, 0, 100)).toBe(1);
    expect(gameplayAlpha(v, 0, GAMEPLAY.lookAheadMax + 10)).toBe(0);
    const mid = gameplayAlpha(v, 0, GAMEPLAY.lookAheadMax - 75);
    expect(mid).toBeCloseTo(0.5);
  });

  it('world/screen transforms', () => {
    const v = computeView(1000, 1000, 1);
    expect(cameraLeft(v, 500)).toBeCloseTo(500 - v.balloonScreenX);
    expect(worldToScreenX(v, 500, 500)).toBeCloseTo(v.balloonScreenX);
    expect(worldToScreenY(v, PHYSICS.worldHeight)).toBe(0);
    expect(worldToScreenY(v, 0)).toBe(1000);
  });
});

describe('Pool', () => {
  it('acquires up to capacity, releases, and reuses objects', () => {
    let created = 0;
    const p = new Pool(3, () => ({ active: false, id: created++ }));
    const a = p.acquire();
    const b = p.acquire();
    const c = p.acquire();
    expect(p.acquire()).toBeNull();
    expect(created).toBe(3);
    expect(p.activeCount).toBe(3);
    p.release(b!);
    expect(p.acquire()).toBe(b);
    let seen = 0;
    p.forEachActive(() => seen++);
    expect(seen).toBe(3);
    p.releaseAll();
    expect(p.activeCount).toBe(0);
    expect([a, c].every((x) => x && !x.active)).toBe(true);
  });
});
