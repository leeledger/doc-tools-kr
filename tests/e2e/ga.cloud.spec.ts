// Google Analytics 4 (owner 2026-10-08) on the GA-on build (dist-bgcloud, PUBLIC_GA_ID=G-TEST000000), served with its
// real _headers. The no-upload fixture (ga: true on the cloud-* projects) answers gtag.js with a stub that sends one
// GET collect hit carrying page_location, and every Google Analytics host with 204: no test reaches Google.
import { existsSync, readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { withGaCsp } from '../../scripts/lib/ga.mjs';
import { CONTENT_CSP } from '../../scripts/lib/adsense.mjs';
import { expect, gotoReady, test, type NetworkLog } from './no-upload';
import { fixturePath } from './paths';

const ID = 'G-TEST000000';
const GA_CSP = /Content-Security-Policy: ([^\r\n]*)/.exec(withGaCsp(readFileSync('public/_headers', 'utf8')))![1]!;
/** legal.ts reads build-time constants, so the date is read from its source here. */
const PRIVACY_GA = /PRIVACY_GA = '([^']+)'/.exec(readFileSync('src/data/legal.ts', 'utf8'))![1]!;
const PRIVACY_ADS = /PRIVACY_ADS = '([^']+)'/.exec(readFileSync('src/data/legal.ts', 'utf8'))![1]!;
const PRIVACY_AFF_OFF = /PRIVACY_AFF_OFF = '([^']+)'/.exec(readFileSync('src/data/legal.ts', 'utf8'))![1]!;
const SECRET = '비밀-파일명.pdf';
/** ADS1020: the cloud build has PUBLIC_ADSENSE_ON=1 (CI), so the home page carries the AdSense pair and CONTENT_CSP. */
const ADS_BUILD = existsSync('dist-bgcloud/ads-cfg.js');

// The same build has the anonymous usage statistics on: using a tool sends its one allowed POST (usage.spec.ts covers it).
test.use({ allowUpload: [{ method: 'POST', path: '/api/usage' }] });

/** Records CSP violations (event and console) from the first byte of every page. */
async function watchCsp(page: Page): Promise<string[]> {
  const seen: string[] = [];
  page.on('console', (m) => {
    // ADS1020: WebKit names a directive it does not know (fenced-frame-src of the home page's content policy): a notice,
    // not a violation (the securitypolicyviolation listener below still catches every real one).
    if (/^Unrecognized Content-Security-Policy directive 'fenced-frame-src'/.test(m.text())) return;
    if (/Content[- ]Security[- ]Policy|\bCSP\b/i.test(m.text())) seen.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
  });
  return seen;
}

const googleUrls = (network: NetworkLog) => network.requests.map((r) => r.url()).filter((u) => /google/.test(u));
const collectHits = (network: NetworkLog) => googleUrls(network).filter((u) => u.includes('/g/collect'));

async function config(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const dl = (window as unknown as { dataLayer: ArrayLike<unknown>[] }).dataLayer;
    const entry = Array.from(dl).find((e) => e[0] === 'config');
    return entry![2] as Record<string, unknown>;
  });
}

test('every page carries the /ga.js tag; gtag.js loads after the load event; one page_view hit; no CSP violation; exact CSP', async ({ page, network }) => {
  const csp = await watchCsp(page);
  for (const path of ['/', '/pdf-compress/', '/privacy/']) {
    const before = collectHits(network).length;
    const res = await gotoReady(page, path);
    // ADS1020 D5: with AdSense on (this build), the home page is a content page with its own policy.
    const ads = (await page.locator('script[data-site-ads-cfg]').count()) > 0;
    expect(ads).toBe(path === '/' && ADS_BUILD);
    expect(res!.headers()['content-security-policy']).toBe(ads ? CONTENT_CSP : GA_CSP);
    await expect(page.locator('script[src="/ga.js"][data-site-ga]')).toHaveCount(1);
    await expect.poll(() => collectHits(network).length, { timeout: 10_000 }).toBe(before + 1);
    expect(await page.evaluate(() => (window as unknown as { __gtagStub?: { afterLoad: boolean } }).__gtagStub)).toEqual({ afterLoad: true });
    expect(await page.evaluate(() => typeof (window as unknown as { gtag?: unknown }).gtag)).toBe('undefined');
    const cfg = await config(page);
    expect(cfg).toMatchObject({ allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: 34128000 });
  }
  const gtag = googleUrls(network).filter((u) => u.includes('googletagmanager'));
  expect(gtag).toEqual(Array(3).fill(`https://www.googletagmanager.com/gtag/js?id=${ID}`));
  expect(csp).toEqual([]);
});

