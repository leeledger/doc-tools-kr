// Engine preload (Polish P.7), counted at the server (own-server.ts) so a second fetch cannot hide in a cache
// statistic. Chromium only (brief Test map).
import { expect, test } from './own-server';
import { fixturePath } from './paths';

const ENGINE = /compress\.worker|\/vendor\/qpdf\/|mozjpeg_|squoosh_resize|\.wasm$/;

test('no worker or wasm before an interaction; after a mouse move plus idle the worker warms; the real run fetches nothing twice', async ({ page, ownServer, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Preload timing and request counting run on chromium (brief Test map).');
  ownServer.setRoot(ownServer.copyDist());
  ownServer.log.length = 0;
  await page.goto('/pdf-compress/');
  await page.waitForFunction(() => document.readyState === 'complete');
  // Idle alone never preloads (Lighthouse never interacts).
  await page.waitForTimeout(2500);
  expect(ownServer.log.filter((p) => ENGINE.test(p))).toEqual([]);

  await page.mouse.move(200, 300);
  await expect.poll(() => ownServer.log.filter((p) => /compress\.worker/.test(p)).length, { timeout: 15_000 }).toBe(1);
  await expect.poll(() => ownServer.log.filter((p) => /qpdf\.wasm$/.test(p)).length, { timeout: 30_000 }).toBe(1);
  await expect.poll(() => ownServer.log.filter((p) => /mozjpeg_enc[^/]*\.wasm$/.test(p)).length, { timeout: 30_000 }).toBe(1);
  // pdf.js was preloaded too.
  expect(ownServer.log.some((p) => /\/vendor\/pdfjs\/.+\/pdf\.worker\.min\.mjs$/.test(p))).toBe(true);
  const before = ownServer.log.length;

  await page.setInputFiles('#cmp-input', fixturePath('gen_scan_a6.pdf'));
  await expect(page.locator('#cmp-info')).toContainText('1쪽');
  await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
  await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', 'done', { timeout: 45_000 });
  const after = ownServer.log.slice(before);
  expect(after.filter((p) => ENGINE.test(p)), 'engine files already warmed are not fetched again').toEqual([]);
});

test('Save-Data skips the preload', async ({ page, ownServer, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Chromium only (network-information API).');
  ownServer.setRoot(ownServer.copyDist());
  ownServer.log.length = 0;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' }, configurable: true });
  });
  await page.goto('/pdf-merge/');
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.mouse.move(200, 300);
  await page.waitForTimeout(3000);
  expect(ownServer.log.filter((p) => /merge\.worker|inspect|pdf\.worker/.test(p))).toEqual([]);
});
