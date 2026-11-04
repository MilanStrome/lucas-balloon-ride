// Level-solvability bot: beam search over intensity 0..1 (step 0.1) at 10 Hz decisions,
// running the real LevelSim (Physics + Collision). Kid-fairness rules are search constraints.
import { EV, LevelSim, copyState, type SimState } from '../../src/game/LevelSim';
import type { Course } from '../../src/game/levels/schema';

export const ACTIONS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const TICKS_PER_DECISION = 6; // 60 Hz sim / 10 Hz decisions
const HIGH = 0.85;
const MAX_HIGH_DECISIONS = 30; // 3 s
const MIN_SEGMENT_DECISIONS = 2; // on/off segments >= 0.2 s  =>  toggling <= 2.5 Hz (< 4 Hz)

interface Node {
  s: SimState;
  highRun: number;
  on: boolean;
  segLen: number;
  score: number;
  parent: Node | null;
  action: number;
}

function actionsOf(n: Node): number[] {
  const out: number[] = [];
  for (let c: Node | null = n; c && c.parent; c = c.parent) out.push(c.action);
  return out.reverse();
}

export interface BotResult {
  ok: boolean;
  starRatio: number;
  stars: number;
  totalStars: number;
  reason: string;
  decisions: number;
  maxHighSec: number;
  actions: number[];
}

export interface BotOptions {
  beam?: number;
  requireStarRatio?: number;
  /** Extra seconds allowed beyond the course's nominal duration. */
  slackSec?: number;
}

function heuristic(sim: LevelSim, s: SimState): number {
  let h = s.stars * 10_000;
  // Next uncollected star ahead: steer towards its height.
  let target = -1;
  for (let i = 0; i < sim.nStars; i++) {
    const x = sim.itemX[i] ?? 0;
    if (x < s.x - 40 || s.collected[i]) continue;
    target = i;
    break;
  }
  if (target >= 0) {
    const dx = (sim.itemX[target] ?? 0) - s.x;
    const w = dx < 700 ? 1 : 0.4;
    h -= Math.abs((sim.itemY[target] ?? 0) - s.y) * w;
  } else if (sim.course.pad) {
    // All stars passed: descend gently towards the pad.
    h -= s.y * 0.5 + Math.max(0, -s.vy - 150) * 2;
  } else {
    h -= Math.abs(s.y - 500) * 0.2;
  }
  // Keep a little distance from the ground and the ceiling.
  if (s.y < 120 && !(target < 0 && sim.course.pad)) h -= (120 - s.y) * 5;
  if (s.y > 900) h -= (s.y - 900) * 5;
  return h;
}

export function solve(course: Course, opts: BotOptions = {}): BotResult {
  const beamWidth = opts.beam ?? 40;
  const sim = new LevelSim(course, { hearts: 3 });
  const total = sim.nStars;
  const dur = course.length / course.speed + (opts.slackSec ?? 25);
  const maxDecisions = Math.ceil(dur * 10);
  let beam: Node[] = [
    { s: sim.newState(), highRun: 0, on: false, segLen: 99, score: 0, parent: null, action: 0 },
  ];
  const finished: Node[] = [];
  let maxHigh = 0;
  let firstFinishAt = -1;
  for (let d = 0; d < maxDecisions && beam.length; d++) {
    const children: Node[] = [];
    for (const node of beam) {
      for (const a of ACTIONS) {
        const on = a > 0;
        let segLen = node.segLen;
        if (on !== node.on) {
          if (node.segLen < MIN_SEGMENT_DECISIONS) continue;
          segLen = 1;
        } else segLen++;
        const highRun = a > HIGH ? node.highRun + 1 : 0;
        if (highRun > MAX_HIGH_DECISIONS) continue;
        const s = sim.newState();
        copyState(s, node.s);
        let bad = false;
        for (let k = 0; k < TICKS_PER_DECISION; k++) {
          const ev = sim.step(a, 1000 / 60, s);
          if (ev & (EV.HIT | EV.SHIELD_BREAK | EV.FAILED)) {
            bad = true;
            break;
          }
          if (s.done) break;
        }
        if (bad) continue;
        children.push({
          s,
          highRun,
          on,
          segLen,
          score: heuristic(sim, s),
          parent: node,
          action: a,
        });
      }
    }
    // Diversity: best node per (y, vy, stars) bucket.
    const buckets = new Map<string, Node>();
    for (const c of children) {
      if (c.s.done) {
        finished.push(c);
        continue;
      }
      const key = `${Math.round(c.s.y / 14)}|${Math.round(c.s.vy / 30)}|${c.s.stars}|${c.on ? 1 : 0}`;
      const cur = buckets.get(key);
      if (!cur || c.score > cur.score) buckets.set(key, c);
    }
    beam = [...buckets.values()].sort((a, b) => b.score - a.score).slice(0, beamWidth);
    if (finished.length && firstFinishAt < 0) firstFinishAt = d;
    if (firstFinishAt >= 0) {
      const best = Math.max(...finished.map((f) => f.s.stars));
      if (best === total || d - firstFinishAt > 40) break;
    }
  }
  if (!finished.length) {
    const reason = beam.length
      ? 'ran out of time'
      : 'every path loses a heart or breaks a fairness rule';
    return {
      ok: false,
      starRatio: 0,
      stars: 0,
      totalStars: total,
      reason,
      decisions: 0,
      maxHighSec: 0,
      actions: [],
    };
  }
  finished.sort((a, b) => b.s.stars - a.s.stars);
  const best = finished[0]!;
  const actions = actionsOf(best);
  let run = 0;
  for (const a of actions) {
    run = a > HIGH ? run + 1 : 0;
    maxHigh = Math.max(maxHigh, run);
  }
  const ratio = total ? best.s.stars / total : 1;
  const need = opts.requireStarRatio ?? 0.95;
  return {
    ok: ratio >= need,
    starRatio: ratio,
    stars: best.s.stars,
    totalStars: total,
    reason: ratio >= need ? 'ok' : `only ${(ratio * 100).toFixed(0)}% stars`,
    decisions: actions.length,
    maxHighSec: maxHigh / 10,
    actions,
  };
}

/** Independent re-check of a solution's fairness (sustained high + toggle rate). */
export function fairness(actions: number[]): { maxHighSec: number; maxToggleHz: number } {
  let run = 0;
  let maxRun = 0;
  let maxHz = 0;
  const toggles: number[] = [];
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i] ?? 0;
    run = a > HIGH ? run + 1 : 0;
    maxRun = Math.max(maxRun, run);
    if (i > 0 && a > 0 !== (actions[i - 1] ?? 0) > 0) toggles.push(i);
  }
  // A full on/off cycle = two consecutive toggles; frequency = 1 / cycle time.
  for (let k = 2; k < toggles.length; k++) {
    const cycle = ((toggles[k] ?? 0) - (toggles[k - 2] ?? 0)) / 10;
    if (cycle > 0) maxHz = Math.max(maxHz, 1 / cycle);
  }
  return { maxHighSec: maxRun / 10, maxToggleHz: maxHz };
}
