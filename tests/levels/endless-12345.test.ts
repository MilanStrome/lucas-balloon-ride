import { describe, expect, it } from 'vitest';
import { SPEEDS } from '../../src/config';
import { EndlessCourse, ENDLESS_CHUNK_SEC } from '../../src/game/CourseGenerator';
import { fairness } from './bot';
import { solveWithRetries } from './solveWithRetries';

const CHUNKS = 200;

describe('Endless chunks are solvable by the bot', () => {
  // Two seeds × 100 consecutive chunks = 200 chunks, covering the full difficulty ramp.
  for (const seed of [12345]) {
    it(`seed ${seed}: ${CHUNKS / 2} consecutive chunks`, () => {
      const course = new EndlessCourse(
        seed,
        SPEEDS.endlessStart,
        SPEEDS.endlessMax,
        (SPEEDS.endlessRampPerKm * ENDLESS_CHUNK_SEC * SPEEDS.endlessStart) / 1000,
      );
      const failures: string[] = [];
      for (let i = 0; i < CHUNKS / 2; i++) {
        const c = course.chunk(i).course;
        const r = solveWithRetries(c);
        const f = fairness(r.actions);
        if (!r.ok || f.maxHighSec > 3 || f.maxToggleHz > 4) failures.push(`${c.id}: ${r.reason}`);
      }
      expect(failures).toEqual([]);
    });
  }
});
