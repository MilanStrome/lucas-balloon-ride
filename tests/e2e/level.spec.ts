import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, lbr, profileSave, seed, startLevel, test, TEST_CAL, toMenu } from './helpers';

const world1 = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', '..', 'src', 'game', 'levels', 'world-1.json'),
    'utf8',
  ),
) as {
  levels: { stars: [number, number][]; pad: { x: number; w: number } }[];
};

test('complete level 1-1 with a scripted intensity sequence → results → progress persists', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
  await toMenu(page);
  await startLevel(page, '1-1');
  const level = world1.levels[0]!;
  // A tiny in-page pilot drives the test hook: steer towards the next star, then land gently.
  await page.evaluate(
    ({ stars, pad }) => {
      const w = window as unknown as {
        __lbr: {
          state: { game: { x: number; y: number; vy: number; done: boolean } | null };
          control: { setIntensity(v: number | null): void };
        };
      };
      const step = () => {
        const g = w.__lbr.state.game;
        if (!g || g.done) {
          w.__lbr.control.setIntensity(null);
          return;
        }
        const next = stars.find(([x]) => x > g.x - 20);
        let v: number;
        if (next && g.x < pad.x - pad.w / 2 - 150) {
          const vDes = Math.max(-150, Math.min(150, (next[1] - g.y) * 1.5));
          v = (500 + 1.5 * g.vy + (vDes - g.vy) * 3) / 1100;
        } else {
          v = (500 + 1.5 * g.vy + (-110 - g.vy) * 3) / 1100;
        }
        w.__lbr.control.setIntensity(Math.max(0.06, Math.min(1, v)));
        requestAnimationFrame(step);
      };
      step();
    },
    { stars: level.stars, pad: level.pad },
  );
  await expect(
    page.getByTestId('screen-results').or(page.locator('[data-screen^="results-"]')),
  ).toBeVisible({ timeout: 100_000 });
  const stars = Number(await page.getByTestId('result-stars').getAttribute('data-stars'));
  expect(stars).toBeGreaterThanOrEqual(2);
  const save = await lbr<{
    profiles: {
      stars: Record<string, number>;
      completed: Record<string, boolean>;
      coins: number;
    }[];
  }>(page, 's.save');
  expect(save.profiles[0]?.completed['1-1']).toBe(true);
  expect(save.profiles[0]?.coins).toBeGreaterThan(0);
  const coinsBefore = save.profiles[0]!.coins;
  // Rapid double taps on Menu must not pay twice or stack screens.
  await page.getByTestId('results-menu').dblclick();
  await expect(page.getByTestId('screen-menu')).toBeVisible();
  // Reload: progress persisted, level 1-2 unlocked.
  await page.reload();
  await page.getByTestId('splash-start').click();
  await page.getByTestId('profile-ptest').click();
  await page.getByTestId('menu-adventure').click();
  await page.getByTestId('world-1').click();
  await expect(page.getByTestId('level-1-2')).not.toHaveClass(/locked/);
  await expect(page.getByTestId('level-1-3')).toHaveClass(/locked/);
  const after = await lbr<{ profiles: { stars: Record<string, number>; coins: number }[] }>(
    page,
    's.save',
  );
  expect(after.profiles[0]?.stars['1-1']).toBe(stars);
  expect(after.profiles[0]?.coins).toBe(coinsBefore);
});

test('losing all hearts shows a soft "Let\'s try again!" (no game over)', async ({ page }) => {
  await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
  await toMenu(page);
  await startLevel(page, '1-1');
  await page.evaluate(() => {
    const w = window as unknown as {
      __lbr: { control: { script(v: number[], ms: number): void } };
    };
    w.__lbr.control.script([0.3, ...Array(200).fill(0)], 50);
  });
  await expect(page.getByTestId('try-again')).toHaveText("Let's try again!", { timeout: 30_000 });
  await expect(page.locator('body')).not.toContainText(/game over/i);
  await page.getByTestId('try-retry').click();
  await expect(page.getByTestId('blow-prompt')).toBeVisible();
});
