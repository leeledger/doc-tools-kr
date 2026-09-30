// HWP PDF 변환 (brief Step 5 "E2E"). All 5 projects; the no-upload fixture runs on every test (./no-upload) and
// every test also asserts zero CSP violations.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, gotoReady, test } from './no-upload';
import { hwpRuntime } from './hwp-fixtures';
import { openPdf, pageText, unitSize } from '../../scripts/regress/lib.mjs';

const CORPUS = join(process.cwd(), 'tests', 'corpus', 'hwp');
const fx = (name: string): string => join(CORPUS, name);
const expected = JSON.parse(readFileSync(join(CORPUS, 'expected.json'), 'utf8')).files as Record<string, { pages: number; officialText: string; officialWords: number }>;
// Routed responses carry the site CSP, as every real response does (the no-upload fixture checks it).
const CSP = readFileSync(join(process.cwd(), 'public', '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)![1].trim();
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const HANCOM = '본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.';
const TRADEMARK = '한글, 한컴, HWP, HWPX는 한글과컴퓨터의 등록상표이며, 본 서비스는 한글과컴퓨터와 무관합니다.';
const SHAPES = '이 문서는 수식·도형이 많아 변환 결과가 원본과 다를 수 있습니다';
const DONE = ['convert', 'viewer-first', 'viewer-only', 'error'];

const tool = (page: Page) => page.locator('#hwp-tool');
const pages = (page: Page) => page.locator('#hwp-print-root .page');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __csp: number }).__csp = 0;
    document.addEventListener('securitypolicyviolation', () => (window as unknown as { __csp: number }).__csp++);
    (window as unknown as { __printed: string[] }).__printed = [];
    window.print = () => (window as unknown as { __printed: string[] }).__printed.push(document.title);
    const revoke = URL.revokeObjectURL.bind(URL);
    (window as unknown as { __revoked: string[] }).__revoked = [];
    URL.revokeObjectURL = (u: string) => {
      (window as unknown as { __revoked: string[] }).__revoked.push(u);
      revoke(u);
    };
  });
});

test.afterEach(async ({ page }) => {
  if (page.url().startsWith('http')) expect(await page.evaluate(() => (window as unknown as { __csp: number }).__csp), 'CSP violations').toBe(0);
});

async function open(page: Page, file: string, state?: string, timeout = 150_000): Promise<string> {
  if (!page.url().includes('/hwp-to-pdf/')) await gotoReady(page, '/hwp-to-pdf/');
  await page.setInputFiles('#hw-input', file);
  await expect(tool(page)).toHaveAttribute('data-state', new RegExp(`^(${DONE.join('|')})$`), { timeout });
  const s = (await tool(page).getAttribute('data-state'))!;
  if (state) expect(s, (await page.locator('#hw-error').textContent()) ?? '').toBe(state);
  return s;
}

async function convertReady(page: Page, file: string): Promise<void> {
  await open(page, file, 'convert');
  await expect(page.locator('#hw-save')).toBeEnabled({ timeout: 60_000 });
}

