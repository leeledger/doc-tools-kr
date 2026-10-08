// /hwp-viewer/ (G2 A0 test map): open .hwp and .hwpx with the page count, navigation (buttons, page box, page
// list), fit width / fit page / zoom keep the page, select + copy, search (count, jump, highlight, stop, the
// 100-page guard), 「PDF로 내려받기」 for the open document, the shared error paths, bfcache, the KakaoTalk
// in-app user agents, phone layout, axe and the legal lines. Every test runs under the no-upload fixture and
// fails on a console error or a CSP violation.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { Download, Page } from '@playwright/test';
import { expect, gotoReady, test } from './no-upload';
import { hwpRuntime } from './hwp-fixtures';
import { openPdf } from '../../scripts/regress/lib.mjs';

const CORPUS = join(process.cwd(), 'tests', 'corpus', 'hwp');
const fx = (name: string): string => join(CORPUS, name);
const expected = JSON.parse(readFileSync(join(CORPUS, 'expected.json'), 'utf8')).files as Record<string, { pages: number; officialText: string }>;
const CSP = readFileSync(join(process.cwd(), 'public', '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)![1].trim();
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const HANCOM = '본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.';
const TRADEMARK = '한글, 한컴, HWP, HWPX는 한글과컴퓨터의 등록상표이며, 본 서비스는 한글과컴퓨터와 무관합니다.';
const DIFFER = '원본과 다르게 보일 수 있어요.';
const DONE = ['convert', 'viewer-first', 'viewer-only', 'error'];
const KAKAO_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.9.5';
const KAKAO_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 KAKAOTALK 10.9.5';

type Win = Window & { __csp: number };

const tool = (page: Page) => page.locator('#hwp-tool');
const pages = (page: Page) => page.locator('#hw-preview .page');
const current = (page: Page) => page.locator('#hv-page');

// The site scrolls the window smoothly; Playwright's scroll-into-view before a click then races the animation
// and the pointer lands mid-scroll (seen on Firefox: pointerdown on 「다음」, no click). Reduced motion turns the
// smooth scroll off; the viewer itself has no motion.
test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  (page as Page & { __errors: string[] }).__errors = errors;
  await page.addInitScript(() => {
    const w = window as unknown as Win;
    w.__csp = 0;
    document.addEventListener('securitypolicyviolation', () => w.__csp++);
  });
});

test.afterEach(async ({ page }, info) => {
  if (!page.url().startsWith('http')) return;
  expect(await page.evaluate(() => (window as unknown as Win).__csp), 'CSP violations').toBe(0);
  // Tests that force an engine failure expect the browser's own load error lines.
  if (!info.tags.includes('@load-error')) expect((page as Page & { __errors: string[] }).__errors, 'console errors').toEqual([]);
});

async function open(page: Page, file: string, state?: string, timeout = 150_000): Promise<string> {
  if (!page.url().includes('/hwp-viewer/')) await gotoReady(page, '/hwp-viewer/');
  await page.setInputFiles('#hw-input', file);
  await expect(tool(page)).toHaveAttribute('data-state', new RegExp(`^(${DONE.join('|')})$`), { timeout });
  const s = (await tool(page).getAttribute('data-state'))!;
  if (state) expect(s, (await page.locator('#hw-error').textContent()) ?? '').toBe(state);
  if (s !== 'error') await expect(page.locator('#hv-bar')).toBeVisible();
  return s;
}

/** The page whose box crosses a line one third down the preview (what the page box should say). */
const inView = (page: Page) =>
  page.evaluate(() => {
    const box = document.getElementById('hw-preview')!;
    const line = box.getBoundingClientRect().top + box.clientHeight / 3;
    const all = Array.from(box.querySelectorAll<HTMLElement>('.page'));
    const hit = all.find((p) => {
      const r = p.getBoundingClientRect();
      return r.top <= line && r.bottom + 12 >= line;
    });
    return hit ? Number(hit.dataset.page) + 1 : -1;
  });

async function download(page: Page, button: string, timeout = 120_000): Promise<Download> {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout }), page.locator(button).click()]);
  return d;
}

function recall(text: string, key: string): number {
  const content = text.normalize('NFKC').match(/[가-힣A-Za-z0-9]/g) ?? [];
  const want = new Map<string, number>();
  for (const c of expected[key]!.officialText) want.set(c, (want.get(c) ?? 0) + 1);
  const got = new Map<string, number>();
  for (const c of content) got.set(c, (got.get(c) ?? 0) + 1);
  let inter = 0;
  for (const [c, n] of want) inter += Math.min(n, got.get(c) ?? 0);
  return inter / expected[key]!.officialText.length;
}

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(AXE_TAGS).exclude('#hw-preview .page > svg').exclude('.hv-mini-svg').analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.length} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

