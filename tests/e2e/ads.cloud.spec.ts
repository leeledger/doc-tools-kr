// Google AdSense, review stage (brief handoff/ARCHITECT-BRIEF-ADS1020.md, "Test map"), on the AdSense-on build
// (dist-bgcloud: PUBLIC_ADSENSE_ON=1, PUBLIC_ADSENSE_CLIENT=ca-pub-0000000000000000), served with its real _headers. The
// no-upload fixture (ads: true on the cloud-* projects) answers adsbygoogle.js with a stub that records what /ads-cfg.js
// set before it ran, and accepts that one bodiless GET only from a content page: no test reaches Google. Also the
// operator pages (/about/, /contact/), the footer links and the guide byline of this build (D8-D11).
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { ADSBYGOOGLE_URL, ADS_CFG_PATH, CONTENT_CSP } from '../../scripts/lib/adsense.mjs';
import { expect, gotoReady, test, type NetworkLog } from './no-upload';
import { photoFixture } from './paths';

const CLIENT = 'ca-pub-0000000000000000';
const TAG = `${ADSBYGOOGLE_URL}?client=${CLIENT}`;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const CONTENT = ['/', '/guide/', '/guide/passport-photo/', '/about/', '/contact/'];

// The same build has the anonymous usage statistics on: using a tool sends its one allowed POST (usage.spec.ts covers it).
test.use({ allowUpload: [{ method: 'POST', path: '/api/usage' }] });

/** Records CSP violations (event and console) from the first byte of every page. */
async function watchCsp(page: Page): Promise<string[]> {
  const seen: string[] = [];
  page.on('console', (m) => {
    // WebKit names a directive it does not know (fenced-frame-src of the content policy): a notice, not a violation.
    if (/^Unrecognized Content-Security-Policy directive 'fenced-frame-src'/.test(m.text())) return;
    if (/Content[- ]Security[- ]Policy|\bCSP\b/i.test(m.text())) seen.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
  });
  return seen;
}

const adRequests = (network: NetworkLog) => network.requests.map((r) => r.url()).filter((u) => /googlesyndication|doubleclick|googleadservices|adtrafficquality/.test(u));

test('content pages: the pair in <head> (config first), the content CSP, one stub load with pause=1 and NPA=1 set first, no ad frame, no CSP violation', async ({ page, network }) => {
  const csp = await watchCsp(page);
  for (const path of CONTENT) {
    const before = adRequests(network).length;
    const res = await gotoReady(page, path);
    expect(res!.headers()['content-security-policy'], path).toBe(CONTENT_CSP);
    const order = await page.evaluate(() => [...document.head.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')));
    const cfg = order.indexOf('/ads-cfg.js');
    expect(cfg, path).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(TAG), path).toBeGreaterThan(cfg);
    expect(order.filter((s) => s === TAG || s === ADS_CFG_PATH), path).toHaveLength(2);
    await expect(page.locator(`script[src="${TAG}"]`)).toHaveAttribute('crossorigin', 'anonymous');
    await expect(page.locator(`script[src="${TAG}"]`)).toHaveAttribute('async', '');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __adsStub?: unknown }).__adsStub), { message: path }).toEqual({ pause: 1, npa: 1, runs: 1 });
    expect(adRequests(network).slice(before), path).toEqual([TAG]);
    await expect(page.locator('iframe, ins.adsbygoogle'), path).toHaveCount(0);
  }
  expect(csp).toEqual([]);
});

test('/ads-cfg.js: same origin, the brief body, cached for an hour', async ({ page, baseURL }) => {
  const res = await page.request.get(`${baseURL}${ADS_CFG_PATH}`);
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe('(window.adsbygoogle=window.adsbygoogle||[]).pauseAdRequests=1;window.adsbygoogle.requestNonPersonalizedAds=1;');
  expect(res.headers()['cache-control']).toBe('public, max-age=3600');
});

test('never elsewhere: tool page, privacy, 404, English page, embed widget request no ad script and carry no tag or content CSP', async ({ page, network }) => {
  for (const path of ['/pdf-merge/', '/privacy/', '/does-not-exist/', '/en/', '/embed/id-photo/', '/licenses/', '/offline/']) {
    const res = await page.goto(path);
    await page.waitForFunction(() => document.readyState === 'complete');
    await expect(page.locator('script[src*="adsbygoogle"], script[src="/ads-cfg.js"]'), path).toHaveCount(0);
    const policy = res!.headers()['content-security-policy'];
    expect(policy, path).not.toBe(CONTENT_CSP);
    expect(policy, path).not.toMatch(/\shttps:(\s|;|$)/);
    expect(await page.evaluate(() => 'adsbygoogle' in window), path).toBe(false);
  }
  expect(adRequests(network)).toEqual([]);
});