const dangling = (page: Page) =>
  page.evaluate(() => {
    let n = 0;
    for (const svg of Array.from(document.querySelectorAll('#hwp-print-root .page svg'))) {
      const ids = new Set(Array.from(svg.querySelectorAll('[id]')).map((e) => e.id));
      for (const el of Array.from(svg.querySelectorAll('*'))) for (const a of Array.from(el.attributes)) for (const m of a.value.matchAll(/url\(#([^)]+)\)/g)) if (!ids.has(m[1])) n++;
    }
    return n;
  });

// The page drawings (rhwp SVG, up to ~20,000 nodes a page) are excluded: they are graphics inside a labelled
// role="group" per page; scanning them made axe take minutes. Everything else on the page is checked.
const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(AXE_TAGS).exclude('#hwp-print-root .page > svg').analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length}`);

// ---------- lazy load ----------

test('lazy: no worker, wasm or HWP font request before a file is picked', async ({ page, network }) => {
  await gotoReady(page, '/hwp-to-pdf/');
  await page.waitForTimeout(1500);
  const urls = network.requests.map((r) => r.url());
  expect(urls.filter((u) => /hwp\.worker|rhwp_bg|\/fonts\/hwp\//.test(u))).toEqual([]);
});

// ---------- convert ----------

test('convert law10: 26 pages, save enabled only after the fonts, print once with the swapped title, restored on afterprint, no dangling url(#…)', async ({ page, network }) => {
  test.setTimeout(240_000);
  await gotoReady(page, '/hwp-to-pdf/');
  await page.evaluate(() => {
    const btn = document.getElementById('hw-save')!;
    new MutationObserver(() => {
      if (!(btn as HTMLButtonElement).disabled && !btn.hidden) (window as unknown as { __fontsAtEnable: string }).__fontsAtEnable ??= document.fonts.status;
    }).observe(btn, { attributes: true });
  });
  await convertReady(page, fx('law10.hwp'));
  await expect(pages(page)).toHaveCount(26);
  expect(await page.evaluate(() => (window as unknown as { __fontsAtEnable: string }).__fontsAtEnable)).toBe('loaded');
  expect(await dangling(page)).toBe(0);
  await expect(page.locator('#hw-note')).toHaveText('원본 프로그램과 글꼴·줄바꿈이 조금 다를 수 있습니다.');
  await expect(page.locator('#hw-guide')).toBeVisible();
  const title = await page.title();
  await page.locator('#hw-save').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: string[] }).__printed)).toEqual(['law10']);
  expect(await page.title()).toBe('law10');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  expect(await page.title()).toBe(title);
  await expect(page.locator('#hw-after')).toContainText('PDF 파일이 저장되지 않았다면 인쇄 창에서 PDF로 저장을 골랐는지 확인해 주세요.');
  await expect(page.locator('#hw-after').getByRole('link', { name: '저장한 PDF가 크면 PDF 용량 줄이기' })).toHaveAttribute('href', '/pdf-compress/');
  await expect(page.locator('#hw-save')).toBeFocused();
  // Font bytes for law10 (budget 2.5 MB, reported).
  let fontBytes = 0;
  for (const r of network.responses.filter((x) => x.url().includes('/fonts/hwp/') && x.url().endsWith('.woff2'))) fontBytes += (await r.body().catch(() => Buffer.alloc(0))).length;
  test.info().annotations.push({ type: 'law10 font bytes', description: String(fontBytes) });
  expect(fontBytes).toBeLessThanOrEqual(2_500_000);
});

for (const key of ['law10', 'law05', 'adm14'] as const) {
  test(`Chromium PDF of ${key}: page count, page size, content recall ≥ 0.99, word spaces`, async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || isMobile, 'page.pdf() exists only in desktop Chromium; the other engines run the print-media screenshot test.');
    test.setTimeout(240_000);
    await convertReady(page, fx(`${key}.${key.startsWith('adm') ? 'hwpx' : 'hwp'}`));
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const doc = await openPdf(new Uint8Array(pdf));
    expect(doc.numPages).toBe(expected[key].pages);
    const size = await unitSize(doc, 0);
    if (key === 'law05') expect(size.width).toBeGreaterThan(size.height);
    else expect(size.height).toBeGreaterThan(size.width);
    let text = '';
    for (let i = 0; i < doc.numPages; i++) text += `${await pageText(doc, i)}\n`;
    await (doc as unknown as { close(): Promise<void> }).close();
    const content = text.normalize('NFKC').match(/[가-힣A-Za-z0-9]/g) ?? [];
    const want = new Map<string, number>();
    for (const c of expected[key].officialText) want.set(c, (want.get(c) ?? 0) + 1);
    const got = new Map<string, number>();
    for (const c of content) got.set(c, (got.get(c) ?? 0) + 1);
    let inter = 0;
    for (const [c, n] of want) inter += Math.min(n, got.get(c) ?? 0);
    expect(inter / expected[key].officialText.length).toBeGreaterThanOrEqual(0.99);
    if (key === 'law10') {
      const words = text.split(/\s+/).filter(Boolean).length;
      expect(Math.abs(words - expected.law10.officialWords) / expected.law10.officialWords).toBeLessThanOrEqual(0.1);
    }
  });
}

test('print media: only the pages are shown, and the first page box matches its size', async ({ page }) => {
  test.setTimeout(240_000);
  await convertReady(page, fx('law05.hwp'));
  await page.emulateMedia({ media: 'print' });
  const r = await page.evaluate(() => {
    const root = document.getElementById('hwp-print-root')!;
    const others = Array.from(document.body.querySelectorAll('*')).filter((e) => {
      if (root.contains(e) || e.contains(root)) return false;
      const b = e.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden';
    });
    const first = root.querySelector('.page')!.getBoundingClientRect();
    return { others: others.map((e) => e.tagName + (e.id ? `#${e.id}` : '')).slice(0, 5), w: first.width, h: first.height };
  });
  expect(r.others).toEqual([]);
  // law05 is landscape A4: 1122.5 x 793.7 CSS px (rhwp page info).
  expect(Math.abs(r.w - 1122.5)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(r.h - 793.7)).toBeLessThanOrEqual(1.5);
  await page.screenshot({ path: test.info().outputPath('print-law05.png') });
});

