import { describe, expect, it } from 'vitest';
import { GAMEPLAY, PHYSICS } from '../../src/config';
import {
  generateCourse,
  generateDaily,
  EndlessCourse,
  mixMechanics,
  worldMechanics,
  dailyWorlds,
  NO_MECHANICS,
} from '../../src/game/CourseGenerator';
import { CourseRunner } from '../../src/game/CourseRunner';
import { EV, LevelSim, copyState } from '../../src/game/LevelSim';
import { loadAllWorlds, nextLevelId, getLevel, levelIds } from '../../src/game/levels';
import {
  LevelValidationError,
  validateCourse,
  validateWorld,
  type Course,
} from '../../src/game/levels/schema';
import { CalmSession, calmPattern } from '../../src/game/modes/CalmBreathing';
import { MiniBubbles } from '../../src/game/modes/MiniBubbles';
import { MiniCandles } from '../../src/game/modes/MiniCandles';
import { MiniSailboat } from '../../src/game/modes/MiniSailboat';
import { newParty, partyOver, podium, recordTurn } from '../../src/game/modes/Party';
import { parseCharacters } from '../../src/game/Characters';
import { makeQuestion } from '../../src/ui/ParentalGate';
import { dateSeed } from '../../src/engine/Rng';

function course(extra: Partial<Course> = {}): Course {
  return {
    id: 't',
    world: 1,
    speed: 200,
    length: 4000,
    gravityScale: 1,
    night: false,
    startY: 500,
    startVy: 0,
    stars: [[300, 500]],
    coins: [[600, 500]],
    hazards: [],
    zones: [],
    powerups: [],
    fireflies: [],
    pad: { x: 3700, w: 340 },
    ...extra,
  };
}

const run = (sim: LevelSim, intensity: number, ticks: number) => {
  let ev = 0;
  for (let i = 0; i < ticks; i++) ev |= sim.step(intensity);
  return ev;
};

