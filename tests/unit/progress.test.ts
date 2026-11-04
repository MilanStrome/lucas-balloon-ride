import { describe, expect, it } from 'vitest';
import { DAILY, GAMEPLAY } from '../../src/config';
import {
  applyEndlessResult,
  applyLevelResult,
  applyMiniResult,
  buyItem,
  completeDaily,
  completedInWorld,
  dailyStatus,
  isLevelUnlocked,
  isWorldUnlocked,
  levelId,
  parseLevelId,
  resultStars,
  totalStars,
  unlockedWorldCount,
} from '../../src/game/Progress';
import { starRating } from '../../src/game/LevelSim';
import { defaultDaily, newProfile } from '../../src/storage/schema';

const fresh = () => newProfile('p', 'bear', '', 0);

describe('stars', () => {
  it('thresholds ≥40 / ≥70 / ≥95 %', () => {
    expect(starRating(0, 20)).toBe(0);
    expect(starRating(7, 20)).toBe(0);
    expect(starRating(8, 20)).toBe(1);
    expect(starRating(13, 20)).toBe(1);
    expect(starRating(14, 20)).toBe(2);
    expect(starRating(18, 20)).toBe(2);
    expect(starRating(19, 20)).toBe(3);
    expect(starRating(0, 0)).toBe(3);
    // Finishing always shows at least one star.
    expect(resultStars(0, 20)).toBe(1);
    expect(resultStars(20, 20)).toBe(3);
  });
});

describe('unlocks', () => {
  it('next level unlocks on completion; next world after 4 of 5', () => {
    const p = fresh();
    expect(isLevelUnlocked(p, '1-1')).toBe(true);
    expect(isLevelUnlocked(p, '1-2')).toBe(false);
    expect(isWorldUnlocked(p, 1)).toBe(true);
    expect(isWorldUnlocked(p, 2)).toBe(false);
    expect(isWorldUnlocked(p, 7)).toBe(false);
    const applied = new Set<string>();
    const r = applyLevelResult(p, applied, 'run1', '1-1', 10, 10, 2, true, '1-2');
    expect(r.unlockedLevel).toBe('1-2');
    expect(isLevelUnlocked(p, '1-2')).toBe(true);
    for (let l = 2; l <= 3; l++)
      applyLevelResult(p, applied, `r${l}`, levelId(1, l), 5, 10, 0, false, levelId(1, l + 1));
    expect(isWorldUnlocked(p, 2)).toBe(false);
    const r4 = applyLevelResult(p, applied, 'r4', '1-4', 5, 10, 0, false, '1-5');
    expect(r4.unlockedWorld).toBe(2);
    expect(isWorldUnlocked(p, 2)).toBe(true);
    expect(isLevelUnlocked(p, '2-1')).toBe(true);
    expect(completedInWorld(p, 1)).toBe(4);
    expect(unlockedWorldCount(p)).toBe(2);
    expect(parseLevelId('3-4')).toEqual([3, 4]);
    expect(parseLevelId('bad')).toEqual([Number.NaN, 1]);
  });
});