test('HWPX: adm02 and adm14 open in convert mode with the expected page counts', async ({ page }) => {
  test.setTimeout(240_000);
  await convertReady(page, fx('adm02.hwpx'));
  await expect(pages(page)).toHaveCount(expected.adm02.pages);
  await page.locator('#hw-reset').click();
  await convertReady(page, fx('adm14.hwpx'));
  await expect(pages(page)).toHaveCount(expected.adm14.pages);
});

test('print gate: the document is printable only once PDF로 저장 is enabled; before that print shows the preparing notice', async ({ page }) => {
  test.setTimeout(240_000);
  await gotoReady(page, '/hwp-to-pdf/');
  await page.evaluate(() => {
    const log: { printable: boolean; preparing: boolean; saveDisabled: boolean }[] = [];
    (window as unknown as { __printLog: typeof log }).__printLog = log;
    const save = document.getElementById('hw-save') as HTMLButtonElement;
    new MutationObserver(() =>
      log.push({ printable: document.body.classList.contains('hwp-printable'), preparing: document.body.classList.contains('hwp-preparing'), saveDisabled: save.disabled || save.hidden !== false }),
    ).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  });
  await convertReady(page, fx('law10.hwp'));
  const log = await page.evaluate(() => (window as unknown as { __printLog: { printable: boolean; preparing: boolean; saveDisabled: boolean }[] }).__printLog);
  expect(log.some((x) => x.preparing)).toBe(true);
  expect(log.filter((x) => x.printable && x.saveDisabled)).toEqual([]);
  expect(await page.evaluate(() => document.body.classList.contains('hwp-printable'))).toBe(true);
  await page.evaluate(() => {
    document.body.classList.remove('hwp-printable');
    document.body.classList.add('hwp-preparing');
  });
  await page.emulateMedia({ media: 'print' });
  expect(await page.evaluate(() => getComputedStyle(document.body, '::before').content)).toContain('문서를 준비하는 중입니다');
});

test('그래도 PDF로 저장 is a secondary button and sets the in-flight flag again for the full render, cleared after', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __storage: string[] }).__storage = log;
    const set = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'hwp-inflight') log.push(`set ${document.getElementById('hwp-tool')?.dataset.state ?? ''}`);
      return set.call(this, k, v);
    };
    Storage.prototype.removeItem = function (k: string) {
      if (k === 'hwp-inflight') log.push('remove');
      return remove.call(this, k);
    };
  });
  await open(page, fx('law17.hwp'), 'viewer-first');
  await expect(page.locator('#hw-force')).toHaveClass(/(^| )ghost( |$)/);
  await expect(page.locator('#hw-force')).not.toHaveClass(/(^| )primary( |$)/);
  await page.evaluate(() => ((window as unknown as { __storage: string[] }).__storage.length = 0));
  await page.locator('#hw-force').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'convert', { timeout: 120_000 });
  await expect(page.locator('#hw-save')).toBeEnabled({ timeout: 60_000 });
  const log = await page.evaluate(() => (window as unknown as { __storage: string[] }).__storage);
  expect(log[0]).toBe('set viewer-first');
  expect(log[log.length - 1]).toBe('remove');
  expect(await page.evaluate(() => sessionStorage.getItem('hwp-inflight'))).toBeNull();
});

// ---------- viewer-first ----------