// ---------- lazy load ----------

test('lazy: no worker, wasm, viewer controls or PDF chunk before a file is picked', async ({ page, network }) => {
  await gotoReady(page, '/hwp-viewer/');
  await page.waitForTimeout(1500);
  const urls = network.requests.map((r) => r.url());
  expect(urls.filter((u) => /hwp\.worker|rhwp_bg|\/fonts\/hwp\/|export-chunk|\/_astro\/ui\./.test(u))).toEqual([]);
  await expect(page.locator('#hv-bar')).toBeHidden();
});

// ---------- open ----------

for (const [file, key] of [
  ['law10.hwp', 'law10'],
  ['adm02.hwpx', 'adm02'],
] as const) {
  test(`opens ${file}: ${expected[key].pages} pages, the page box, the page list and the "다를 수 있어요" line`, async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, fx(file), 'convert');
    const n = expected[key].pages;
    await expect(pages(page)).toHaveCount(n);
    await expect(page.locator('#hv-total')).toHaveText(`/ ${n}`);
    await expect(page.locator('#hw-file-name')).toHaveText(`${file} · ${n}쪽`);
    await expect(current(page)).toHaveValue('1');
    await expect(page.locator('.hv-differ')).toHaveText(DIFFER);
    await expect(page.locator('#hw-preview .page.rendered').first()).toBeVisible();
    await expect(page.locator('#hw-save')).toHaveText('PDF로 내려받기');
  });
}

// ---------- navigation ----------

test('navigation: 다음 / 이전, the page box and a page-list tile each bring that page into view', async ({ page, isMobile }) => {
  test.setTimeout(180_000);
  await open(page, fx('law10.hwp'), 'convert');
  await expect(page.locator('#hv-prev')).toBeDisabled();
  await page.locator('#hv-next').click();
  await expect(current(page)).toHaveValue('2');
  expect(await inView(page)).toBe(2);
  await page.locator('#hv-prev').click();
  await expect(current(page)).toHaveValue('1');
  await current(page).fill('17');
  await current(page).press('Enter');
  await expect(current(page)).toHaveValue('17');
  expect(await inView(page)).toBe(17);
  await expect(page.locator('#hw-preview .page[data-page="16"]')).toHaveClass(/rendered/);
  // Page list: a side list on wide screens, a bottom sheet behind 「쪽 목록」 on phones.
  if (isMobile) {
    await expect(page.locator('#hv-thumbs')).toBeHidden();
    await page.locator('#hv-thumbs-toggle').click();
  }
  const list = page.locator('#hv-thumbs');
  await expect(list).toBeVisible();
  await expect(list.locator('.hv-tile.is-now')).toHaveAttribute('data-page', '16');
  await list.locator('.hv-tile[data-page="4"]').click();
  await expect(current(page)).toHaveValue('5');
  expect(await inView(page)).toBe(5);
  if (isMobile) await expect(list).toBeHidden();
  await page.locator('#hv-next').click();
  await page.locator('#hv-next').click();
  await expect(current(page)).toHaveValue('7');
});

test('page list: a tile shows a mini preview of a drawn page and drops it when the page leaves the window', async ({ page, isMobile }) => {
  test.setTimeout(180_000);
  await open(page, fx('law10.hwp'), 'convert');
  if (isMobile) await page.locator('#hv-thumbs-toggle').click();
  const tile = page.locator('.hv-tile[data-page="0"]');
  await expect(tile.locator('.hv-mini-svg use')).toHaveAttribute('href', '#hv-p0');
  // The mini preview paints the page: dark pixels inside the tile's page box.
  const png = await tile.locator('.hv-mini').screenshot();
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, img.width, img.height).data;
  let dark = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] < 600) dark++;
  expect(dark).toBeGreaterThan(30);
  await current(page).fill('26');
  await current(page).press('Enter');
  await expect(page.locator('#hw-preview .page[data-page="0"]')).not.toHaveClass(/rendered/);
  await expect(page.locator('.hv-tile[data-page="0"] .hv-mini-svg')).toHaveCount(0);
  await expect(page.locator('.hv-tile[data-page="25"] .hv-mini-svg')).toHaveCount(1);
});

