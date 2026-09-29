// Service worker e2e (Polish P.11). This spec alone runs with service workers allowed, on its own server
// (own-server.ts), so it can serve a second build. Every test still runs under the no-upload fixture.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { buildServiceWorker, KILL_SWITCH } from '../../scripts/gen-sw.mjs';
import { expect, setBuildId, test } from './own-server';
import { fixturePath } from './paths';

test.use({ serviceWorkers: 'allow' });

const LAW = fixturePath('kr_law_form.pdf');
const FW9 = fixturePath('irs_fw9.pdf');

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
