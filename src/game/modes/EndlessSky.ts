// Endless Sky: seeded procedural chunks, difficulty ramps with distance; score = distance.
import type { App } from '../../App';
import { gameScreen } from '../../ui/screens/Game';
import { resultsScreen } from '../../ui/screens/Results';
import { CourseRunner } from '../CourseRunner';
import { applyEndlessResult } from '../Progress';
import type { CourseMode, RunResult } from './types';

let runCounter = 0;

export function endlessMode(app: App, seed: number | null): CourseMode {
  const runSeed = seed ?? Math.floor(Math.random() * 2 ** 31);
  const runId = `endless-${runSeed}-${Date.now().toString(36)}-${runCounter++}`;
  return {
    kind: 'endless',
    id: runId,
    music: 'w2',
    easy: app.store.data.settings.easyMode,
    showDistance: true,
    createRunner: () =>
      new CourseRunner({ endlessSeed: runSeed }, { easy: app.store.data.settings.easyMode }),
    finish: (r: RunResult) => {
      let res = { best: false, coinsAdded: 0 };
      app.store.update(() => {
        res = applyEndlessResult(app.p, app.applied, r.runId, r.distanceM, r.coins);
      });
      app.store.flush();
      app.router.replace(
        () =>
          resultsScreen(app, {
            id: `results-${r.runId}`,
            stars: null,
            distanceM: r.distanceM,
            best: app.p.bestEndless,
            coins: res.coinsAdded,
            gentle: false,
            newBest: res.best,
            unlocked: null,
            retry: () => app.router.replace(() => gameScreen(app, endlessMode(app, null)), true),
            next: null,
          }),
        true,
      );
    },
    retry: () => app.router.replace(() => gameScreen(app, endlessMode(app, null)), true),
  };
}