test('page list above 100 pages is virtualised (adm28, 128 pages)', async ({ page, isMobile }) => {
  test.setTimeout(240_000);
  await open(page, fx('adm28.hwpx'));
  if (isMobile) await page.locator('#hv-thumbs-toggle').click();
  await expect(page.locator('.hv-tile').first()).toBeVisible();
  expect(await page.locator('.hv-tile').count()).toBeLessThan(60);
  await page.locator('#hv-tiles').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(page.locator('.hv-tile[data-page="127"]')).toBeAttached();
  expect(await page.locator('.hv-tile').count()).toBeLessThan(60);
});

// ---------- zoom ----------

test('zoom: phones open in fit width, wider screens in fit page; 너비 맞춤, 쪽 맞춤 and ± keep the page in view', async ({ page, isMobile }) => {
  test.setTimeout(180_000);
  await open(page, fx('law10.hwp'), 'convert');
  await expect(page.locator(isMobile ? '#hv-fit-width' : '#hv-fit-page')).toHaveAttribute('aria-pressed', 'true');
  await current(page).fill('9');
  await current(page).press('Enter');
  expect(await inView(page)).toBe(9);
  const widthOf = () => page.locator('#hw-preview .page[data-page="8"]').evaluate((e) => e.getBoundingClientRect().width);
  const before = await widthOf();
  await page.locator('#hv-zoom-in').click();
  await expect(page.locator('#hv-fit-width')).toHaveAttribute('aria-pressed', 'false');
  expect(await widthOf()).toBeGreaterThan(before);
  expect(await inView(page)).toBe(9);
  await expect(current(page)).toHaveValue('9');
  await page.locator('#hv-zoom-in').click();
  await page.locator('#hv-zoom-in').click();
  expect(await inView(page)).toBe(9);
  await page.locator('#hv-fit-width').click();
  await expect(page.locator('#hv-fit-width')).toHaveAttribute('aria-pressed', 'true');
  const box = await page.locator('#hw-preview').evaluate((e) => e.clientWidth);
  expect(await widthOf()).toBeLessThanOrEqual(box);
  expect(await widthOf()).toBeGreaterThan(box * 0.8);
  expect(await inView(page)).toBe(9);
  await page.locator('#hv-fit-page').click();
  expect(await inView(page)).toBe(9);
  const fits = await page.locator('#hw-preview .page[data-page="8"]').evaluate((e) => e.getBoundingClientRect().height <= (e.parentElement as HTMLElement).clientHeight);
  expect(fits).toBe(true);
  // The ± steps run 50–300 % and stop at the ends (a fit can be smaller than 50 %).
  await page.locator('#hv-zoom-in').click();
  for (let i = 0; i < 10; i++) if (await page.locator('#hv-zoom-out').isEnabled()) await page.locator('#hv-zoom-out').click();
  await expect(page.locator('#hv-zoom')).toHaveText('50%');
  await expect(page.locator('#hv-zoom-out')).toBeDisabled();
  for (let i = 0; i < 10; i++) if (await page.locator('#hv-zoom-in').isEnabled()) await page.locator('#hv-zoom-in').click();
  await expect(page.locator('#hv-zoom')).toHaveText('300%');
  expect(await inView(page)).toBe(9);
});

test('pinch zoom is never blocked: no user-scalable=no, no maximum-scale, no touch-action: none', async ({ page }) => {
  await gotoReady(page, '/hwp-viewer/');
  const vp = (await page.locator('meta[name="viewport"]').getAttribute('content')) ?? '';
  expect(vp).not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale/);
  await open(page, fx('law05.hwp'), 'convert');
  const ta = await page.evaluate(() => [document.documentElement, document.body, ...Array.from(document.querySelectorAll('#hwp-tool, #hwp-tool *'))].map((e) => getComputedStyle(e).touchAction).filter((t) => t === 'none'));
  expect(ta).toEqual([]);
});

// ---------- text ----------