describe('LevelSim', () => {
  it('collects stars and coins on the path', () => {
    const sim = new LevelSim(course());
    const ev = run(sim, 0.4545, 240);
    expect(ev & EV.STAR).toBeTruthy();
    expect(ev & EV.COIN).toBeTruthy();
    expect(sim.state.stars).toBe(1);
    expect(sim.state.coins).toBe(GAMEPLAY.coinValue);
    expect(sim.itemKind(0)).toBe('star');
    expect(sim.itemKind(1)).toBe('coin');
  });

  it('ground outside the pad costs a heart and bounces; 3 hits = soft fail', () => {
    const sim = new LevelSim(course());
    let ev = 0;
    for (let i = 0; i < 2000 && !sim.state.failed; i++) ev |= sim.step(0);
    expect(ev & EV.GROUND).toBeTruthy();
    expect(sim.state.failed).toBe(true);
    expect(sim.state.hearts).toBe(0);
    expect(sim.step(0)).toBe(0);
  });

  it('invincibility after a hit lasts 1.5 s', () => {
    const sim = new LevelSim(course());
    while (!(sim.step(0) & EV.HIT));
    expect(sim.state.invuln).toBeCloseTo(GAMEPLAY.invulnMs / 1000, 1);
    expect(sim.state.vy).toBeGreaterThan(0);
  });

  it('easy mode: infinite hearts and reduced gravity', () => {
    const sim = new LevelSim(course(), { easy: true });
    expect(sim.gravityScale).toBeCloseTo(PHYSICS.easyGravityScale);
    run(sim, 0, 3000);
    expect(sim.state.failed).toBe(false);
    expect(sim.state.hits).toBeGreaterThan(2);
  });

  it('lands on the pad: done + gentle landing flag', () => {
    const sim = new LevelSim(course({ length: 1200, pad: { x: 900, w: 400 } }));
    let landed = 0;
    for (let i = 0; i < 4000 && !sim.state.done; i++) {
      const s = sim.state;
      const intensity = s.x < 850 ? 0.4545 : s.vy < -120 ? 0.5 : 0.4;
      landed |= sim.step(intensity) & EV.LANDED;
    }
    expect(landed).toBeTruthy();
    expect(sim.state.done).toBe(true);
    expect(sim.state.gentle).toBe(true);
  });

  it('hazards: tree, cloud, bird, asteroid hits; shield absorbs one', () => {
    const hazards = [
      { type: 'tree' as const, x: 300, w: 100, h: 520 },
      { type: 'cloud' as const, x: 1200, y: 500, r: 60 },
      { type: 'bird' as const, x: 2000, y: 500, r: 30, amp: 0, freq: 0.3, phase: 0, ax: 0 },
      {
        type: 'asteroid' as const,
        x: 2800,
        y: 500,
        r: 60,
        sides: 6,
        spin: 0.5,
        amp: 0,
        freq: 0.1,
        phase: 0,
      },
    ];
    const sim = new LevelSim(
      course({
        hazards,
        powerups: [{ type: 'shield', x: 100, y: 500 }],
        length: 6000,
        pad: { x: 5800, w: 300 },
      }),
    );
    let hits = 0;
    let shield = 0;
    for (let i = 0; i < 1200; i++) {
      // Hold altitude at 500 regardless of bounces.
      const s = sim.state;
      const ev = sim.step(Math.max(0, Math.min(1, 0.4545 + (500 - s.y) * 0.01 - s.vy * 0.002)));
      if (ev & EV.HIT) hits++;
      if (ev & EV.SHIELD_BREAK) shield++;
    }
    expect(shield).toBe(1);
    expect(hits).toBe(3);
  });

  it('wind and rain zones change forces and speed; power-ups apply', () => {
    const zones = [
      { type: 'wind' as const, x: 0, w: 1000, fx: 0.5, fy: 200 },
      { type: 'rain' as const, x: 1000, w: 1000, weight: 220 },
    ];
    const sim = new LevelSim(
      course({
        zones,
        powerups: [
          { type: 'magnet', x: 50, y: 500 },
          { type: 'slowmo', x: 150, y: 500 },
        ],
      }),
    );
    expect(sim.zoneAt(10, 500)).toEqual([200, 1.5]);
    expect(sim.zoneAt(1500, 500)).toEqual([-220, 1]);
    run(sim, 0.4545, 60);
    expect(sim.state.magnet).toBeGreaterThan(0);
    expect(sim.state.slow).toBeGreaterThan(0);
    expect(sim.state.t).toBeLessThan(sim.state.rt);
    sim.hop();
    expect(sim.state.vy).toBeGreaterThanOrEqual(PHYSICS.hopImpulse);
  });

  it('endless chunks end at the chunk length; copyState clones', () => {
    const sim = new LevelSim(course({ pad: null, length: 600 }));
    const other = sim.newState();
    copyState(other, sim.state);
    expect(other).not.toBe(sim.state);
    let ev = 0;
    for (let i = 0; i < 400 && !sim.state.done; i++) ev |= sim.step(0.4545);
    expect(ev & EV.CHUNK_END).toBeTruthy();
  });
});

