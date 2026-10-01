// HWP PDF 변환 (brief Step 5 "E2E"; SPIKE-HWP-DIRECT §6.9: PDF 내려받기). All 5 projects; the no-upload fixture
// runs on every test (./no-upload), every test asserts zero CSP violations, and every test that makes a PDF
// asserts that the page never swaps: no main-frame navigation, the same URL and title, no dialog, no new page,
// window.print never called, and the preview is the same node, visible while the PDF is made.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Download, Page } from '@playwright/test';
import { expect, gotoReady, test } from './no-upload';
import { hwpRuntime } from './hwp-fixtures';
import { openPdf, pageText, pdfjs, renderRgba, unitSize } from '../../scripts/regress/lib.mjs';

const CORPUS = join(process.cwd(), 'tests', 'corpus', 'hwp');
const fx = (name: string): string => join(CORPUS, name);
const expected = JSON.parse(readFileSync(join(CORPUS, 'expected.json'), 'utf8')).files as Record<string, { pages: number; officialText: string; officialWords: number }>;
// Routed responses carry the site CSP, as every real response does (the no-upload fixture checks it).
const CSP = readFileSync(join(process.cwd(), 'public', '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)![1].trim();
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const HANCOM = '본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.';
const TRADEMARK = '한글, 한컴, HWP, HWPX는 한글과컴퓨터의 등록상표이며, 본 서비스는 한글과컴퓨터와 무관합니다.';
const CHECK = '미리보기로 확인한 뒤 내려받으세요.';
const DONE = ['convert', 'viewer-first', 'viewer-only', 'error'];

type Win = Window & { __csp: number; __printed: number; __revoked: string[]; __swap: { titles: string[]; hidden: number; swapped: number; samples: number } };

const tool = (page: Page) => page.locator('#hwp-tool');
const pages = (page: Page) => page.locator('#hw-preview .page');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Win;
    w.__csp = 0;
    document.addEventListener('securitypolicyviolation', () => w.__csp++);
    w.__printed = 0;
    window.print = () => {
      w.__printed++;
    };
    const revoke = URL.revokeObjectURL.bind(URL);
    w.__revoked = [];
    URL.revokeObjectURL = (u: string) => {
      w.__revoked.push(u);
      revoke(u);
    };
  });
});

test.afterEach(async ({ page }) => {
  if (page.url().startsWith('http')) expect(await page.evaluate(() => (window as unknown as Win).__csp), 'CSP violations').toBe(0);
});

async function open(page: Page, file: string, state?: string, timeout = 150_000): Promise<string> {
  if (!page.url().includes('/hwp-to-pdf/')) await gotoReady(page, '/hwp-to-pdf/');
  await page.setInputFiles('#hw-input', file);
  await expect(tool(page)).toHaveAttribute('data-state', new RegExp(`^(${DONE.join('|')})$`), { timeout });
  const s = (await tool(page).getAttribute('data-state'))!;
  if (state) expect(s, (await page.locator('#hw-error').textContent()) ?? '').toBe(state);
  return s;
}

/**
 * Watches the page for a swap while `run` makes a PDF: main-frame navigations, dialogs, new pages, print
 * calls, title changes, and the preview node (the same one, visible, sampled every 25 ms while exporting).
 */
