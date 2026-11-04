import { describe, expect, it } from 'vitest';
import {
  dateKey,
  dateKeyOf,
  dateSeed,
  daysBetween,
  hashString,
  mulberry32,
  pick,
  randInt,
  randRange,
} from '../../src/engine/Rng';

describe('Rng', () => {
  it('same seed gives the same sequence; different seeds differ', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const sa = Array.from({ length: 20 }, a);
    expect(Array.from({ length: 20 }, b)).toEqual(sa);
    expect(Array.from({ length: 20 }, c)).not.toEqual(sa);
    for (const v of sa) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('date seed is stable and different dates differ', () => {
    expect(dateSeed('2026-11-04')).toBe(dateSeed('2026-11-04'));
    expect(dateSeed('2026-11-04')).not.toBe(dateSeed('2026-11-05'));
    expect(dateKey(2026, 1, 5)).toBe('2026-01-05');
    expect(dateKeyOf(new Date(2026, 10, 4, 23, 59, 59))).toBe('2026-11-04');
    expect(dateKeyOf(new Date(2026, 10, 5, 0, 0, 0))).toBe('2026-11-05');
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('day math across months, years and DST', () => {
    expect(daysBetween('2026-11-04', '2026-11-05')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-11-05', '2026-11-04')).toBe(-1);
  });

  it('range helpers', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const v = randRange(r, 5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
      expect([1, 2, 3]).toContain(randInt(r, 1, 3));
    }
    expect(pick(r, ['x'])).toBe('x');
    expect(() => pick(r, [])).toThrow();
  });
});
