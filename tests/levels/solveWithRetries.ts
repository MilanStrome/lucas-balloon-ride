import type { Course } from '../../src/game/levels/schema';
import { solve, type BotResult } from './bot';

/** Beam search with widening beams; a course passes if any width finds a fair solution. */
export function solveWithRetries(course: Course, beams = [60, 150, 320]): BotResult {
  let last: BotResult | null = null;
  for (const beam of beams) {
    last = solve(course, { beam });
    if (last.ok) return last;
  }
  return last!;
}
