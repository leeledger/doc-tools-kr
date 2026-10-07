// Growth G e2e: deep links, quick links, share, guides and the 404 suggestion. Every test runs under the
// no-upload fixture (./no-upload).
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, gotoReady, test } from './no-upload';
import { fixturePath } from './paths';

const LAW = fixturePath('kr_law_form.pdf');
const FW9 = fixturePath('irs_fw9.pdf');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const search = (page: Page) => page.evaluate(() => location.search);

test.describe('deep links (G.5)', () => {
  test('/id-photo/?preset=gosi has the 공무원 preset selected at load, with its source line', async ({ page }) => {
    await gotoReady(page, '/id-photo/?preset=gosi');
    await expect(page.locator('#idp-preset')).toHaveValue('gosi');
    await expect(page.locator('#idp-source')).toContainText('인사혁신처');
    expect(await search(page)).toBe('?preset=gosi');
  });

  test('/photo-compress/: ?target=200 checks the chip, 250 is custom, abc keeps the defaults and is dropped', async ({ page }) => {
    await gotoReady(page, '/photo-compress/?target=200');
    await expect(page.locator('input[name="ph-target"][value="200"]')).toBeChecked();
    await gotoReady(page, '/photo-compress/?target=250');
    await expect(page.locator('input[name="ph-target"][value="custom"]')).toBeChecked();
    await expect(page.locator('#ph-target-kb')).toHaveValue('250');
    await gotoReady(page, '/photo-compress/?target=abc&x=1');
    await expect(page.locator('input[name="ph-target"][value="500"]')).toBeChecked();
    await expect(page.locator('input[name="ph-mode"][value="target"]')).toBeChecked();
    expect(await search(page)).toBe('');
  });

  test('changing an option updates location.search; the canonical stays path-only', async ({ page }) => {
    await gotoReady(page, '/pdf-compress/');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/pdf-compress\/$/);
    await page.setInputFiles('#cmp-input', LAW);
    await expect(page.locator('#cmp-info')).toContainText('7쪽');
    await page.getByRole('radio', { name: '목표 용량으로 줄이기' }).check();
    await expect.poll(() => search(page)).toBe('?target=10');
    await page.getByRole('radio', { name: '5 MB' }).check();
    await expect.poll(() => search(page)).toBe('?target=5');
    await page.getByRole('radio', { name: '품질 단계로 줄이기' }).check();
    await expect.poll(() => search(page)).toBe('');
    const depth: number = await page.evaluate(() => window.history.length);
    expect(depth).toBeLessThanOrEqual(2);
  });

  test('a quick-link click applies in place and keeps the loaded file', async ({ page }) => {
    await gotoReady(page, '/pdf-compress/');
    await page.setInputFiles('#cmp-input', LAW);
    await expect(page.locator('#cmp-info')).toContainText('7쪽');
    await page.getByRole('link', { name: '지메일 첨부 한도 (25MB)' }).click();
    await expect.poll(() => search(page)).toBe('?target=25');
    expect(new URL(page.url()).pathname).toBe('/pdf-compress/');
    await expect(page.locator('#cmp-info')).toContainText('7쪽');
    await expect(page.locator('input[name="cmp-target"][value="custom"]')).toBeChecked();
    await expect(page.locator('#cmp-target-mb')).toHaveValue('25');
    await expect(page.locator('[data-live="status"]').first()).toContainText('규격으로 바꿨어요');
  });

  test('photo quick links carry the preset-derived targets', async ({ page }) => {
    await gotoReady(page, '/photo-compress/');
    await expect(page.getByRole('link', { name: '공무원 시험 원서 사진 (350KB 미만)' })).toHaveAttribute('href', '/photo-compress/?target=349');
    await page.getByRole('link', { name: 'Q-Net 원서 사진 (200KB 이하)' }).click();
    await expect.poll(() => search(page)).toBe('?target=200');
    await expect(page.locator('input[name="ph-target"][value="200"]')).toBeChecked();
  });
});

