import { defineConfig, devices } from '@playwright/test';

// E2E_PORT: a second build can be tested next to one already served on 4173.
const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // One retry absorbs a Playwright-Firefox harness race on Windows (goto misses the load event under
  // parallel load while the page is complete). Retried tests are reported as "flaky", never hidden.
  retries: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'ko-KR',
    trace: 'retain-on-failure',
    navigationTimeout: 20_000,
    // Every spec runs without the service worker (Polish P.11), so its behaviour and its no-upload recordings
    // do not change; tests/e2e/sw.spec.ts opts back in with serviceWorkers: 'allow'.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'node tests/e2e/serve.mjs',
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
  },
});
