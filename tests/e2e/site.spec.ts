import AxeBuilder from '@axe-core/playwright';
import { expect, gotoReady, test } from './no-upload';
import { fixturePath, runtimePath } from './paths';

const PAGES = ['/', '/pdf-merge/', '/pdf-compress/', '/privacy/', '/licenses/', '/does-not-exist/'];
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const path of PAGES) {
  test(`axe: no serious or critical violations on ${path}`, async ({ page }) => {
    await gotoReady(page, path);
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('axe: /pdf-merge/ with files listed has no serious or critical violations', async ({ page }) => {
  await gotoReady(page, '/pdf-merge/');
  await page.setInputFiles('#merge-input', [fixturePath('kr_law_form.pdf'), fixturePath('irs_fw9.pdf')]);
  await expect(page.locator('#merge-list > li .info').last()).toContainText('쪽');
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => v.id)).toEqual([]);
});

test('axe: /pdf-compress/ in the ready state (details open) and the done state', async ({ page }) => {
  await gotoReady(page, '/pdf-compress/');
  await page.setInputFiles('#cmp-input', fixturePath('gen_scan_a6.pdf'));
  await expect(page.locator('#cmp-info')).toContainText('1쪽');
  await page.getByText('더 줄여야 하나요?').click();
  await expect(page.locator('#cmp-desc-raster')).toBeVisible();
  const serious = async () =>
    (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(await serious()).toEqual([]);
  await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
  await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', 'done', { timeout: 45_000 });
  expect(await serious()).toEqual([]);
});

for (const path of ['/', '/pdf-merge/', '/pdf-compress/', '/privacy/', '/licenses/']) {
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

for (const [path, name] of [
  ['/pdf-merge/', 'PDF 합치기'],
  ['/pdf-compress/', 'PDF 용량 줄이기'],
] as const) {
  test(`tool page JSON-LD, title and description on ${path}`, async ({ page }) => {
    await gotoReady(page, path);
    const data = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((j) => JSON.parse(j));
    const app = data.find((d: { '@type': string }) => d['@type'] === 'WebApplication');
    expect(app).toMatchObject({
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: '웹 브라우저',
      inLanguage: 'ko',
      offers: { price: 0, priceCurrency: 'KRW' },
    });
    expect(data.some((d: { '@type': string }) => d['@type'] === 'BreadcrumbList')).toBe(true);
    await expect(page).toHaveTitle(`${name} — 업로드 없이 브라우저에서 무료로 | 안올림`);
    const desc = (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
    expect(desc).toContain(name);
    expect([...desc].length).toBeGreaterThanOrEqual(80);
    expect([...desc].length).toBeLessThanOrEqual(120);
  });
}

test('related tools: each tool page links to the other live tool', async ({ page }) => {
  await gotoReady(page, '/pdf-merge/');
  await expect(page.locator('.related').getByRole('link', { name: 'PDF 용량 줄이기' })).toHaveAttribute('href', '/pdf-compress/');
  await gotoReady(page, '/pdf-compress/');
  await expect(page.locator('.related').getByRole('link', { name: 'PDF 합치기' })).toHaveAttribute('href', '/pdf-merge/');
});

test('sitemap lists exactly the live pages; robots points to it', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  expect(locs.sort()).toEqual(['/', '/licenses/', '/pdf-compress/', '/pdf-merge/', '/privacy/'].sort());
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

test('landing page: live PDF cards link to their tools, others are 곧 공개, footer has legal links', async ({ page }) => {
  await gotoReady(page, '/');
  const cards = page.locator('.card.live');
  await expect(cards).toHaveCount(2);
  await expect(cards.getByRole('link', { name: 'PDF 합치기' })).toHaveAttribute('href', '/pdf-merge/');
  await expect(cards.getByRole('link', { name: 'PDF 용량 줄이기' })).toHaveAttribute('href', '/pdf-compress/');
  await expect(cards.locator('.status')).toHaveText(['사용하기', '사용하기']);
  await expect(page.locator('.card .status', { hasText: '곧 공개' })).toHaveCount(3);
  await expect(page.locator('footer').getByRole('link', { name: '개인정보 처리방침' })).toHaveAttribute('href', '/privacy/');
  await expect(page.locator('footer').getByRole('link', { name: '오픈소스 라이선스' })).toHaveAttribute('href', '/licenses/');
});

test('licenses page lists the shipped packages and their texts', async ({ page }) => {
  await gotoReady(page, '/licenses/');
  for (const name of ['@cantoo/pdf-lib', 'pdfjs-dist', 'pretendard', 'fflate', '@neslinesli93/qpdf-wasm', 'qpdf', 'libjpeg-turbo', 'zlib', '@jsquash/jpeg', '@jsquash/resize']) {
    await expect(page.locator('table')).toContainText(name);
  }
  const body = await page.locator('main').textContent();
  expect(body).toContain('SIL OPEN FONT LICENSE');
  expect(body).toContain('LICENSE_OPENJPEG');
  expect(body).toContain('LICENSE_JBIG2');
  expect(body).toContain('qpdf-12.2.0/NOTICE.md');
  expect(body).toContain('ISC License');
  expect(body).toContain('codec/LICENSE.codec.md');
  expect(body).toContain('lib/resize/LICENSE.codec.md');
});

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  for (const path of ['/', '/pdf-merge/', '/pdf-compress/', '/privacy/', '/licenses/']) {
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

  test('compress controls are at least 44 px tall at 360 px, with no horizontal scroll', async ({ page }) => {
    await gotoReady(page, '/pdf-compress/');
    await page.setInputFiles('#cmp-input', runtimePath('encrypted_userpw_1234'));
    await expect(page.locator('#cmp-pw-input')).toBeVisible();
    await page.getByText('더 줄여야 하나요?').click();
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw).toBeLessThanOrEqual(cw);
    const small = await page
      .locator('#compress-tool button:visible, #compress-tool label.btn:visible, #compress-tool .radio:visible, #compress-tool summary:visible')
      .evaluateAll((els) =>
        els
          .filter((e) => !e.closest('[hidden]'))
          .map((e) => ({ t: e.textContent?.trim(), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }))
          .filter((r) => r.h < 44 || r.w < 44),
      );
    expect(small).toEqual([]);
  });
});
