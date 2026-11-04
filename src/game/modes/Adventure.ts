// Adventure: 6 worlds × 5 handcrafted (generated + bot-verified) levels.
import type { App } from '../../App';
import { resultsScreen } from '../../ui/screens/Results';
import { gameScreen } from '../../ui/screens/Game';
import { CourseRunner } from '../CourseRunner';
import { getLevel, nextLevelId } from '../levels';
import { applyLevelResult, parseLevelId } from '../Progress';
import type { TrackId } from '../../audio/Music';
import type { CourseMode, RunResult } from './types';

let runCounter = 0;

export function adventureMode(app: App, levelId: string): CourseMode {
  const level = getLevel(levelId);
  if (!level) throw new Error(`unknown level ${levelId}`);
  const [world] = parseLevelId(levelId);
  const runId = `adv-${levelId}-${Date.now().toString(36)}-${runCounter++}`;
  const mode: CourseMode = {
    kind: 'adventure',
    id: runId,
    music: `w${world}` as TrackId,
    easy: app.store.data.settings.easyMode,
    showDistance: false,
    createRunner: () => new CourseRunner(level, { easy: app.store.data.settings.easyMode }),
    finish: (r: RunResult) => {
      if (!r.landed) {
        app.toMenu();
        return;
      }
      const next = nextLevelId(levelId);
      let reward: ReturnType<typeof applyLevelResult> | null = null;
      app.store.update(() => {
        reward = applyLevelResult(
          app.p,
          app.applied,
          r.runId,
          levelId,
          r.stars,
          r.starsTotal,
          r.coins,
          r.gentle,
          next,
        );
      });
      app.store.flush();
      const rw = reward as ReturnType<typeof applyLevelResult> | null;
      if (!rw) return;
      app.router.replace(
        () =>
          resultsScreen(app, {
            id: `results-${r.runId}`,
            stars: rw.stars,
            coins: rw.coinsAdded,
            gentle: r.gentle,
            newBest: rw.newBest,
            unlocked: rw.unlockedWorld ? `world.${rw.unlockedWorld}` : null,
            retry: () =>
              app.router.replace(() => gameScreen(app, adventureMode(app, levelId)), true),
            next: next
              ? () => app.router.replace(() => gameScreen(app, adventureMode(app, next)), true)
              : null,
          }),
        true,
      );
    },
    retry: () => app.router.replace(() => gameScreen(app, adventureMode(app, levelId)), true),
  };
  return mode;
}