test('viewer-first: law09 and law17 show the 수식·도형 copy; the save path is 그래도 PDF로 저장', async ({ page }) => {
  test.setTimeout(240_000);
  for (const f of ['law09.hwp', 'law17.hwp']) {
    await open(page, fx(f), 'viewer-first');
    await expect(page.locator('#hw-banner')).toHaveText(SHAPES);
    await expect(page.locator('#hw-save')).toBeHidden();
    await expect(page.locator('#hw-force')).toBeVisible();
    await page.locator('#hw-reset').click();
  }
});

test('viewer-first adm28 (desktop): the 100쪽 copy, a lazy window of ≤ 13 pages, then 그래도 PDF로 저장 renders all and prints', async ({ page, isMobile }) => {
  test.skip(isMobile, 'adm28 is viewer-only on phones (tested below).');
  test.setTimeout(300_000);
  await open(page, fx('adm28.hwpx'), 'viewer-first');
  await expect(page.locator('#hw-banner')).toHaveText(`${SHAPES} (100쪽 이상)`);
  await expect(pages(page)).toHaveCount(128);
  const rendered = page.locator('#hwp-print-root .page.rendered');
  await expect(rendered.first()).toBeVisible();
  let max = 0;
  for (const frac of [0.2, 0.45, 0.7, 1]) {
    await page.locator('#hwp-print-root').evaluate((el, f) => el.scrollTo(0, el.scrollHeight * f), frac);
    await page.waitForTimeout(600);
    max = Math.max(max, await rendered.count());
  }
  expect(max).toBeGreaterThan(0);
  expect(max).toBeLessThanOrEqual(13);
  await page.locator('#hw-force').click();
  await expect(page.locator('#hw-progress-text')).toContainText('쪽 준비 중');
  await expect(tool(page)).toHaveAttribute('data-state', 'convert', { timeout: 240_000 });
  await expect(rendered).toHaveCount(128);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: string[] }).__printed.length), { timeout: 60_000 }).toBe(1);
});

test('cancel during the adm28 full render: back to viewer-first, no stale page appended afterwards', async ({ page, isMobile }) => {
  test.skip(isMobile, 'adm28 is viewer-only on phones.');
  test.setTimeout(300_000);
  await open(page, fx('adm28.hwpx'), 'viewer-first');
  await page.locator('#hw-force').click();
  await expect(page.locator('#hw-progress-text')).toContainText(/[1-9]\d*\/128쪽 준비 중/);
  await page.locator('#hw-cancel').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'viewer-first');
  await page.waitForTimeout(1500);
  const n1 = await page.locator('#hwp-print-root .page.rendered').count();
  await page.waitForTimeout(1500);
  expect(await page.locator('#hwp-print-root .page.rendered').count()).toBeLessThanOrEqual(Math.max(n1, 13));
  expect(await page.evaluate(() => (window as unknown as { __printed: string[] }).__printed.length)).toBe(0);
  await expect(page.locator('#hw-force')).toBeVisible();
});

test('downscale: adm19 after 그래도 PDF로 저장 has blob: images, none over 1.25 × its 200-dpi target', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page, fx('adm19.hwpx'), 'viewer-first');
  await page.locator('#hw-force').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'convert', { timeout: 240_000 });
  await expect(page.locator('#hw-save')).toBeEnabled({ timeout: 120_000 });
  const r = await page.evaluate(async () => {
    const out = { blobs: 0, over: [] as string[] };
    for (const svg of Array.from(document.querySelectorAll('#hwp-print-root .page svg')) as SVGSVGElement[]) {
      for (const im of Array.from(svg.querySelectorAll('image'))) {
        const href = im.getAttribute('href') ?? '';
        if (!href.startsWith('blob:')) continue;
        out.blobs++;
        const img = new Image();
        img.src = href;
        await img.decode();
        const m = svg.getScreenCTM()!.inverse().multiply((im as SVGImageElement).getScreenCTM()!);
        const tw = (+im.getAttribute('width')! * Math.hypot(m.a, m.b) * 200) / 96;
        const th = (+im.getAttribute('height')! * Math.hypot(m.c, m.d) * 200) / 96;
        if (img.naturalWidth > tw * 1.25 + 1 && img.naturalHeight > th * 1.25 + 1) out.over.push(`${img.naturalWidth}x${img.naturalHeight} for ${Math.round(tw)}x${Math.round(th)}`);
      }
    }
    return out;
  });
  expect(r.blobs).toBeGreaterThan(0);
  expect(r.over).toEqual([]);
});

