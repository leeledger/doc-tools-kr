import AxeBuilder from '@axe-core/playwright';
import { expect, gotoReady, test } from './no-upload';
import { fixturePath, photoFixture, runtimePath } from './paths';

const PAGES = ['/', '/pdf-merge/', '/pdf-compress/', '/photo-compress/', '/id-photo/', '/privacy/', '/terms/', '/licenses/', '/offline/', '/does-not-exist/'];
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

for (const path of ['/', '/pdf-merge/', '/pdf-compress/', '/photo-compress/', '/id-photo/', '/privacy/', '/terms/', '/licenses/']) {
  test(`SEO smoke on ${path}`, async ({ page, baseURL }) => {
    const res = await gotoReady(page, path);
    expect(res?.status()).toBe(200);
    expect(res?.headers()['content-security-policy']).toContain("connect-src 'self'");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toMatch(/^https:\/\/[^/]+\/(.*\/)?$/);
    expect(new URL(canonical!).pathname).toBe(path);
    await expect(page.locator('h1')).toHaveCount(1);
    expect(await page.locator('meta[property="og:url"]').getAttribute('content')).toBe(canonical);
    expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toMatch(/^https:\/\/.+\/brand\/og-[a-z-]+\.png$/);
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
  ['/photo-compress/', '사진 용량 줄이기'],
  ['/hwp-to-pdf/', 'HWP PDF 변환'],
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
    await expect(page).toHaveTitle(`${name} — 파일을 보내지 않고 무료로 | 문서딱`);
    const desc = (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
    expect(desc.toLowerCase()).toContain(name.toLowerCase());
    expect([...desc].length).toBeGreaterThanOrEqual(80);
    expect([...desc].length).toBeLessThanOrEqual(120);
  });
}

test('related tools: each tool page links to the other live tools (HWP PDF 변환: the two PDF tools only)', async ({ page }) => {
  const tools = [
    ['/pdf-merge/', 'PDF 합치기'],
    ['/pdf-compress/', 'PDF 용량 줄이기'],
    ['/photo-compress/', '사진 용량 줄이기'],
    ['/id-photo/', '여권·증명사진 규격 맞추기'],
    ['/hwp-to-pdf/', 'HWP PDF 변환'],
  ] as const;
  const related: Record<string, string[]> = { '/hwp-to-pdf/': ['/pdf-merge/', '/pdf-compress/'] };
  for (const [path] of tools) {
    await gotoReady(page, path);
    const others = tools.filter(([p]) => p !== path && (!related[path] || related[path].includes(p)));
    for (const [other, name] of others) {
      await expect(page.locator('.related').getByRole('link', { name })).toHaveAttribute('href', other);
    }
    await expect(page.locator('.related a')).toHaveCount(others.length);
  }
});

test('sitemap lists exactly the live pages; robots points to it', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  expect(locs.sort()).toEqual(['/', '/hwp-to-pdf/', '/id-photo/', '/licenses/', '/pdf-compress/', '/pdf-merge/', '/photo-compress/', '/privacy/', '/terms/'].sort());
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

test('landing page: live cards link to their tools, soon tools are names only, footer has legal links', async ({ page }) => {
  await gotoReady(page, '/');
  const cards = page.locator('.card.live');
  await expect(cards).toHaveCount(5);
  await expect(cards.getByRole('link', { name: 'PDF 합치기' })).toHaveAttribute('href', '/pdf-merge/');
  await expect(cards.getByRole('link', { name: 'PDF 용량 줄이기' })).toHaveAttribute('href', '/pdf-compress/');
  await expect(cards.getByRole('link', { name: '사진 용량 줄이기' })).toHaveAttribute('href', '/photo-compress/');
  await expect(cards.getByRole('link', { name: '여권·증명사진 규격 맞추기' })).toHaveAttribute('href', '/id-photo/');
  await expect(cards.getByRole('link', { name: 'HWP PDF 변환' })).toHaveAttribute('href', '/hwp-to-pdf/');
  await expect(cards.locator('.status')).toHaveText(['사용하기', '사용하기', '사용하기', '사용하기', '사용하기']);
  await expect(page.locator('.card')).toHaveCount(5);
  await expect(page.getByText('곧 공개')).toHaveCount(0);
  // Every tool is live: the 준비 중 block is not rendered at all.
  await expect(page.locator('.soon')).toHaveCount(0);
  await expect(page.locator('.soon a')).toHaveCount(0);
  await expect(page.locator('footer').getByRole('link', { name: '이용약관' })).toHaveAttribute('href', '/terms/');
  await expect(page.locator('footer').getByRole('link', { name: '개인정보 처리방침' })).toHaveAttribute('href', '/privacy/');
  await expect(page.locator('footer').getByRole('link', { name: '오픈소스 라이선스' })).toHaveAttribute('href', '/licenses/');
});

test('licenses page lists the shipped packages and their texts', async ({ page }) => {
  await gotoReady(page, '/licenses/');
  for (const name of ['@cantoo/pdf-lib', 'pdfjs-dist', 'pretendard', 'fflate', '@neslinesli93/qpdf-wasm', 'qpdf', 'libjpeg-turbo', 'zlib', '@jsquash/jpeg', '@jsquash/resize', '@jsquash/webp', 'wasm-feature-detect']) {
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
  // libwebp (BSD-3) through @jsquash/webp.
  expect(body).toContain('Copyright (c) 2010, Google Inc. All rights reserved.');
});

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  for (const path of ['/', '/pdf-merge/', '/pdf-compress/', '/photo-compress/', '/id-photo/', '/privacy/', '/terms/', '/licenses/']) {
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
  test('photo controls are at least 44 px at 360 px, with no horizontal scroll (ready state, details open, 직접 입력)', async ({ page }) => {
    await gotoReady(page, '/photo-compress/');
    const supported = await page.evaluate(() => typeof OffscreenCanvas !== 'undefined');
    test.skip(!supported, 'No OffscreenCanvas here: the photo page shows its unsupported notice (photo-compress.spec.ts).');
    await page.setInputFiles('#ph-input', [photoFixture('portrait_pd.jpg'), photoFixture('alpha.png')]);
    await expect(page.locator('#ph-list .info', { hasText: '확인 중' })).toHaveCount(0);
    await page.getByText('저장 형식: JPG').click();
    await page.getByRole('radiogroup', { name: '목표 용량' }).getByText('직접 입력', { exact: true }).click();
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(sw).toBeLessThanOrEqual(cw);
    const small = await page
      .locator('#photo-tool button:visible, #photo-tool label.btn:visible, #photo-tool .radio:visible, #photo-tool .chip:visible, #photo-tool summary:visible, #photo-tool .check:visible, #photo-tool select:visible, #photo-tool .num-input:visible')
      .evaluateAll((els) =>
        els
          .filter((e) => !e.closest('[hidden]'))
          .map((e) => ({ t: e.textContent?.trim(), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }))
          .filter((r) => r.h < 44 || r.w < 44),
      );
    expect(small).toEqual([]);
  });
});
