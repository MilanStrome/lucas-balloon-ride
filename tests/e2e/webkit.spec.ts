import { expect, lbr, passGate, profileSave, seed, test, TEST_CAL } from './helpers';

// WebKit (Safari engine). Playwright's WebKit has no fake-mic flags (and on some hosts no
// mediaDevices at all), so getUserMedia is replaced by a synthesized stream when possible.
// Either way this exercises layout, menus, and the AudioContext create/resume path.
test('WebKit: layout and menus render; the AudioContext resume path works', async ({ page }) => {
  await page.addInitScript(() => {
    const synth = async () => {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      if (!('createMediaStreamDestination' in ctx))
        throw new DOMException('no capture', 'NotFoundError');
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      const dest = ctx.createMediaStreamDestination();
      osc.connect(g).connect(dest);
      osc.start();
      return dest.stream;
    };
    const md = {
      getUserMedia: synth,
      enumerateDevices: async () => [],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true });
  });
  // Tap mode on, so a host without capture support still reaches the menus.
  await seed(page, {
    testConfig: { calibration: TEST_CAL },
    save: profileSave({}, { tapMode: true }),
  });
  await page.goto('');
  await expect(page.getByTestId('screen-splash')).toBeVisible();
  await page.getByTestId('splash-start').click();
  await page.getByTestId('profile-ptest').click();
  await expect(page.getByTestId('screen-menu')).toBeVisible();
  const hasWebAudio = await page.evaluate(
    () => typeof AudioContext !== 'undefined' || 'webkitAudioContext' in window,
  );
  if (hasWebAudio) {
    // The context was created inside the first tap. Suspend it (as iOS does in the
    // background); the next gesture must resume it.
    expect(await lbr<string>(page, 's.audioState')).not.toBe('none');
    await page.evaluate(() =>
      (
        window as unknown as { __lbr: { control: { suspendAudio(): Promise<void> } } }
      ).__lbr.control.suspendAudio(),
    );
    const before = await lbr<number>(page, 's.resumeCalls');
    await page.waitForTimeout(400);
    await page.getByTestId('menu-adventure').click();
    await expect(page.getByTestId('screen-world-map')).toBeVisible();
    expect(await lbr<number>(page, 's.resumeCalls')).toBeGreaterThan(before);
  } else {
    // This WebKit build ships without Web Audio (Playwright on Windows): the game must still
    // boot, fall back to tap mode, and keep every menu working.
    test
      .info()
      .annotations.push({
        type: 'note',
        description: 'WebKit build without Web Audio: resume path covered by manual Safari QA',
      });
    expect(await lbr<string>(page, 's.audioState')).toBe('none');
    await page.waitForTimeout(400);
    await page.getByTestId('menu-adventure').click();
    await expect(page.getByTestId('screen-world-map')).toBeVisible();
  }
  await page.waitForTimeout(400);
  await page.getByTestId('back').click();
  await page.waitForTimeout(400);
  await page.getByTestId('menu-settings').click();
  await passGate(page);
  await expect(page.getByTestId('screen-settings')).toBeVisible();
  await expect(page.getByText('never recorded')).toBeVisible();
});
