import type { TrackId } from '../../audio/Music';
import type { CourseRunner } from '../CourseRunner';

export interface RunResult {
  /** Landed on the pad (Adventure/Daily). */
  landed: boolean;
  /** Ran out of hearts. */
  failed: boolean;
  /** Player chose to stop (Endless/Party "done"). */
  quit: boolean;
  stars: number;
  starsTotal: number;
  coins: number;
  gentle: boolean;
  distanceM: number;
  runId: string;
}

/** A course-based mode played on the Game screen. */
export interface CourseMode {
  kind: 'adventure' | 'endless' | 'daily' | 'party';
  /** Screen id (unique per run for idempotent navigation). */
  id: string;
  music: TrackId;
  easy: boolean;
  createRunner(): CourseRunner;
  /** Endless-style modes show distance instead of stars. */
  showDistance: boolean;
  /** Optional turn time limit (Party). */
  timeLimitSec?: number;
  /** Label shown in the HUD (e.g. the current party player). */
  hudLabel?: string;
  /** Called once when the run ends. */
  finish(result: RunResult): void;
  /** Retry from the "Let's try again" card. */
  retry(): void;
}
