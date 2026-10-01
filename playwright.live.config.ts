import { defineConfig, devices } from '@playwright/test';

// A-1 live smoke against the deployed site (docs/OPS-RUNBOOK.md): no local server, Chromium only, two workers
// so the live site sees a visitor's load, not a test farm's. LIVE_URL overrides the target.
export default defineConfig({
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
  },
  projects: [{ name: 'live-chromium', use: { ...devices['Desktop Chrome'] } }],
});
