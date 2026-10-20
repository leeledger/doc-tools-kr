import AxeBuilder from '@axe-core/playwright';
import { expect, gotoReady, test } from './no-upload';
import { fixturePath, photoFixture, runtimePath } from './paths';

const PAGES = ['/', '/pdf-merge/', '/pdf-compress/', '/jpg-to-pdf/', '/pdf-to-jpg/', '/pdf-password/', '/pdf-split/', '/pdf-sign/', '/image-to-jpg/', '/photo-compress/', '/id-photo/', '/stamp-signature/', '/char-count/', '/id-copy/', '/pdf-edit/', '/stamp-maker/', '/english-name/', '/privacy/', '/terms/', '/licenses/', '/offline/', '/does-not-exist/'];
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

for (const path of ['/', '/pdf-merge/', '/pdf-compress/', '/jpg-to-pdf/', '/pdf-to-jpg/', '/pdf-password/', '/pdf-split/', '/pdf-sign/', '/image-to-jpg/', '/photo-compress/', '/id-photo/', '/stamp-signature/', '/hwpx-to-hwp/', '/char-count/', '/id-copy/', '/pdf-edit/', '/stamp-maker/', '/english-name/', '/privacy/', '/terms/']) {
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
  ['/jpg-to-pdf/', '사진 PDF 변환'],
  ['/pdf-to-jpg/', 'PDF JPG 변환'],
  ['/pdf-password/', 'PDF 암호 해제'],
  ['/image-to-jpg/', 'HEIC·PNG JPG 변환'],
  ['/pdf-split/', 'PDF 분할'],
  ['/pdf-sign/', 'PDF 서명 넣기'],
  ['/photo-compress/', '사진 용량 줄이기'],
  ['/hwp-to-pdf/', 'HWP PDF 변환'],
  ['/hwp-viewer/', 'hwp 뷰어'],
  ['/hwpx-to-hwp/', 'hwp로 바꿔요'],
  ['/stamp-signature/', '도장 이미지 만들기'],
  ['/char-count/', '자소서 글자수'],
  ['/id-copy/', '주민번호 뒤 7자리'],
  ['/pdf-edit/', '흰 상자로 가려요'],
  ['/stamp-maker/', '도장 이미지'],
  ['/english-name/', '여권 영문 이름으로'],
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
    // SEO-LENGTH: at most 40 characters with " | 문서딱" (the body at most 34).
    await expect(page).toHaveTitle(/^.{8,34} \| 문서딱$/);
    const desc = (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
    expect(desc.toLowerCase()).toContain(name.toLowerCase());
    expect([...desc].length).toBeGreaterThanOrEqual(40);
    expect([...desc].length).toBeLessThanOrEqual(80);
  });
}

