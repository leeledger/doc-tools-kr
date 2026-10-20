// 위임장 만들기 (FORM1020 test map "e2e"). All 5 projects; the no-upload fixture runs on every test (./no-upload) and
// every test asserts zero CSP violations. The HWP the page hands out is reopened in Node rhwp (1 page, every value
// drawn); the PDF is read with pdf.js (1 page, every value) and pdf-lib (every font embedded). Nothing typed is stored,
// put in the URL or in a file name (D7).
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { PDFDict, PDFDocument, PDFName } from '@cantoo/pdf-lib';
import type { Download, Page } from '@playwright/test';
import { expect, gotoReady, test } from './no-upload';
import { loadRhwp } from '../helpers/rhwp-node';
import { pageTexts } from '../helpers/pdf';
import { SAMPLE_VALUES } from '../helpers/form-samples';
import { glyphText } from '../../src/lib/hwp/svg-string';
import { POWER_OF_ATTORNEY as SPEC } from '../../src/data/forms/power-of-attorney';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const WASM_RE = /\/vendor\/rhwp\/[^/]+\/rhwp_bg\.wasm$/;
const WORKER_RE = /hwp\.worker[^/]*\.js$/;
const CSP = readFileSync('public/_headers', 'utf8').match(/Content-Security-Policy: (.+)/)![1].trim();
const SAMPLE = SAMPLE_VALUES['power-of-attorney']!;
const CAUTION = '관공서에 따라 정해진 위임장 서식이 있어요. 내기 전에 그 기관에 확인하세요.';
const FINAL = /^(ready|error)$/;
const flat = (s: string): string => s.replace(/\s+/g, '');

type Win = Window & { __csp: number };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Win;
    w.__csp = 0;
    document.addEventListener('securitypolicyviolation', () => w.__csp++);
  });
});

test.afterEach(async ({ page }) => {
  if (page.url().startsWith('http')) expect(await page.evaluate(() => (window as unknown as Win).__csp), 'CSP violations').toBe(0);
});

const tool = (page: Page) => page.locator('#pa-tool');

/** Types `values` into the fields (the date input takes YYYY-MM-DD). */
async function fill(page: Page, values: Record<string, string>): Promise<void> {
  for (const [id, v] of Object.entries(values)) await page.locator(`[data-field="${id}"]`).fill(v);
}

async function build(page: Page, how: 'make' | 'blank' = 'make'): Promise<void> {
  await page.locator(how === 'make' ? '#pa-make' : '#pa-blank').click();
  await expect(tool(page)).toHaveAttribute('data-state', FINAL, { timeout: 180_000 });
  expect(await tool(page).getAttribute('data-state'), (await page.locator('#pa-error').textContent()) ?? '').toBe('ready');
}

async function download(page: Page, id: '#pa-hwp' | '#pa-pdf'): Promise<{ d: Download; bytes: Uint8Array }> {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.locator(id).click()]);
  return { d, bytes: new Uint8Array(readFileSync((await d.path())!)) };
}

/** The HWP reopened in Node rhwp: its page count and the drawn text of page 1. */
async function reopen(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
  const Doc = await loadRhwp();
  const doc = new Doc(bytes);
  try {
    return { pages: doc.pageCount(), text: glyphText(doc.renderPageSvg(0)) };
  } finally {
    doc.free();
  }
}

/** Every font descriptor of the PDF has its font program (FontFile, FontFile2 or FontFile3): fonts are embedded. */
async function fontsEmbedded(bytes: Uint8Array): Promise<{ descriptors: number; missing: number }> {
  const pdf = await PDFDocument.load(bytes);
  let descriptors = 0;
  let missing = 0;
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(PDFName.of('Type'))?.toString() !== '/FontDescriptor') continue;
    descriptors++;
    if (!['FontFile', 'FontFile2', 'FontFile3'].some((k) => obj.has(PDFName.of(k)))) missing++;
  }
  return { descriptors, missing };
}

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

/** What the page stores: Web Storage keys and IndexedDB databases. */
const storage = (page: Page) =>
  page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    idb: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((d) => d.name) : [],
  }));

// ---------- page ----------

