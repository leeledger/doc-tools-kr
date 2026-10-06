import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// E2E_PORT: a second build can be tested next to one already served on 4173.
const PORT = Number(process.env.E2E_PORT ?? 4173);
/**
 * The shipping configuration of /id-photo/ (PUBLIC_ID_PHOTO_AUTOFRAME=0, built into dist-noauto/): the id-photo
 * suite runs against it as its own projects (manual-chromium, manual-firefox), manual flow end to end (Step 4 round 2, Arch). Only when the
 * folder exists (the gate run builds it).
 */
const MANUAL_PORT = Number(process.env.E2E_MANUAL_PORT ?? 4181);
const MANUAL = existsSync('dist-noauto/id-photo/index.html');
/**
 * 사진 배경 지우기 (Sprint C, C2): the page exists only in a PUBLIC_BG_REMOVE=1 build, built into dist-bg/. Its spec runs
 * there as bg-chromium and bg-mobile-safari (brief: chromium + mobile-safari), and nowhere else. Only when the folder
 * exists (the gate run and the CI chromium / mobile-safari jobs build it).
 */
const BG_PORT = Number(process.env.E2E_BG_PORT ?? 4182);
const BG = existsSync('dist-bg/remove-background/index.html');
const BG_SPEC = /remove-background\.spec\.ts$/;
/**
 * C2-cloud: the cloud path of 배경 지우기 exists only in a build with PUBLIC_BG_REMOVE=1 and PUBLIC_BG_CLOUD=1 (plus the
 * privacy officer and contact), built into dist-bgcloud/. Its spec runs there in all five browsers (cloud-*), and
 * nowhere else. /api/remove-bg is answered by page.route fixtures: no test reaches Cloudflare. The same build has the
 * anonymous usage statistics on (PUBLIC_USAGE_STATS=1), so usage.spec.ts runs there too; /api/usage is page.route'd.
 */
const CLOUD_PORT = Number(process.env.E2E_CLOUD_PORT ?? 4183);
const CLOUD = existsSync('dist-bgcloud/remove-background/index.html');
const CLOUD_SPEC = /(remove-background\.cloud|usage)\.spec\.ts$/;
const CLOUD_DEVICES = { chromium: 'Desktop Chrome', firefox: 'Desktop Firefox', webkit: 'Desktop Safari', 'mobile-chrome': 'Pixel 7', 'mobile-safari': 'iPhone 14' } as const;

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
  // The other projects run against dist/ (flag off), where /remove-background/ does not exist.
  testIgnore: [BG_SPEC, CLOUD_SPEC],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Firefox on CI: Playwright's Firefox driver sometimes drops navigation events under load, so page.goto times out
    // at 20 s although the page has loaded (ci-green BUILD-LOG). One extra retry on CI only; real failures still fail 3x.
    { name: 'firefox', retries: process.env.CI ? 2 : 1, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
    ...(MANUAL
      ? [
          { name: 'manual-chromium', testMatch: /id-photo\.spec\.ts$/, use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${MANUAL_PORT}` } },
          // Firefox runs the id-photo suite on the shipping build too (G2 ci-green): headless Firefox on the Linux CI
          // runner has no WebGL, so on the auto-framing build the tests that need a detected face skip there.
          { name: 'manual-firefox', retries: process.env.CI ? 2 : 1, testMatch: /id-photo\.spec\.ts$/, use: { ...devices['Desktop Firefox'], baseURL: `http://127.0.0.1:${MANUAL_PORT}` } },
        ]
      : []),
    ...(BG
      ? [
          { name: 'bg-chromium', testIgnore: [], testMatch: BG_SPEC, use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${BG_PORT}` } },
          { name: 'bg-mobile-safari', testIgnore: [], testMatch: BG_SPEC, use: { ...devices['iPhone 14'], baseURL: `http://127.0.0.1:${BG_PORT}` } },
        ]
      : []),
    ...(CLOUD
      ? Object.entries(CLOUD_DEVICES).map(([name, device]) => ({
          name: `cloud-${name}`,
          testIgnore: [],
          testMatch: CLOUD_SPEC,
          ...(name === 'firefox' ? { retries: process.env.CI ? 2 : 1 } : {}),
          use: { ...devices[device], baseURL: `http://127.0.0.1:${CLOUD_PORT}` },
        }))
      : []),
  ],
  webServer: [
    {
      command: 'node tests/e2e/serve.mjs',
      url: `http://127.0.0.1:${PORT}/`,
      reuseExistingServer: !process.env.CI,
      env: { PORT: String(PORT) },
    },
    ...(MANUAL
      ? [{ command: 'node tests/e2e/serve.mjs', url: `http://127.0.0.1:${MANUAL_PORT}/`, reuseExistingServer: !process.env.CI, env: { PORT: String(MANUAL_PORT), DIST: 'dist-noauto' } }]
      : []),
    ...(BG ? [{ command: 'node tests/e2e/serve.mjs', url: `http://127.0.0.1:${BG_PORT}/`, reuseExistingServer: !process.env.CI, env: { PORT: String(BG_PORT), DIST: 'dist-bg' } }] : []),
    ...(CLOUD ? [{ command: 'node tests/e2e/serve.mjs', url: `http://127.0.0.1:${CLOUD_PORT}/`, reuseExistingServer: !process.env.CI, env: { PORT: String(CLOUD_PORT), DIST: 'dist-bgcloud' } }] : []),
  ],
});
