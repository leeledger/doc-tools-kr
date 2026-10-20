// 무료 임베드 위젯 e2e (brief handoff/ARCHITECT-BRIEF-REV5.md, "Test map"). A host page on another site
// (tests/e2e/host-page.ts: localhost against our 127.0.0.1) frames /embed/id-photo/. The widget works end to end inside
// the third-party frame (download included), sends nothing anywhere, registers no service worker, shows the credit and
// none of the site's extras; every other page refuses to be framed. Plus the /embed/ info page: the snippet, the copy
// button and its fallback; axe on both.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { sniffImage } from '../../src/lib/image/sniff';
import { expect, gotoReady, test, type NetworkLog } from './no-upload';
import { startHost, type HostSite } from './host-page';
import { photoFixture } from './paths';

const PORTRAIT = photoFixture('portrait_pd.jpg');
/** The brief's snippet, verbatim (src/data/embed.ts imports og.json, which Playwright's loader cannot). */
const embedSnippet = (site: string): string =>
  `<iframe src="${site}/embed/id-photo/" title="증명사진 규격 맞추기 (문서딱)" width="100%" height="820" style="border:0;max-width:720px" loading="lazy"></iframe>
<p><a href="${site}/id-photo/">증명사진 규격 맞추기</a> · 문서딱 제공</p>`;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe.configure({ timeout: 150_000 });

// Every frame records CSP violations; any violation fails the test. Manual framing (deviceMemory 1, the tool's own
// fallback): the widget flow needs no face model, so it runs the same in every browser.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 1, configurable: true });
  });
});

let site: HostSite;
test.beforeAll(async () => {
  site = await startHost();
});
test.afterAll(async () => {
  await site.close();
});

/**
 * Opens the host page with one iframe of `path`; waits for the frame's load event unless the frame is expected to be
 * refused (Firefox fires none then).
 */
async function host(page: Page, baseURL: string, path: string, loads = true): Promise<void> {
  await page.goto(site.url(`${baseURL}${path}`), { waitUntil: 'domcontentloaded' });
  if (loads) await page.waitForFunction(() => (window as unknown as { __framed?: boolean }).__framed === true);
}
const dropHost = (network: NetworkLog): void => site.drop(network);
/** Clipboard and selection text use CRLF on Windows. */
const lf = (s: string | undefined): string | undefined => s?.replace(/\r\n/g, '\n');
const widgetFrame = (page: Page) => page.frames().find((f) => f.url().includes('/embed/id-photo/'))!;

