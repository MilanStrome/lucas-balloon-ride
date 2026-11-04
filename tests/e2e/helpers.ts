import { chromium, test as base, expect, type Page } from '@playwright/test';
import { join } from 'node:path';

export const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'audio');

/** Chromium launch args for a fake mic that plays `fixture`.wav in a loop. */
export function fakeMic(fixture: string) {
  return {
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${join(FIXTURES, `${fixture}.wav`)}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
    permissions: ['microphone'],
  };
}

export const TEST_CAL = { noiseFloorDb: -56, maxBlowDb: -18 };

export interface Seed {
  testConfig?: Record<string, unknown>;
  save?: unknown;
}

/** A save with one profile, ready to play. */
export function profileSave(
  extra: Record<string, unknown> = {},
  settings: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 3,
    profiles: [
      {
        id: 'ptest',
        name: 'Tester',
        avatar: 'bear',
        skin: 'sunny',
        character: 'lucas',
        coins: 0,
        stars: {},
        completed: {},
        ownedSkins: ['sunny'],
        ownedCharacters: ['lucas'],
        bestEndless: 0,
        minis: { candles: 0, sailboat: 0, bubbles: 0 },
        createdAt: 1,
        ...extra,
      },
    ],
    activeProfileId: 'ptest',
    settings: { restBreaks: false, ...settings },
    calibrationByDevice: {},
    pendingUnlocks: [],
    daily: {},
  };
}

/** Install test config + an initial save (only if none exists, so reloads keep progress). */
export async function seed(page: Page, s: Seed): Promise<void> {
  await page.addInitScript((arg: Seed) => {
    (window as unknown as { __lbrTestConfig: unknown }).__lbrTestConfig = arg.testConfig ?? {};
    if (arg.save && !localStorage.getItem('lbr.save'))
      localStorage.setItem('lbr.save', JSON.stringify(arg.save));
  }, s);
}

/** Fails the test on any console error/warning or uncaught page error. */
export const test = base.extend<{ consoleGuard: string[] }>({
  consoleGuard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning')
          problems.push(`${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      await use(problems);
      expect(problems, 'console errors/warnings').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Run `fn` with a page whose fake microphone plays `fixture`.wav. Launch args are per browser,
 * so each fixture gets its own Chromium. The same console guard applies.
 */
export async function withMic(
  fixture: string,
  baseURL: string,
  fn: (page: Page) => Promise<void>,
): Promise<void> {
  const browser = await chromium.launch(fakeMic(fixture).launchOptions);
  try {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 1366, height: 768 },
      permissions: ['microphone'],
    });
    const page = await context.newPage();
    const problems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await fn(page);
    expect(problems, 'console errors/warnings').toEqual([]);
  } finally {
    await browser.close();
  }
}

export async function lbr<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(`(() => { const s = window.__lbr.state; return ${fn}; })()`) as Promise<T>;
}

export async function setIntensity(page: Page, v: number | null): Promise<void> {
  await page.evaluate(
    (x) =>
      (
        window as unknown as { __lbr: { control: { setIntensity(v: number | null): void } } }
      ).__lbr.control.setIntensity(x),
    v,
  );
}

/** Splash -> (mic) -> seeded profile -> main menu. */
export async function toMenu(page: Page, path = ''): Promise<void> {
  await page.goto(path);
  await page.getByTestId('splash-start').click();
  const profile = page.getByTestId('profile-ptest');
  const create = page.getByTestId('profile-create');
  await expect(profile.or(create)).toBeVisible();
  if (await profile.isVisible()) await profile.click();
  else await create.click();
  await expect(page.getByTestId('screen-menu')).toBeVisible();
  await page.waitForTimeout(300); // screens ignore taps during the 250 ms transition
}

export async function startLevel(page: Page, id: string): Promise<void> {
  await page.getByTestId('menu-adventure').click();
  await page.waitForTimeout(300);
  await page.getByTestId(`world-${id.split('-')[0]}`).click();
  await page.waitForTimeout(300);
  await page.getByTestId(`level-${id}`).click();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
}

/** Pass the parental gate (hold 3 s, then answer the sum). */
export async function passGate(page: Page): Promise<void> {
  const hold = page.getByTestId('gate-hold');
  await expect(hold).toBeVisible();
  const box = await hold.boundingBox();
  if (!box) throw new Error('no gate button');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3300);
  await page.mouse.up();
  const q = await page.getByTestId('gate-question').textContent();
  const m = /(\d+)\s*\+\s*(\d+)/.exec(q ?? '');
  if (!m) throw new Error(`bad question: ${q}`);
  await page.getByTestId(`gate-answer-${Number(m[1]) + Number(m[2])}`).click();
}
