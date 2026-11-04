// Daily Sky Challenge: same date => same course for everyone, offline. Reward once per day.
import type { App } from '../../App';
import { DAILY, SPEEDS } from '../../config';
import { dateSeed } from '../../engine/Rng';
import { gameScreen } from '../../ui/screens/Game';
import { resultsScreen } from '../../ui/screens/Results';
import { generateDaily } from '../CourseGenerator';
import { CourseRunner } from '../CourseRunner';
import type { Course } from '../levels/schema';
import { completeDaily, resultStars, unlockedWorldCount } from '../Progress';
import type { CourseMode, RunResult } from './types';

let runCounter = 0;
const cache = new Map<string, Course>();

export function dailyCourse(dayKey: string, unlockedWorlds: number): Course {
  const k = `${dayKey}|${Math.max(3, unlockedWorlds)}`;
  let c = cache.get(k);
  if (!c) {
    c = generateDaily(
      dateSeed(dayKey),
      dayKey,
      unlockedWorlds,
      SPEEDS.endlessStart,
      DAILY.lengthSec,
    ).course;
    cache.clear();
    cache.set(k, c);
  }
  return c;
}

export function dailyMode(app: App): CourseMode {
  // The run belongs to the day it STARTED on, even if it ends after midnight.
  const runDay = app.today();
  const course = dailyCourse(runDay, unlockedWorldCount(app.p));
  const runId = `daily-${runDay}-${Date.now().toString(36)}-${runCounter++}`;
  return {
    kind: 'daily',
    id: runId,
    music: 'w1',
    easy: app.store.data.settings.easyMode,
    showDistance: false,
    createRunner: () => new CourseRunner(course, { easy: app.store.data.settings.easyMode }),
    finish: (r: RunResult) => {
      if (!r.landed) {
        app.toMenu();
        return;
      }
      let res = { rewarded: false, coins: 0, streak: 0 };
      app.store.update(() => {
        if (app.applied.has(r.runId)) return;
        app.applied.add(r.runId);
        res = completeDaily(app.p, app.store.dailyFor(app.p.id), runDay);
        app.p.coins += r.coins;
      });
      app.store.flush();
      app.router.replace(
        () =>
          resultsScreen(app, {
            id: `results-${r.runId}`,
            stars: resultStars(r.stars, r.starsTotal),
            coins: res.coins + r.coins,
            gentle: r.gentle,
            newBest: false,
            unlocked: null,
            streak: app.store.dailyFor(app.p.id).streak,
            retry: () => app.router.replace(() => gameScreen(app, dailyMode(app)), true),
            next: null,
          }),
        true,
      );
    },
    retry: () => app.router.replace(() => gameScreen(app, dailyMode(app)), true),
  };
}