test('select + copy: law05 copies as lines of words, not one glyph per line (clipboard on Chromium)', async ({ page, browserName, context, isMobile }) => {
  test.setTimeout(180_000);
  await open(page, fx('law05.hwp'), 'convert');
  // Select the whole page, then let the page answer a copy event (the same handler Ctrl+C reaches).
  const copied = await page.evaluate(() => {
    const svg = document.querySelector('#hw-preview .page[data-page="0"] > svg')!;
    const r = document.createRange();
    r.selectNodeContents(svg);
    const s = getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
    const ev = new ClipboardEvent('copy', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    return { text: ev.clipboardData!.getData('text/plain'), handled: ev.defaultPrevented };
  });
  expect(copied.handled).toBe(true);
  expect(recall(copied.text, 'law05')).toBeGreaterThanOrEqual(0.99);
  expect(copied.text).toContain('관세법 시행규칙');
  expect(copied.text.split('\n').length).toBeLessThan(40);
  if (browserName === 'chromium' && !isMobile) {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#hw-preview').focus();
    await page.evaluate(() => {
      const r = document.createRange();
      r.selectNodeContents(document.querySelector('#hw-preview .page[data-page="0"] > svg')!);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    });
    await page.keyboard.press('Control+C');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip.replace(/\r\n/g, '\n')).toBe(copied.text);
  }
});

// ---------- search ----------

test('search: "전산" in law10 → 7 hits, jumps to page 23 and marks the word; 다음 walks the hits; spaces are folded', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, fx('law10.hwp'), 'convert');
  await page.locator('#hv-find-toggle').click();
  await expect(page.locator('#hv-q')).toBeFocused();
  await page.locator('#hv-q').fill('전산');
  await page.locator('#hv-q').press('Enter');
  await expect(page.locator('#hv-find-status')).toHaveText('7개 찾음', { timeout: 120_000 });
  await expect(page.locator('#hv-hit-pos')).toHaveText('1 / 7 · 23쪽');
  const mark = page.locator('#hw-preview .page[data-page="22"] .hv-mark');
  await expect(mark.first()).toBeVisible();
  expect(await inView(page)).toBeGreaterThanOrEqual(22);
  // The mark covers the drawn word: the glyphs under it read 전산.
  const under = await page.evaluate(() => {
    const m = document.querySelector('#hw-preview .page[data-page="22"] .hv-mark')!.getBoundingClientRect();
    return Array.from(document.querySelectorAll('#hw-preview .page[data-page="22"] svg text'))
      .filter((t) => {
        const r = t.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        return cx >= m.left && cx <= m.right && cy >= m.top && cy <= m.bottom;
      })
      .map((t) => t.textContent)
      .join('')
      .replace(/\s/g, '');
  });
  expect(under).toBe('전산');
  for (let i = 0; i < 4; i++) await page.locator('#hv-hit-next').click();
  await expect(page.locator('#hv-hit-pos')).toHaveText('5 / 7 · 25쪽');
  await expect(page.locator('#hw-preview .page[data-page="24"] .hv-mark').first()).toBeVisible();
  await expect(page.locator('#hw-preview .page[data-page="22"] .hv-mark')).toHaveCount(0);
  await page.locator('#hv-hit-prev').click();
  await expect(page.locator('#hv-hit-pos')).toHaveText('4 / 7 · 23쪽');
  // Folded: a space in the query and a different normal form still match.
  await page.locator('#hv-q').fill('공무원 임용시험령');
  await page.locator('#hv-q').press('Enter');
  await expect(page.locator('#hv-find-status')).toHaveText('1개 찾음');
  await expect(page.locator('#hv-hit-pos')).toHaveText('1 / 1 · 1쪽');
  await page.locator('#hv-q').fill('문서딱없는말');
  await page.locator('#hv-q').press('Enter');
  await expect(page.locator('#hv-find-status')).toHaveText('찾지 못했습니다');
});

test('search: 멈추기 stops with the hits so far; past 100 pages the search stops at the guard (adm28)', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page, fx('adm28.hwpx'));
  await page.locator('#hv-find-toggle').click();
  await page.locator('#hv-q').fill('내진');
  await page.locator('#hv-q').press('Enter');
  await expect(page.locator('#hv-find-stop')).toBeVisible();
  await page.locator('#hv-find-stop').click();
  await expect(page.locator('#hv-find-status')).toHaveText(/^찾기를 멈췄어요 · \d+개 찾음$/);
  await expect(page.locator('#hv-find-stop')).toBeHidden();
  await page.locator('#hv-q').press('Enter');
  await expect(page.locator('#hv-find-status')).toHaveText(/^찾기를 멈췄어요 · 처음 100쪽에서 \d+개 찾음$/, { timeout: 240_000 });
});

// ---------- PDF ----------

