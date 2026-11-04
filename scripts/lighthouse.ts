// Lighthouse gate on the production build (spec 15.4): Performance ≥ 90, Accessibility ≥ 95,
// Best Practices ≥ 95. (Installability is checked by the e2e suite via CDP, because
// Lighthouse 12+ no longer has a PWA category.) Uses Playwright's Chromium.
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

const PORT = 4175;
const url = `http://localhost:${PORT}/`;
const THRESHOLDS: Record<string, number> = {
  performance: 0.9,
  accessibility: 0.95,
  'best-practices': 0.95,
};

const server = spawn(`npx vite preview --outDir dist --port ${PORT} --strictPort`, {
  shell: true,
  stdio: 'ignore',
});
const kill = () => {
  if (process.platform === 'win32' && server.pid)
    spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill();
};

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

let failed = false;
try {
  await waitForServer();
  const chrome = await chromeLauncher.launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox'],
  });
  try {
    const result = await lighthouse(
      url,
      {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: Object.keys(THRESHOLDS),
      },
      {
        extends: 'lighthouse:default',
        settings: {
          formFactor: 'mobile',
          screenEmulation: {
            mobile: true,
            width: 740,
            height: 360,
            deviceScaleFactor: 2,
            disabled: false,
          },
        },
      },
    );
    const cats = result?.lhr.categories ?? {};
    if (process.env['LH_DEBUG']) {
      for (const id of [
        'mainthread-work-breakdown',
        'bootup-time',
        'long-tasks',
        'total-blocking-time',
        'color-contrast',
      ]) {
        const a = result?.lhr.audits[id];
        console.log(
          id,
          a?.displayValue ?? '',
          JSON.stringify(
            (a?.details as { items?: unknown[] } | undefined)?.items?.slice(0, 8) ?? [],
          ).slice(0, 1500),
        );
      }
    }
    for (const [k, min] of Object.entries(THRESHOLDS)) {
      const score = cats[k]?.score ?? 0;
      const ok = score >= min;
      if (!ok) failed = true;
      console.log(
        `${ok ? 'ok  ' : 'FAIL'} ${k.padEnd(15)} ${Math.round(score * 100)} (min ${min * 100})`,
      );
      if (!ok) {
        for (const ref of cats[k]?.auditRefs ?? []) {
          const a = result?.lhr.audits[ref.id];
          if (a && a.score !== null && a.score < 1 && ref.weight > 0)
            console.log(`       - ${a.id}: ${a.title}`);
        }
      }
    }
  } finally {
    await chrome.kill();
  }
} finally {
  kill();
}
process.exit(failed ? 1 : 0);