// ---------- viewer-only (phones) ----------

test('viewer-only on a phone: adm28 (60쪽 with 128), padded law05 (10 MB), adm14 + 9 MB of images; no save; print shows the notice only', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The viewer-only caps tested here are the phone caps.');
  test.setTimeout(300_000);
  await open(page, fx('adm28.hwpx'), 'viewer-only');
  await expect(page.locator('#hw-banner')).toHaveText('이 기기에서는 60쪽이 넘는 문서를 PDF로 저장할 수 없어 보기만 제공합니다 (이 문서 128쪽). 컴퓨터에서 열면 저장할 수 있습니다.');
  await expect(page.locator('#hw-save')).toBeHidden();
  await expect(page.locator('#hw-force')).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  const shown = await page.evaluate(() => ({
    before: getComputedStyle(document.body, '::before').content,
    visible: Array.from(document.body.children).filter((e) => e.getBoundingClientRect().height > 0).length,
  }));
  expect(shown.before).toBe('"이 문서는 보기 전용입니다"');
  expect(shown.visible).toBe(0);
  await page.emulateMedia({ media: 'screen' });
  await page.locator('#hw-reset').click();
  await open(page, hwpRuntime('law05-padded.hwp'), 'viewer-only');
  await expect(page.locator('#hw-banner')).toContainText(/10 MB가 넘는 문서를 PDF로 저장할 수 없어 보기만 제공합니다 \(이 문서 10\.\d MB\)/);
  await page.locator('#hw-reset').click();
  await open(page, hwpRuntime('adm14-images.hwpx'), 'viewer-only');
  await expect(page.locator('#hw-banner')).toContainText('그림이 8 MB가 넘게 들어 있는 문서');
});

// ---------- glyph fallback ----------

test('glyph fallback: ㊞, ㆍ, ᆞ and ‧ render with a real glyph in Anolim HWP Serif after the fonts load', async ({ page }) => {
  test.setTimeout(240_000);
  await convertReady(page, fx('law05.hwp'));
  const r = await page.evaluate(async () => {
    const fam = "'Anolim HWP Serif','Anolim HWP Fallback'";
    await Promise.all(['㊞', 'ㆍ', 'ᆞ', '‧'].map((c) => document.fonts.load(`40px ${fam}`, c)));
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = `40px ${fam}, serif`;
    const tofu = ctx.measureText(String.fromCodePoint(0xe0fff)).width;
    return { tofu, widths: ['㊞', 'ㆍ', 'ᆞ', '‧'].map((c) => ctx.measureText(c).width), checks: ['㊞', 'ᆞ', '‧'].map((c) => document.fonts.check(`40px ${fam}`, c)) };
  });
  for (const w of r.widths) expect(w).not.toBe(r.tofu);
  expect(r.checks).toEqual([true, true, true]);
});

// ---------- errors ----------

test('errors: .txt and a renamed .docx are not-hwp; password; truncated is corrupt', async ({ page }) => {
  test.setTimeout(180_000);
  const cases: [string, string][] = [
    [hwpRuntime('notes.txt'), '한글(HWP·HWPX) 문서가 아닙니다.'],
    [hwpRuntime('word-renamed.hwpx'), '한글(HWP·HWPX) 문서가 아닙니다.'],
    [hwpRuntime('law05-password.hwp'), '비밀번호가 걸린 문서는 열 수 없습니다. 한글 프로그램에서 암호를 해제한 뒤 다시 시도해 주세요.'],
    [hwpRuntime('law05-truncated.hwp'), '문서가 손상되었거나 끝까지 내려받아지지 않았습니다.'],
  ];
  for (const [file, text] of cases) {
    await open(page, file, 'error');
    await expect(page.locator('#hw-error')).toContainText(text);
    await expect(page.locator('#hw-error')).toBeFocused();
  }
});

