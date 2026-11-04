import { describe, expect, it } from 'vitest';
import { DAILY, SPEEDS } from '../../src/config';
import { generateDaily } from '../../src/game/CourseGenerator';
import { dateKeyOf, dateSeed } from '../../src/engine/Rng';
import { fairness } from './bot';
import { solveWithRetries } from './solveWithRetries';

const DAYS = 60;

function keys(): string[] {
  const out: string[] = [];
  for (let i = 0; i < DAYS; i++) out.push(dateKeyOf(new Date(2026, 10, 1 + i, 12)));
  return out;
}

describe('Daily courses are solvable by the bot', () => {
  for (const unlocked of [6]) {
    it(`60 consecutive seeds with ${unlocked} worlds of mechanics`, () => {
      const failures: string[] = [];
      for (const key of keys()) {
        const c = generateDaily(
          dateSeed(key),
          key,
          unlocked,
          SPEEDS.endlessStart,
          DAILY.lengthSec,
        ).course;
        const r = solveWithRetries(c);
        const f = fairness(r.actions);
        if (!r.ok || f.maxHighSec > 3 || f.maxToggleHz > 4) failures.push(`${key}: ${r.reason}`);
      }
      expect(failures).toEqual([]);
    });
  }
});
