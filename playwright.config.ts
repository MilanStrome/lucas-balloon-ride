import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';

const SILENT_MIC = join(import.meta.dirname, 'tests', 'fixtures', 'audio', 'silence.wav');

const E2E_PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // Each fake-mic test starts its own browser; keep memory modest on 8 GB machines.
  workers: process.env['CI'] ? 3 : 2,
  retries: 0,
  updateSnapshots: 'missing',
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}',
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${E2E_PORT}/`,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Builds e2e + production bundles sequentially, then serves both (4173 and 4174).
    command: 'npx tsx scripts/e2e-server.ts',
    url: `http://localhost:${E2E_PORT}/`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /(webkit|perf)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
        permissions: ['microphone'],
        // Default: a live but silent fake microphone. Tests that need other sounds launch their own.
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${SILENT_MIC}`,
          ],
        },
      },
    },
    {
      // Runs alone, after everything else, so fps/long-task numbers measure the game, not
      // other test browsers competing for the CPU.
      name: 'perf',
      testMatch: /perf\.spec\.ts/,
      dependencies: ['chromium', 'webkit'],
    },
    {
      name: 'webkit',
      testMatch: /webkit\.spec\.ts/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 768 } },
    },
  ],
});
