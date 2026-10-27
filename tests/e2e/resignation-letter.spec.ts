// 사직서 만들기 (RESIGN1027 test map "e2e /resignation-letter/"). All 5 projects; the no-upload fixture runs on every test
// (./no-upload) and every test asserts zero CSP violations. The HWP the page hands out is reopened in Node rhwp (1 page,
// 「…일자로 사직하고자」); the PDF is read with pdf.js (1 page) and pdf-lib (every font embedded). The 그만두는 이유
// presets (R5) fill the field before the controller has loaded (its chunk held back here) and after a build (the
// document goes stale). Nothing typed is stored, put in the URL or in a file name (R9).
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
import { RESIGNATION_LETTER as SPEC } from '../../src/data/forms/resignation-letter';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const WASM_RE = /\/vendor\/rhwp\/[^/]+\/rhwp_bg\.wasm$/;
const WORKER_RE = /hwp\.worker[^/]*\.js$/;
const CONTROLLER_RE = /\/_astro\/controller\.[\w-]{8}\.js$/;
const SAMPLE = SAMPLE_VALUES['resignation-letter']!;
const FINAL = /^(ready|error)$/;
const LINE = '본인은 위와 같은 사유로 2026년 11월 30일자로 사직하고자 하오니 처리하여 주시기 바랍니다.';
const KWON = '회사의 권고에 따른 퇴사(권고사직)';
const CHIPS = ['개인 사정', '이직', '건강', '학업', '식구 돌보기', '계약 끝', '회사 권고'];
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

const tool = (page: Page) => page.locator('#rs-tool');
const chip = (page: Page, name: string) => page.locator('#rs-tool .pa-preset', { hasText: name });
const todayOf = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

async function fill(page: Page, values: Record<string, string>): Promise<void> {
  for (const [id, v] of Object.entries(values)) await page.locator(`[data-field="${id}"]`).fill(v);
}

async function build(page: Page, how: 'make' | 'blank' = 'make'): Promise<void> {
  await page.locator(how === 'make' ? '#rs-make' : '#rs-blank').click();
  await expect(tool(page)).toHaveAttribute('data-state', FINAL, { timeout: 180_000 });
  expect(await tool(page).getAttribute('data-state'), (await page.locator('#rs-error').textContent()) ?? '').toBe('ready');
}