test('cross-origin frame: pick, adjust, save and download inside the widget; credit, no extras, no CSP violation', async ({ page, baseURL, network }) => {
  await host(page, baseURL!, '/embed/id-photo/');
  const frame = page.frameLocator('iframe');
  const tool = frame.locator('#idp-tool');
  await expect(tool).toHaveAttribute('data-state', 'empty');
  await frame.locator('#idp-preset').selectOption('passport_online');
  await frame.locator('#idp-input').setInputFiles(PORTRAIT);
  await expect(tool).toHaveAttribute('data-state', /^(adjust|blocked)$/, { timeout: 90_000 });
  await frame.locator('#idp-confirm').check();
  await frame.locator('#idp-save').click();
  await expect(tool).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  const link = frame.locator('#idp-download');
  await expect(link).toHaveAttribute('href', /^blob:/);
  const [d] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const bytes = new Uint8Array(readFileSync((await d.path())!));
  expect(sniffImage(bytes)).toMatchObject({ format: 'jpeg', width: 413, height: 531 });

  // The credit is the only way out; the site's extras never show inside a host's frame.
  const credit = frame.locator('[data-embed-credit]');
  await expect(credit).toHaveText('문서딱 제공');
  await expect(credit).toHaveAttribute('href', /\/id-photo\/\?via=embed$/);
  await expect(credit).toHaveAttribute('target', '_blank');
  await expect(frame.locator('footer')).toContainText('파일은 이 기기 밖으로 나가지 않아요.');
  for (const sel of ['#idp-next', '[data-share]', '#idp-print-links', 'a[rel~="sponsored"]', '.ad-slot', 'header.top', 'footer.foot', '.quick-links']) await expect(frame.locator(sel), sel).toHaveCount(0);
  await expect(frame.locator('a[href="/privacy/"]')).toHaveAttribute('target', '_blank');

  expect(await widgetFrame(page).evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
  // No request for the service worker or any analytics: the widget page has no site script.
  expect(network.requests.map((r) => new URL(r.url()).pathname).filter((p) => p === '/sw.js' || p === '/ga.js')).toEqual([]);
  dropHost(network);
});

test('blocked storage in the frame (third-party partitioning at its worst): the widget still works', async ({ page, baseURL, network }) => {
  await page.addInitScript(() => {
    if (!location.pathname.startsWith('/embed/')) return;
    const deny = (): never => {
      throw new DOMException('blocked', 'SecurityError');
    };
    Object.defineProperty(window, 'localStorage', { get: deny, configurable: true });
    Object.defineProperty(window, 'indexedDB', { get: deny, configurable: true });
  });
  await host(page, baseURL!, '/embed/id-photo/');
  const frame = page.frameLocator('iframe');
  await frame.locator('#idp-input').setInputFiles(PORTRAIT);
  await expect(frame.locator('#idp-tool')).toHaveAttribute('data-state', /^(adjust|blocked)$/, { timeout: 90_000 });
  await frame.locator('#idp-confirm').check();
  await frame.locator('#idp-save').click();
  await expect(frame.locator('#idp-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await expect(frame.locator('#idp-error')).toBeHidden();
  await expect(frame.locator('#idp-download')).toHaveAttribute('href', /^blob:/);
  dropHost(network);
});

test.describe('service worker allowed', () => {
  test.use({ serviceWorkers: 'allow' });
  test('the widget registers no service worker', async ({ page, baseURL, network }) => {
    await host(page, baseURL!, '/embed/id-photo/');
    await expect(page.frameLocator('iframe').locator('#idp-tool')).toHaveAttribute('data-state', 'empty');
    await page.waitForTimeout(1_000);
    const regs = await widgetFrame(page).evaluate(async () => {
      try {
        return (await navigator.serviceWorker?.getRegistrations())?.length ?? 0;
      } catch {
        return 0;
      }
    });
    expect(regs).toBe(0);
    expect(network.requests.filter((r) => new URL(r.url()).pathname === '/sw.js').length).toBe(0);
    dropHost(network);
  });
});

for (const path of ['/id-photo/', '/', '/embed/']) {
  test(`framing refused: ${path} keeps frame-ancestors 'none'`, async ({ page, baseURL, network }) => {
    const res = await page.request.get(`${baseURL}${path}`);
    expect(res.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers()['content-security-policy']).not.toContain('frame-ancestors *');
    await host(page, baseURL!, path, false);
    await page.waitForTimeout(1_500);
    // Our page never renders in the frame. A refused frame is an error page that may never answer (Firefox), so a
    // query that does not come back within 3 s counts as refused too; a framed page of ours answers at once.
    const child = page.frames().find((f) => f !== page.mainFrame());
    const rendered = await Promise.race([
      child?.evaluate(() => document.querySelector('main') !== null).catch(() => false) ?? Promise.resolve(false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3_000)),
    ]);
    expect(rendered).toBe(false);
    dropHost(network);
  });
}

test('the widget answers with one policy that allows framing, and noindex', async ({ page, baseURL }) => {
  const res = await page.request.get(`${baseURL}/embed/id-photo/`);
  const csp = res.headers()['content-security-policy']!;
  expect(csp).toContain('frame-ancestors *');
  expect(csp).not.toContain("frame-ancestors 'none'");
  expect(csp.split(',').length).toBe(1);
  expect(res.headers()['x-robots-tag']).toBe('noindex');
  const html = await res.text();
  expect(html).toContain('<meta name="robots" content="noindex">');
  expect(html).toMatch(/<link rel="canonical" href="[^"]+\/id-photo\/">/);
});

test('axe: the widget (alone and in the frame) and the /embed/ page have no serious or critical violation', async ({ page, baseURL, network }) => {
  const serious = async (): Promise<string[]> =>
    (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  await gotoReady(page, '/embed/id-photo/');
  expect(await serious()).toEqual([]);
  await gotoReady(page, '/embed/');
  expect(await serious()).toEqual([]);
  await host(page, baseURL!, '/embed/id-photo/');
  await expect(page.frameLocator('iframe').locator('#idp-tool')).toHaveAttribute('data-state', 'empty');
  expect(await serious()).toEqual([]);
  dropHost(network);
});

test.describe('/embed/ info page', () => {
  // ADS1020 D12: the page is noindex (no canonical); og:url still names the site.
  const site = async (page: Page): Promise<string> => new URL((await page.locator('meta[property="og:url"]').getAttribute('content'))!).origin;

  test('the snippet is exact, noindex (ADS1020 D12); 미리 보기 열기 makes the frame, which shows the widget', async ({ page }) => {
    await gotoReady(page, '/embed/');
    await expect(page.locator('h1')).toHaveText('내 누리집에 증명사진 도구 넣기 (무료)');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator('#embed-code')).toHaveText(embedSnippet(await site(page)));
    // The preview frame exists only after 미리 보기 열기 (no frame requests before LCP); without JS the link opens the widget.
    await expect(page.locator('iframe')).toHaveCount(0);
    const open = page.locator('#embed-preview-open');
    await expect(open).toHaveAttribute('href', '/embed/id-photo/');
    await open.click();
    const preview = page.locator('iframe.embed-preview');
    await expect(preview).toHaveAttribute('src', /\/embed\/id-photo\/$/);
    await expect(preview).toHaveAttribute('title', '증명사진 규격 맞추기 (문서딱) 미리 보기');
    await expect(page.frameLocator('iframe.embed-preview').locator('#idp-tool')).toHaveAttribute('data-state', 'empty');
  });

  test('코드 복사: the clipboard gets the snippet (chromium)', async ({ page, browserName, context }) => {
    test.skip(browserName !== 'chromium', 'Clipboard read permission is a Chromium-only Playwright feature.');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await gotoReady(page, '/embed/');
    await page.locator('#embed-copy').click();
    await expect(page.locator('#embed-copy-status')).toHaveText('코드를 복사했어요.');
    expect(lf(await page.evaluate(() => navigator.clipboard.readText()))).toBe(embedSnippet(await site(page)));
  });

  test('코드 복사 fallback: a refused clipboard selects the code and says how to copy', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => ({ writeText: () => Promise.reject(new Error('denied')) }), configurable: true });
    });
    await gotoReady(page, '/embed/');
    await page.locator('#embed-copy').click();
    await expect(page.locator('#embed-copy-status')).toHaveText('코드를 선택했어요. 길게 누르거나 Ctrl+C로 복사해 주세요.');
    expect(lf(await page.evaluate(() => window.getSelection()?.toString()))).toBe(embedSnippet(await site(page)));
  });
});
