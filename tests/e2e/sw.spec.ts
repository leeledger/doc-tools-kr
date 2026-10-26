// Service worker e2e (Polish P.11). This spec alone runs with service workers allowed, on its own server
// (own-server.ts), so it can serve a second build. Every test still runs under the no-upload fixture.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { buildServiceWorker, KILL_SWITCH } from '../../scripts/gen-sw.mjs';
import { expect, setBuildId, test } from './own-server';
import { fixturePath, photoFixture } from './paths';

test.use({ serviceWorkers: 'allow' });

const LAW = fixturePath('kr_law_form.pdf');
const FW9 = fixturePath('irs_fw9.pdf');
const HWP = join(process.cwd(), 'tests', 'corpus', 'hwp', 'law05.hwp');
const PHOTO = photoFixture('scene_cc0.jpg');

/** Waits until the SW controls the page; skips with the verbatim reason when this browser cannot register it. */
async function controlled(page: Page): Promise<void> {
  const why = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'navigator.serviceWorker is undefined';
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      return null;
    } catch (err) {
      return String(err);
    }
  });
  test.skip(why !== null, `Service worker registration failed in this browser: ${why}`);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });
}

async function merge(page: Page): Promise<void> {
  await page.setInputFiles('#merge-input', [LAW, FW9]);
  await expect(page.locator('#merge-list .info').nth(1)).toContainText('쪽');
  await expect(page.locator('#merge-list .info').first()).toContainText('쪽');
  await page.locator('#merge-run').click();
  await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'done', { timeout: 45_000 });
}

test('offline: after one merge the page and the merge engine work with the network off; the cache holds only site files', async ({ page, context, ownServer, browserName, isMobile }) => {
  test.skip(browserName === 'webkit' && isMobile, 'mobile-safari runs the same WebKit service worker as the webkit project, which covers this test (brief Test map: chromium, firefox, webkit, mobile-chrome).');
  const root = ownServer.copyDist();
  ownServer.setRoot(root);
  await page.goto('/pdf-merge/');
  await controlled(page);
  await merge(page);

  // Offline. Playwright WebKit on Windows fails any navigation under context.setOffline with "WebKit
  // encountered an internal error" before the service worker can answer, so there the host goes down instead.
  const harnessOffline = browserName !== 'webkit';
  if (harnessOffline) await context.setOffline(true);
  else ownServer.setDown(true);
  await page.reload();
  await expect(page.locator('h1')).toHaveText('PDF 합치기');
  await merge(page);

  const entries = await page.evaluate(async () => {
    const out: { url: string; size: number }[] = [];
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      for (const req of await c.keys()) {
        const res = await c.match(req);
        out.push({ url: req.url, size: res ? (await res.arrayBuffer()).byteLength : -1 });
      }
    }
    return out;
  });
  if (harnessOffline) await context.setOffline(false);
  else ownServer.setDown(false);
  expect(entries.length).toBeGreaterThan(10);
  const fixtureSizes = new Set([statSync(LAW).size, statSync(FW9).size]);
  for (const e of entries) {
    const u = new URL(e.url);
    expect(u.origin, e.url).toBe(new URL(ownServer.url).origin);
    const file = join(root, u.pathname.endsWith('/') ? `${u.pathname}index.html` : u.pathname);
    expect(existsSync(file), `${e.url} is a file of the build`).toBe(true);
    expect(e.size, e.url).toBe(statSync(file).size);
    expect(fixtureSizes.has(e.size), `${e.url} is not a user file`).toBe(false);
  }
});
test('REV3 R3.0: /hwp-to-pdf/ is not precached, but after one online visit it opens and converts offline (runtime cache, like /hwp-viewer/)', async ({ page, context, ownServer, browserName, isMobile }) => {
  test.skip(browserName === 'webkit' && isMobile, 'mobile-safari runs the same WebKit service worker as the webkit project.');
  test.setTimeout(240_000);
  const root = ownServer.copyDist();
  ownServer.setRoot(root);
  const precache = JSON.parse(/__PRECACHE__\s*=\s*(\[[^\]]*\])/.exec(readFileSync(join(root, 'sw.js'), 'utf8'))?.[1] ?? 'null') as string[] | null;
  if (precache) expect(precache).not.toContain('/hwp-to-pdf/');
  await page.goto('/hwp-to-pdf/');
  await controlled(page);
  // The first load ran before the worker controlled the page: one controlled load stores the page and its scripts.
  await page.reload();
  const convert = async (): Promise<void> => {
    await page.setInputFiles('#hw-input', HWP);
    await expect(page.locator('#hwp-tool')).toHaveAttribute('data-state', 'convert', { timeout: 150_000 });
    await expect(page.locator('#hw-preview .page').first()).toBeVisible();
  };
  await convert();
  const harnessOffline = browserName !== 'webkit';
  if (harnessOffline) await context.setOffline(true);
  else ownServer.setDown(true);
  await page.reload();
  await expect(page.locator('h1')).toHaveText('HWP PDF 변환');
  await convert();
  if (harnessOffline) await context.setOffline(false);
  else ownServer.setDown(false);
});