test.describe('share (G.7)', () => {
  test('navigator.share gets exactly title, text and the tool URL with its option, never a blob', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (d: unknown) => {
          (window as unknown as { __shared: unknown[] }).__shared = [...((window as unknown as { __shared?: unknown[] }).__shared ?? []), d];
          return Promise.resolve();
        },
      });
    });
    await gotoReady(page, '/pdf-compress/?target=25');
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('[data-share-send]')!.click());
    const shared = (await page.evaluate(() => (window as unknown as { __shared: Record<string, string>[] }).__shared)) ?? [];
    expect(shared.length).toBe(1);
    expect(Object.keys(shared[0]!).sort()).toEqual(['text', 'title', 'url']);
    expect(shared[0]!.title).toBe('PDF 용량 줄이기 | 문서딱');
    expect(new URL(shared[0]!.url).pathname + new URL(shared[0]!.url).search).toBe('/pdf-compress/?target=25');
    expect(shared[0]!.url).not.toContain('blob:');
  });

  test('without Web Share: 링크 보내기 is hidden and 링크 복사 copies the URL (or shows the field)', async ({ page, context, browserName }) => {
    await page.addInitScript(() => {
      delete (Navigator.prototype as unknown as { share?: unknown }).share;
    });
    const chromium = browserName === 'chromium';
    if (chromium) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    else {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('blocked')) } });
      });
    }
    await gotoReady(page, '/pdf-merge/');
    await page.setInputFiles('#merge-input', [LAW, FW9]);
    await expect(page.locator('#merge-list li')).toHaveCount(2);
    await page.locator('#merge-run').click();
    await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'done');
    const box = page.locator('#merge-result [data-share]');
    await expect(box.getByRole('button', { name: '링크 보내기' })).toBeHidden();
    await box.getByRole('button', { name: '링크 복사' }).click();
    const origin = new URL(page.url()).origin;
    if (chromium) {
      await expect(box.getByRole('button', { name: '복사했어요' })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/pdf-merge/`);
    } else {
      await expect(box.locator('[data-share-field]')).toBeVisible();
      await expect(box.locator('[data-share-field]')).toHaveValue(`${origin}/pdf-merge/`);
    }
    await expect(box.locator('[data-share-field]')).not.toHaveValue(/blob:|\.pdf/);
  });
});

test.describe('guides (G.1, G.2)', () => {
  test('/guide/ and a guide have no serious or critical axe findings', async ({ page }) => {
    for (const path of ['/guide/', '/guide/passport-photo/']) {
      await gotoReady(page, path);
      const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), path).toEqual([]);
    }
  });

  test('the CTA opens the tool with the preset applied', async ({ page }) => {
    await gotoReady(page, '/guide/gosi-photo/');
    await expect(page.locator('.guide-answer')).toContainText('137×177픽셀');
    await page.locator('.guide-cta a').click();
    await page.waitForURL(/\/id-photo\/\?preset=gosi$/);
    await page.waitForFunction(() => document.readyState === 'complete');
    await expect(page.locator('#idp-preset')).toHaveValue('gosi');
  });

  test('the header, footer and home link to the guides', async ({ page }) => {
    await gotoReady(page, '/');
    await expect(page.locator('header').getByRole('link', { name: '안내', exact: true })).toHaveAttribute('href', '/guide/');
    await expect(page.locator('footer').getByRole('link', { name: '안내', exact: true })).toHaveAttribute('href', '/guide/');
    await expect(page.locator('#guides li a')).toHaveCount(6);
    await expect(page.locator('#guides li a').first()).toHaveAttribute('href', '/guide/passport-photo/');
  });

  // LCP CI follow-up: CI chromium fetched the late UI face on /guide/passport-photo/. Root cause: the guide's
  // system-font rule lived in a page-only stylesheet, so while that sheet was still loading, any style pass gave
  // guide text the UI font, and its late characters fetched the late face. This replays that moment on every guide
  // page (sitemap): hold every stylesheet except the shared Base one, force style and layout, then release.
  test('every guide page: style computed before its own stylesheet loads never fetches a late UI face', async ({ page, network }) => {
    test.setTimeout(240_000);
    const sitemap = await (await page.request.get('/sitemap.xml')).text();
    const paths = [...sitemap.matchAll(/<loc>[^<]*?(\/guide\/[^<]*)<\/loc>/g)].map((m) => m[1]!);
    expect(paths.length).toBeGreaterThan(20);
    await gotoReady(page, '/');
    for (const path of paths) {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const held = /\/_astro\/(?!Base\.)[^/]*\.css$/;
      await page.route(held, async (route) => {
        await gate;
        await route.continue();
      });
      const from = network.requests.length;
      await page.goto(path, { waitUntil: 'commit' });
      await page.waitForFunction(() => document.querySelector('footer'), null, { polling: 10 });
      await page.evaluate(() => void document.body.offsetHeight);
      await page.waitForTimeout(150);
      release();
      await page.waitForFunction(() => document.readyState === 'complete');
      await page.unroute(held);
      expect.soft(network.requests.slice(from).map((r) => r.url()).filter((u) => /\/_astro\/anolim-ui-late-/.test(u)), path).toEqual([]);
    }
  });
});

test('404: /hwp/abc suggests /hwp-to-pdf/; an unrelated path suggests nothing', async ({ page }) => {
  const res = await gotoReady(page, '/hwp/abc');
  expect(res?.status()).toBe(404);
  const box = page.locator('#nf-suggest');
  await expect(box).toBeVisible();
  await expect(box).toContainText('혹시 이 페이지를 찾으셨나요?');
  await expect(box.getByRole('link')).toHaveAttribute('href', '/hwp-to-pdf/');
  await gotoReady(page, '/zzz-qqq/');
  await expect(page.locator('#nf-suggest')).toBeHidden();
});
