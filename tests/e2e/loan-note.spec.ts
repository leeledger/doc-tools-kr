// 차용증 만들기 (LOAN1022 test map "e2e /loan-note/"). All 5 projects; the no-upload fixture runs on every test
// (./no-upload) and every test asserts zero CSP violations. The HWP the page hands out is reopened in Node rhwp (1 page,
// the amount as 「금 일천만원정 (10,000,000원)」); the PDF is read with pdf.js (1 page) and pdf-lib (every font
// embedded). An amount or rate that is not a number blocks the build with an inline error. Nothing typed is stored, put
// in the URL or in a file name (L-D8).
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { PDFDict, PDFDocument, PDFName } from '@cantoo/pdf-lib';
import type { Download, Page } from '@playwright/test';
import { expect, gotoReady, test } from './no-upload';
import { loadRhwp } from '../helpers/rhwp-node';
import { pageTexts } from '../helpers/pdf';
import { SAMPLE_VALUES } from '../helpers/form-samples';
import { glyphText } from '../../src/lib/hwp/svg-string';
import { docText, normalizeValues } from '../../src/lib/form/values';
import { LOAN_NOTE as SPEC } from '../../src/data/forms/loan-note';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const WASM_RE = /\/vendor\/rhwp\/[^/]+\/rhwp_bg\.wasm$/;
const WORKER_RE = /hwp\.worker[^/]*\.js$/;
const SAMPLE = SAMPLE_VALUES['loan-note']!;
const FINAL = /^(ready|error)$/;
const AMOUNT_DOC = '금 일천만원정 (10,000,000원)';
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

const tool = (page: Page) => page.locator('#ln-tool');
const todayOf = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

async function fill(page: Page, values: Record<string, string>): Promise<void> {
  for (const [id, v] of Object.entries(values)) await page.locator(`[data-field="${id}"]`).fill(v);
}

async function build(page: Page, how: 'make' | 'blank' = 'make'): Promise<void> {
  await page.locator(how === 'make' ? '#ln-make' : '#ln-blank').click();
  await expect(tool(page)).toHaveAttribute('data-state', FINAL, { timeout: 180_000 });
  expect(await tool(page).getAttribute('data-state'), (await page.locator('#ln-error').textContent()) ?? '').toBe('ready');
}

async function download(page: Page, id: '#ln-hwp' | '#ln-pdf'): Promise<{ d: Download; bytes: Uint8Array }> {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.locator(id).click()]);
  return { d, bytes: new Uint8Array(readFileSync((await d.path())!)) };
}

async function reopen(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
  const Doc = await loadRhwp();
  const doc = new Doc(bytes);
  try {
    return { pages: doc.pageCount(), text: glyphText(doc.renderPageSvg(0)) };
  } finally {
    doc.free();
  }
}

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

const storage = (page: Page) =>
  page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    idb: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((d) => d.name) : [],
  }));

// ---------- page ----------

test('the page: today in 쓴 날 and 빌린 날, the general-information line, 함께 준비하는 것; no worker or engine before a press', async ({ page, network }) => {
  await gotoReady(page, '/loan-note/');
  const today = await todayOf(page);
  await expect(page.locator('#ln-date')).toHaveValue(today);
  await expect(page.locator('#ln-loanDate')).toHaveValue(today);
  await expect(page.locator('#ln-dueDate')).toHaveValue('');
  await expect(page.locator('#ln-general')).toHaveText('이 페이지는 일반적인 안내입니다. 내 경우에 맞는지는 전문가나 공공 상담 기관에 물어보세요.');
  await expect(page.locator('#ln-amount')).toHaveAttribute('inputmode', 'numeric');
  await expect(page.locator('#ln-rate')).toHaveAttribute('inputmode', 'decimal');
  await expect(page.locator('#ln-with a')).toHaveText(['도장 만들기', '신분증 사본 만들기', 'PDF 합치기']);
  expect(await page.locator('#ln-with a').evaluateAll((a) => a.map((x) => x.getAttribute('href')))).toEqual(['/stamp-maker/', '/id-copy/', '/pdf-merge/']);
  expect(await page.locator('#ln-form [name]').count()).toBe(0);
  expect(await page.locator('#ln-form').getAttribute('action')).toBeNull();
  await page.waitForTimeout(1000);
  expect(network.requests.map((r) => r.url()).filter((u) => WORKER_RE.test(u) || WASM_RE.test(u))).toEqual([]);
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  expect(await serious(page), 'axe on the form').toEqual([]);
});