async function download(page: Page, id: '#rs-hwp' | '#rs-pdf'): Promise<{ d: Download; bytes: Uint8Array }> {
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

test('the page: today in 내는 날 only, the general-information line with 고용24, 7 reason buttons, 함께 준비하는 것; no worker or engine before a press', async ({ page, network }) => {
  await gotoReady(page, '/resignation-letter/');
  await expect(page.locator('#rs-date')).toHaveValue(await todayOf(page));
  await expect(page.locator('#rs-joinDate')).toHaveValue('');
  await expect(page.locator('#rs-leaveDate')).toHaveValue('');
  await expect(page.locator('#rs-general')).toHaveText('이 페이지는 일반적인 안내이고, 만든 사직서는 일반 양식입니다. 내 경우에 맞는지는 고용24나 고용노동부 고객상담센터(국번없이 1350)에 물어보세요.');
  await expect(page.locator('#rs-general a')).toHaveAttribute('href', 'https://www.work24.go.kr/cm/main.do');
  const group = page.getByRole('group', { name: '자주 쓰는 이유' });
  await expect(group.getByRole('button')).toHaveText(CHIPS);
  for (const b of await group.getByRole('button').all()) await expect(b).toHaveAttribute('type', 'button');
  await expect(chip(page, '회사 권고')).toHaveAttribute('data-fill', KWON);
  await expect(page.locator('#rs-reason-presets-hint')).toHaveText('고르면 칸에 들어가요. 고쳐 써도 돼요.');
  await expect(page.locator('#rs-to')).toHaveAttribute('aria-describedby', 'rs-to-hint');
  await expect(page.locator('#rs-with a')).toHaveText(['도장 만들기', '전자서명·도장 이미지 만들기']);
  expect(await page.locator('#rs-with a').evaluateAll((a) => a.map((x) => x.getAttribute('href')))).toEqual(['/stamp-maker/', '/stamp-signature/']);
  expect(await page.locator('#rs-form [name]').count()).toBe(0);
  expect(await page.locator('#rs-form').getAttribute('action')).toBeNull();
  await page.waitForTimeout(1000);
  expect(network.requests.map((r) => r.url()).filter((u) => WORKER_RE.test(u) || WASM_RE.test(u))).toEqual([]);
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  expect(await serious(page), 'axe on the form and the reason buttons').toEqual([]);
});

// ---------- presets before the controller ----------

test('a reason button before the controller has loaded: fills the field (replacing typed text), fires input, focus and caret at the end; the build uses it', async ({ page }) => {
  test.setTimeout(300_000);
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let asked = 0;
  await page.route(CONTROLLER_RE, async (route) => {
    asked++;
    await held;
    await route.continue();
  });
  await gotoReady(page, '/resignation-letter/');
  await page.evaluate(() => {
    const w = window as unknown as { __inputs: number };
    w.__inputs = 0;
    document.getElementById('rs-form')!.addEventListener('input', () => w.__inputs++);
  });
  await page.locator('#rs-reason').fill('쓰다 만 이유');
  const typed = await page.evaluate(() => (window as unknown as { __inputs: number }).__inputs);
  await chip(page, '회사 권고').click();
  await expect(page.locator('#rs-reason')).toHaveValue(KWON);
  expect(asked, 'the controller chunk is held back').toBeGreaterThanOrEqual(1);
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  expect(await page.evaluate(() => (window as unknown as { __inputs: number }).__inputs)).toBe(typed + 1);
  await expect(page.locator('#rs-reason')).toBeFocused();
  expect(await page.locator('#rs-reason').evaluate((t: HTMLTextAreaElement) => [t.selectionStart, t.selectionEnd, t.value.length])).toEqual([KWON.length, KWON.length, KWON.length]);
  await fill(page, { name: '홍길동', leaveDate: '2026-11-30' });
  release();
  await build(page);
  await expect(page.locator('#rs-reason')).toHaveValue(KWON);
  const texts = await pageTexts((await download(page, '#rs-pdf')).bytes);
  expect(texts).toHaveLength(1);
  expect(flat(texts[0]!)).toContain(flat(KWON));
  expect(flat(texts[0]!)).toContain(flat(LINE));
});

// ---------- filled ----------

test('filled: 1-page preview; 사직서.hwp reopens with 「…일자로 사직하고자」; 사직서.pdf 1 page, embedded fonts; nothing stored, URL unchanged', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/resignation-letter/');
  const before = await storage(page);
  const url = page.url();
  await fill(page, SAMPLE);
  await build(page);
  await expect(page.locator('#rs-preview .page')).toHaveCount(1);
  await expect(page.locator('#rs-result')).toBeFocused();
  expect(await serious(page), 'axe on the result').toEqual([]);

  const values = normalizeValues(SPEC, SAMPLE);
  const expected = [...SPEC.fields.flatMap((f) => docText(f, values[f.id]!).split('\n')).filter((s) => s.trim()), LINE, '○○ 주식회사 대표이사 귀하'];
  const hwp = await download(page, '#rs-hwp');
  expect(hwp.d.suggestedFilename()).toBe('사직서.hwp');
  expect([...hwp.bytes.subarray(0, 8)]).toEqual(CFB);
  const back = await reopen(hwp.bytes);
  expect(back.pages).toBe(1);
  expect(flat(back.text)).toContain(flat('일자로 사직하고자'));
  for (const v of expected) expect(flat(back.text), v).toContain(flat(v));

  const pdf = await download(page, '#rs-pdf');
  expect(pdf.d.suggestedFilename()).toBe('사직서.pdf');
  const texts = await pageTexts(pdf.bytes);
  expect(texts).toHaveLength(1);
  for (const v of expected) expect(flat(texts[0]!), v).toContain(flat(v));
  const fonts = await fontsEmbedded(pdf.bytes);
  expect(fonts.descriptors).toBeGreaterThan(0);
  expect(fonts.missing).toBe(0);
  await expect(page.locator('#rs-done')).toHaveText('「사직서.pdf」를 내려받았어요. 「다운로드」 폴더를 확인하세요.');

  expect(page.url()).toBe(url);
  expect(await storage(page)).toEqual(before);
  for (const v of ['홍길동', '영업팀', '2026-11-30']) expect(page.url()).not.toContain(encodeURIComponent(v));
});

// ---------- blank ----------