test('the page: today in the date field, the caution with the 정부24 link, 함께 준비하는 것; no worker or engine before a press', async ({ page, network }) => {
  await gotoReady(page, '/power-of-attorney/');
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await expect(page.locator('#pa-date')).toHaveValue(today);
  await expect(page.locator('#pa-caution p').first()).toHaveText(CAUTION);
  await expect(page.locator('#pa-caution a')).toHaveAttribute('href', 'https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000025');
  await expect(page.locator('#pa-with a')).toHaveText(['신분증 사본 만들기', '도장 만들기', 'PDF 합치기']);
  expect(await page.locator('#pa-with a').evaluateAll((a) => a.map((x) => x.getAttribute('href')))).toEqual(['/id-copy/', '/stamp-maker/', '/pdf-merge/']);
  expect(await page.locator('#pa-form [name]').count()).toBe(0);
  expect(await page.locator('#pa-form').getAttribute('action')).toBeNull();
  await page.waitForTimeout(1000);
  expect(network.requests.map((r) => r.url()).filter((u) => WORKER_RE.test(u) || WASM_RE.test(u))).toEqual([]);
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  expect(await serious(page), 'axe on the form').toEqual([]);
});

// ---------- filled ----------

test('filled: 1-page preview; 위임장.hwp reopens in rhwp with 1 page and every value; 위임장.pdf has 1 page, every value, embedded fonts; nothing stored, URL unchanged', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/power-of-attorney/');
  const before = await storage(page);
  const url = page.url();
  await fill(page, SAMPLE);
  await build(page);
  await expect(page.locator('#pa-preview .page')).toHaveCount(1);
  await expect(page.locator('#pa-preview .page svg')).toHaveCount(1);
  await expect(page.locator('#pa-result')).toBeFocused();
  expect(await serious(page), 'axe on the result').toEqual([]);

  const hwp = await download(page, '#pa-hwp');
  expect(hwp.d.suggestedFilename()).toBe('위임장.hwp');
  expect([...hwp.bytes.subarray(0, 8)]).toEqual(CFB);
  const back = await reopen(hwp.bytes);
  expect(back.pages).toBe(1);
  for (const v of ['홍길동', '홍서연', '종로구 행정복지센터 귀중', '2026년 10월 20일', '주민등록표 등본 발급 신청과 수령', '관련 서류 제출']) expect(flat(back.text)).toContain(flat(v));
  await expect(page.locator('#pa-done')).toHaveText('「위임장.hwp」를 내려받았어요. 「다운로드」 폴더를 확인하세요.');

  const pdf = await download(page, '#pa-pdf');
  expect(pdf.d.suggestedFilename()).toBe('위임장.pdf');
  const texts = await pageTexts(pdf.bytes);
  expect(texts).toHaveLength(1);
  for (const v of Object.entries(SAMPLE).filter(([k]) => k !== 'date').flatMap(([, v]) => v.split('\n'))) expect(flat(texts[0]!), v).toContain(flat(v));
  const fonts = await fontsEmbedded(pdf.bytes);
  expect(fonts.descriptors).toBeGreaterThan(0);
  expect(fonts.missing).toBe(0);
  await expect(page.locator('#pa-done')).toHaveText('「위임장.pdf」를 내려받았어요. 「다운로드」 폴더를 확인하세요.');

  // D7: no storage, no value in the URL.
  expect(page.url()).toBe(url);
  expect(await storage(page)).toEqual(before);
  for (const v of ['홍길동', '1001']) expect(page.url()).not.toContain(encodeURIComponent(v));
});

// ---------- blank ----------

test('빈 양식으로 받기: no field needed; a 1-page HWP and PDF with the labels and a blank date line, no 귀중 line', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/power-of-attorney/');
  await fill(page, { giverName: '홍길동' });
  await build(page, 'blank');
  const back = await reopen((await download(page, '#pa-hwp')).bytes);
  expect(back.pages).toBe(1);
  const t = flat(back.text);
  for (const s of ['위임장', '위임인', '대리인', '위임내용', '성명', '년월일', '(서명또는인)']) expect(t).toContain(s);
  expect(t).not.toContain('홍길동');
  expect(t).not.toContain('귀중');
  const texts = await pageTexts((await download(page, '#pa-pdf')).bytes);
  expect(texts).toHaveLength(1);
  expect(flat(texts[0]!)).toContain('위임장');
});

// ---------- stale, reset ----------

test('stale: an edit after a build hides the downloads and asks for a new build; a new build brings them back; 모두 지우기 empties the fields', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/power-of-attorney/');
  await fill(page, { giverName: '홍길동', task: '등본 발급' });
  await build(page);
  await expect(page.locator('#pa-downloads')).toBeVisible();
  await page.locator('[data-field="giverName"]').fill('홍길순');
  await expect(page.locator('#pa-downloads')).toBeHidden();
  await expect(page.locator('#pa-stale')).toHaveText('고친 내용으로 다시 만들어 주세요. 「위임장 만들기」를 누르면 새로 만들어요.');
  await build(page);
  await expect(page.locator('#pa-stale')).toBeHidden();
  await expect(page.locator('#pa-downloads')).toBeVisible();
  const back = await reopen((await download(page, '#pa-hwp')).bytes);
  expect(flat(back.text)).toContain('홍길순');
  await page.locator('#pa-reset').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#pa-result')).toBeHidden();
  for (const f of SPEC.fields.filter((x) => x.kind !== 'date')) await expect(page.locator(`[data-field="${f.id}"]`)).toHaveValue('');
  await expect(page.locator('#pa-date')).not.toHaveValue('');
});

