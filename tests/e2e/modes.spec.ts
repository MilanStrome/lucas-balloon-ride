import type { Browser, Page } from '@playwright/test';
import { expect, lbr, profileSave, seed, setIntensity, test, TEST_CAL, toMenu } from './helpers';

async function dailyFingerprint(
  browser: Browser,
  baseURL: string,
): Promise<{ id: string; hash: number }> {
  const ctx = await browser.newContext({ baseURL, permissions: ['microphone'] });
  const page = await ctx.newPage();
  await seed(page, {
    testConfig: { calibration: TEST_CAL, today: '2026-11-04' },
    save: profileSave(),
  });
  await toMenu(page);
  await page.getByTestId('menu-daily').click();
  await expect(page.getByTestId('daily-date')).toHaveText('2026-11-04');
  await page.getByTestId('daily-play').click();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  const id = await lbr<string>(page, 's.game.courseId');
  const hash = await lbr<number>(page, 's.game.courseHash');
  await ctx.close();
  return { id, hash };
}

test('Daily seed is the same across two fresh contexts on the same mocked date', async ({
  browser,
  baseURL,
}) => {
  const a = await dailyFingerprint(browser, baseURL!);
  const b = await dailyFingerprint(browser, baseURL!);
  expect(a.id).toBe('daily-2026-11-04-3');
  expect(b).toEqual(a);
});

async function playTurn(page: Page, intensity: number) {
  await page.getByTestId('party-turn-start').click();
  await expect(page.getByTestId('game-canvas')).toBeVisible({ timeout: 10_000 });
  await setIntensity(page, 0.45);
  await expect.poll(() => lbr<boolean>(page, 's.game.started')).toBe(true);
  await setIntensity(page, intensity);
}

test('Party: 3 players complete turns → podium shows the correct order', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, {
    testConfig: { calibration: TEST_CAL, quickTimers: true, partyTurnSec: 9 },
    save: profileSave(),
  });
  await toMenu(page);
  await page.getByTestId('menu-party').click();
  await expect(page.getByTestId('party-count')).toHaveText('3');
  await page.getByTestId('party-slot-1').click();
  await page.getByTestId('party-start').click();
  // Player 1 hovers (survives the turn), player 2 stops blowing (bumps out), player 3 hovers.
  for (const v of [0.45, 0, 0.45]) {
    await expect(page.getByTestId('party-pass')).toBeVisible({ timeout: 20_000 });
    await playTurn(page, v);
    await setIntensity(page, v);
  }
  await expect(page.getByTestId('podium')).toBeVisible({ timeout: 30_000 });
  await setIntensity(page, null);
  const places = await page
    .locator('[data-testid^="podium-"][data-place]')
    .evaluateAll((els) =>
      els.map((e) => ({
        place: Number(e.getAttribute('data-place')),
        player: Number(e.getAttribute('data-player')),
        text: e.textContent ?? '',
      })),
    );
  expect(places).toHaveLength(3);
  const dist = places.map((p) => Number(/(\d+) m/.exec(p.text)?.[1] ?? -1));
  // Sorted by distance, ties share a place, and the player who stopped blowing is last.
  for (let i = 1; i < dist.length; i++) expect(dist[i]!).toBeLessThanOrEqual(dist[i - 1]!);
  expect(places.at(-1)?.player).toBe(1);
  expect(places[0]?.place).toBe(1);
  if (dist[0] === dist[1]) expect(places[1]?.place).toBe(1);
});

test('Endless Sky runs and ends with a distance result', async ({ page }) => {
  await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
  await toMenu(page);
  await page.getByTestId('menu-endless').click();
  await setIntensity(page, 0.45);
  await expect.poll(() => lbr<number>(page, 's.game.distanceM')).toBeGreaterThan(20);
  await page.getByTestId('pause').click();
  await page.getByTestId('pause-menu').click();
  await expect(page.getByTestId('result-distance')).toBeVisible();
  const save = await lbr<{ profiles: { bestEndless: number }[] }>(page, 's.save');
  expect(save.profiles[0]?.bestEndless).toBeGreaterThan(20);
});

test('Calm Breathing shows the guide ring cues', async ({ page }) => {
  await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
  await toMenu(page);
  await page.getByTestId('menu-calm').click();
  await page.getByTestId('calm-pattern-0').click();
  await page.getByTestId('calm-start').click();
  await expect(page.getByTestId('calm-cue')).toHaveText('Breathe in…');
  await setIntensity(page, 0.3);
  await expect(page.getByTestId('calm-cue')).toHaveText('Blow gently…', { timeout: 6000 });
  await expect(page.locator('body')).not.toContainText(/therapy|medical|treat|cure/i);
});

test('Birthday Candles: sustained blowing puts the candles out', async ({ page }) => {
  await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
  await toMenu(page);
  await page.getByTestId('menu-minis').click();
  await page.getByTestId('mini-candles').click();
  await setIntensity(page, 0.6);
  await expect(page.getByTestId('mini-done')).toBeVisible({ timeout: 20_000 });
  await setIntensity(page, null);
  await page.getByTestId('mini-menu').click();
  await expect(page.getByTestId('screen-minis')).toBeVisible();
});

test('Sailboat and Bubbles start and score', async ({ page }) => {
  await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
  await toMenu(page);
  await page.getByTestId('menu-minis').click();
  await page.getByTestId('mini-sailboat').click();
  await setIntensity(page, 1);
  await expect(page.getByTestId('mini-done')).toBeVisible({ timeout: 30_000 });
  await setIntensity(page, null);
  await page.getByTestId('mini-menu').click();
  await page.waitForTimeout(400);
  await page.getByTestId('mini-bubbles').click();
  await page.evaluate(() => {
    const w = window as unknown as {
      __lbr: { control: { script(v: number[], ms: number): void } };
    };
    w.__lbr.control.script([...Array(20).fill(0.4), ...Array(6).fill(0)], 100);
  });
  await expect(page.getByTestId('mini-score')).toContainText(/Score: [1-9]/, { timeout: 8000 });
});

test('Shop: buy and use a skin with coins earned in play', async ({ page }) => {
  await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave({ coins: 25 }) });
  await toMenu(page);
  await page.getByTestId('menu-shop').click();
  await page.getByTestId('buy-ocean').click();
  await page.getByTestId('use-ocean').click();
  const save = await lbr<{ profiles: { coins: number; skin: string; ownedSkins: string[] }[] }>(
    page,
    's.save',
  );
  expect(save.profiles[0]).toMatchObject({ coins: 5, skin: 'ocean' });
  await page.getByTestId('shop-tab-characters').click();
  await expect(page.getByTestId('shop-sample-rider')).toBeVisible();
});

test('Night Sky and Space levels render without errors', async ({ page }) => {
  const completed: Record<string, boolean> = {};
  for (let w = 1; w <= 5; w++) for (let l = 1; l <= 5; l++) completed[`${w}-${l}`] = true;
  await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave({ completed }) });
  await toMenu(page);
  for (const id of ['5-1', '6-1']) {
    await page.getByTestId('menu-adventure').click();
    await page.waitForTimeout(350);
    await page.getByTestId(`world-${id[0]}`).click();
    await page.waitForTimeout(350);
    await page.getByTestId(`level-${id}`).click();
    await setIntensity(page, 0.45);
    await expect.poll(() => lbr<number>(page, 's.game.x')).toBeGreaterThan(100);
    await setIntensity(page, null);
    await page.getByTestId('pause').click();
    await page.getByTestId('pause-menu').click();
    await expect(page.getByTestId('screen-menu')).toBeVisible();
    await page.waitForTimeout(400);
  }
});
