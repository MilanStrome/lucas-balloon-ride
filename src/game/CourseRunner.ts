// Runs a single course (Adventure/Daily) or an endless chain of chunks (Endless/Party)
// behind one interface the game screen and renderer can use.
import { SPEEDS } from '../config';
import { EndlessCourse, ENDLESS_CHUNK_SEC } from './CourseGenerator';
import { EV, LevelSim, type SimState } from './LevelSim';
import type { Course } from './levels/schema';

export interface RunnerOptions {
  easy: boolean;
}

export const ENDLESS_RAMP_PER_CHUNK =
  (SPEEDS.endlessRampPerKm * ENDLESS_CHUNK_SEC * SPEEDS.endlessStart) / 1000;

export class CourseRunner {
  /** Current sim plus (endless) the next one, with their world-x offsets. */
  cur: LevelSim;
  next: LevelSim | null = null;
  curOffset = 0;
  private chunkIndex = 0;
  private readonly endless: EndlessCourse | null;
  /** Previous-step values for render interpolation. */
  prevX = 0;
  prevY = 0;

  constructor(
    course: Course | { endlessSeed: number },
    private readonly opts: RunnerOptions,
  ) {
    if ('endlessSeed' in course) {
      this.endless = new EndlessCourse(
        course.endlessSeed,
        SPEEDS.endlessStart,
        SPEEDS.endlessMax,
        ENDLESS_RAMP_PER_CHUNK,
      );
      this.cur = new LevelSim(this.endless.chunk(0).course, { easy: opts.easy });
      this.next = new LevelSim(this.endless.chunk(1).course, { easy: opts.easy });
    } else {
      this.endless = null;
      this.cur = new LevelSim(course, { easy: opts.easy });
    }
    this.prevX = this.state.x;
    this.prevY = this.state.y;
  }

  get isEndless(): boolean {
    return this.endless !== null;
  }

  get state(): SimState {
    return this.cur.state;
  }

  /** World x of the balloon (across chunks). */
  get worldX(): number {
    return this.curOffset + this.cur.state.x;
  }

  /** Distance flown in metres (10 units = 1 m). */
  get distanceM(): number {
    return Math.floor(this.worldX / 10);
  }

  get starsTotal(): number {
    return this.cur.nStars;
  }

  step(intensity: number, dtMs: number): number {
    this.prevX = this.worldX;
    this.prevY = this.cur.state.y;
    const ev = this.cur.step(intensity, dtMs);
    if (ev & EV.CHUNK_END && this.endless && this.next) this.advanceChunk();
    return ev;
  }

  hop(): void {
    this.cur.hop();
  }

  private advanceChunk(): void {
    if (!this.endless || !this.next) return;
    const a = this.cur.state;
    const b = this.next.state;
    const carryStars = a.stars;
    const carryCoins = a.coins;
    this.curOffset += this.cur.course.length;
    b.y = a.y;
    b.vy = a.vy;
    b.hearts = a.hearts;
    b.hits = a.hits;
    b.invuln = a.invuln;
    b.shield = a.shield;
    b.magnet = a.magnet;
    b.slow = a.slow;
    b.rt = a.rt;
    b.t = a.t;
    b.x = Math.max(0, a.x - this.cur.course.length);
    b.stars = carryStars;
    b.coins = carryCoins;
    this.cur = this.next;
    this.chunkIndex++;
    this.endless.forgetBefore(this.chunkIndex - 1);
    this.next = new LevelSim(this.endless.chunk(this.chunkIndex + 1).course, {
      easy: this.opts.easy,
    });
  }

  /**
   * Generate the chunk after `next` ahead of time (call from idle time), so crossing a chunk
   * boundary inside a fixed update step only builds a sim from an already generated course.
   */
  prepareAhead(): void {
    this.endless?.chunk(this.chunkIndex + 2);
  }
}