// ---------- all-max, glyphs ----------

test('every field at its limit (the inputs cut there): still one page in the preview and in the HWP', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/power-of-attorney/');
  const max: Record<string, string> = {};
  for (const f of SPEC.fields) if (f.kind !== 'date') max[f.id] = '가'.repeat(f.maxLength + 5);
  await fill(page, max);
  for (const f of SPEC.fields) if (f.kind !== 'date') expect((await page.locator(`[data-field="${f.id}"]`).inputValue()).length, f.id).toBe(f.maxLength);
  await build(page);
  await expect(page.locator('#pa-preview .page')).toHaveCount(1);
  expect((await reopen((await download(page, '#pa-hwp')).bytes)).pages).toBe(1);
});

test('an emoji and a rare Hanja: the PDF page the writer cannot set in a face is a picture (never tofu); 1 page', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/power-of-attorney/');
  await fill(page, { giverName: '홍길동😀', agentName: '𠀀김' });
  await build(page);
  const pdf = await download(page, '#pa-pdf');
  await expect(page.locator('#pa-done')).toContainText('글꼴에 없는 글자가 있어 PDF의 그 쪽은 그림으로 넣었어요.');
  expect(await pageTexts(pdf.bytes)).toHaveLength(1);
});

// ---------- chain ----------

test('이어서 하기 after the PDF: 도장·서명 first; /pdf-sign/ receives 위임장.pdf', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/power-of-attorney/');
  await fill(page, { giverName: '홍길동' });
  await build(page);
  await expect(page.locator('#pa-next')).toBeHidden();
  await download(page, '#pa-pdf');
  await expect(page.locator('#pa-next').getByRole('button')).toHaveText(['PDF 서명·도장 넣기', 'PDF 글자 넣기·편집', 'PDF 용량 줄이기']);
  await page.locator('#pa-next').getByRole('button', { name: 'PDF 서명·도장 넣기' }).click();
  await expect(page).toHaveURL(/\/pdf-sign\/$/);
  await expect(page.locator('#sg-notice')).toHaveText('방금 만든 파일을 가져왔습니다.');
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await expect(page.locator('#sg-name')).toHaveText('위임장.pdf');
});

// ---------- errors ----------

test('engine: a wasm 404 shows the engine panel (axe clean), not a form error; the fields keep what was typed', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.route(WASM_RE, (route) => route.fulfill({ status: 404, body: 'missing', headers: { 'Content-Security-Policy': CSP } }));
  await gotoReady(page, '/power-of-attorney/');
  await fill(page, { giverName: '홍길동' });
  await page.locator('#pa-make').click();
  await expect(page.locator('#engine-error')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#engine-error').getByRole('button', { name: '새로고침' })).toBeFocused();
  await expect(page.locator('#pa-error')).toBeHidden();
  await expect(page.locator('[data-field="giverName"]')).toHaveValue('홍길동');
  expect(await serious(page), 'axe on the engine error').toEqual([]);
});

test('a build that fails in the worker: 「만들지 못했어요」 with 다시 해 보기 (axe clean); the retry builds', async ({ page, context }) => {
  test.setTimeout(300_000);
  // The worker answers form-build with an export error once (a stub in front of the real worker).
  let failed = false;
  await context.route(WORKER_RE, async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    const stub = failed ? body : `${body}\n;(() => { const real = self.onmessage; self.onmessage = (ev) => { if (ev.data && ev.data.type === 'form-build' && !self.__failedOnce) { self.__failedOnce = true; self.postMessage({ type: 'error', code: 'export' }); return; } return real(ev); }; })();`;
    failed = true;
    await route.fulfill({ response: res, body: stub });
  });
  await gotoReady(page, '/power-of-attorney/');
  await fill(page, { giverName: '홍길동' });
  await page.locator('#pa-make').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'error', { timeout: 120_000 });
  await expect(page.locator('#pa-error-text')).toHaveText('위임장을 만들지 못했어요. 다시 해 보세요.');
  await expect(page.locator('#pa-error')).toBeFocused();
  expect(await serious(page), 'axe on the build error').toEqual([]);
  await page.locator('#pa-retry').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'ready', { timeout: 180_000 });
});