describe('CourseGenerator', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const o = {
      id: 'x',
      seed: 7,
      world: 3,
      speed: 180,
      lengthSec: 30,
      mechanics: worldMechanics(3, 4),
      difficulty: 0.5,
      pad: true,
    };
    const a = generateCourse(o).course;
    const b = generateCourse(o).course;
    const c = generateCourse({ ...o, seed: 8 }).course;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
    expect(a.hazards.length).toBeGreaterThan(0);
    expect(() => validateCourse(a)).not.toThrow();
  });

  it('mechanics per world, daily mixes, endless chain', () => {
    expect(worldMechanics(1, 1)).toEqual(NO_MECHANICS);
    expect(worldMechanics(2, 1).wind).toBe(true);
    expect(worldMechanics(5, 1).night).toBe(true);
    expect(mixMechanics([1, 2, 3]).birds).toBe(true);
    expect(mixMechanics([1, 2, 3, 4, 5]).night).toBe(false);
    expect(dailyWorlds(1)).toEqual([1, 2, 3]);
    expect(dailyWorlds(5)).toEqual([1, 2, 3, 4, 5]);
    const d1 = generateDaily(dateSeed('2026-11-04'), '2026-11-04', 1, 190, 60).course;
    const d2 = generateDaily(dateSeed('2026-11-04'), '2026-11-04', 2, 190, 60).course;
    expect(JSON.stringify(d1)).toBe(JSON.stringify(d2));
    const e = new EndlessCourse(5, 190, 300, 20);
    const c0 = e.chunk(0);
    const c2 = e.chunk(2);
    expect(c2.course.speed).toBeGreaterThan(c0.course.speed);
    e.forgetBefore(1);
    expect(c0.course.hazards).toHaveLength(0);
  });

  it('CourseRunner carries state across endless chunks', () => {
    const r = new CourseRunner({ endlessSeed: 3 }, { easy: true });
    const len = r.cur.course.length;
    for (let i = 0; i < 6000 && r.curOffset === 0; i++)
      r.step(Math.max(0, Math.min(1, 0.4545 + (520 - r.state.y) * 0.01)), 1000 / 60);
    expect(r.curOffset).toBe(len);
    expect(r.worldX).toBeGreaterThan(len);
    expect(r.isEndless).toBe(true);
    expect(r.distanceM).toBe(Math.floor(r.worldX / 10));
  });
});

describe('levels', () => {
  it('30 valid levels in order', () => {
    expect(levelIds()).toHaveLength(30);
    expect(nextLevelId('1-5')).toBe('2-1');
    expect(nextLevelId('6-5')).toBeNull();
    expect(getLevel('nope')).toBeNull();
    expect(loadAllWorlds()[5]?.levels[0]?.gravityScale).toBeLessThan(1);
  });

  it('schema rejects invalid data with a precise path', () => {
    const good = getLevel('1-1')!;
    expect(() => validateCourse({ ...good, speed: 'fast' })).toThrow(LevelValidationError);
    expect(() => validateCourse({ ...good, stars: [] })).toThrow(/at least one star/);
    expect(() => validateCourse({ ...good, hazards: [{ type: 'dragon', x: 1 }] })).toThrow(
      /unknown hazard/,
    );
    expect(() => validateCourse({ ...good, zones: [{ type: 'fog', x: 1, w: 100 }] })).toThrow(
      /unknown zone/,
    );
    expect(() => validateCourse({ ...good, powerups: [{ type: 'rocket', x: 1, y: 1 }] })).toThrow(
      /power-up/,
    );
    expect(() => validateCourse({ ...good, stars: [[1]] })).toThrow(/\[x, y\]/);
    expect(() => validateCourse(null)).toThrow();
    expect(() => validateCourse({ ...good, id: '' })).toThrow();
    expect(() => validateCourse({ ...good, coins: 'x' })).toThrow();
    expect(() => validateWorld({ world: 2, levels: [] }, 1)).toThrow();
    expect(() => validateWorld({ world: 1, levels: [] }, 1)).toThrow(/5 levels/);
    expect(() =>
      validateWorld({ world: 1, levels: Array(5).fill({ ...good, pad: null }) }, 1),
    ).toThrow(/landing pad/);
    expect(() =>
      validateWorld({ world: 1, levels: Array(5).fill({ ...good, speed: good.length / 20 }) }, 1),
    ).toThrow(/duration/);
  });
});