test('related tools: each tool page links to the other live tools (the HWP tools: each other and the PDF tools; /stamp-signature/, /jpg-to-pdf/, /pdf-to-jpg/, /pdf-password/, /image-to-jpg/, /pdf-split/ and /pdf-sign/: their three; /stamp-signature/ four)', async ({ page }) => {
  const tools = [
    ['/pdf-merge/', 'PDF 합치기'],
    ['/pdf-compress/', 'PDF 용량 줄이기'],
    ['/jpg-to-pdf/', '사진 PDF 변환'],
    ['/pdf-to-jpg/', 'PDF JPG 변환'],
    ['/pdf-password/', 'PDF 암호 해제·설정'],
    ['/image-to-jpg/', '사진 JPG 변환'],
    ['/pdf-split/', 'PDF 나누기·쪽 편집'],
    ['/pdf-sign/', 'PDF 서명·도장 넣기'],
    ['/photo-compress/', '사진 용량 줄이기'],
    ['/id-photo/', '여권·증명사진 규격 맞추기'],
    ['/hwp-to-pdf/', 'HWP PDF 변환'],
    ['/hwp-viewer/', 'HWP·HWPX 파일 보기'],
    ['/hwpx-to-hwp/', 'HWPX HWP 변환'],
    ['/stamp-signature/', '전자서명·도장 이미지 만들기'],
    ['/char-count/', '글자수 세기'],
    ['/id-copy/', '신분증 사본 만들기'],
    ['/pdf-edit/', 'PDF 글자 넣기·편집'],
    ['/stamp-maker/', '도장 만들기'],
    ['/english-name/', '영문 이름 변환기'],
  ] as const;
  const related: Record<string, string[]> = {
    '/hwp-to-pdf/': ['/hwp-viewer/', '/hwpx-to-hwp/', '/pdf-merge/', '/pdf-compress/'],
    '/hwp-viewer/': ['/hwp-to-pdf/', '/hwpx-to-hwp/', '/pdf-compress/'],
    // HWPX2HWP (decision 13).
    '/hwpx-to-hwp/': ['/hwp-viewer/', '/hwp-to-pdf/'],
    // Sprint C (C1): where a signature or 도장 image goes next.
    '/stamp-signature/': ['/stamp-maker/', '/pdf-sign/', '/photo-compress/', '/hwp-to-pdf/', '/pdf-merge/'],
    // TOOLS4 T2 (brief decision 9).
    '/jpg-to-pdf/': ['/pdf-merge/', '/pdf-compress/', '/photo-compress/'],
    // TOOLS4 T3 (brief decision 9).
    '/pdf-to-jpg/': ['/jpg-to-pdf/', '/pdf-compress/', '/photo-compress/'],
    // TOOLS4 T4 (brief decision 9).
    '/pdf-password/': ['/pdf-merge/', '/pdf-compress/', '/pdf-to-jpg/'],
    // TOOLS5 U1 (brief decision 12).
    '/image-to-jpg/': ['/photo-compress/', '/jpg-to-pdf/', '/id-photo/'],
    // TOOLS5 U2 (brief decision 12).
    '/pdf-split/': ['/pdf-merge/', '/pdf-compress/', '/pdf-to-jpg/'],
    // TOOLS5 U3 (brief decision 12).
    '/pdf-sign/': ['/stamp-maker/', '/stamp-signature/', '/pdf-merge/', '/pdf-password/'],
    // TOOLS1015 C1.
    '/char-count/': ['/id-photo/', '/photo-compress/', '/jpg-to-pdf/'],
    // TOOLS1015 I1.
    '/id-copy/': ['/jpg-to-pdf/', '/photo-compress/', '/pdf-password/'],
    // TOOLS1015 E1.
    '/pdf-edit/': ['/pdf-sign/', '/pdf-merge/', '/pdf-compress/'],
    // STAMP1015 D2.
    '/stamp-maker/': ['/stamp-signature/', '/pdf-sign/', '/jpg-to-pdf/'],
    // ROMANIZE1016 D5.
    '/english-name/': ['/id-photo/', '/id-copy/', '/char-count/'],
  };
  for (const [path] of tools) {
    await gotoReady(page, path);
    const others = tools.filter(([p]) => p !== path && (!related[path] || related[path].includes(p)));
    for (const [other, name] of others) {
      await expect(page.locator('.related').getByRole('link', { name })).toHaveAttribute('href', other);
    }
    await expect(page.locator('.related a')).toHaveCount(others.length);
  }
});