test('page_location keeps ?utm_source= (read before the page script tidies the address bar) and drops the #hash', async ({ page, network }) => {
  await gotoReady(page, '/pdf-compress/?utm_source=blog&utm_medium=post#top');
  const cfg = await config(page);
  expect(cfg.page_location).toMatch(/\/pdf-compress\/\?utm_source=blog&utm_medium=post$/);
  await expect.poll(() => collectHits(network).length).toBe(1);
  expect(decodeURIComponent(collectHits(network)[0]!)).toContain('utm_source=blog');
});

test('a picked file never reaches Google: its name is not in dataLayer nor in any Google URL', async ({ page, network }) => {
  const csp = await watchCsp(page);
  await page.route('**/api/usage', (route) => route.fulfill({ status: 204, body: '' }));
  await gotoReady(page, '/pdf-compress/');
  await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', 'empty');
  await page.setInputFiles('#cmp-input', { name: SECRET, mimeType: 'application/pdf', buffer: readFileSync(fixturePath('gen_already_small.pdf')) });
  await expect(page.locator('#cmp-info')).toContainText('쪽');
  await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
  await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', /done|kept/, { timeout: 45_000 });
  await expect.poll(() => collectHits(network).length).toBeGreaterThan(0);
  const dl = await page.evaluate(() => JSON.stringify(Array.from((window as unknown as { dataLayer: ArrayLike<unknown>[] }).dataLayer, (e) => Array.from(e))));
  for (const needle of [SECRET, '비밀', encodeURIComponent('비밀'), 'gen_already_small']) {
    expect(dl, needle).not.toContain(needle);
    for (const u of googleUrls(network)) expect(u, needle).not.toContain(needle);
  }
  expect(csp).toEqual([]);
});

test('/privacy/ in this build (cloud + usage + GA): section 1 names the cookies, GA is section 5, date and change log', async ({ page }) => {
  await gotoReady(page, '/privacy/');
  const main = page.locator('main');
  // ADDREN1016: with 영문주소 변환기 on (PUBLIC_ADDR_EN=1, as in the CI cloud build) its section 4 follows 배경 지우기 and
  // every later section moves down one; its date is then the newest.
  const k = (await page.locator('#addr').count()) ? 1 : 0;
  const s = (n: number): number => n + k;
  await expect(main).toContainText(`방문 분석을 위해 Google 애널리틱스 쿠키를 써요(${s(5)}항).`);
  await expect(page.locator('#bg')).toHaveText('3. 배경 지우기에서 사진을 보내는 경우');
  if (k) await expect(page.locator('#addr')).toHaveText('4. 영문주소 변환기에서 주소를 보내는 경우');
  await expect(page.locator('#ga')).toHaveText(`${s(5)}. Google 애널리틱스(방문 분석)`);
  await expect(page.locator('#usage')).toHaveText(`${s(7)}. 익명 사용 통계`);
  await expect(page.locator('h2')).toHaveText([/^1\. /, /^2\. /, /^3\. /, ...(k ? [/^4\. 영문주소/] : []), new RegExp(`^${s(4)}\\. 사이트를 여는 기록$`), new RegExp(`^${s(5)}\\. Google`), new RegExp(`^${s(6)}\\. 광고$`), new RegExp(`^${s(7)}\\. 익명`), new RegExp(`^${s(8)}\\. 개인정보 보호책임자$`), new RegExp(`^${s(9)}\\. 변경 이력$`)]);
  // The 인화·사진관 link count (REV2, 2026-10-12, usage-stats builds such as this one) is the newest section (or 영문주소).
  // ADS1020: AdSense (#ads, on in the CI cloud build) is the newest change, else the product links taken out of the count.
  await expect(main).toContainText(`시행일: ${(await page.locator('#ads').count()) ? PRIVACY_ADS : PRIVACY_AFF_OFF}`);
  await expect(main).toContainText(`${PRIVACY_GA}: Google 애널리틱스(방문 분석, 쿠키)와 국외 이전 내용을 더함`);
  await expect(main.locator('a[href="https://tools.google.com/dlpage/gaoptout?hl=ko"]')).toHaveCount(1);
});

test('EN1: English pages carry no /ga.js tag and load nothing from Google, also while using a tool', async ({ page, network }) => {
  await page.route('**/api/usage', (route) => route.fulfill({ status: 204, body: '' }));
  for (const path of ['/en/', '/en/privacy/', '/en/pdf-compress/']) {
    await gotoReady(page, path);
    await expect(page.locator('script[src="/ga.js"]')).toHaveCount(0);
  }
  await page.setInputFiles('#cmp-input', fixturePath('gen_already_small.pdf'));
  await page.waitForTimeout(1500);
  expect(googleUrls(network)).toEqual([]);
  expect(await page.evaluate(() => 'dataLayer' in window)).toBe(false);
});