test('「PDF로 내려받기」 saves the open document as a PDF with its page count, without a second pick', async ({ page }) => {
  test.setTimeout(240_000);
  const picks: number[] = [];
  page.on('filechooser', () => picks.push(1));
  await open(page, fx('adm02.hwpx'), 'convert');
  const d = await download(page, '#hw-save');
  expect(d.suggestedFilename()).toBe('adm02.pdf');
  const doc = await openPdf(new Uint8Array(readFileSync((await d.path())!)));
  expect(doc.numPages).toBe(expected.adm02.pages);
  await (doc as unknown as { close(): Promise<void> }).close();
  await expect(page.locator('#hw-done')).toBeVisible();
  await expect(page.locator('#hw-again')).toHaveAttribute('download', 'adm02.pdf');
  // The document is still open in the viewer.
  await expect(pages(page)).toHaveCount(expected.adm02.pages);
  await expect(page.locator('#hv-bar')).toBeVisible();
  expect(picks).toEqual([]);
});

test('viewer-first (law17): the banner and 「그래도 PDF로 내려받기」', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, fx('law17.hwp'), 'viewer-first');
  await expect(page.locator('#hw-banner')).toContainText('글상자·도형이 많아');
  await expect(page.locator('#hw-save')).toBeHidden();
  const d = await download(page, '#hw-force');
  expect(d.suggestedFilename()).toBe('law17.pdf');
});

// ---------- KakaoTalk in-app ----------

for (const [name, ua, project] of [
  ['iOS', KAKAO_IOS, 'mobile-safari'],
  ['Android', KAKAO_ANDROID, 'mobile-chrome'],
] as const) {
  test.describe(`KakaoTalk in-app (${name} user agent)`, () => {
    test.use({ userAgent: ua });
    test('opens law05 and downloads its PDF through the same path', async ({ page }, info) => {
      test.skip(info.project.name !== project, `${name} KakaoTalk runs on ${project}.`);
      test.setTimeout(180_000);
      expect(await page.evaluate(() => navigator.userAgent).catch(() => ua)).toContain('KAKAOTALK');
      await open(page, fx('law05.hwp'), 'convert');
      await expect(pages(page)).toHaveCount(1);
      const d = await download(page, '#hw-save');
      expect(d.suggestedFilename()).toBe('law05.pdf');
    });
  });
}

// ---------- errors ----------

test('errors: a .txt is not a HWP file; an over-cap phone file gets the converter’s panel', async ({ page, isMobile }) => {
  test.setTimeout(120_000);
  await open(page, hwpRuntime('notes.txt'), 'error');
  await expect(page.locator('#hw-error')).toHaveText('한글(HWP·HWPX) 문서가 아닙니다. 확장자가 .hwp 또는 .hwpx인 파일을 골라 주세요.');
  await expect(page.locator('#hv-bar')).toBeHidden();
  if (isMobile) {
    await open(page, hwpRuntime('big-26mb.hwp'), 'error');
    await expect(page.locator('#hw-error')).toHaveText('휴대폰에서는 25 MB까지 열 수 있습니다 (이 파일 26 MB). 컴퓨터에서 열어 주세요.');
  }
});

test('engine: a wasm 404 shows the engine panel with 새로고침', { tag: '@load-error' }, async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.route(/\/vendor\/rhwp\/.*\.wasm$/, (route) => route.fulfill({ status: 404, body: 'missing', headers: { 'Content-Security-Policy': CSP } }));
  await open(page, fx('law05.hwp'), 'error');
  await expect(page.locator('#engine-error')).toBeVisible();
  await expect(page.locator('#engine-error').getByRole('button', { name: '새로고침' })).toBeFocused();
});

test('engine: the PDF chunk failing to load shows the engine panel, not a file error', { tag: '@load-error' }, async ({ page, context }) => {
  test.setTimeout(180_000);
  await context.route(/\/_astro\/export-chunk[^/]*\.js$/, (route) => route.fulfill({ status: 404, body: 'missing', headers: { 'Content-Security-Policy': CSP } }));
  await open(page, fx('law05.hwp'), 'convert');
  await page.locator('#hw-save').click();
  await expect(page.locator('#engine-error')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#hw-error')).toBeHidden();
});

const pagehide = (page: Page) => page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
const pageshow = (page: Page) => page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));

test('bfcache: pagehide then pageshow(persisted) starts over with the controls gone; a new file opens', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, fx('law10.hwp'), 'convert');
  await pagehide(page);
  await pageshow(page);
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  await expect(pages(page)).toHaveCount(0);
  await expect(page.locator('#hv-bar')).toBeHidden();
  await open(page, fx('law05.hwp'), 'convert');
  await expect(page.locator('#hv-total')).toHaveText('/ 1');
});