test('CARD1026 D (D10): /photo-compress/ is not precached, but after one online use it opens and compresses offline (runtime cache)', async ({ page, context, ownServer, browserName, isMobile }) => {
  test.skip(browserName === 'webkit' && isMobile, 'mobile-safari runs the same WebKit service worker as the webkit project.');
  test.skip(browserName === 'webkit', 'Playwright WebKit (Windows) cannot read a setInputFiles file while offline (polish.spec "compress: offline before the first file"); chromium, firefox and mobile-chrome cover it.');
  test.setTimeout(240_000);
  const root = ownServer.copyDist();
  ownServer.setRoot(root);
  const precache = JSON.parse(/__PRECACHE__\s*=\s*(\[[^\]]*\])/.exec(readFileSync(join(root, 'sw.js'), 'utf8'))?.[1] ?? 'null') as string[] | null;
  if (precache) expect(precache).not.toContain('/photo-compress/');
  await page.goto('/photo-compress/');
  await controlled(page);
  // One controlled load stores the page and its scripts; one use stores the lazily loaded controller.
  await page.reload();
  const compress = async (): Promise<void> => {
    await page.setInputFiles('#ph-input', PHOTO);
    await expect(page.locator('#ph-list .info', { hasText: '확인 중' })).toHaveCount(0);
    await page.getByRole('button', { name: '사진 용량 줄이기', exact: true }).click();
    await expect(page.locator('#photo-tool')).toHaveAttribute('data-state', 'done', { timeout: 110_000 });
  };
  await compress();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('h1')).toHaveText('사진 용량 줄이기');
  await compress();
  await context.setOffline(false);
});


test('offline: the Play app start URL (home with utm query) is served from the precache', async ({ page, context, ownServer, browserName, isMobile }) => {
  test.skip(browserName === 'webkit' && isMobile, 'mobile-safari runs the same WebKit service worker as the webkit project, which covers this test.');
  ownServer.setRoot(ownServer.copyDist());
  await page.goto('/');
  await controlled(page);
  const harnessOffline = browserName !== 'webkit';
  if (harnessOffline) await context.setOffline(true);
  else ownServer.setDown(true);
  // twa/twa-manifest.json startUrl: the SW navigation lookup ignores the query (src/sw/sw.ts).
  await page.goto('/?utm_source=play&utm_medium=twa');
  await expect(page.locator('h1')).toContainText('딱 맞춰');
  if (harnessOffline) await context.setOffline(false);
  else ownServer.setDown(false);
});

test('update: a waiting worker shows the bar only when the page is not busy; 새로고침 loads the new build', async ({ page, ownServer, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Update flow runs on chromium (brief Test map).');
  ownServer.setRoot(ownServer.copyDist());
  await page.goto('/');
  await controlled(page);
  const oldId = await page.locator('meta[name="build-id"]').getAttribute('content');

  // A new deploy: other build id in the pages and in sw.js.
  const next = ownServer.copyDist();
  setBuildId(next, 'e2e-next-build');
  writeFileSync(join(next, 'sw.js'), buildServiceWorker(next).code);
  ownServer.setRoot(next);

  await page.evaluate(() => {
    document.body.dataset.busy = 'test';
  });
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting), null, { timeout: 30_000 });
  await page.waitForTimeout(500);
  await expect(page.locator('#sw-update')).toHaveCount(0);

  await page.evaluate(() => {
    delete document.body.dataset.busy;
  });
  const bar = page.locator('#sw-update');
  await expect(bar).toHaveAttribute('role', 'status');
  await expect(bar).toContainText('새 버전이 있습니다.');
  await Promise.all([page.waitForEvent('load'), bar.getByRole('button', { name: '새로고침' }).click()]);
  await expect(page.locator('meta[name="build-id"]')).toHaveAttribute('content', 'e2e-next-build');
  expect(oldId).not.toBe('e2e-next-build');
});

test('kill switch: a PUBLIC_SW=0 sw.js unregisters itself and empties the caches', async ({ page, ownServer, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Kill switch runs on chromium (brief Test map).');
  ownServer.setRoot(ownServer.copyDist());
  await page.goto('/');
  await controlled(page);
  expect(await page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0);

  const killed = ownServer.copyDist();
  writeFileSync(join(killed, 'sw.js'), KILL_SWITCH);
  ownServer.setRoot(killed);
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
  await expect
    .poll(
      async () => {
        try {
          return await page.evaluate(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).length, caches: (await caches.keys()).length }));
        } catch {
          return null; // the kill switch reloads the page
        }
      },
      { timeout: 30_000 },
    )
    .toEqual({ regs: 0, caches: 0 });
  expect(readFileSync(join(killed, 'sw.js'), 'utf8')).toContain('registration.unregister()');
});
