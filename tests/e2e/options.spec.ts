import {
  expect,
  lbr,
  passGate,
  profileSave,
  seed,
  test,
  TEST_CAL,
  toMenu,
  withMic,
} from './helpers';

test('all levels are unlocked by default; the setting brings back step-by-step unlocking', async ({
  page,
}) => {
  await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
  await toMenu(page);
  await page.getByTestId('menu-adventure').click();
  await page.waitForTimeout(350);
  await expect(page.getByTestId('world-6')).not.toHaveClass(/locked/);
  await page.getByTestId('world-6').click();
  await expect(page.getByTestId('level-6-5')).not.toHaveClass(/locked/);
  // Turn it off in Settings.
  await page.getByTestId('back').click();
  await page.waitForTimeout(350);
  await page.getByTestId('back').click();
  await page.waitForTimeout(350);
  await page.getByTestId('menu-settings').click();
  await passGate(page);
  await expect(page.getByTestId('toggle-unlockAll')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('toggle-unlockAll').click();
  await expect(page.getByTestId('toggle-unlockAll')).toHaveAttribute('aria-pressed', 'false');
  expect(await lbr<boolean>(page, 's.save.settings.unlockAll')).toBe(false);
  await page.getByTestId('back').click();
  await page.waitForTimeout(350);
  await page.getByTestId('menu-adventure').click();
  await expect(page.getByTestId('world-2')).toHaveClass(/locked/);
});

test('"Try another way" plays with tap & hold even when there is no mic', async ({ page }) => {
  // No microphone at all: the quiet mic attempt fails and the game carries on with tap only.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('should not be called', 'NotAllowedError'));
  });
  await seed(page, { save: profileSave() });
  await page.goto('');
  await page.getByTestId('try-another-way').click();
  await page.getByTestId('profile-ptest').click();
  await expect(page.getByTestId('screen-menu')).toBeVisible();
  expect(await lbr<boolean>(page, 's.save.settings.tapMode')).toBe(true);
  await page.waitForTimeout(350);
  await page.getByTestId('menu-adventure').click();
  await page.waitForTimeout(350);
  await page.getByTestId('world-1').click();
  await page.waitForTimeout(350);
  await page.getByTestId('level-1-1').click();
  await expect(page.getByTestId('blow-prompt')).toHaveText('Tap and hold to fly!');
  // Hold on the screen: the balloon takes off and rises.
  const canvas = await page.getByTestId('game-canvas').boundingBox();
  await page.mouse.move(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2);
  await page.mouse.down();
  await expect.poll(() => lbr<boolean>(page, 's.game.started')).toBe(true);
  await page.waitForTimeout(1500);
  expect(await lbr<number>(page, 's.game.y')).toBeGreaterThan(540);
  await page.mouse.up();
  expect(await lbr<string>(page, 's.micState')).toBe('error');
  await expect(page.getByTestId('screen-mic-help')).toHaveCount(0);
});

test('"Try another way" is offered from the start of calibration', async ({ page }) => {
  await seed(page, {});
  await page.goto('');
  await page.getByTestId('splash-start').click();
  await expect(page.getByTestId('screen-mic-check')).toBeVisible();
  await page.getByTestId('check-another-way').click();
  await expect(page.getByTestId('screen-profile-create')).toBeVisible();
  expect(await lbr<boolean>(page, 's.save.settings.tapMode')).toBe(true);
});

test('after "Try another way", blowing still works (mic listens in the background)', async ({
  baseURL,
}) => {
  // The recording starts with 2 s of room noise, then a long blow (like a real room).
  await withMic('calibration', baseURL!, async (page) => {
    // No saved calibration: the game measures the room by itself.
    await seed(page, { save: profileSave() });
    await page.goto('');
    await page.getByTestId('try-another-way').click();
    await page.getByTestId('profile-ptest').click();
    await expect(page.getByTestId('screen-menu')).toBeVisible();
    await expect.poll(() => lbr<string>(page, 's.micState')).toBe('on');
    await page.waitForTimeout(1200); // quick room measurement (0.8 s)
    await page.getByTestId('menu-adventure').click();
    await page.waitForTimeout(350);
    await page.getByTestId('world-1').click();
    await page.waitForTimeout(350);
    await page.getByTestId('level-1-1').click();
    await expect(page.getByTestId('blow-prompt')).toHaveText('Blow, or tap and hold to fly!');
    await expect.poll(() => lbr<boolean>(page, 's.isBlowing'), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => lbr<boolean>(page, 's.game.started')).toBe(true);
    await expect
      .poll(() => lbr<number>(page, 's.game.y'), { timeout: 10_000 })
      .toBeGreaterThan(560);
  });
});

test('a blow during the quick room measurement does not stop later blows working', async ({
  baseURL,
}) => {
  await withMic('hard-blow', baseURL!, async (page) => {
    await seed(page, { save: profileSave() });
    await page.goto('');
    await page.getByTestId('try-another-way').click();
    await page.getByTestId('profile-ptest').click();
    await expect.poll(() => lbr<string>(page, 's.micState')).toBe('on');
    await page.waitForTimeout(1200);
    const cal = await lbr<{ noiseFloorDb: number }>(page, 's.calibration');
    expect(cal.noiseFloorDb).toBeLessThanOrEqual(-42);
    await expect.poll(() => lbr<boolean>(page, 's.isBlowing'), { timeout: 10_000 }).toBe(true);
  });
});
