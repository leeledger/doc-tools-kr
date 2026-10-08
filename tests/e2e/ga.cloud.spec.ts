// Google Analytics 4 (owner 2026-10-08) on the GA-on build (dist-bgcloud, PUBLIC_GA_ID=G-TEST000000), served with its
// real _headers. The no-upload fixture (ga: true on the cloud-* projects) answers gtag.js with a stub that sends one
// GET collect hit carrying page_location, and every Google Analytics host with 204: no test reaches Google.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { withGaCsp } from '../../scripts/lib/ga.mjs';
import { expect, gotoReady, test, type NetworkLog } from './no-upload';
import { fixturePath } from './paths';

const ID = 'G-TEST000000';
const GA_CSP = /Content-Security-Policy: ([^\r\n]*)/.exec(withGaCsp(readFileSync('public/_headers', 'utf8')))![1]!;
/** legal.ts reads build-time constants, so the date is read from its source here. */
const PRIVACY_GA = /PRIVACY_GA = '([^']+)'/.exec(readFileSync('src/data/legal.ts', 'utf8'))![1]!;
const SECRET = '비밀-파일명.pdf';

// The same build has the anonymous usage statistics on: using a tool sends its one allowed POST (usage.spec.ts covers it).
test.use({ allowUpload: [{ method: 'POST', path: '/api/usage' }] });

/** Records CSP violations (event and console) from the first byte of every page. */
async function watchCsp(page: Page): Promise<string[]> {
  const seen: string[] = [];
  page.on('console', (m) => {
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
    expect(res!.headers()['content-security-policy']).toBe(GA_CSP);
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
  await expect(main).toContainText('방문 분석을 위해 Google 애널리틱스 쿠키를 써요(5항).');
  await expect(page.locator('#bg')).toHaveText('3. 배경 지우기에서 사진을 보내는 경우');
  await expect(page.locator('#ga')).toHaveText('5. Google 애널리틱스(방문 분석)');
  await expect(page.locator('#usage')).toHaveText('7. 익명 사용 통계');
  await expect(page.locator('h2')).toHaveText([/^1\. /, /^2\. /, /^3\. /, /^4\. 사이트를 여는 기록$/, /^5\. Google/, /^6\. 광고$/, /^7\. 익명/, /^8\. 개인정보 보호책임자$/, /^9\. 변경 이력$/]);
  await expect(main).toContainText(`시행일: ${PRIVACY_GA}`);
  await expect(main).toContainText(`${PRIVACY_GA}: Google 애널리틱스(방문 분석, 쿠키)와 국외 이전 내용을 더함`);
  await expect(main.locator('a[href="https://tools.google.com/dlpage/gaoptout?hl=ko"]')).toHaveCount(1);
});
