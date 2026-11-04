import type { Page } from '@playwright/test';
import {
  expect,
  lbr,
  profileSave,
  seed,
  setIntensity,
  startLevel,
  test,
  TEST_CAL,
  toMenu,
  withMic,
} from './helpers';

interface Sample {
  blowing: boolean;
  intensity: number;
  y: number | null;
  started: boolean;
}

async function sample(page: Page, ms: number): Promise<Sample[]> {
  return page.evaluate(async (dur) => {
    const w = window as unknown as {
      __lbr: {
        state: {
          isBlowing: boolean;
          intensity: number;
          game: { y: number; started: boolean } | null;
        };
      };
    };
    const out: Sample[] = [];
    const t0 = performance.now();
    while (performance.now() - t0 < dur) {
      const s = w.__lbr.state;
      out.push({
        blowing: s.isBlowing,
        intensity: s.intensity,
        y: s.game?.y ?? null,
        started: !!s.game?.started,
      });
      await new Promise((r) => setTimeout(r, 50));
    }
    return out;
  }, ms);
}

async function intoLevel(page: Page) {
  await seed(page, { testConfig: { calibration: TEST_CAL }, save: profileSave() });
  await toMenu(page);
  await startLevel(page, '1-1');
}

test('blow fixture → balloon rises', async ({ baseURL }) => {
  await withMic('hard-blow', baseURL!, async (page) => {
    await intoLevel(page);
    const s = await sample(page, 4000);
    expect(s.some((x) => x.blowing)).toBe(true);
    const ys = s.filter((x) => x.y !== null).map((x) => x.y as number);
    expect(Math.max(...ys)).toBeGreaterThan(560);
  });
});

test('soft blow is detected too', async ({ baseURL }) => {
  await withMic('soft-blow', baseURL!, async (page) => {
    await intoLevel(page);
    const s = await sample(page, 3000);
    expect(s.filter((x) => x.blowing).length).toBeGreaterThan(20);
  });
});

test('music + blow fixture → balloon rises', async ({ baseURL }) => {
  await withMic('music-blow', baseURL!, async (page) => {
    await intoLevel(page);
    const s = await sample(page, 4000);
    expect(s.filter((x) => x.blowing).length).toBeGreaterThan(20);
  });
});

test('intermittent blows switch on and off', async ({ baseURL }) => {
  await withMic('intermittent-blows', baseURL!, async (page) => {
    await intoLevel(page);
    const s = await sample(page, 7000);
    expect(s.some((x) => x.blowing)).toBe(true);
    expect(s.some((x, i) => i > 0 && s[i - 1]!.blowing && !x.blowing)).toBe(true);
  });
});

test('silence → balloon falls', async ({ baseURL }) => {
  await withMic('silence', baseURL!, async (page) => {
    await intoLevel(page);
    // Start the flight with one tiny scripted puff, then real (silent) input.
    await setIntensity(page, 0.3);
    await expect.poll(() => lbr<boolean>(page, 's.game.started')).toBe(true);
    await setIntensity(page, null);
    // The scripted puff clears on the next frame; only then is the input really the silent mic.
    await expect.poll(() => lbr<boolean>(page, 's.isBlowing')).toBe(false);
    const y0 = await lbr<number>(page, 's.game.y');
    const s = await sample(page, 1500);
    expect(s.some((x) => x.blowing)).toBe(false);
    expect(s.at(-1)!.y!).toBeLessThan(y0 - 100);
  });
});

for (const fixture of ['speech-like', 'claps', 'music-loop', 'singing-tone', 'room-noise']) {
  test(`${fixture} → balloon does not rise`, async ({ baseURL }) => {
    await withMic(fixture, baseURL!, async (page) => {
      await intoLevel(page);
      const s = await sample(page, 5000);
      expect(s.filter((x) => x.blowing).length).toBe(0);
      expect(Math.max(...s.map((x) => x.intensity))).toBeLessThan(0.05);
      // The flight never even starts: nothing lifted the balloon.
      expect(s.every((x) => !x.started)).toBe(true);
    });
  });
}