test('too large on a phone: a 26 MB file is refused with the numbers before any parse', async ({ page, isMobile, network }) => {
  test.skip(!isMobile, 'The 25 MB hard limit is the phone limit (150 MB on PC is unit-tested).');
  await open(page, hwpRuntime('big-26mb.hwp'), 'error');
  await expect(page.locator('#hw-error')).toHaveText('휴대폰에서는 25 MB까지 열 수 있습니다 (이 파일 26 MB). 컴퓨터에서 열어 주세요.');
  // The worker script may be preloaded (focus in the tool + idle, Polish P.7); the engine wasm never is.
  expect(network.requests.filter((r) => /rhwp_bg/.test(r.url()))).toEqual([]);
});

test('engine: a wasm 404 shows the engine panel with 새로고침, not a file error', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.route(/\/vendor\/rhwp\/.*\.wasm$/, (route) => route.fulfill({ status: 404, body: 'missing', headers: { 'Content-Security-Policy': CSP } }));
  await open(page, fx('law05.hwp'), 'error');
  await expect(page.locator('#engine-error')).toBeVisible();
  await expect(page.locator('#engine-error').getByRole('button', { name: '새로고침' })).toBeFocused();
  await expect(page.locator('#hw-error')).toBeHidden();
});

test('a crashing worker is oom', async ({ page, context }) => {
  await context.route(/hwp\.worker[^/]*\.js$/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'Content-Security-Policy': CSP }, body: "self.postMessage({type:'progress',phase:'parse'}); setTimeout(() => { throw new Error('out of memory'); }, 50);" }),
  );
  await open(page, fx('law05.hwp'), 'error');
  await expect(page.locator('#hw-error')).toContainText('이 브라우저에서 처리하기에는 문서가 너무 무겁습니다.');
});

test('a tab killed mid-parse: the in-flight flag shows the notice once on reload', async ({ page }) => {
  await gotoReady(page, '/hwp-to-pdf/');
  await page.evaluate(() => sessionStorage.setItem('hwp-inflight', JSON.stringify({ bytes: 64_000_000 })));
  await page.reload();
  await page.waitForFunction(() => document.readyState === 'complete');
  await expect(page.locator('#hw-notice')).toHaveText('이전 문서가 너무 커서 브라우저가 멈췄습니다. 컴퓨터에서 열거나 더 작은 문서로 다시 시도해 주세요.');
  await page.reload();
  await page.waitForFunction(() => document.readyState === 'complete');
  await expect(page.locator('#hw-notice')).toBeHidden();
});

// ---------- reset ----------

test('다른 문서 열기: no page, no blob URL, then law05 opens', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page, fx('adm19.hwpx'), 'viewer-first');
  await page.locator('#hw-force').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'convert', { timeout: 240_000 });
  await expect(page.locator('#hw-save')).toBeEnabled({ timeout: 120_000 });
  expect(await page.locator('image[href^="blob:"]').count()).toBeGreaterThan(0);
  const urls = await page.evaluate(() => Array.from(document.querySelectorAll('image[href^="blob:"]')).map((i) => i.getAttribute('href')!));
  await page.locator('#hw-reset').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  await expect(pages(page)).toHaveCount(0);
  expect(await page.locator('image[href^="blob:"]').count()).toBe(0);
  // The revoked URLs no longer load.
  // Every blob: URL the pages used was revoked (fetching a blob: URL would itself be a CSP connect-src violation).
  const revoked = await page.evaluate(() => (window as unknown as { __revoked: string[] }).__revoked);
  for (const u of urls) expect(revoked).toContain(u);
  expect(await page.evaluate(() => document.getElementById('hwp-page-style'))).toBeNull();
  await convertReady(page, fx('law05.hwp'));
  await expect(pages(page)).toHaveCount(1);
});

// ---------- keyboard ----------

