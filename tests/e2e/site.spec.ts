import AxeBuilder from '@axe-core/playwright';
import { expect, gotoReady, test } from './no-upload';
import { fixturePath, runtimePath } from './paths';

const PAGES = ['/', '/pdf-merge/', '/privacy/', '/licenses/', '/does-not-exist/'];

for (const path of PAGES) {
  test(`axe: no serious or critical violations on ${path}`, async ({ page }) => {
    await gotoReady(page, path);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('axe: /pdf-merge/ with files listed has no serious or critical violations', async ({ page }) => {
  await gotoReady(page, '/pdf-merge/');
  await page.setInputFiles('#merge-input', [fixturePath('kr_law_form.pdf'), fixturePath('irs_fw9.pdf')]);
  await expect(page.locator('#merge-list > li .info').last()).toContainText('쪽');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => v.id)).toEqual([]);
});

for (const path of ['/', '/pdf-merge/', '/privacy/', '/licenses/']) {
  test(`SEO smoke on ${path}`, async ({ page, baseURL }) => {
    const res = await gotoReady(page, path);
    expect(res?.status()).toBe(200);
    expect(res?.headers()['content-security-policy']).toContain("connect-src 'self'");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toMatch(/^https:\/\/[^/]+\/(.*\/)?$/);
    expect(new URL(canonical!).pathname).toBe(path);
    await expect(page.locator('h1')).toHaveCount(1);
    expect(await page.locator('meta[property="og:url"]').getAttribute('content')).toBe(canonical);
    expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toMatch(/^https:\/\/.+\/og\.png$/);
    expect(await page.locator('meta[property="og:locale"]').getAttribute('content')).toBe('ko_KR');
    await expect(page.locator('meta[name="keywords"]')).toHaveCount(0);
    for (const json of await page.locator('script[type="application/ld+json"]').allTextContents()) {
      expect(() => JSON.parse(json)).not.toThrow();
    }
    expect(baseURL).toBeTruthy();
  });
}

test('tool page JSON-LD: WebApplication + BreadcrumbList', async ({ page }) => {
  await gotoReady(page, '/pdf-merge/');
  const data = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((j) => JSON.parse(j));
  const app = data.find((d: { '@type': string }) => d['@type'] === 'WebApplication');
  expect(app).toMatchObject({
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: '웹 브라우저',
    inLanguage: 'ko',
    offers: { price: 0, priceCurrency: 'KRW' },
  });
  expect(data.some((d: { '@type': string }) => d['@type'] === 'BreadcrumbList')).toBe(true);
  await expect(page).toHaveTitle('PDF 합치기 — 업로드 없이 브라우저에서 무료로 | 안올림');
  const desc = (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
  expect(desc).toContain('PDF 합치기');
  expect([...desc].length).toBeGreaterThanOrEqual(80);
  expect([...desc].length).toBeLessThanOrEqual(120);
});

test('sitemap lists exactly the live pages; robots points to it', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  expect(locs.sort()).toEqual(['/', '/licenses/', '/pdf-merge/', '/privacy/'].sort());
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/Sitemap: https:\/\/.+\/sitemap\.xml/);
});

test('404 page is Korean, links home and is not indexed', async ({ page }) => {
  const res = await gotoReady(page, '/does-not-exist/');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('페이지를 찾을 수 없습니다');
  await expect(page.getByRole('link', { name: '첫 화면으로' })).toHaveAttribute('href', '/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test('CSP header is present with the locked policy', async ({ request }) => {
  const res = await request.get('/pdf-merge/');
  const csp = res.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(csp).toContain("connect-src 'self'");
});

test('landing page: live PDF card links to the tool, others are 곧 공개, footer has legal links', async ({ page }) => {
  await gotoReady(page, '/');
  const card = page.locator('.card.live');
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('link', { name: 'PDF 합치기' })).toHaveAttribute('href', '/pdf-merge/');
  await expect(card.locator('.status')).toHaveText('사용하기');
  await expect(page.locator('.card .status', { hasText: '곧 공개' })).toHaveCount(4);
  await expect(page.locator('footer').getByRole('link', { name: '개인정보 처리방침' })).toHaveAttribute('href', '/privacy/');
  await expect(page.locator('footer').getByRole('link', { name: '오픈소스 라이선스' })).toHaveAttribute('href', '/licenses/');
});

test('licenses page lists the shipped packages and their texts', async ({ page }) => {
  await gotoReady(page, '/licenses/');
  for (const name of ['@cantoo/pdf-lib', 'pdfjs-dist', 'pretendard', 'fflate']) {
    await expect(page.locator('table')).toContainText(name);
  }
  const body = await page.locator('main').textContent();
  expect(body).toContain('SIL OPEN FONT LICENSE');
  expect(body).toContain('LICENSE_OPENJPEG');
  expect(body).toContain('LICENSE_JBIG2');
});

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  for (const path of ['/', '/pdf-merge/', '/privacy/', '/licenses/']) {
    test(`no horizontal scroll at 360 px on ${path}`, async ({ page }) => {
      await gotoReady(page, path);
      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(sw).toBeLessThanOrEqual(cw);
    });
  }

  test('tool controls are at least 44 px tall at 360 px', async ({ page }) => {
    await gotoReady(page, '/pdf-merge/');
    await page.setInputFiles('#merge-input', [fixturePath('kr_law_form.pdf'), fixturePath('irs_fw9.pdf'), runtimePath('encrypted_userpw_1234')]);
    await expect(page.locator('#merge-list > li .info').nth(1)).toContainText('쪽');
    await expect(page.locator('.pw-input')).toBeVisible();
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw).toBeLessThanOrEqual(cw);
    const small = await page
      .locator('#merge-tool button:visible, #merge-tool label.btn:visible, #merge-tool .check:visible')
      .evaluateAll((els) =>
        els
          .filter((e) => !e.closest('[hidden]'))
          .map((e) => ({ t: e.textContent?.trim(), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }))
          .filter((r) => r.h < 44 || r.w < 44),
      );
    expect(small).toEqual([]);
  });
});
