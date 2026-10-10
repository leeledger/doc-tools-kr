import { defineConfig, devices } from '@playwright/test';

// A-1 live smoke against the deployed site (docs/OPS-RUNBOOK.md): no local server, Chromium only, two workers
// so the live site sees a visitor's load, not a test farm's. LIVE_URL overrides the target. noAnalytics (INTERNAL-TRAFFIC):
// the no-upload fixture aborts Web Analytics, Google Analytics and /api/usage, so these runs never count as visits.
// liveCsp: the CSP may name exactly the analytics and GA hosts production is built with (scripts/lib/csp-connect.mjs).
export default defineConfig<{ noAnalytics: boolean; liveCsp: boolean }>({
  testDir: 'tests/live',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-live' }]] : 'list',
  outputDir: 'test-results-live',
  use: {
    baseURL: process.env.LIVE_URL ?? 'https://docttak.com',
    locale: 'ko-KR',
    trace: 'retain-on-failure',
    navigationTimeout: 30_000,
    serviceWorkers: 'block',
    noAnalytics: true,
    liveCsp: true,
  },
  projects: [{ name: 'live-chromium', use: { ...devices['Desktop Chrome'] } }],
});
