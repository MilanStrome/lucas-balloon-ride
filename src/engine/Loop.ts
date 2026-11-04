// Fixed 60 Hz update with an accumulator, variable render with interpolation, delta clamp.
import { LOOP } from '../config';

export class FixedLoop {
  private acc = 0;
  private last = -1;
  /** Number of fixed steps taken so far. */
  steps = 0;
  paused = false;

  constructor(
    private readonly update: (dtMs: number) => void,
    private readonly render: (alpha: number) => void,
    readonly stepMs: number = LOOP.stepMs,
    readonly maxFrameMs: number = LOOP.maxFrameMs,
  ) {}

  /** Advance to `nowMs`. Returns the number of fixed updates run. */
  frame(nowMs: number): number {
    if (this.last < 0 || this.paused) {
      this.last = nowMs;
      this.render(0);
      return 0;
    }
    let delta = nowMs - this.last;
    this.last = nowMs;
    if (delta < 0) delta = 0;
    // A backgrounded tab must not teleport the balloon.
    if (delta > this.maxFrameMs) delta = this.maxFrameMs;
    this.acc += delta;
    let n = 0;
    while (this.acc >= this.stepMs - 1e-6) {
      this.update(this.stepMs);
      this.acc = Math.max(0, this.acc - this.stepMs);
      this.steps++;
      n++;
    }
    this.render(this.acc / this.stepMs);
    return n;
  }

  /** Forget the previous timestamp (after pause/resume) so no time jump occurs. */
  resetClock(): void {
    this.last = -1;
    this.acc = 0;
  }
}
