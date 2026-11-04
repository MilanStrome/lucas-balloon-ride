import {
  expect,
  lbr,
  profileSave,
  seed,
  setIntensity,
  startLevel,
  test,
  TEST_CAL,
} from './helpers';

test('test hooks do not exist in the production build', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __lbrTestConfig: unknown }).__lbrTestConfig = {
      calibration: { noiseFloorDb: 0, maxBlowDb: 1 },
    };
  });
  await page.goto('http://localhost:4174/');
  await expect(page.getByTestId('screen-splash')).toBeVisible();
  expect(await page.evaluate(() => 'testHooks' in window || '__lbr' in window)).toBe(false);
  const scripts = await page.evaluate(async () => {
    const urls = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((n) => n.endsWith('.js'));
    const texts = await Promise.all(urls.map((u) => fetch(u).then((r) => r.text())));
    return texts.join('\n');
  });
  expect(scripts).not.toContain('__lbr"');
  expect(scripts).not.toContain('installTestHooks');
});

test('the production PWA is installable (manifest, icons, service worker)', async ({ page }) => {
  await page.goto('http://localhost:4174/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[];
  };
  expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);
  const manifest = (await cdp.send('Page.getAppManifest')) as { errors: unknown[]; data?: string };
  expect(manifest.errors).toEqual([]);
  const m = JSON.parse(manifest.data ?? '{}') as {
    display: string;
    orientation: string;
    icons: { purpose?: string }[];
  };
  expect(m.display).toBe('standalone');
  expect(m.orientation).toBe('any');
  expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
});

test('offline: load once, go offline, reload → the game is fully playable', async ({
  page,
  context,
}) => {
  await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
  await page.goto('');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('screen-splash')).toBeVisible();
  await page.getByTestId('splash-start').click();
  await page.getByTestId('profile-ptest').click();
  await expect(page.getByTestId('screen-menu')).toBeVisible();
  await page.waitForTimeout(300);
  await startLevel(page, '1-1');
  await setIntensity(page, 0.45);
  await expect.poll(() => lbr<number>(page, 's.game.x')).toBeGreaterThan(100);
  // The font is self-hosted and cached too.
  expect(await page.evaluate(() => document.fonts.check('900 20px "SN Pro"'))).toBe(true);
  await context.setOffline(false);
});

const VIEWPORTS = [
  { name: 'phone-portrait', width: 360, height: 740 },
  { name: 'phone-landscape', width: 740, height: 360 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'desktop', width: 1920, height: 1080 },
];

for (const vp of VIEWPORTS) {
  test(`layout at ${vp.width}×${vp.height}: no overlap or clipping`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
    await page.goto('');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${vp.name}-splash.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
    await page.getByTestId('splash-start').click();
    await page.getByTestId('profile-ptest').click();
    await expect(page.getByTestId('screen-menu')).toBeVisible();
    await page.waitForTimeout(400);
    // Every control is fully inside the viewport (scrolling allowed on tiny screens), ≥ 56 px, and none overlap.
    const boxes = await page.locator('.screen button').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return {
          x: r.left,
          y: r.top + (e.closest('.screen')?.scrollTop ?? 0),
          w: r.width,
          h: r.height,
          id: e.getAttribute('data-testid'),
        };
      }),
    );
    for (const b of boxes) {
      expect(b.x, `${b.id} left`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w, `${b.id} right`).toBeLessThanOrEqual(vp.width + 0.5);
      expect(Math.min(b.w, b.h), `${b.id} size`).toBeGreaterThanOrEqual(56);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const c = boxes[j]!;
        const overlap =
          a.x < c.x + c.w - 1 && c.x < a.x + a.w - 1 && a.y < c.y + c.h - 1 && c.y < a.y + a.h - 1;
        expect(overlap, `${a.id} overlaps ${c.id}`).toBe(false);
      }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page).toHaveScreenshot(`${vp.name}-menu.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
    await page.getByTestId('menu-adventure').click();
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot(`${vp.name}-worlds.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
    await page.getByTestId('world-1').click();
    await page.waitForTimeout(400);
    await page.getByTestId('level-1-1').click();
    await page.waitForTimeout(400); // let the screen fade-in finish
    // HUD stays inside the screen; the canvas fills it.
    const hud = await page.locator('.hud').boundingBox();
    expect(hud!.x + hud!.width).toBeLessThanOrEqual(vp.width + 0.5);
    const canvas = await page.getByTestId('game-canvas').boundingBox();
    expect(Math.round(canvas!.width)).toBe(vp.width);
    expect(Math.round(canvas!.height)).toBe(vp.height);
    if (vp.height > vp.width) await expect(page.getByTestId('rotate-hint')).toBeVisible();
  });
}