test('bfcache: a search with no worker (pagehide, no restore event) ends in the engine panel, not a hang', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page, fx('law10.hwp'), 'convert');
  await pagehide(page);
  await page.locator('#hv-find-toggle').click();
  await page.locator('#hv-q').fill('전산');
  await page.locator('#hv-q').press('Enter');
  await expect(tool(page)).toHaveAttribute('data-state', 'error', { timeout: 15_000 });
  await expect(page.locator('#engine-error')).toBeVisible();
});

// ---------- layout ----------

test('phone width: nothing scrolls sideways at 360 px; the page list is a bottom sheet with 닫기', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Phone layout.');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await open(page, fx('law10.hwp'), 'convert');
  const sideways = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await sideways()).toBeLessThanOrEqual(0);
  await expect(page.locator('#hv-fit-width')).toHaveAttribute('aria-pressed', 'true');
  const pageBox = await page.locator('#hw-preview .page[data-page="0"]').boundingBox();
  const prevBox = await page.locator('#hw-preview').boundingBox();
  expect(pageBox!.width).toBeLessThanOrEqual(prevBox!.width);
  for (const id of ['#hv-prev', '#hv-next', '#hv-zoom-in', '#hv-thumbs-toggle', '#hv-find-toggle']) {
    const b = await page.locator(id).boundingBox();
    expect(b!.x + b!.width, id).toBeLessThanOrEqual(360);
    expect(b!.height, id).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#hv-thumbs-toggle').click();
  const sheet = await page.locator('#hv-thumbs').boundingBox();
  expect(sheet!.y + sheet!.height).toBeGreaterThan(700);
  expect(sheet!.width).toBeGreaterThanOrEqual(359);
  // 「닫기」 keeps its own width; the phone rule that stretches buttons does not apply in the sheet header.
  const head = await page.locator('.hv-sheet-head').boundingBox();
  const close = await page.locator('#hv-thumbs-close').boundingBox();
  expect(close!.width).toBeLessThan(head!.width * 0.4);
  await page.locator('#hv-thumbs-close').click();
  await expect(page.locator('#hv-thumbs')).toBeHidden();
  await expect(page.locator('#hv-thumbs-toggle')).toBeFocused();
  await page.locator('#hv-zoom-in').click();
  await page.locator('#hv-zoom-in').click();
  expect(await sideways()).toBeLessThanOrEqual(0);
});

// ---------- axe ----------

test('axe: empty, a document with the page list and search open, after a download, error', async ({ page, isMobile }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/hwp-viewer/');
  expect(await serious(page)).toEqual([]);
  await open(page, fx('law10.hwp'), 'convert');
  if (isMobile) await page.locator('#hv-thumbs-toggle').click();
  await page.locator('#hv-find-toggle').click();
  await page.locator('#hv-q').fill('전산');
  await page.locator('#hv-q').press('Enter');
  await expect(page.locator('#hv-find-status')).toHaveText('7개 찾음', { timeout: 120_000 });
  expect(await serious(page)).toEqual([]);
  await download(page, '#hw-save');
  expect(await serious(page)).toEqual([]);
  await page.locator('#hw-reset').click();
  await open(page, hwpRuntime('notes.txt'), 'error');
  expect(await serious(page)).toEqual([]);
});

// ---------- SEO and legal ----------

test('SEO and legal: title, H1, canonical, FAQPage JSON-LD with the notice, the Hancom and trademark lines, 3 HWP guides', async ({ page }) => {
  await gotoReady(page, '/hwp-viewer/');
  await expect(page).toHaveTitle('HWP 뷰어 — 한글 파일(hwp·hwpx) 설치 없이 열기 | 문서딱');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('HWP·HWPX 파일 보기');
  expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href'))!).pathname).toBe('/hwp-viewer/');
  const data = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((j) => JSON.parse(j));
  const faq = data.find((d: { '@type': string }) => d['@type'] === 'FAQPage');
  expect(JSON.stringify(faq)).toContain(HANCOM);
  for (const text of [HANCOM, TRADEMARK]) {
    await expect(page.locator('.tool-legal')).toContainText(text);
    await expect(page.locator('.help')).toContainText(text);
  }
  await expect(page.locator('.help')).toContainText(DIFFER);
  await expect(page.locator('body')).not.toContainText(/한컴\s*뷰어|한컴오피스/);
  expect((await page.locator('.quick-guides a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))).sort()).toEqual(['/guide/hwp-on-phone/', '/guide/open-hwp-without-hangul/', '/guide/what-is-hwpx/']);
});
