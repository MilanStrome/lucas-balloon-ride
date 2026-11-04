// Calm Breathing: guide ring (in = expand, no blowing; out = shrink, steady gentle blow).
// Scoring is steadiness only. Blowing too hard just makes the balloon wobble, never fail.
import { CALM } from '../../config';

export type CalmPhase = 'in' | 'out' | 'ending' | 'done';

export class CalmSession {
  t = 0;
  phase: CalmPhase = 'in';
  /** 0..1 within the current breath phase. */
  phaseT = 0;
  /** 0.4..1 guide ring size. */
  ring = 0.4;
  balloonY = 0.5;
  wobble = 0;
  steadySec = 0;
  outSec = 0;
  breaths = 0;
  endT = 0;

  constructor(
    readonly inSec: number,
    readonly outSecLen: number,
    readonly minutes: number,
  ) {}

  get totalSec(): number {
    return this.minutes * 60;
  }

  /** Steadiness 0..100 (share of out-breath time spent in the gentle band). */
  get steadiness(): number {
    return this.outSec > 0 ? Math.round((100 * this.steadySec) / this.outSec) : 0;
  }

  update(dt: number, intensity: number): void {
    if (this.phase === 'done') return;
    this.t += dt;
    if (this.phase === 'ending') {
      this.endT += dt;
      this.balloonY = Math.max(0.12, this.balloonY - dt * 0.08);
      this.wobble *= 0.95;
      if (this.endT > 5) this.phase = 'done';
      return;
    }
    if (this.t >= this.totalSec) {
      this.phase = 'ending';
      return;
    }
    const cycle = this.inSec + this.outSecLen;
    const c = this.t % cycle;
    const breathing = c < this.inSec ? 'in' : 'out';
    if (breathing === 'in' && this.phase === 'out') this.breaths++;
    this.phase = breathing;
    if (breathing === 'in') {
      this.phaseT = c / this.inSec;
      this.ring = 0.4 + 0.6 * this.phaseT;
      this.balloonY += (0.5 - this.balloonY) * dt * 0.5;
    } else {
      this.phaseT = (c - this.inSec) / this.outSecLen;
      this.ring = 1 - 0.6 * this.phaseT;
      this.outSec += dt;
      if (intensity >= CALM.bandLow && intensity <= CALM.bandHigh) {
        this.steadySec += dt;
        this.balloonY += (0.62 - this.balloonY) * dt * 0.6;
      } else if (intensity > CALM.bandHigh) {
        this.wobble = Math.min(1, this.wobble + dt * 2);
      }
    }
    this.wobble = Math.max(0, this.wobble - dt * 0.6);
  }
}

export function calmPattern(idx: number): [number, number] {
  const p = CALM.patterns[idx] ?? CALM.patterns[CALM.defaultPattern];
  return [p?.[0] ?? 4, p?.[1] ?? 6];
}