async function noSwap<T>(page: Page, run: () => Promise<T>): Promise<T> {
  const url = page.url();
  const title = await page.title();
  const navigations: string[] = [];
  const dialogs: string[] = [];
  const popups: string[] = [];
  const onNav = (f: { url(): string }) => {
    if (f === page.mainFrame()) navigations.push(f.url());
  };
  const onDialog = (d: { type(): string; dismiss(): Promise<void> }) => {
    dialogs.push(d.type());
    void d.dismiss();
  };
  const onPage = (p: Page) => popups.push(p.url());
  page.on('framenavigated', onNav);
  page.on('dialog', onDialog);
  page.context().on('page', onPage);
  await page.evaluate(() => {
    const w = window as unknown as Win;
    const node = document.getElementById('hw-preview');
    w.__swap = { titles: [], hidden: 0, swapped: 0, samples: 0 };
    const tick = (): void => {
      const now = document.getElementById('hw-preview');
      if (document.getElementById('hwp-tool')?.dataset.state === 'exporting') {
        w.__swap.samples++;
        if (now !== node) w.__swap.swapped++;
        const b = now?.getBoundingClientRect();
        if (!b || b.width === 0 || b.height === 0) w.__swap.hidden++;
      }
      if (!w.__swap.titles.includes(document.title)) w.__swap.titles.push(document.title);
    };
    // One sample now: a fast 「다시 내려받기」 (an anchor to a ready blob) can finish before the first 25 ms tick,
    // which left `titles` empty (CI mobile-chrome, G2 A1 run 36906140363).
    tick();
    setInterval(tick, 25);
  });
  try {
    return await run();
  } finally {
    page.off('framenavigated', onNav);
    page.off('dialog', onDialog);
    page.context().off('page', onPage);
    const swap = await page.evaluate(() => (window as unknown as Win).__swap);
    expect(navigations, 'main-frame navigations').toEqual([]);
    expect(dialogs, 'dialogs').toEqual([]);
    expect(popups, 'new pages').toEqual([]);
    expect(page.url()).toBe(url);
    expect(await page.title()).toBe(title);
    expect(swap.titles, 'document.title during the export').toEqual([title]);
    expect(swap.swapped, 'the preview was replaced').toBe(0);
    expect(swap.hidden, 'the preview was hidden').toBe(0);
    expect(await page.evaluate(() => (window as unknown as Win).__printed), 'window.print() calls').toBe(0);
  }
}

/** Clicks `button` and returns the download it starts (the export runs in the page). */
async function download(page: Page, button: string, timeout = 120_000): Promise<Download> {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout }), page.locator(button).click()]);
  return d;
}

