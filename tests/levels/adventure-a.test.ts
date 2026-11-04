import { describe, expect, it } from 'vitest';
import { loadAllWorlds } from '../../src/game/levels';
import { fairness } from './bot';
import { solveWithRetries } from './solveWithRetries';

describe('Adventure worlds 1-3 are solvable by the bot', () => {
  const worlds = loadAllWorlds();
  it('has 6 worlds × 5 levels', () => {
    expect(worlds).toHaveLength(6);
    for (const w of worlds) expect(w.levels).toHaveLength(5);
  });
  for (const w of worlds.slice(0, 3)) {
    for (const level of w.levels) {
      it(`level ${level.id}: no heart lost, ≥95% stars, kid-fair`, () => {
        const r = solveWithRetries(level);
        expect(r.reason).toBe('ok');
        expect(r.starRatio).toBeGreaterThanOrEqual(0.95);
        const f = fairness(r.actions);
        expect(f.maxHighSec).toBeLessThanOrEqual(3);
        expect(f.maxToggleHz).toBeLessThanOrEqual(4);
      });
    }
  }
});