test('빈 양식으로 받기: ignores the fields; 1-page HWP and PDF with room to write the dates and names by hand', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/resignation-letter/');
  await fill(page, { name: '홍길동' });
  await chip(page, '이직').click();
  await build(page, 'blank');
  const back = await reopen((await download(page, '#rs-hwp')).bytes);
  expect(back.pages).toBe(1);
  const t = flat(back.text);
  for (const s of ['사직서', '인적사항', '재직사항', '소속', '퇴사예정일', '사직사유', '년월일자로사직하고자', '(서명또는인)', '귀하']) expect(t, s).toContain(s);
  expect(t).not.toContain('홍길동');
  expect(t).not.toContain(flat('다른 회사로 옮기게 되어서'));
  expect(await pageTexts((await download(page, '#rs-pdf')).bytes)).toHaveLength(1);
});

// ---------- presets after a build, reset ----------

test('a reason button after a build marks the document stale and hides the downloads; the rebuild has the new reason; 모두 지우기 restores today in 내는 날 only', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/resignation-letter/');
  await fill(page, { name: '홍길동', reason: '개인적인 사정' });
  await build(page);
  await expect(page.locator('#rs-downloads')).toBeVisible();
  await chip(page, '건강').click();
  await expect(page.locator('#rs-reason')).toHaveValue('건강 문제(치료와 회복)');
  await expect(page.locator('#rs-downloads')).toBeHidden();
  await expect(page.locator('#rs-stale')).toHaveText('고친 내용으로 다시 만들어 주세요. 「사직서 만들기」를 누르면 새로 만들어요.');
  await build(page);
  const t = flat((await reopen((await download(page, '#rs-hwp')).bytes)).text);
  expect(t).toContain(flat('건강 문제(치료와 회복)'));
  expect(t).not.toContain('개인적인사정');

  await page.locator('#rs-reset').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  const today = await todayOf(page);
  for (const f of SPEC.fields) await expect(page.locator(`[data-field="${f.id}"]`), f.id).toHaveValue(f.id === 'date' ? today : '');
});

// ---------- all-max, glyphs ----------

test('every field at its limit (사직 사유 in 3 lines): one page in the preview and in the HWP', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/resignation-letter/');
  const max: Record<string, string> = {};
  for (const f of SPEC.fields) if (f.kind === 'text' || f.kind === 'multiline') max[f.id] = '가'.repeat(f.maxLength + 5);
  await fill(page, { ...max, joinDate: '2026-12-31', leaveDate: '2026-12-31', date: '2026-12-31' });
  for (const f of SPEC.fields) if (f.kind === 'text' || f.kind === 'multiline') expect([...(await page.locator(`[data-field="${f.id}"]`).inputValue())].length, f.id).toBe(f.maxLength);
  await build(page);
  await expect(page.locator('#rs-preview .page')).toHaveCount(1);
  expect((await reopen((await download(page, '#rs-hwp')).bytes)).pages).toBe(1);
  await fill(page, { reason: ['가'.repeat(32), '가'.repeat(32), '가'.repeat(32)].join('\n') });
  await build(page);
  await expect(page.locator('#rs-preview .page')).toHaveCount(1);
});

test('an emoji and a rare Hanja: the PDF page is a picture (never tofu); 1 page', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/resignation-letter/');
  await fill(page, { name: '홍길동😀', dept: '𠀀영업' });
  await build(page);
  const pdf = await download(page, '#rs-pdf');
  await expect(page.locator('#rs-done')).toContainText('글꼴에 없는 글자가 있어 PDF의 그 쪽은 그림으로 넣었어요.');
  expect(await pageTexts(pdf.bytes)).toHaveLength(1);
});

// ---------- chain ----------

test('이어서 하기 after the PDF: 도장·서명 first; /pdf-sign/ receives 사직서.pdf', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/resignation-letter/');
  await fill(page, { name: '홍길동' });
  await build(page);
  await download(page, '#rs-pdf');
  await expect(page.locator('#rs-next').getByRole('button')).toHaveText(['PDF 서명·도장 넣기', 'PDF 글자 넣기·편집', 'PDF 용량 줄이기']);
  await page.locator('#rs-next').getByRole('button', { name: 'PDF 서명·도장 넣기' }).click();
  await expect(page).toHaveURL(/\/pdf-sign\/$/);
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await expect(page.locator('#sg-name')).toHaveText('사직서.pdf');
});