async function pdfOf(d: Download): Promise<Uint8Array> {
  return new Uint8Array(readFileSync((await d.path())!));
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

async function readPdf(bytes: Uint8Array): Promise<{ pages: number; text: string; first: { width: number; height: number } }> {
  const doc = await openPdf(bytes);
  let text = '';
  for (let i = 0; i < doc.numPages; i++) text += `${await pageText(doc, i)}\n`;
  const first = await unitSize(doc, 0);
  const n = doc.numPages;
  await (doc as unknown as { close(): Promise<void> }).close();
  return { pages: n, text, first };
}

const dangling = (page: Page) =>
  page.evaluate(() => {
    let n = 0;
    for (const svg of Array.from(document.querySelectorAll('#hw-preview .page svg'))) {
      const ids = new Set(Array.from(svg.querySelectorAll('[id]')).map((e) => e.id));
      for (const el of Array.from(svg.querySelectorAll('*'))) for (const a of Array.from(el.attributes)) for (const m of a.value.matchAll(/url\(#([^)]+)\)/g)) if (!ids.has(m[1])) n++;
    }
    return n;
  });

// The page drawings (rhwp SVG, up to ~20,000 nodes a page) are excluded: they are graphics inside a labelled
// role="group" per page; scanning them made axe take minutes. Everything else on the page is checked.
const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(AXE_TAGS).exclude('#hw-preview .page > svg').analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length}`);

// ---------- lazy load ----------

test('lazy: no worker, wasm, HWP font or PDF chunk request before a file is picked', async ({ page, network }) => {
  await gotoReady(page, '/hwp-to-pdf/');
  await page.waitForTimeout(1500);
  const urls = network.requests.map((r) => r.url());
  expect(urls.filter((u) => /hwp\.worker|rhwp_bg|\/fonts\/hwp\/|export-chunk/.test(u))).toEqual([]);
});

test('prefetch: pressing the picker starts the engine download during the file dialog (SPIKE-HWP-DIRECT §6.7)', async ({ page, network }) => {
  await gotoReady(page, '/hwp-to-pdf/');
  await page.locator('#hw-pick').dispatchEvent('pointerdown');
  await expect.poll(() => network.requests.filter((r) => /\/vendor\/rhwp\/[^/]+\/rhwp_bg\.wasm$/.test(r.url())).length, { timeout: 15_000 }).toBeGreaterThan(0);
});

// ---------- PDF 내려받기 ----------

test('law05: 「PDF 내려받기」 downloads law05.pdf in the page: 1 landscape page, the text, no swap of any kind', async ({ page, network }) => {
  test.setTimeout(240_000);
  await open(page, fx('law05.hwp'), 'convert');
  await expect(page.locator('#hw-save')).toHaveText('PDF 내려받기');
  await expect(page.locator('#hw-save')).toBeEnabled();
  await expect(page.locator('#hw-note')).toHaveText('원본 프로그램과 글꼴·줄바꿈이 조금 다를 수 있습니다.');
  const d = await noSwap(page, () => download(page, '#hw-save'));
  expect(d.suggestedFilename()).toBe('law05.pdf');
  const bytes = await pdfOf(d);
  expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
  const pdf = await readPdf(bytes);
  expect(pdf.pages).toBe(1);
  expect(pdf.first.width).toBeGreaterThan(pdf.first.height);
  expect(recall(pdf.text, 'law05')).toBeGreaterThanOrEqual(0.99);
  await expect(page.locator('#hw-done-text')).toHaveText(/^「law05\.pdf」를 내려받았습니다 · 1쪽 · [\d.,]+ (KB|MB)$/);
  await expect(page.locator('#hw-again')).toBeVisible();
  await expect(page.locator('#hw-again')).toHaveAttribute('download', 'law05.pdf');
  await expect(page.locator('#hw-done').getByRole('link', { name: '저장한 PDF가 크면 PDF 용량 줄이기' })).toHaveAttribute('href', '/pdf-compress/');
  // Share (the tool address, never the PDF) and the 관련 안내 links, as on the other tools.
  await expect(page.locator('#hw-done [data-share-copy]')).toBeVisible();
  await expect(page.locator('#hw-done [data-share]')).not.toHaveAttribute('data-url', /blob:/);
  // G2 A1: the four HWP guides that name the tool (the hwp-to-pdf guide is published now); at most 4.
  await expect(page.locator('.quick .quick-guides a')).toHaveCount(4);
  expect(await page.locator('.quick .quick-guides a').evaluateAll((a) => a.map((x) => x.getAttribute('href')))).toEqual(['/guide/open-hwp-without-hangul/', '/guide/hwp-on-phone/', '/guide/hwp-to-pdf/', '/guide/what-is-hwpx/']);
  await expect(page.locator('#hw-save')).toBeFocused();
  await expect(tool(page)).toHaveAttribute('data-state', 'convert');
  // The PDF fonts are same-origin GETs of our own files: the face list and .woff slices.
  const fonts = network.requests.map((r) => r.url()).filter((u) => u.includes('/fonts/hwp/'));
  expect(fonts.some((u) => /\/fonts\/hwp\/hwp-pdf-faces\.[0-9a-f]+\.json$/.test(u))).toBe(true);
  expect(fonts.some((u) => u.endsWith('.woff'))).toBe(true);
  // 「다시 내려받기」 saves the same file again.
  const again = await noSwap(page, () => download(page, '#hw-again', 30_000));
  expect(again.suggestedFilename()).toBe('law05.pdf');
  expect((await pdfOf(again)).length).toBe(bytes.length);
});

test('law10: progress reaches 26/26쪽, then the done line; 26 portrait pages, recall ≥ 0.99, word spaces; font bytes ≤ 1 MB', async ({ page, network }) => {
  test.setTimeout(240_000);
  await open(page, fx('law10.hwp'), 'convert');
  expect(await dangling(page)).toBe(0);
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __progress: string[] }).__progress = seen;
    const el = document.getElementById('hw-progress-text')!;
    new MutationObserver(() => seen.push(el.textContent ?? '')).observe(el, { childList: true, characterData: true, subtree: true });
  });
  const d = await noSwap(page, () => download(page, '#hw-save'));
  expect(d.suggestedFilename()).toBe('law10.pdf');
  const progress = await page.evaluate(() => (window as unknown as { __progress: string[] }).__progress);
  expect(progress).toContain('PDF 만드는 중 26/26쪽');
  await expect(page.locator('#hw-done-text')).toContainText('「law10.pdf」를 내려받았습니다 · 26쪽 · ');
  await expect(page.locator('#hw-again')).toBeVisible();
  const pdf = await readPdf(await pdfOf(d));
  expect(pdf.pages).toBe(expected.law10!.pages);
  expect(pdf.first.height).toBeGreaterThan(pdf.first.width);
  expect(recall(pdf.text, 'law10')).toBeGreaterThanOrEqual(0.99);
  const words = pdf.text.split(/\s+/).filter(Boolean).length;
  expect(Math.abs(words - expected.law10!.officialWords) / expected.law10!.officialWords).toBeLessThanOrEqual(0.1);
  let fontBytes = 0;
  for (const r of network.responses.filter((x) => x.url().includes('/fonts/hwp/') && x.url().endsWith('.woff'))) fontBytes += (await r.body().catch(() => Buffer.alloc(0))).length;
  test.info().annotations.push({ type: 'law10 PDF font bytes', description: String(fontBytes) });
  expect(fontBytes).toBeLessThanOrEqual(1_000_000);
});

test('HWPX: adm02 and adm14 convert and download with the expected page counts and text', async ({ page }) => {
  test.setTimeout(300_000);
  for (const key of ['adm02', 'adm14'] as const) {
    await open(page, fx(`${key}.hwpx`), 'convert');
    await expect(pages(page)).toHaveCount(expected[key]!.pages);
    const d = await noSwap(page, () => download(page, '#hw-save'));
    expect(d.suggestedFilename()).toBe(`${key}.pdf`);
    const pdf = await readPdf(await pdfOf(d));
    expect(pdf.pages).toBe(expected[key]!.pages);
    expect(recall(pdf.text, key)).toBeGreaterThanOrEqual(0.99);
    await page.locator('#hw-reset').click();
  }
});

test('law09 (28 equations) is a normal convert with the equation note (SPIKE-HWP-DIRECT §6.6)', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, fx('law09.hwp'), 'convert');
  await expect(page.locator('#hw-save')).toBeVisible();
  await expect(page.locator('#hw-eq-note')).toHaveText('수식이 들어 있어 수식 모양이 원본과 조금 다를 수 있습니다. 미리보기로 확인해 보세요.');
  await expect(page.locator('#hw-banner')).toBeHidden();
  await page.locator('#hw-reset').click();
  await open(page, fx('law05.hwp'), 'convert');
  await expect(page.locator('#hw-eq-note')).toBeHidden();
});

// ---------- viewer-first ----------

test('viewer-first law17: the 글상자·도형 banner; 「그래도 PDF 내려받기」 is secondary, sets the in-flight flag for the export, downloads law17.pdf', async ({ page }) => {
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
  await expect(page.locator('#hw-banner')).toHaveText(`글상자·도형이 많아 위치가 원본과 다를 수 있습니다. ${CHECK}`);
  await expect(page.locator('#hw-save')).toBeHidden();
  await expect(page.locator('#hw-force')).toHaveText('그래도 PDF 내려받기');
  await expect(page.locator('#hw-force')).toHaveClass(/(^| )ghost( |$)/);
  await expect(page.locator('#hw-force')).not.toHaveClass(/(^| )primary( |$)/);
  await page.evaluate(() => ((window as unknown as { __storage: string[] }).__storage.length = 0));
  const d = await noSwap(page, () => download(page, '#hw-force'));
  expect(d.suggestedFilename()).toBe('law17.pdf');
  const pdf = await readPdf(await pdfOf(d));
  expect(pdf.pages).toBe(expected.law17!.pages);
  await expect(tool(page)).toHaveAttribute('data-state', 'viewer-first');
  await expect(page.locator('#hw-force')).toBeFocused();
  const log = await page.evaluate(() => (window as unknown as { __storage: string[] }).__storage);
  expect(log[0]).toBe('set viewer-first');
  expect(log[log.length - 1]).toBe('remove');
  expect(await page.evaluate(() => sessionStorage.getItem('hwp-inflight'))).toBeNull();
});

test('viewer-first adm28 (desktop): the banner, a lazy window of ≤ 13 pages, then 취소 at page ≥ 5: back, no download', async ({ page, isMobile }) => {
  test.skip(isMobile, 'adm28 is viewer-only on phones (tested below).');
  test.setTimeout(300_000);
  await open(page, fx('adm28.hwpx'), 'viewer-first');
  await expect(page.locator('#hw-banner')).toHaveText(`글상자·도형이 많고 100쪽 이상인 문서라 위치와 쪽 나눔이 원본과 다를 수 있습니다. ${CHECK}`);
  await expect(pages(page)).toHaveCount(128);
  const rendered = page.locator('#hw-preview .page.rendered');
  await expect(rendered.first()).toBeVisible();
  let max = 0;
  for (const frac of [0.2, 0.45, 0.7, 1]) {
    await page.locator('#hw-preview').evaluate((el, f) => el.scrollTo(0, el.scrollHeight * f), frac);
    await page.waitForTimeout(600);
    max = Math.max(max, await rendered.count());
  }
  expect(max).toBeGreaterThan(0);
  expect(max).toBeLessThanOrEqual(13);
  const downloads: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await noSwap(page, async () => {
    await page.locator('#hw-force').click();
    await expect(page.locator('#hw-progress-text')).toHaveText(/^PDF 만드는 중 ([5-9]|\d{2,})\/128쪽$/, { timeout: 120_000 });
    await page.locator('#hw-cancel').click();
  });
  await expect(tool(page)).toHaveAttribute('data-state', 'viewer-first');
  await expect(page.locator('#hw-status')).toHaveText('PDF 만들기를 취소했습니다.');
  await page.waitForTimeout(2000);
  expect(downloads).toEqual([]);
  await expect(page.locator('#hw-force')).toBeVisible();
  await expect(page.locator('#hw-done')).toBeHidden();
  expect(await rendered.count()).toBeLessThanOrEqual(13);
});

// ---------- viewer-only (phones) ----------

test('viewer-only on a phone: adm28 (60쪽 with 128), padded law05 (10 MB), adm14 + 9 MB of images; no PDF button', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The viewer-only caps tested here are the phone caps.');
  test.setTimeout(300_000);
  await open(page, fx('adm28.hwpx'), 'viewer-only');
  await expect(page.locator('#hw-banner')).toHaveText('이 기기에서는 60쪽이 넘는 문서는 PDF로 내려받을 수 없어 보기만 할 수 있습니다 (이 문서 128쪽). 컴퓨터에서 열면 내려받을 수 있습니다.');
  await expect(page.locator('#hw-save')).toBeHidden();
  await expect(page.locator('#hw-force')).toBeHidden();
  await page.locator('#hw-reset').click();
  await open(page, hwpRuntime('law05-padded.hwp'), 'viewer-only');
  await expect(page.locator('#hw-banner')).toContainText(/10 MB가 넘는 문서는 PDF로 내려받을 수 없어 보기만 할 수 있습니다 \(이 문서 10\.\d MB\)/);
  await page.locator('#hw-reset').click();
  await open(page, hwpRuntime('adm14-images.hwpx'), 'viewer-only');
  await expect(page.locator('#hw-banner')).toContainText('그림이 8 MB가 넘게 들어 있는 문서는');
});

test('phone: law05 downloads, and the done line fits 360 px without horizontal scroll', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Phone layout.');
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await open(page, fx('law05.hwp'), 'convert');
  const d = await noSwap(page, () => download(page, '#hw-save'));
  expect(d.suggestedFilename()).toBe('law05.pdf');
  await expect(page.locator('#hw-done-text')).toBeVisible();
  const r = await page.evaluate(() => {
    const b = document.getElementById('hw-done')!.getBoundingClientRect();
    return { right: b.right, vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth };
  });
  expect(r.right).toBeLessThanOrEqual(r.vw);
  expect(r.sw).toBeLessThanOrEqual(r.vw);
});

// ---------- glyph fallback ----------

test('glyph fallback: ㊞, ㆍ, ᆞ, ‧ and the extended symbols (═ ∼ ▪ ➔) render with a real glyph in the preview faces', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, fx('law05.hwp'), 'convert');
  const chars = ['㊞', 'ㆍ', 'ᆞ', '‧', '═', '∼', '▪', '➔'];
  const r = await page.evaluate(async (cs) => {
    const fam = "'Anolim HWP Serif','Anolim HWP Fallback'";
    await Promise.all(cs.map((c) => document.fonts.load(`40px ${fam}`, c)));
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = `40px ${fam}, serif`;
    const tofu = ctx.measureText(String.fromCodePoint(0xe0fff)).width;
    return { tofu, widths: cs.map((c) => ctx.measureText(c).width), checks: cs.map((c) => document.fonts.check(`40px ${fam}`, c)) };
  }, chars);
  for (const w of r.widths) expect(w).not.toBe(r.tofu);
  expect(r.checks).toEqual(chars.map(() => true));
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
  await expect(page.locator('#hw-error')).toContainText('이 기기에서 열기에는 문서가 너무 큽니다.');
});

test('a tab killed mid-work: the in-flight flag shows the notice once on reload', async ({ page }) => {
  await gotoReady(page, '/hwp-to-pdf/');
  await page.evaluate(() => sessionStorage.setItem('hwp-inflight', JSON.stringify({ bytes: 64_000_000 })));
  await page.reload();
  await page.waitForFunction(() => document.readyState === 'complete');
  await expect(page.locator('#hw-notice')).toHaveText('이전 문서가 너무 커서 이 페이지가 멈췄습니다. 컴퓨터에서 열거나 더 작은 문서로 다시 시도해 주세요.');
  await page.reload();
  await page.waitForFunction(() => document.readyState === 'complete');
  await expect(page.locator('#hw-notice')).toBeHidden();
});

// ---------- raster fallback ----------

/** Dark pixels (luma < 128) of page 1 at 2× (144 dpi), and whether the page paints an image. */
async function inkOf(bytes: Uint8Array): Promise<{ ink: Uint8Array; w: number; h: number; image: boolean; text: string }> {
  const doc = await openPdf(bytes);
  const { rgba, w, h } = await renderRgba(doc, 0, 2);
  const ops = await (await doc.getPage(1)).getOperatorList();
  const image = ops.fnArray.includes(pdfjs.OPS.paintImageXObject);
  const text = await pageText(doc, 0);
  await (doc as unknown as { close(): Promise<void> }).close();
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]! < 128 ? 1 : 0;
  return { ink, w, h, image, text };
}

/** Share of the dark pixels of `a` that are dark in `b` too. */
function covered(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  let hit = 0;
  for (let i = 0; i < a.length; i++) {
    if (!a[i]) continue;
    n++;
    hit += b[i]!;
  }
  return n ? hit / n : 0;
}

// No fixture reaches the fallback (0 of 236 pages), so this test forces it: an init script appends an element
// the vector writer does not draw (<switch>) to page 1 as it arrives from the worker. The page is then drawn
// through <img> → canvas with the fonts inlined as data: @font-face, under the page CSP (font-src 'self').
// If those fonts did not apply, the image would use a system face and its glyphs would not sit on the vector
// page's glyphs.
test('raster fallback (forced on page 1): an image page with the text layer, its glyphs on the vector glyphs; no CSP violation', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    const Base = window.Worker;
    const w = window as unknown as { __forceRaster?: boolean };
    window.Worker = class extends Base {
      set onmessage(fn: ((ev: MessageEvent) => unknown) | null) {
        super.onmessage = fn
          ? (ev: MessageEvent) => {
              const d = ev.data as { type?: string; i?: number; svg?: string };
              if (w.__forceRaster && d?.type === 'page' && d.i === 0 && typeof d.svg === 'string') return fn({ data: { ...d, svg: d.svg.replace(/<\/svg>\s*$/, '<switch/></svg>') } } as MessageEvent);
              return fn(ev);
            }
          : null;
      }
      get onmessage() {
        return super.onmessage;
      }
    } as typeof Worker;
  });
  await open(page, fx('law05.hwp'), 'convert');
  const vector = await inkOf(await pdfOf(await download(page, '#hw-save')));
  expect(vector.image).toBe(false);
  await page.evaluate(() => ((window as unknown as { __forceRaster: boolean }).__forceRaster = true));
  const raster = await inkOf(await pdfOf(await download(page, '#hw-save')));
  expect(raster.image, 'page 1 is an image').toBe(true);
  expect(recall(raster.text, 'law05'), 'the invisible text layer').toBeGreaterThanOrEqual(0.99);
  expect([raster.w, raster.h]).toEqual([vector.w, vector.h]);
  const sum = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);
  expect(sum(raster.ink) / sum(vector.ink), 'ink ratio').toBeGreaterThan(0.6);
  // Same pixel (144 dpi): 0.83–0.87 both ways with the inlined fonts in all 3 engines; 0.52–0.56 with the
  // @font-face rules stripped (a system face, measured 2026-10-01). 0.75 tells the two apart.
  const onVector = covered(raster.ink, vector.ink);
  const ofVector = covered(vector.ink, raster.ink);
  expect(onVector, 'raster ink on vector ink').toBeGreaterThanOrEqual(0.75);
  expect(ofVector, 'vector ink on raster ink').toBeGreaterThanOrEqual(0.75);
});

// ---------- reset ----------

test('다른 문서 열기 after a download: no page, the PDF URL revoked, 다시 내려받기 without href; then law05 opens', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, fx('law10.hwp'), 'convert');
  await noSwap(page, () => download(page, '#hw-save'));
  const url = (await page.locator('#hw-again').getAttribute('href'))!;
  expect(url.startsWith('blob:')).toBe(true);
  await page.locator('#hw-reset').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  await expect(pages(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Win).__revoked)).toContain(url);
  expect(await page.locator('#hw-again').getAttribute('href')).toBeNull();
  await expect(page.locator('#hw-done')).toBeHidden();
  await open(page, fx('law05.hwp'), 'convert');
  await expect(pages(page)).toHaveCount(1);
});

// Back/forward cache: pagehide ends the worker and any export; a restored page must not wait for it forever.
const pagehide = (page: Page) => page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
const pageshow = (page: Page) => page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));

test('bfcache: pagehide mid-export then pageshow(persisted) starts over (no download); then law05 downloads', async ({ page }) => {
  test.setTimeout(240_000);
  const downloads: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await open(page, fx('law10.hwp'), 'convert');
  await page.locator('#hw-save').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'exporting');
  await pagehide(page);
  await pageshow(page);
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  await expect(pages(page)).toHaveCount(0);
  await expect(page.locator('#hw-progress')).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem('hwp-inflight'))).toBeNull();
  await page.waitForTimeout(2000);
  expect(downloads).toEqual([]);
  await open(page, fx('law05.hwp'), 'convert');
  const d = await download(page, '#hw-save');
  expect(d.suggestedFilename()).toBe('law05.pdf');
});

test('bfcache: a page request with no worker (pagehide, no restore event) is an engine error, not a hang', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page, fx('law05.hwp'), 'convert');
  await pagehide(page);
  await page.locator('#hw-save').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'error', { timeout: 15_000 });
  await expect(page.locator('#engine-error')).toBeVisible();
  await expect(page.locator('#engine-error').getByRole('button', { name: '새로고침' })).toBeVisible();
  await expect(page.locator('#hw-progress')).toBeHidden();
});

// ---------- keyboard ----------

test('keyboard only: pick, scroll the preview, 그래도 PDF 내려받기, then 다시 내려받기', async ({ page, browserName, isMobile }) => {
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
  await tabTo(`document.activeElement?.id === 'hw-preview'`);
  await page.keyboard.press('PageDown');
  // 그래도 PDF 내려받기 comes before the preview in tab order.
  for (let i = 0; i < 20 && !(await page.evaluate(() => document.activeElement?.id === 'hw-force')); i++) await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#hw-force')).toBeFocused();
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.keyboard.press('Enter')]);
  expect(d.suggestedFilename()).toBe('law17.pdf');
  await expect(page.locator('#hw-force')).toBeFocused();
  // WebKit leaves links out of the Tab order unless the user turns that on (Safari's "Press Tab to highlight each
  // item", which Playwright cannot set; Option+Tab did not reach it either); there the link is focused directly
  // and still activated with the keyboard.
  if (browserName === 'webkit') await page.locator('#hw-again').focus();
  else await tabTo(`document.activeElement?.id === 'hw-again'`);
  const [again] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.keyboard.press('Enter')]);
  expect(again.suggestedFilename()).toBe('law17.pdf');
});

// ---------- axe ----------

test('axe: empty, convert (law10), after a download, viewer-first (law17), error; / and /licenses/', async ({ page }) => {
  test.setTimeout(360_000);
  await gotoReady(page, '/hwp-to-pdf/');
  expect(await serious(page)).toEqual([]);
  await open(page, fx('law10.hwp'), 'convert');
  expect(await serious(page)).toEqual([]);
  await download(page, '#hw-save');
  await expect(page.locator('#hw-done')).toBeVisible();
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

test('SEO and legal: one H1, canonical, FAQPage JSON-LD, the three steps, Hancom and trademark lines, /licenses/', async ({ page }) => {
  await gotoReady(page, '/hwp-to-pdf/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('HWP PDF 변환');
  const lead = await page.locator('.lead').textContent();
  for (const s of ['한글 파일을 PDF로 바꿉니다', 'HWP·HWPX', '한글 프로그램 없이', 'PDF 파일로 내려받습니다', '한글 뷰어처럼']) expect(lead).toContain(s);
  expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href'))!).pathname).toBe('/hwp-to-pdf/');
  const data = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((j) => JSON.parse(j));
  const faq = data.find((d: { '@type': string }) => d['@type'] === 'FAQPage');
  expect(faq.mainEntity).toHaveLength(8);
  expect(JSON.stringify(faq)).not.toContain('인쇄');
  expect(JSON.stringify(faq)).toContain('PDF는 어디에 저장되나요?');
  await expect(page.locator('.steps li strong')).toHaveText(['HWP 파일 고르기', '미리 보기', 'PDF 내려받기']);
  await expect(page.locator('#hw-input')).toHaveAttribute('accept', '.hwp,.hwpx,application/x-hwp,application/haansofthwp,application/vnd.hancom.hwp,application/vnd.hancom.hwpx');
  await expect(page.locator('.privacy-note')).toContainText('파일은 이 기기 밖으로 전송되지 않습니다.');
  for (const text of [HANCOM, TRADEMARK]) {
    await expect(page.locator('.tool-legal')).toContainText(text);
    await expect(page.locator('.help')).toContainText(text);
  }
  await expect(page.locator('.help details')).toHaveCount(0);
  await gotoReady(page, '/licenses/');
  for (const text of [HANCOM, TRADEMARK]) await expect(page.locator('main')).toContainText(text);
  for (const name of ['@rhwp/core', '@cantoo/fontkit', '@fontsource/noto-serif-kr', '@fontsource/noto-sans-kr', '@fontsource/nanum-myeongjo', '@fontsource/nanum-gothic', 'Noto Sans CJK KR (부분)', 'Noto Sans Math']) {
    await expect(page.locator('table')).toContainText(name);
  }
});