// ---------- filled ----------

test('filled: echo 「10,000,000원」; 1-page preview; 차용증.hwp reopens with the amount in 한글 and digits; 차용증.pdf 1 page, embedded fonts; nothing stored, URL unchanged', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/loan-note/');
  const before = await storage(page);
  const url = page.url();
  await fill(page, SAMPLE);
  await expect(page.locator('#ln-amount-echo')).toHaveText('10,000,000원');
  await build(page);
  await expect(page.locator('#ln-preview .page')).toHaveCount(1);
  await expect(page.locator('#ln-result')).toBeFocused();
  expect(await serious(page), 'axe on the result').toEqual([]);

  const values = normalizeValues(SPEC, SAMPLE);
  const expected = SPEC.fields.flatMap((f) => docText(f, values[f.id]!).split('\n')).filter((s) => s.trim());
  const hwp = await download(page, '#ln-hwp');
  expect(hwp.d.suggestedFilename()).toBe('차용증.hwp');
  expect([...hwp.bytes.subarray(0, 8)]).toEqual(CFB);
  const back = await reopen(hwp.bytes);
  expect(back.pages).toBe(1);
  expect(flat(back.text)).toContain(flat(AMOUNT_DOC));
  for (const v of expected) expect(flat(back.text), v).toContain(flat(v));

  const pdf = await download(page, '#ln-pdf');
  expect(pdf.d.suggestedFilename()).toBe('차용증.pdf');
  const texts = await pageTexts(pdf.bytes);
  expect(texts).toHaveLength(1);
  for (const v of expected) expect(flat(texts[0]!), v).toContain(flat(v));
  const fonts = await fontsEmbedded(pdf.bytes);
  expect(fonts.descriptors).toBeGreaterThan(0);
  expect(fonts.missing).toBe(0);
  await expect(page.locator('#ln-done')).toHaveText('「차용증.pdf」를 내려받았어요. 「다운로드」 폴더를 확인하세요.');

  expect(page.url()).toBe(url);
  expect(await storage(page)).toEqual(before);
  for (const v of ['홍길동', '10000000']) expect(page.url()).not.toContain(encodeURIComponent(v));
});

// ---------- field problems ----------

test('「1천만」 and 「5.555」: inline errors, focus on the first, no build (axe clean); 13 digits: the 1조 line; fixed: 연 이자 0 → 없음', async ({ page, network }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/loan-note/');
  await fill(page, { amount: '1천만', rate: '5.555' });
  await expect(page.locator('#ln-amount-echo')).toHaveText('');
  await page.locator('#ln-make').click();
  await expect(page.locator('#ln-amount-error')).toHaveText('숫자로만 써 주세요.');
  await expect(page.locator('#ln-rate-error')).toHaveText('숫자로만 써 주세요.');
  await expect(page.locator('#ln-amount')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#ln-amount')).toBeFocused();
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  expect(network.requests.map((r) => r.url()).filter((u) => WORKER_RE.test(u))).toEqual([]);
  expect(await serious(page), 'axe on the field error').toEqual([]);

  await fill(page, { amount: '1,000,000,000,000' });
  await expect(page.locator('#ln-amount-error')).toHaveText('');
  await page.locator('#ln-make').click();
  await expect(page.locator('#ln-amount-error')).toHaveText('1조 원보다 적게 써 주세요.');

  await fill(page, { amount: '１０,０００,０００원', rate: '0' });
  await expect(page.locator('#ln-amount-echo')).toHaveText('10,000,000원');
  await build(page);
  await expect(page.locator('#ln-amount-error')).toHaveText('');
  await expect(page.locator('#ln-rate')).not.toHaveAttribute('aria-invalid', 'true');
  const t = flat((await reopen((await download(page, '#ln-hwp')).bytes)).text);
  expect(t).toContain(flat(AMOUNT_DOC));
  expect(t).toContain('없음');
});

// ---------- blank ----------

test('빈 양식으로 받기: ignores the fields (even a bad amount); 1-page HWP and PDF with room to write by hand', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/loan-note/');
  await fill(page, { borrowerName: '홍길동', amount: '1천만' });
  await build(page, 'blank');
  await expect(page.locator('#ln-amount-error')).toHaveText('');
  const back = await reopen((await download(page, '#ln-hwp')).bytes);
  expect(back.pages).toBe(1);
  const t = flat(back.text);
  for (const s of ['차용증', '차용내용', '빌려준사람(채권자)', '빌린사람(채무자)', '금원정(원)', '연%', '년월일', '(서명또는인)']) expect(t).toContain(s);
  expect(t).not.toContain('홍길동');
  const texts = await pageTexts((await download(page, '#ln-pdf')).bytes);
  expect(texts).toHaveLength(1);
});