test('keyboard only: pick, scroll the preview, 그래도 PDF로 저장, PDF로 저장, open a guidance details', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile, 'Keyboard-only flow is a desktop scenario; mobile projects cover touch.');
  test.setTimeout(240_000);
  await gotoReady(page, '/hwp-to-pdf/');
  const tabTo = async (predicate: string, max = 80): Promise<void> => {
    for (let i = 0; i < max; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(predicate)) return;
    }
    throw new Error(`focus never reached: ${predicate}`);
  };
  await tabTo(`document.activeElement?.id === 'hw-input'`);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press(browserName === 'webkit' ? 'Space' : 'Enter')]);
  await chooser.setFiles(fx('law17.hwp'));
  await expect(tool(page)).toHaveAttribute('data-state', 'viewer-first', { timeout: 120_000 });
  await tabTo(`document.activeElement?.id === 'hwp-print-root'`);
  await page.keyboard.press('PageDown');
  // 그래도 PDF로 저장 comes before the preview in tab order.
  for (let i = 0; i < 20 && !(await page.evaluate(() => document.activeElement?.id === 'hw-force')); i++) await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#hw-force')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tool(page)).toHaveAttribute('data-state', 'convert', { timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: string[] }).__printed.length), { timeout: 60_000 }).toBe(1);
  await expect(page.locator('#hw-save')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: string[] }).__printed.length)).toBe(2);
  await tabTo(`document.activeElement?.tagName === 'SUMMARY' && document.activeElement.closest('#hw-guide') !== null`);
  await page.keyboard.press(browserName === 'webkit' ? 'Space' : 'Enter');
  await expect(page.locator('#hw-guide details')).toHaveAttribute('open', '');
});

// ---------- axe ----------

test('axe: empty, convert (law10), viewer-first (law17), error; / and /licenses/', async ({ page }) => {
  test.setTimeout(360_000);
  await gotoReady(page, '/hwp-to-pdf/');
  expect(await serious(page)).toEqual([]);
  await convertReady(page, fx('law10.hwp'));
  expect(await serious(page)).toEqual([]);
  await page.locator('#hw-reset').click();
  await open(page, fx('law17.hwp'), 'viewer-first');
  expect(await serious(page)).toEqual([]);
  await page.locator('#hw-reset').click();
  await open(page, hwpRuntime('notes.txt'), 'error');
  expect(await serious(page)).toEqual([]);
  for (const path of ['/', '/licenses/']) {
    await gotoReady(page, path);
    expect(await serious(page)).toEqual([]);
  }
});

test('axe: viewer-only on a phone (adm28)', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'viewer-only for adm28 needs the phone caps.');
  test.setTimeout(240_000);
  await open(page, fx('adm28.hwpx'), 'viewer-only');
  expect(await serious(page)).toEqual([]);
});

// ---------- SEO and legal ----------

test('SEO and legal: one H1, canonical, FAQPage JSON-LD, Hancom and trademark lines in the tool footer, 도움말 and /licenses/', async ({ page }) => {
  await gotoReady(page, '/hwp-to-pdf/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('HWP PDF 변환');
  const lead = await page.locator('.lead').textContent();
  for (const s of ['한글파일 PDF로 변환', 'HWP·HWPX', '한글 프로그램 없이', 'HWP 뷰어처럼 바로 열어 볼 수도 있습니다']) expect(lead).toContain(s);
  expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href'))!).pathname).toBe('/hwp-to-pdf/');
  const data = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((j) => JSON.parse(j));
  const faq = data.find((d: { '@type': string }) => d['@type'] === 'FAQPage');
  expect(faq.mainEntity).toHaveLength(8);
  await expect(page.locator('#hw-input')).toHaveAttribute('accept', '.hwp,.hwpx,application/x-hwp,application/haansofthwp,application/vnd.hancom.hwp,application/vnd.hancom.hwpx');
  await expect(page.locator('.privacy-note')).toContainText('파일은 이 기기 밖으로 전송되지 않습니다.');
  for (const text of [HANCOM, TRADEMARK]) {
    await expect(page.locator('.tool-legal')).toContainText(text);
    await expect(page.locator('.help')).toContainText(text);
  }
  await expect(page.locator('.help details')).toHaveCount(8);
  await gotoReady(page, '/licenses/');
  for (const text of [HANCOM, TRADEMARK]) await expect(page.locator('main')).toContainText(text);
  for (const name of ['@rhwp/core', '@fontsource/noto-serif-kr', '@fontsource/noto-sans-kr', '@fontsource/nanum-myeongjo', '@fontsource/nanum-gothic', 'Noto Sans CJK KR (부분)']) {
    await expect(page.locator('table')).toContainText(name);
  }
});
