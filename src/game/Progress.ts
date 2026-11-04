// Progress rules: stars, coins, unlocks, streaks. Pure functions over plain profile data.
import { DAILY, GAMEPLAY } from '../config';
import { daysBetween } from '../engine/Rng';
import type { DailyState, MiniBests, Profile } from '../storage/schema';
import { starRating } from './LevelSim';

export const WORLDS = 6;
export const LEVELS_PER_WORLD = 5;
export const WORLD_UNLOCK_COUNT = 4;

export const levelId = (world: number, level: number): string => `${world}-${level}`;

export function parseLevelId(id: string): [number, number] {
  const [w, l] = id.split('-').map(Number);
  return [w ?? 1, l ?? 1];
}

export function completedInWorld(p: Profile, world: number): number {
  let n = 0;
  for (let l = 1; l <= LEVELS_PER_WORLD; l++) if (p.completed[levelId(world, l)]) n++;
  return n;
}

/**
 * `unlockAll` (the "Unlock all levels" setting, on by default) opens every world and level.
 * Progress is still recorded, so turning it off falls back to step-by-step unlocking.
 */
export function isWorldUnlocked(p: Profile, world: number, unlockAll = false): boolean {
  if (world <= 1) return true;
  if (world > WORLDS) return false;
  if (unlockAll) return true;
  return isWorldUnlocked(p, world - 1) && completedInWorld(p, world - 1) >= WORLD_UNLOCK_COUNT;
}

export function unlockedWorldCount(p: Profile): number {
  let n = 1;
  while (n < WORLDS && isWorldUnlocked(p, n + 1)) n++;
  return n;
}

export function isLevelUnlocked(p: Profile, id: string, unlockAll = false): boolean {
  const [w, l] = parseLevelId(id);
  if (!isWorldUnlocked(p, w, unlockAll)) return false;
  if (unlockAll) return l >= 1 && l <= LEVELS_PER_WORLD;
  return l === 1 || !!p.completed[levelId(w, l - 1)];
}

/** Results always show at least one star for finishing (kid-friendly). */
export function resultStars(got: number, total: number): number {
  return Math.max(1, starRating(got, total));
}

export interface LevelReward {
  stars: number;
  newBest: boolean;
  coinsAdded: number;
  unlockedLevel: string | null;
  unlockedWorld: number | null;
  alreadyApplied: boolean;
}

/**
 * Apply a finished level once. `runId` makes this idempotent: double taps or a re-render of the
 * results screen can never pay twice.
 */
export function applyLevelResult(
  p: Profile,
  applied: Set<string>,
  runId: string,
  id: string,
  starsGot: number,
  starsTotal: number,
  coinsGot: number,
  gentle: boolean,
  next: string | null,
): LevelReward {
  const stars = resultStars(starsGot, starsTotal);
  if (applied.has(runId)) {
    return {
      stars,
      newBest: false,
      coinsAdded: 0,
      unlockedLevel: null,
      unlockedWorld: null,
      alreadyApplied: true,
    };
  }
  applied.add(runId);
  const [w] = parseLevelId(id);
  const worldsBefore = unlockedWorldCount(p);
  const nextWasUnlocked = next ? isLevelUnlocked(p, next) : true;
  const prev = p.stars[id] ?? 0;
  const newBest = stars > prev;
  if (newBest) p.stars[id] = stars;
  p.completed[id] = true;
  const coinsAdded =
    coinsGot +
    starsGot * GAMEPLAY.coinsPerStar +
    GAMEPLAY.levelCompleteCoins +
    (gentle ? GAMEPLAY.landingBonusCoins : 0);
  p.coins += coinsAdded;
  const worldsAfter = unlockedWorldCount(p);
  const unlockedLevel = next && !nextWasUnlocked && isLevelUnlocked(p, next) ? next : null;
  return {
    stars,
    newBest,
    coinsAdded,
    unlockedLevel,
    unlockedWorld: worldsAfter > worldsBefore ? Math.max(w + 1, worldsAfter) : null,
    alreadyApplied: false,
  };
}

export function totalStars(p: Profile): number {
  return Object.values(p.stars).reduce((a, b) => a + b, 0);
}

/** Coins + best for an Endless/Party run (applied once per runId). */
export function applyEndlessResult(
  p: Profile,
  applied: Set<string>,
  runId: string,
  distance: number,
  coins: number,
): { best: boolean; coinsAdded: number } {
  if (applied.has(runId)) return { best: false, coinsAdded: 0 };
  applied.add(runId);
  const best = distance > p.bestEndless;
  if (best) p.bestEndless = Math.floor(distance);
  p.coins += coins;
  return { best, coinsAdded: coins };
}

export function applyMiniResult(
  p: Profile,
  applied: Set<string>,
  runId: string,
  game: keyof MiniBests,
  score: number,
): { best: boolean; coinsAdded: number } {
  if (applied.has(runId)) return { best: false, coinsAdded: 0 };
  applied.add(runId);
  const best = score > p.minis[game];
  if (best) p.minis[game] = score;
  const coinsAdded = Math.min(10, Math.max(1, Math.round(score / 2)));
  p.coins += coinsAdded;
  return { best, coinsAdded };
}

export type BuyResult = 'bought' | 'owned' | 'poor';

export function buyItem(
  p: Profile,
  kind: 'skin' | 'character',
  id: string,
  price: number,
): BuyResult {
  const owned = kind === 'skin' ? p.ownedSkins : p.ownedCharacters;
  if (owned.includes(id)) return 'owned';
  if (p.coins < price) return 'poor';
  p.coins -= price;
  owned.push(id);
  return 'bought';
}

// ---- Daily streak ----

export interface DailyStatus {
  doneToday: boolean;
  streak: number;
  /** The streak will reset (a day was missed); show a gentle message. */
  missed: boolean;
}

export function dailyStatus(d: DailyState, today: string): DailyStatus {
  if (!d.lastCompleted) return { doneToday: false, streak: 0, missed: false };
  const gap = daysBetween(d.lastCompleted, today);
  if (gap <= 0) return { doneToday: true, streak: d.streak, missed: false };
  if (gap === 1) return { doneToday: false, streak: d.streak, missed: false };
  return { doneToday: false, streak: 0, missed: d.streak > 0 };
}

/**
 * Complete the Daily for `runDay` (the day the run *started*, so a run that ends after midnight
 * still counts for the day it began). Reward is granted once per day; retries are unlimited.
 * A clock set backwards (gap < 0) is tolerated: no reward change, never blocks play.
 */
export function completeDaily(
  p: Profile,
  d: DailyState,
  runDay: string,
): { rewarded: boolean; coins: number; streak: number } {
  if (d.rewarded.includes(runDay)) return { rewarded: false, coins: 0, streak: d.streak };
  const gap = d.lastCompleted ? daysBetween(d.lastCompleted, runDay) : null;
  if (gap !== null && gap < 0) {
    // Clock moved backwards: allow play, reward once for this key, keep the streak as is.
    d.rewarded.push(runDay);
    d.rewarded = d.rewarded.slice(-14);
    p.coins += DAILY.rewardCoins;
    return { rewarded: true, coins: DAILY.rewardCoins, streak: d.streak };
  }
  d.streak = gap === 1 ? d.streak + 1 : gap === 0 ? d.streak : 1;
  d.lastCompleted = runDay;
  d.rewarded.push(runDay);
  d.rewarded = d.rewarded.slice(-14);
  p.coins += DAILY.rewardCoins;
  return { rewarded: true, coins: DAILY.rewardCoins, streak: d.streak };
}