describe('rewards', () => {
  it('coin math and no double reward for the same run', () => {
    const p = fresh();
    const applied = new Set<string>();
    const r = applyLevelResult(p, applied, 'run', '1-1', 19, 20, 4, true, '1-2');
    const expected =
      4 + 19 * GAMEPLAY.coinsPerStar + GAMEPLAY.levelCompleteCoins + GAMEPLAY.landingBonusCoins;
    expect(r.coinsAdded).toBe(expected);
    expect(r.stars).toBe(3);
    expect(r.newBest).toBe(true);
    expect(p.coins).toBe(expected);
    const again = applyLevelResult(p, applied, 'run', '1-1', 19, 20, 4, true, '1-2');
    expect(again.alreadyApplied).toBe(true);
    expect(again.coinsAdded).toBe(0);
    expect(p.coins).toBe(expected);
    // A worse replay keeps the best stars.
    const worse = applyLevelResult(p, applied, 'run2', '1-1', 1, 20, 0, false, '1-2');
    expect(worse.newBest).toBe(false);
    expect(p.stars['1-1']).toBe(3);
    expect(totalStars(p)).toBe(3);
    const last = applyLevelResult(p, applied, 'run3', '6-5', 1, 20, 0, false, null);
    expect(last.unlockedLevel).toBeNull();
  });

  it('endless and mini results are idempotent too', () => {
    const p = fresh();
    const applied = new Set<string>();
    expect(applyEndlessResult(p, applied, 'e', 120.7, 3)).toEqual({ best: true, coinsAdded: 3 });
    expect(p.bestEndless).toBe(120);
    expect(applyEndlessResult(p, applied, 'e', 500, 3)).toEqual({ best: false, coinsAdded: 0 });
    expect(applyEndlessResult(p, applied, 'e2', 50, 0).best).toBe(false);
    const m = applyMiniResult(p, applied, 'm', 'candles', 6);
    expect(m.best).toBe(true);
    expect(m.coinsAdded).toBe(3);
    expect(applyMiniResult(p, applied, 'm', 'candles', 8).coinsAdded).toBe(0);
    expect(applyMiniResult(p, applied, 'm2', 'bubbles', 100).coinsAdded).toBe(10);
    expect(applyMiniResult(p, applied, 'm3', 'bubbles', 0).coinsAdded).toBe(1);
  });

  it('shop purchases', () => {
    const p = fresh();
    expect(buyItem(p, 'skin', 'ocean', 20)).toBe('poor');
    p.coins = 25;
    expect(buyItem(p, 'skin', 'ocean', 20)).toBe('bought');
    expect(p.coins).toBe(5);
    expect(buyItem(p, 'skin', 'ocean', 20)).toBe('owned');
    p.coins = 100;
    expect(buyItem(p, 'character', 'mia', 30)).toBe('bought');
    expect(p.ownedCharacters).toContain('mia');
  });
});

describe('daily streak', () => {
  it('streak grows on consecutive days, reward once per day, retries unlimited', () => {
    const p = fresh();
    const d = defaultDaily();
    expect(dailyStatus(d, '2026-11-04')).toEqual({ doneToday: false, streak: 0, missed: false });
    expect(completeDaily(p, d, '2026-11-04')).toEqual({
      rewarded: true,
      coins: DAILY.rewardCoins,
      streak: 1,
    });
    expect(completeDaily(p, d, '2026-11-04').rewarded).toBe(false);
    expect(p.coins).toBe(DAILY.rewardCoins);
    expect(dailyStatus(d, '2026-11-04').doneToday).toBe(true);
    expect(dailyStatus(d, '2026-11-05')).toEqual({ doneToday: false, streak: 1, missed: false });
    expect(completeDaily(p, d, '2026-11-05').streak).toBe(2);
    expect(completeDaily(p, d, '2026-11-06').streak).toBe(3);
  });

  it('a missed day resets with a gentle message', () => {
    const p = fresh();
    const d = defaultDaily();
    completeDaily(p, d, '2026-11-01');
    completeDaily(p, d, '2026-11-02');
    expect(dailyStatus(d, '2026-11-04')).toEqual({ doneToday: false, streak: 0, missed: true });
    expect(completeDaily(p, d, '2026-11-04').streak).toBe(1);
  });

  it('midnight boundary: a run started on day N counts for day N', () => {
    const p = fresh();
    const d = defaultDaily();
    // Run started 23:59 on the 4th, finished 00:01 on the 5th → still the 4th's run.
    const runDay = '2026-11-04';
    expect(completeDaily(p, d, runDay).streak).toBe(1);
    expect(d.lastCompleted).toBe('2026-11-04');
    // The 5th's own run is then a fresh reward and continues the streak.
    expect(completeDaily(p, d, '2026-11-05')).toMatchObject({ rewarded: true, streak: 2 });
  });

  it('a clock moved backwards never blocks play', () => {
    const p = fresh();
    const d = defaultDaily();
    completeDaily(p, d, '2026-11-10');
    const r = completeDaily(p, d, '2026-11-08');
    expect(r.rewarded).toBe(true);
    expect(r.streak).toBe(1);
    expect(d.lastCompleted).toBe('2026-11-10');
    expect(dailyStatus(d, '2026-11-08').doneToday).toBe(true);
  });

  it('keeps only the recent reward history', () => {
    const p = fresh();
    const d = defaultDaily();
    for (let i = 1; i <= 20; i++) completeDaily(p, d, `2026-01-${String(i).padStart(2, '0')}`);
    expect(d.rewarded.length).toBeLessThanOrEqual(14);
    expect(d.streak).toBe(20);
  });
});
