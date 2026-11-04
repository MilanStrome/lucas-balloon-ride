import {
  expect,
  lbr,
  passGate,
  profileSave,
  seed,
  setIntensity,
  startLevel,
  test,
  TEST_CAL,
  toMenu,
} from './helpers';

test.describe('mic denied', () => {
  test('denied → Mic Help screen; "Try another way" switches to tap & hold', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('denied', 'NotAllowedError'));
    });
    await page.goto('');
    await page.getByTestId('splash-start').click();
    await expect(page.getByTestId('screen-mic-help')).toBeVisible();
    await expect(page.getByTestId('mic-help-reason')).toContainText('turned off');
    await page.getByTestId('mic-fallback').click();
    await expect(page.getByTestId('parental-gate')).toHaveCount(0);
    await expect(page.getByTestId('screen-profile-create')).toBeVisible();
    const save = await lbr<{ settings: { tapMode: boolean } }>(page, 's.save');
    expect(save.settings.tapMode).toBe(true);
  });

  test('no microphone hardware → Mic Help explains it', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('none', 'NotFoundError'));
    });
    await page.goto('');
    await page.getByTestId('splash-start').click();
    await expect(page.getByTestId('mic-help-reason')).toContainText("couldn't find");
  });

  test('rejected constraints fall back to {audio:true}', async ({ page }) => {
    await page.addInitScript(() => {
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (c?: MediaStreamConstraints) =>
        c && typeof c.audio === 'object'
          ? Promise.reject(new DOMException('no', 'OverconstrainedError'))
          : real(c);
    });
    await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
    await toMenu(page);
    expect(await lbr<string>(page, 's.micState')).toBe('on');
  });
});

test.describe('pause & back', () => {
  test('pause on visibilitychange, no time jump, resume by blowing', async ({ page }) => {
    await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
    await toMenu(page);
    await startLevel(page, '1-1');
    await setIntensity(page, 0.45);
    await expect.poll(() => lbr<boolean>(page, 's.game.started')).toBe(true);
    await setIntensity(page, 0);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    const x0 = await lbr<number>(page, 's.game.x');
    await page.waitForTimeout(1500);
    expect(await lbr<number>(page, 's.game.x')).toBe(x0);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => lbr<string>(page, 's.micState')).toBe('on');
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    // "Blow to continue!"
    await setIntensity(page, 0.6);
    await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
    const x1 = await lbr<number>(page, 's.game.x');
    expect(x1 - x0).toBeLessThan(200);
  });

  test('browser back during play pauses first and never leaves the level', async ({ page }) => {
    await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
    await toMenu(page);
    await startLevel(page, '1-1');
    await page.goBack();
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    await expect(page.getByTestId('game-canvas')).toBeVisible();
    await page.getByTestId('pause-resume').click();
    await expect(page.getByTestId('pause-overlay')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('screen-menu')).toBeVisible();
  });

  test('window blur pauses gameplay', async ({ page }) => {
    await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
    await toMenu(page);
    await startLevel(page, '1-1');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
  });

  test('resize and orientation change mid-level keep the level running', async ({ page }) => {
    await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
    await toMenu(page);
    await startLevel(page, '1-1');
    await setIntensity(page, 0.45);
    await expect.poll(() => lbr<boolean>(page, 's.game.started')).toBe(true);
    const id = await lbr<string>(page, 's.screen');
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 740, height: 360 });
    await page.waitForTimeout(300);
    expect(await lbr<string>(page, 's.screen')).toBe(id);
    expect(await lbr<number>(page, 's.game.x')).toBeGreaterThan(0);
    await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    expect(await lbr<string>(page, 's.screen')).toBe(id);
  });

  test('mic unplugged mid-level → pause with "Mic lost, tap to reconnect"', async ({ page }) => {
    await page.addInitScript(() => {
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      const w = window as unknown as { __streams: MediaStream[] };
      w.__streams = [];
      navigator.mediaDevices.getUserMedia = async (c?: MediaStreamConstraints) => {
        const st = await real(c);
        w.__streams.push(st);
        return st;
      };
    });
    await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
    await toMenu(page);
    await startLevel(page, '1-1');
    // Unplug: the live track ends (as a Bluetooth headset switching off would).
    await page.evaluate(() => {
      const w = window as unknown as { __streams: MediaStream[] };
      for (const st of w.__streams)
        for (const t of st.getTracks()) {
          t.stop();
          t.dispatchEvent(new Event('ended'));
        }
    });
    await expect(page.getByTestId('mic-lost')).toBeVisible();
    await expect(page.getByTestId('mic-lost')).toContainText('Mic lost, tap to reconnect');
    await page.getByTestId('mic-reconnect').click();
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    expect(await lbr<string>(page, 's.micState')).toBe('on');
  });
});

test.describe('gates & rapid taps', () => {
  test('Settings require the parental gate', async ({ page }) => {
    await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
    await toMenu(page);
    await page.getByTestId('menu-settings').click();
    await expect(page.getByTestId('parental-gate')).toBeVisible();
    await expect(page.getByTestId('screen-settings')).toHaveCount(0);
    // Math only: no hold button, a question with three answers.
    await expect(page.getByTestId('gate-hold')).toHaveCount(0);
    await expect(page.getByTestId('gate-question')).toContainText('+');
    await expect(page.locator('[data-testid^="gate-answer-"]')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('parental-gate')).toHaveCount(0);
    await page.waitForTimeout(600); // double-tap guard
    await page.getByTestId('menu-settings').click();
    await passGate(page);
    await expect(page.getByTestId('screen-settings')).toBeVisible();
    await expect(page.getByText('never recorded')).toBeVisible();
  });

  test('a wrong answer closes the gate without opening Settings', async ({ page }) => {
    await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
    await toMenu(page);
    await page.getByTestId('menu-settings').click();
    const q = await page.getByTestId('gate-question').textContent();
    const m = /(\d+)\s*\+\s*(\d+)/.exec(q ?? '');
    const right = Number(m?.[1]) + Number(m?.[2]);
    const wrong = page
      .locator(`[data-testid^="gate-answer-"]:not([data-testid="gate-answer-${right}"])`)
      .first();
    await wrong.click();
    await expect(page.getByTestId('parental-gate')).toHaveCount(0);
    await expect(page.getByTestId('screen-menu')).toBeVisible();
  });

  test('double-taps never open duplicate screens', async ({ page }) => {
    await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
    await toMenu(page);
    await page.getByTestId('menu-adventure').dblclick();
    await expect(page.getByTestId('screen-world-map')).toHaveCount(1);
    await page.getByTestId('world-1').dblclick();
    await expect(page.locator('.screen')).toHaveCount(1);
  });

  test('keyboard navigation: arrows move focus, Enter activates, Esc goes back', async ({
    page,
  }) => {
    await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
    await toMenu(page);
    await page.waitForTimeout(400); // transition guard
    await page.getByTestId('menu-adventure').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('menu-endless')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('screen-world-map')).toBeVisible();
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('screen-menu')).toBeVisible();
  });
});