describe('modes', () => {
  it('party podium handles ties and order', () => {
    const p = newParty(['bear', 'cat', 'fox'], 1);
    recordTurn(p, 120);
    recordTurn(p, 300);
    expect(partyOver(p)).toBe(false);
    recordTurn(p, 120);
    recordTurn(p, 999);
    expect(partyOver(p)).toBe(true);
    const r = podium(p);
    expect(r.map((x) => x.place)).toEqual([1, 2, 2]);
    expect(r[0]?.player.avatar).toBe('cat');
    expect(newParty(['a'], 1).players).toHaveLength(2);
    expect(newParty(Array(9).fill('a'), 1).players).toHaveLength(6);
  });

  it('calm: steadiness only, no failure; ends with goodnight', () => {
    const [i, o] = calmPattern(1);
    expect([i, o]).toEqual([4, 6]);
    expect(calmPattern(99)).toEqual([4, 6]);
    const c = new CalmSession(i, o, 1);
    for (let k = 0; k < 600; k++) c.update(0.1, c.phase === 'out' ? 0.3 : 0);
    expect(c.steadiness).toBeGreaterThan(90);
    expect(c.breaths).toBeGreaterThan(4);
    const hard = new CalmSession(4, 6, 1);
    for (let k = 0; k < 100; k++) hard.update(0.1, 1);
    expect(hard.wobble).toBeGreaterThan(0);
    for (let k = 0; k < 700; k++) hard.update(0.1, 1);
    expect(hard.phase).toBe('done');
    expect(new CalmSession(4, 6, 1).steadiness).toBe(0);
  });

  it('candles: a 400 ms sustained blow puts out the cursor candle', () => {
    const m = new MiniCandles(3);
    expect(m.update(0.3, 0.6, true)).toBeNull();
    expect(m.update(0.15, 0.6, true)).toBe('blowout');
    expect(m.score).toBe(1);
    m.update(0.5, 0.6, true);
    expect(m.update(0.5, 0.6, true)).toBe('cheer');
    expect(m.allOut).toBe(true);
    for (let k = 0; k < 30; k++) m.update(0.1, 0, false);
    expect(m.done).toBe(true);
    expect(new MiniCandles(20).lit).toHaveLength(8);
    const weak = new MiniCandles(3);
    for (let k = 0; k < 20; k++) weak.update(0.1, 0.1, true);
    expect(weak.score).toBe(0);
  });

  it('sailboat: intensity → speed with drag, reach the dock', () => {
    const b = new MiniSailboat();
    let cue = null;
    for (let k = 0; k < 600 && !cue; k++) cue = b.update(0.1, 1);
    expect(cue).toBe('cheer');
    expect(b.won).toBe(true);
    expect(b.score).toBeGreaterThan(0);
    const slow = new MiniSailboat();
    for (let k = 0; k < 500; k++) slow.update(0.1, 0);
    expect(slow.won).toBe(false);
    for (let k = 0; k < 40; k++) slow.update(0.1, 0);
    expect(slow.done).toBe(true);
  });

  it('bubbles: gentle grows, hard pops, stopping releases', () => {
    const b = new MiniBubbles();
    for (let k = 0; k < 20; k++) b.update(0.1, 0.4, true);
    expect(b.size).toBeGreaterThan(0.5);
    for (let k = 0; k < 4; k++) b.update(0.1, 0, false);
    expect(b.released).toBe(1);
    for (let k = 0; k < 10; k++) b.update(0.1, 0.4, true);
    let cue = null;
    for (let k = 0; k < 5 && cue !== 'pop'; k++) cue = b.update(0.1, 0.95, true);
    expect(cue).toBe('pop');
    expect(b.popped).toBe(1);
    for (let k = 0; k < 700; k++) b.update(0.1, 0, false);
    expect(b.done).toBe(true);
    expect(b.score).toBeGreaterThanOrEqual(1);
  });

  it('characters.json parsing tolerates bad entries', () => {
    const list = parseCharacters([
      { id: 'ok', price: 5, poses: { idle: 'idle.svg', hit: '../evil.js' } },
      { id: 'BAD ID' },
      5,
      { id: 'ph', placeholder: { ears: 'long' } },
    ]);
    expect(list.map((c) => c.id)).toEqual(['ok', 'ph']);
    expect(list[0]?.poses).toEqual({ idle: 'idle.svg' });
    expect(list[1]?.placeholder?.ears).toBe('long');
    expect(parseCharacters('nope')[0]?.id).toBe('lucas');
    expect(parseCharacters([])[0]?.id).toBe('lucas');
  });

  it('parental gate questions have 3 distinct options including the answer', () => {
    let s = 1;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 50; k++) {
      const q = makeQuestion(rand);
      expect(q.answer).toBe(q.a + q.b);
      expect(new Set(q.options).size).toBe(3);
      expect(q.options).toContain(q.answer);
    }
  });
});