// ---------- stale, reset ----------

test('stale after an edit; 모두 지우기 restores the defaults (today in 쓴 날 and 빌린 날, the rest empty, no echo)', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/loan-note/');
  await fill(page, { amount: '500000', borrowerName: '홍길동', dueDate: '2027-01-31' });
  await build(page);
  await page.locator('[data-field="borrowerName"]').fill('홍길순');
  await expect(page.locator('#ln-downloads')).toBeHidden();
  await expect(page.locator('#ln-stale')).toHaveText('고친 내용으로 다시 만들어 주세요. 「차용증 만들기」를 누르면 새로 만들어요.');
  await page.locator('#ln-reset').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  const today = await todayOf(page);
  for (const f of SPEC.fields) await expect(page.locator(`[data-field="${f.id}"]`), f.id).toHaveValue(f.id === 'date' || f.id === 'loanDate' ? today : '');
  await expect(page.locator('#ln-amount-echo')).toHaveText('');
});

// ---------- all-max, glyphs ----------

test('every field at its limit: one page in the preview and in the HWP', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/loan-note/');
  const max: Record<string, string> = {};
  for (const f of SPEC.fields) if (f.kind === 'text' || f.kind === 'multiline') max[f.id] = '가'.repeat(f.maxLength + 5);
  await fill(page, { ...max, amount: '999,999,999,999', rate: '100.25', dueDate: '2099-12-31' });
  for (const f of SPEC.fields) if (f.kind === 'text' || f.kind === 'multiline') expect((await page.locator(`[data-field="${f.id}"]`).inputValue()).length, f.id).toBe(f.maxLength);
  await build(page);
  await expect(page.locator('#ln-preview .page')).toHaveCount(1);
  expect((await reopen((await download(page, '#ln-hwp')).bytes)).pages).toBe(1);
});

test('an emoji and a rare Hanja: the PDF page is a picture (never tofu); 1 page', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/loan-note/');
  await fill(page, { borrowerName: '홍길동😀', lenderName: '𠀀김' });
  await build(page);
  const pdf = await download(page, '#ln-pdf');
  await expect(page.locator('#ln-done')).toContainText('글꼴에 없는 글자가 있어 PDF의 그 쪽은 그림으로 넣었어요.');
  expect(await pageTexts(pdf.bytes)).toHaveLength(1);
});

// ---------- chain ----------

test('이어서 하기 after the PDF: 도장·서명 first; /pdf-sign/ receives 차용증.pdf', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/loan-note/');
  await fill(page, { amount: '3000000', borrowerName: '홍길동' });
  await build(page);
  await download(page, '#ln-pdf');
  await expect(page.locator('#ln-next').getByRole('button')).toHaveText(['PDF 서명·도장 넣기', 'PDF 글자 넣기·편집', 'PDF 용량 줄이기']);
  await page.locator('#ln-next').getByRole('button', { name: 'PDF 서명·도장 넣기' }).click();
  await expect(page).toHaveURL(/\/pdf-sign\/$/);
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await expect(page.locator('#sg-name')).toHaveText('차용증.pdf');
});
