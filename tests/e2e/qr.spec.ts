import { expect, lbr, seed, test, TEST_CAL } from './helpers';

test('QR: ?unlock=VALID on a fresh install → after profile creation the skin is owned and the URL is cleaned', async ({
  page,
}) => {
  await seed(page, { testConfig: { calibration: TEST_CAL } });
  await page.goto('?unlock=PZBX7K3MQA');
  await expect(page).not.toHaveURL(/unlock=/);
  // The code survives the first-run flow as a pending unlock.
  const before = await lbr<{ pendingUnlocks: string[]; profiles: unknown[] }>(page, 's.save');
  expect(before.pendingUnlocks).toEqual(['PZBX7K3MQA']);
  expect(before.profiles).toHaveLength(0);
  await page.getByTestId('splash-start').click();
  await page.getByTestId('profile-create').click();
  await expect(page.getByTestId('unlock-title')).toHaveText('You unlocked something!');
  await expect(page.getByTestId('unlock-puzzle')).toBeVisible();
  await page.getByTestId('unlock-ok').click();
  await expect(page.getByTestId('screen-menu')).toBeVisible();
  const after = await lbr<{ pendingUnlocks: string[]; profiles: { ownedSkins: string[] }[] }>(
    page,
    's.save',
  );
  expect(after.profiles[0]?.ownedSkins).toContain('puzzle');
  expect(after.pendingUnlocks).toEqual([]);
});

test('QR: an invalid code shows the friendly error', async ({ page }) => {
  await seed(page, { testConfig: { calibration: TEST_CAL } });
  await page.goto('?unlock=ZZZZ9999');
  await expect(page).not.toHaveURL(/unlock=/);
  await page.getByTestId('splash-start').click();
  await page.getByTestId('profile-create').click();
  await expect(page.getByTestId('qr-invalid')).toHaveText("Hmm, that code didn't work");
});

test('QR: an already-owned code says so', async ({ page }) => {
  await seed(page, { testConfig: { calibration: TEST_CAL } });
  await page.goto('?unlock=PZBX7K3MQA');
  await page.getByTestId('splash-start').click();
  await page.getByTestId('profile-create').click();
  await page.getByTestId('unlock-ok').click();
  await page.goto('?unlock=PZBX7K3MQA');
  await page.getByTestId('splash-start').click();
  await page.locator('[data-testid^="profile-p"]').first().click();
  await expect(page.getByTestId('unlock-title')).toHaveText('You already have this!');
});