test('ADS1020 D12: /licenses/ and /embed/ are noindex (no canonical) and out of the sitemap', async ({ page }) => {
  for (const path of ['/licenses/', '/embed/']) {
    const res = await gotoReady(page, path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute('content', 'noindex');
    await expect(page.locator('link[rel="canonical"]'), path).toHaveCount(0);
    await expect(page.locator('h1'), path).toHaveCount(1);
  }
});

test('sitemap lists exactly the live pages; robots points to it', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  // EN1: the English twins are listed too (hreflang alternates: scripts/lib/en-check.mjs rule e).
  expect(locs.filter((p) => p.startsWith('/en/')).sort()).toEqual(['/en/', '/en/image-to-jpg/', '/en/pdf-compress/', '/en/pdf-merge/', '/en/privacy/', '/en/terms/']);
  // ADS1020 D8, D12: /about/ and /contact/ only with the operator pages built; /licenses/ and /embed/ (noindex) never.
  const operator = (await request.get('/about/')).status() === 200;
  const pages = locs.filter((p) => !p.startsWith('/guide/') && !p.startsWith('/en/') && !['/about/', '/contact/'].includes(p));
  expect(pages.sort()).toEqual(['/', '/hwp-to-pdf/', '/hwp-viewer/', '/id-photo/', '/jpg-to-pdf/', '/pdf-compress/', '/pdf-merge/', '/pdf-password/', '/pdf-to-jpg/', '/image-to-jpg/', '/pdf-split/', '/pdf-sign/', '/char-count/', '/id-copy/', '/pdf-edit/', '/photo-compress/', '/privacy/', '/stamp-maker/', '/english-name/', '/stamp-signature/', '/terms/', '/hwpx-to-hwp/'].sort());
  expect(locs.filter((p) => ['/about/', '/contact/'].includes(p))).toEqual(operator ? ['/about/', '/contact/'] : []);
  for (const p of ['/embed/', '/embed/id-photo/', '/licenses/']) expect(locs).not.toContain(p);
  // Growth G: /guide/ and every published guide (drafts never). G2 A1: hwp-to-pdf is published; both hubs are in.
  const guides = locs.filter((p) => p.startsWith('/guide/'));
  expect(guides).toContain('/guide/');
  expect(guides.length).toBeGreaterThanOrEqual(12);
  for (const hub of ['/guide/photo-sizes/', '/guide/upload-limits/', '/guide/hwp-to-pdf/']) expect(guides).toContain(hub);
  // G2 A3: kakao-photo and yearend-tax-pdf went from draft to published; the file-limit rows without a source stay drafts.
  for (const live of ['/guide/kakao-photo/', '/guide/yearend-tax-pdf/', '/guide/ecfs-pdf-limit/']) expect(guides).toContain(live);
  for (const draft of ['/guide/gov24-upload-limit/', '/guide/hometax-upload-limit/', '/guide/work24-resume-upload/', '/guide/epeople-upload-limit/']) {
    expect(guides).not.toContain(draft);
  }
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
  await expect(cards).toHaveCount(19);
  await expect(cards.getByRole('link', { name: 'PDF 합치기' })).toHaveAttribute('href', '/pdf-merge/');
  await expect(cards.getByRole('link', { name: 'PDF 용량 줄이기' })).toHaveAttribute('href', '/pdf-compress/');
  await expect(cards.getByRole('link', { name: '사진 PDF 변환' })).toHaveAttribute('href', '/jpg-to-pdf/');
  await expect(cards.getByRole('link', { name: 'PDF JPG 변환' })).toHaveAttribute('href', '/pdf-to-jpg/');
  await expect(cards.getByRole('link', { name: 'PDF 암호 해제·설정' })).toHaveAttribute('href', '/pdf-password/');
  await expect(cards.getByRole('link', { name: '사진 용량 줄이기' })).toHaveAttribute('href', '/photo-compress/');
  await expect(cards.getByRole('link', { name: '사진 JPG 변환' })).toHaveAttribute('href', '/image-to-jpg/');
  await expect(cards.getByRole('link', { name: 'PDF 나누기·쪽 편집' })).toHaveAttribute('href', '/pdf-split/');
  await expect(cards.getByRole('link', { name: 'PDF 서명·도장 넣기' })).toHaveAttribute('href', '/pdf-sign/');
  await expect(cards.getByRole('link', { name: '여권·증명사진 규격 맞추기' })).toHaveAttribute('href', '/id-photo/');
  await expect(cards.getByRole('link', { name: 'HWP PDF 변환' })).toHaveAttribute('href', '/hwp-to-pdf/');
  await expect(cards.getByRole('link', { name: 'HWP·HWPX 파일 보기' })).toHaveAttribute('href', '/hwp-viewer/');
  await expect(cards.getByRole('link', { name: 'HWPX HWP 변환' })).toHaveAttribute('href', '/hwpx-to-hwp/');
  await expect(cards.getByRole('link', { name: '전자서명·도장 이미지 만들기' })).toHaveAttribute('href', '/stamp-signature/');
  await expect(cards.getByRole('link', { name: '글자수 세기' })).toHaveAttribute('href', '/char-count/');
  await expect(cards.getByRole('link', { name: '신분증 사본 만들기' })).toHaveAttribute('href', '/id-copy/');
  await expect(cards.getByRole('link', { name: 'PDF 글자 넣기·편집' })).toHaveAttribute('href', '/pdf-edit/');
  await expect(cards.getByRole('link', { name: '도장 만들기', exact: true })).toHaveAttribute('href', '/stamp-maker/');
  await expect(cards.getByRole('link', { name: '영문 이름 변환기' })).toHaveAttribute('href', '/english-name/');
  await expect(cards.locator('.status')).toHaveText(Array(19).fill('사용하기'));
  await expect(page.locator('.card')).toHaveCount(19);
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

  for (const path of ['/', '/pdf-merge/', '/pdf-compress/', '/jpg-to-pdf/', '/pdf-to-jpg/', '/pdf-password/', '/pdf-split/', '/pdf-sign/', '/image-to-jpg/', '/photo-compress/', '/id-photo/', '/stamp-signature/', '/hwpx-to-hwp/', '/char-count/', '/id-copy/', '/pdf-edit/', '/stamp-maker/', '/english-name/', '/privacy/', '/terms/', '/licenses/']) {
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

test('REV3: the default build (PUBLIC_AFF_COUPANG off) has no affiliate block, sponsored link or first-part line on any tool page or guide', async ({ page }) => {
  for (const path of [...PAGES, '/hwp-to-pdf/', '/hwp-viewer/', '/hwpx-to-hwp/', '/guide/passport-photo/', '/guide/pdf-merge/', '/guide/hwp-on-phone/']) {
    await page.goto(path);
    await expect(page.locator('a[rel~="sponsored"]'), path).toHaveCount(0);
    await expect(page.locator('a[href^="https://link.coupang.com/"]'), path).toHaveCount(0);
    await expect(page.locator('.guide-aff-top, .out-links .out-links, [data-guide]'), path).toHaveCount(0);
    await expect(page.locator('.out-links'), path).toHaveCount(path === '/id-photo/' ? 1 : 0);
  }
});

// REQ1014-A T-E1: a marked blog/app link (utm_*) never reaches canonical or og:url, and a deep link still applies.
for (const [url, path] of [
  ['/id-photo/?preset=history&utm_source=naver_blog&utm_medium=blog&utm_campaign=history-exam-photo', '/id-photo/'],
  ['/guide/history-exam-photo/?utm_source=tistory&utm_campaign=x', '/guide/history-exam-photo/'],
  ['/?utm_source=play&utm_medium=twa', '/'],
] as const) {
  test(`utm link ${url}: canonical and og:url are the clean path`, async ({ page }) => {
    await gotoReady(page, url);
    const canonical = (await page.locator('link[rel="canonical"]').getAttribute('href'))!;
    const u = new URL(canonical);
    expect(u.pathname).toBe(path);
    expect(u.search).toBe('');
    expect(canonical).toBe(`${u.origin}${path}`);
    expect(await page.locator('meta[property="og:url"]').getAttribute('content')).toBe(canonical);
    if (path === '/id-photo/') await expect(page.locator('#idp-preset')).toHaveValue('history');
  });
}
