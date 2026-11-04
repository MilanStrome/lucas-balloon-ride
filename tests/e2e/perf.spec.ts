import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { expect, FIXTURES, profileSave, seed, test, TEST_CAL, toMenu } from './helpers';

// Real devices composite and rasterize canvas on the GPU, off the main thread. Headless
// Chromium defaults to software raster ON the main thread, which a 4× CPU throttle then
// slows 4× (that measures the test rig, not the game). So this test enables GPU raster.
const GPU_ARGS = ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];

// Spec 15.4. Full durations (2 min fps run; heap at minute 1 vs minute 10) run with
// PERF_FULL=1. The default `verify` run uses shorter windows; see DECISIONS.md.
const FULL = process.env['PERF_FULL'] === '1';
const FPS_SEC = FULL ? 120 : 30;
const HEAP_A_SEC = FULL ? 60 : 15;
const HEAP_B_SEC = FULL ? 600 : 60;

test('Endless under 4× CPU throttle: ≥45 fps, no long tasks >100 ms, heap growth <5 MB', async ({
  baseURL,
}) => {
  // Hosted CI runners have no GPU, so canvas falls back to main-thread software raster and the
  // fps number measures the runner. Run it on a machine with a GPU (or set PERF_GPU=1).
  test.skip(!!process.env['CI'] && !process.env['PERF_GPU'], 'CI runner has no GPU');
  test.setTimeout((FPS_SEC + HEAP_B_SEC + 60) * 1000);
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${join(FIXTURES, 'silence.wav')}`,
      ...GPU_ARGS,
    ],
  });
  const page = await (
    await browser.newContext({
      baseURL,
      viewport: { width: 1366, height: 768 },
      permissions: ['microphone'],
    })
  ).newPage();
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text());
  });
  await seed(page, {
    testConfig: { calibration: TEST_CAL },
    save: profileSave({}, { easyMode: true }),
  });
  await toMenu(page);
  const cdp = await page.context().newCDPSession(page);
  await page.getByTestId('menu-endless').click();
  await expect(page.getByTestId('game-canvas')).toBeVisible();
  // A steady in-page pilot keeps the balloon flying (easy mode: never ends).
  await page.evaluate(() => {
    const w = window as unknown as {
      __lbr: {
        state: { game: { y: number; vy: number } | null };
        control: { setIntensity(v: number | null): void };
      };
    };
    const step = () => {
      const g = w.__lbr.state.game;
      if (g)
        w.__lbr.control.setIntensity(
          Math.max(0.05, Math.min(1, (350 + 1.5 * g.vy + ((560 - g.y) * 1.2 - g.vy) * 3) / 1100)),
        );
      requestAnimationFrame(step);
    };
    step();
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const stats = await page.evaluate(async (sec) => {
    const long: number[] = [];
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) long.push(e.duration);
    });
    try {
      obs.observe({ type: 'longtask', buffered: false });
    } catch {
      // longtask unsupported
    }
    let frames = 0;
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const f = () => {
        frames++;
        if (performance.now() - t0 < sec * 1000) requestAnimationFrame(f);
        else resolve();
      };
      requestAnimationFrame(f);
    });
    obs.disconnect();
    return {
      fps: (frames * 1000) / (performance.now() - t0),
      maxLong: long.length ? Math.max(...long) : 0,
    };
  }, FPS_SEC);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(
    `perf: ${stats.fps.toFixed(1)} fps under 4× throttle, longest task ${stats.maxLong.toFixed(0)} ms`,
  );
  expect(stats.fps).toBeGreaterThanOrEqual(45);
  expect(stats.maxLong).toBeLessThanOrEqual(100);

  const heapAt = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const h = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
    return h.usedSize;
  };
  await page.waitForTimeout(Math.max(0, HEAP_A_SEC * 1000 - FPS_SEC * 1000));
  const a = await heapAt();
  await page.waitForTimeout((HEAP_B_SEC - HEAP_A_SEC) * 1000);
  const b = await heapAt();
  console.log(`heap: ${(a / 1e6).toFixed(2)} MB → ${(b / 1e6).toFixed(2)} MB`);
  expect(b - a).toBeLessThan(5 * 1024 * 1024);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __lbr: { state: { game: unknown } } }).__lbr.state.game !== null,
    ),
  ).toBe(true);
  expect(problems).toEqual([]);
  await browser.close();
});