test('the id-photo result screen loads no ad script', async ({ page, network }) => {
  await page.route('**/api/usage', (route) => route.fulfill({ status: 204, body: '' }));
  await gotoReady(page, '/id-photo/');
  await page.selectOption('#idp-preset', 'passport_online');
  await page.setInputFiles('#idp-input', photoFixture('portrait_pd.jpg'));
  await expect(page.locator('#idp-tool')).toHaveAttribute('data-state', /^(adjust|blocked)$/, { timeout: 90_000 });
  await page.locator('#idp-confirm').check();
  await page.locator('#idp-save').click();
  await expect(page.locator('#idp-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await expect(page.locator('script[src*="adsbygoogle"]')).toHaveCount(0);
  expect(adRequests(network)).toEqual([]);
});

test('/about/ and /contact/: headings, the operator, the mailto, the 영문주소 and 배경 지우기 lines; axe clean', async ({ page }) => {
  await gotoReady(page, '/about/');
  await expect(page.locator('h1')).toHaveText('문서딱 소개');
  await expect(page.locator('main h2')).toHaveText(['만든 사람', '왜 만들었나', '파일을 다루는 방법', '규격 정보를 확인하는 방법', '고친 기록']);
  const made = (await page.locator('main p').first().textContent())!;
  const officer = /^문서딱은 (\S+?)[이가] 만들고 운영해요\./.exec(made)?.[1];
  expect(officer, made).toBeTruthy();
  await expect(page.locator('main')).toContainText('다만 사진 배경 지우기는 예외로');
  await expect(page.locator('main')).toContainText('영문주소 변환기는 적은 주소 글자만 행정안전부 주소 검색에 전달해요.');
  await expect(page.locator('main')).not.toContainText('행정안전부 주소 검색으로 보내');
  await expect(page.locator('main a[href="/contact/"]')).toHaveCount(2);
  const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((j) => JSON.parse(j));
  expect(ld.find((d: { '@type': string }) => d['@type'] === 'AboutPage').mainEntity).toMatchObject({ '@type': 'Person', name: officer });
  expect(await page.locator('main').evaluate((el) => getComputedStyle(el.querySelector('.site-info')!).fontFamily)).toMatch(/^-apple-system/);
  let axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  await gotoReady(page, '/contact/');
  await expect(page.locator('h1')).toHaveText('문의');
  const mail = page.locator('main a[href^="mailto:"]');
  await expect(mail).toHaveCount(1);
  expect(await mail.getAttribute('href')).toBe(`mailto:${await mail.textContent()}`);
  await expect(page.locator('main')).toContainText('보통 3일 안에 답장해요.');
  await expect(page.locator('main')).toContainText('서류 파일은 보내지 마세요.');
  await expect(page.locator('main li')).toHaveText(['페이지 주소', '쓰는 기기와 앱 (예: 아이폰 카카오톡)', '무엇이 틀렸는지', '공식 출처 링크가 있으면 함께']);
  for (const href of ['/about/', '/privacy/']) await expect(page.locator(`main a[href="${href}"]`)).toHaveCount(1);
  axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // The privacy officer named on /privacy/ is the operator named on /about/.
  await gotoReady(page, '/privacy/');
  await expect(page.locator('main')).toContainText(`이름 ${officer}`);
});

test('footer 소개·문의 on a tool page; the guide byline names the operator with a link to /about/; the Person author', async ({ page }) => {
  await gotoReady(page, '/pdf-merge/');
  await expect(page.locator('.foot-links a')).toHaveText(['안내', '소개', '문의', '이용약관', '개인정보 처리방침', '오픈소스 라이선스', 'English']);
  await gotoReady(page, '/guide/passport-photo/');
  const byline = page.locator('.guide-dates');
  await expect(byline).toHaveText(/^글: \S+ · 소개 · 처음 쓴 날 \d{4}-\d{2}-\d{2} · 고친 날 \d{4}-\d{2}-\d{2}$/);
  await expect(byline.locator('a')).toHaveAttribute('href', '/about/');
  const name = /^글: (\S+) ·/.exec((await byline.textContent())!)![1];
  const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((j) => JSON.parse(j));
  const article = ld.find((d: { '@type': string }) => d['@type'] === 'Article');
  expect(article.author).toMatchObject({ '@type': 'Person', name });
  expect(new URL(article.author.url).pathname).toBe('/about/');
  expect(article.publisher['@type']).toBe('Organization');
});

test('/privacy/#ads: where, the review state, the cookie line, the transfer to Google LLC, refusal, under-14', async ({ page }) => {
  await gotoReady(page, '/privacy/');
  await expect(page.locator('#ads')).toHaveText(/^\d+\. 광고$/);
  const main = page.locator('main');
  for (const s of [
    '첫 화면·안내 글·소개·문의 페이지에만 Google 애드센스 코드가 있어요. 도구 화면과 결과 화면에는 없어요.',
    '광고 심사 중이라 광고를 보여 주지 않아요. 보여 줄 때도 맞춤 광고가 아닌 광고만 보여요.',
    '받는 자: Google LLC',
    '이전 국가: 미국',
    '이전 항목: IP 주소, 쿠키, 본 페이지 주소, 기기 정보',
    '문서딱은 그 정보를 받지 않아요.',
    '막아도 모든 도구를 그대로 쓸 수 있어요.',
    '맞춤 광고를 쓰지 않아요.',
  ]) await expect(main).toContainText(s);
  await expect(main).not.toContainText('지금은 광고가 없어요');
  await expect(main.locator('a[href="https://policies.google.com/technologies/ads?hl=ko"]')).toHaveCount(1);
});

test('round 2: a hub has the operator byline and Person author, axe clean; the footer has no 「문의: email」 line next to the 「문의」 link', async ({ page }) => {
  await gotoReady(page, '/guide/photo-sizes/');
  const byline = page.locator('.guide-dates');
  await expect(byline).toHaveText(/^글: \S+ · 소개 · 처음 쓴 날 \d{4}-\d{2}-\d{2} · 고친 날 \d{4}-\d{2}-\d{2}$/);
  await expect(byline.locator('a')).toHaveAttribute('href', '/about/');
  const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((j) => JSON.parse(j));
  const article = ld.find((d: { '@type': string }) => d['@type'] === 'Article');
  expect(article.author['@type']).toBe('Person');
  expect(new URL(article.author.url).pathname).toBe('/about/');
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await expect(page.locator('footer .foot-op')).toHaveCount(0);
  await expect(page.locator('footer a[href^="mailto:"]')).toHaveCount(0);
  await expect(page.locator('footer a[href="/contact/"]')).toHaveText('문의');
});
