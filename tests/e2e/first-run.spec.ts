import { expect, lbr, test, withMic } from './helpers';

test('full first run: splash → permission → calibration → profile → menu', async ({ baseURL }) => {
  await withMic('calibration', baseURL!, async (page) => {
    await page.goto('');
    await expect(page.getByTestId('screen-splash')).toBeVisible();
    await page.getByTestId('splash-start').click();
    // Calibration runs automatically: quiet, then big blow, with the live meter.
    await expect(page.getByTestId('screen-mic-check')).toBeVisible();
    await expect(page.getByTestId('meter-balloon')).toBeVisible();
    await expect(page.getByTestId('check-title')).toHaveText(/Yay/, { timeout: 20_000 });
    const cal = await lbr<{ noiseFloorDb: number; maxBlowDb: number }>(page, 's.calibration');
    expect(cal.maxBlowDb - cal.noiseFloorDb).toBeGreaterThan(12);
    // First run: create a profile by picking an avatar (no typing required).
    await expect(page.getByTestId('screen-profile-create')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('avatar-cat').click();
    await page.getByTestId('profile-create').click();
    await expect(page.getByTestId('screen-menu')).toBeVisible();
    const save = await lbr<{
      profiles: { avatar: string }[];
      calibrationByDevice: Record<string, unknown>;
    }>(page, 's.save');
    expect(save.profiles[0]?.avatar).toBe('cat');
    expect(Object.keys(save.calibrationByDevice).length).toBe(1);
    // AudioContext was created inside the first tap and is running.
    expect(await lbr<string>(page, 's.audioState')).toBe('running');
  });
});
