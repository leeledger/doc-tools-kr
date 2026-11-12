// 견적서·거래명세서 만들기 (QUOTE1112 test map "e2e /quotation/"). All 5 projects; the no-upload fixture runs on every test
// (./no-upload) and every test asserts zero CSP violations. The totals box is compared with the PDF text (pdf.js) and the
// HWP text (Node rhwp); both come from src/lib/form/ledger.ts. 거래명세서 and the three VAT modes, the add-row button up to
// ITEM_ROWS, the pair and 100억 errors, the blank form, the seal from a file (an image XObject in the PDF, an <image> in
// the reopened HWP), a bad file, the seal from 도장 만들기 (read once, keys removed), stale on edit / radio / seal, reset,
// 이어서 하기, the result-only affiliate group. Nothing typed is stored, put in the URL or in a file name (Q11).
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import type { Download, Page } from '@playwright/test';
import { expect, gotoReady, test } from './no-upload';
import { loadRhwp } from '../helpers/rhwp-node';
import { pageTexts } from '../helpers/pdf';
import { sealPng } from '../helpers/form-samples';
import { glyphText } from '../../src/lib/hwp/svg-string';
import { ITEM_ROWS } from '../../src/data/forms/quotation';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const WASM_RE = /\/vendor\/rhwp\/[^/]+\/rhwp_bg\.wasm$/;
const WORKER_RE = /hwp\.worker[^/]*\.js$/;
const FINAL = /^(ready|error)$/;
const flat = (s: string): string => s.replace(/\s+/g, '');
/** Three rows: 3 × 120,000 + 10 × 25,000 + 1 × 30,000 = 640,000 (별도: 64,000 tax, 704,000 total). */
const ROWS: Record<string, string> = {
  bizName: '○○상사',
  ceo: '홍길동',
  recvName: '△△주식회사',
  i1Name: '사무용 의자',
  i1Spec: '메시',
  i1Qty: '3',
  i1Price: '120,000',
  i2Name: 'A4 복사용지',
  i2Qty: '10',
  i2Price: '25000',
  i3Name: '배송비',
  i3Qty: '1',
  i3Price: '30,000',
};

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

const tool = (page: Page) => page.locator('#qt-tool');
const todayOf = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

async function fill(page: Page, values: Record<string, string>): Promise<void> {
  for (const [id, v] of Object.entries(values)) await page.locator(`#qt-${id}`).fill(v);
}

async function build(page: Page, how: 'make' | 'blank' = 'make'): Promise<void> {
  await page.locator(how === 'make' ? '#qt-make' : '#qt-blank').click();
  await expect(tool(page)).toHaveAttribute('data-state', FINAL, { timeout: 180_000 });
  expect(await tool(page).getAttribute('data-state'), (await page.locator('#qt-error').textContent()) ?? '').toBe('ready');
}

async function download(page: Page, id: '#qt-hwp' | '#qt-pdf'): Promise<{ d: Download; bytes: Uint8Array }> {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.locator(id).click()]);
  return { d, bytes: new Uint8Array(readFileSync((await d.path())!)) };
}

async function reopen(bytes: Uint8Array): Promise<{ pages: number; text: string; image: boolean }> {
  const Doc = await loadRhwp();
  const doc = new Doc(bytes);
  try {
    const svg = doc.renderPageSvg(0);
    return { pages: doc.pageCount(), text: glyphText(svg), image: /<image/.test(svg) };
  } finally {
    doc.free();
  }
}

/** Image XObjects on page 1 of a PDF. */
async function pdfImages(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const xobjects = doc.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
  if (!xobjects) return 0;
  return xobjects.keys().map((k) => xobjects.lookup(k)).filter((s) => s instanceof PDFRawStream && s.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')).length;
}

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length} ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

const storage = (page: Page) =>
  page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    idb: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((d) => d.name) : [],
  }));

/** The totals box lines, once the controller has filled it. */
const totals = (page: Page) => page.locator('#qt-totals p');

// ---------- page ----------

test('the page: 견적서 checked, today in 작성일, 3 rows then 품목 줄 더하기 up to ITEM_ROWS, the 세금계산서 line, radio names only; no engine before a press', async ({ page, network }) => {
  await gotoReady(page, '/quotation/');
  await expect(page.locator('#qt-doc-quotation')).toBeChecked();
  await expect(page.locator('#qt-vat-separate')).toBeChecked();
  await expect(page.locator('#qt-make')).toHaveText('견적서 만들기');
  await expect(page.locator('#qt-date')).toHaveValue(await todayOf(page));
  await expect(page.locator('#qt-not-tax')).toHaveText('이 서류는 세금계산서가 아닙니다. 세금계산서는 따로 발급해야 합니다. 국세청 홈택스');
  await expect(page.locator('#qt-not-tax a')).toHaveAttribute('href', 'https://www.hometax.go.kr/');
  await expect(page.locator('#qt-with a')).toHaveText(['도장 만들기', 'PDF 서명·도장 넣기']);
  await expect(page.getByRole('group', { name: '자주 쓰는 말' }).getByRole('button')).toHaveText(['30일 유효', '배송비 별도', '30일 안에 지급']);
  expect(await page.locator('#qt-form [name]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).type))).toEqual(['radio', 'radio', 'radio', 'radio', 'radio']);
  expect(await page.locator('#qt-form').getAttribute('action')).toBeNull();
  await expect(page.locator('fieldset[data-item]:visible')).toHaveCount(3);
  await page.waitForTimeout(500);
  expect(network.requests.map((r) => r.url()).filter((u) => WORKER_RE.test(u) || WASM_RE.test(u))).toEqual([]);
  expect(await serious(page), 'axe on the form and the rows').toEqual([]);
  // 품목 줄 더하기: the next row shows, focus on its 품명; the button goes after the last row.
  for (let n = 4; n <= ITEM_ROWS; n++) {
    await page.locator('#qt-add-row').click();
    await expect(page.locator(`#qt-item-${n}`)).toBeVisible();
    await expect(page.locator(`#qt-i${n}Name`)).toBeFocused();
  }
  await expect(page.locator('#qt-add-row')).toBeHidden();
  await expect(page.locator('fieldset[data-item]:visible')).toHaveCount(ITEM_ROWS);
  // 거래명세서: the button and the result title follow the radio.
  await page.locator('#qt-doc-transaction-statement').check();
  await expect(page.locator('#qt-make')).toHaveText('거래명세서 만들기');
  await expect(page.locator('#qt-result-title')).toHaveText('만든 거래명세서');
});

// ---------- filled 견적서 ----------

test('견적서, 3 rows, 부가세 별도: totals box = PDF text = HWP text; 견적서.hwp / .pdf, 1 page; nothing stored, URL unchanged', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/quotation/');
  const before = await storage(page);
  const url = page.url();
  await fill(page, ROWS);
  await expect(totals(page)).toHaveText(['공급가액 합계 640,000원', '부가세 64,000원', '합계 704,000원', '일금 칠십만사천원정']);
  await build(page);
  await expect(page.locator('#qt-preview .page')).toHaveCount(1);
  expect(await serious(page), 'axe on the result').toEqual([]);
  const expected = ['견적서', '공급받는자', '공급자', '합계금액일금칠십만사천원정(704,000원)(부가세포함)', '1사무용의자메시3120,000360,00036,000', '250,00025,000', '합계640,00064,000', '위와같이견적합니다.', '공급자홍길동(인)'];

  const hwp = await download(page, '#qt-hwp');
  expect(hwp.d.suggestedFilename()).toBe('견적서.hwp');
  expect([...hwp.bytes.subarray(0, 8)]).toEqual(CFB);
  const back = await reopen(hwp.bytes);
  expect(back.pages).toBe(1);
  for (const v of expected) expect(flat(back.text), v).toContain(v);

  const pdf = await download(page, '#qt-pdf');
  expect(pdf.d.suggestedFilename()).toBe('견적서.pdf');
  const texts = await pageTexts(pdf.bytes);
  expect(texts).toHaveLength(1);
  for (const v of ['칠십만사천원정', '704,000', '640,000', '64,000', '360,000', '36,000']) expect(flat(texts[0]!), v).toContain(v);
  expect(await pdfImages(pdf.bytes)).toBe(0);

  expect(page.url()).toBe(url);
  expect(await storage(page)).toEqual(before);
  for (const v of ['홍길동', '상사', '120000']) expect(page.url()).not.toContain(encodeURIComponent(v));
});

// ---------- 거래명세서, 포함 / 없음 ----------

test('거래명세서 with 부가세 포함, then 없음: titles, closing lines, file names and numbers follow', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/quotation/');
  await fill(page, { ceo: '홍길동', i1Name: '설치비', i1Qty: '1', i1Price: '11,000' });
  await page.locator('#qt-doc-transaction-statement').check();
  await page.locator('#qt-vat-included').check();
  await expect(totals(page)).toHaveText(['공급가액 합계 10,000원', '부가세 1,000원', '합계 11,000원', '일금 일만일천원정']);
  await build(page);
  const pdf = await download(page, '#qt-pdf');
  expect(pdf.d.suggestedFilename()).toBe('거래명세서.pdf');
  const t = flat((await pageTexts(pdf.bytes))[0]!);
  for (const v of ['거래명세서', '위와같이거래하였습니다.', '일금일만일천원정(11,000원)(부가세포함)', '10,0001,000']) expect(t, v).toContain(flat(v));
  const hwp = await download(page, '#qt-hwp');
  expect(hwp.d.suggestedFilename()).toBe('거래명세서.hwp');

  await page.locator('#qt-vat-none').check();
  await expect(page.locator('#qt-downloads')).toBeHidden();
  await expect(page.locator('#qt-stale')).toHaveText('고친 내용으로 다시 만들어 주세요. 만들기 버튼을 누르면 새로 만들어요.');
  await expect(totals(page)).toHaveText(['공급가액 합계 11,000원', '부가세 없음', '합계 11,000원', '일금 일만일천원정']);
  await build(page);
  const none = flat((await reopen((await download(page, '#qt-hwp')).bytes)).text);
  expect(none).toContain(flat('일금 일만일천원정 (11,000원) (부가세 없음)'));
  // 세액 cells empty: the row ends at its 공급가액 and the 합계 row at its sum (no 「1,000」 after either).
  expect(none).toContain('설치비111,00011,000합계11,000비고');
});

// ---------- errors ----------

test('수량 without 단가 names the row; 100억 or more and 3 decimals are errors; nothing is built', async ({ page }) => {
  await gotoReady(page, '/quotation/');
  await fill(page, { i1Name: '가', i1Qty: '1', i1Price: '1000', i2Name: '나', i2Qty: '2' });
  await page.locator('#qt-make').click();
  await expect(page.locator('#qt-items-error')).toHaveText('품목 2: 수량과 단가를 함께 넣어 주세요.');
  await expect(page.locator('#qt-i2Price')).toBeFocused();
  await expect(page.locator('#qt-i2Price')).toHaveAttribute('aria-invalid', 'true');
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  await page.locator('#qt-i2Price').fill('10000000000');
  await page.locator('#qt-make').click();
  await expect(page.locator('#qt-i2Price-error')).toHaveText('너무 큰 수예요. 수량은 999,999까지, 단가는 열 자리까지 써 주세요.');
  await page.locator('#qt-i2Price').fill('9999999999');
  await page.locator('#qt-make').click();
  await expect(page.locator('#qt-items-error')).toHaveText('100억 원 넘는 금액은 만들 수 없어요.');
  await expect(page.locator('#qt-totals .pa-hangul')).toHaveText('');
  await page.locator('#qt-i2Qty').fill('1.234');
  await page.locator('#qt-make').click();
  await expect(page.locator('#qt-i2Qty-error')).toHaveText('숫자로 써 주세요. 수량은 소수점 아래 두 자리까지 돼요.');
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  expect(await serious(page), 'axe with the error lines').toEqual([]);
});

// ---------- blank ----------

test('빈 양식으로 받기: ignores the fields; 1-page HWP and PDF with room for the amounts', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/quotation/');
  await fill(page, ROWS);
  await build(page, 'blank');
  const back = await reopen((await download(page, '#qt-hwp')).bytes);
  expect(back.pages).toBe(1);
  const t = flat(back.text);
  for (const s of ['견적서', '공급받는자', '번호품명규격수량단가공급가액세액', '합계', '합계금액일금원정(원)', '년월일', '(인)']) expect(t, s).toContain(s);
  for (const s of ['홍길동', '사무용', '640,000']) expect(t).not.toContain(s);
  expect(await pageTexts((await download(page, '#qt-pdf')).bytes)).toHaveLength(1);
});

// ---------- seal ----------

test('직인 그림 from a file: shown, the PDF has an image and the reopened HWP draws it; a non-picture is refused; 빼기 and a change are stale', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/quotation/');
  await fill(page, { ceo: '홍길동', i1Name: '가', i1Qty: '1', i1Price: '1000' });
  await page.locator('#qt-seal-file').setInputFiles({ name: 'seal.txt', mimeType: 'image/png', buffer: Buffer.from('not a picture') });
  await expect(page.locator('#qt-seal-error')).toHaveText('PNG나 JPG 그림만 넣을 수 있어요.');
  await expect(page.locator('#qt-seal-img')).toBeHidden();
  const seal = sealPng(200, 160);
  await page.locator('#qt-seal-file').setInputFiles({ name: 'seal.png', mimeType: 'image/png', buffer: Buffer.from(seal.bytes) });
  await expect(page.locator('#qt-seal-img')).toBeVisible();
  await expect(page.locator('#qt-seal-error')).toHaveText('');
  await expect(page.locator('#qt-seal-note')).toHaveText('직인 그림을 넣었어요. 만들기를 누르면 서류의 공급자 이름 옆에 찍혀요.');
  await build(page);
  const pdf = await download(page, '#qt-pdf');
  expect(await pdfImages(pdf.bytes)).toBe(1);
  const back = await reopen((await download(page, '#qt-hwp')).bytes);
  expect(back.image).toBe(true);
  expect(flat(back.text)).not.toContain('(인)');
  await page.locator('#qt-seal-remove').click();
  await expect(page.locator('#qt-downloads')).toBeHidden();
  await expect(page.locator('#qt-seal-img')).toBeHidden();
  await build(page);
  expect(await pdfImages((await download(page, '#qt-pdf')).bytes)).toBe(0);
});

test('직인 그림 from 도장 만들기: 「견적서에 찍기」 opens /quotation/ with the picture; the hand-off keys are removed', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/stamp-maker/');
  await page.locator('#sm-text').focus();
  await expect(page.locator('#sm-tool')).toHaveAttribute('data-painted', /\d+/);
  const before = Number(await page.locator('#sm-tool').getAttribute('data-painted'));
  await page.locator('#sm-text').fill('홍길동');
  await expect.poll(async () => Number(await page.locator('#sm-tool').getAttribute('data-painted'))).toBeGreaterThan(before);
  await page.locator('.sm-tile[data-style="round"]').click();
  await Promise.all([page.waitForURL('**/quotation/'), page.locator('#sm-quote').click()]);
  await expect(page.locator('#qt-seal-note')).toHaveText('도장 만들기에서 만든 그림을 가져왔습니다.');
  await expect(page.locator('#qt-seal-img')).toBeVisible();
  expect(await page.evaluate(() => [sessionStorage.getItem('docttak:sign-png'), sessionStorage.getItem('docttak:sign-from')])).toEqual([null, null]);
  await fill(page, { ceo: '홍길동' });
  await build(page);
  expect(await pdfImages((await download(page, '#qt-pdf')).bytes)).toBe(1);
});

// ---------- stale, reset ----------

test('after a build: an edit and the 만들 서류 radio mark the document stale; 모두 지우기 puts 견적서, 별도, today and 3 rows back', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/quotation/');
  await fill(page, ROWS);
  await page.locator('#qt-add-row').click();
  await build(page);
  await page.locator('#qt-i1Qty').fill('4');
  await expect(page.locator('#qt-downloads')).toBeHidden();
  await build(page);
  await expect(page.locator('#qt-downloads')).toBeVisible();
  await page.locator('#qt-doc-transaction-statement').check();
  await expect(page.locator('#qt-downloads')).toBeHidden();
  await page.locator('#qt-vat-none').check();
  await page.locator('#qt-reset').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#qt-doc-quotation')).toBeChecked();
  await expect(page.locator('#qt-vat-separate')).toBeChecked();
  await expect(page.locator('#qt-make')).toHaveText('견적서 만들기');
  await expect(page.locator('#qt-date')).toHaveValue(await todayOf(page));
  await expect(page.locator('#qt-i1Name')).toHaveValue('');
  await expect(page.locator('fieldset[data-item]:visible')).toHaveCount(3);
  await expect(page.locator('#qt-add-row')).toBeVisible();
  await expect(totals(page)).toHaveText(['공급가액 합계 0원', '부가세 0원', '합계 0원', '']);
});

// ---------- chain, affiliate ----------

test('이어서 하기 after the PDF: /pdf-sign/ receives 견적서.pdf; the affiliate group shows on the result only', async ({ page }) => {
  test.setTimeout(300_000);
  await gotoReady(page, '/quotation/');
  const block = page.locator('#qt-result .out-links');
  await expect(block).toHaveCount(1);
  await expect(block).toBeHidden();
  await fill(page, ROWS);
  await build(page);
  await expect(block).toBeVisible();
  await expect(page.locator('#qt-result .out-links a[rel~="sponsored"]').first()).toBeVisible();
  await download(page, '#qt-pdf');
  await expect(page.locator('#qt-next').getByRole('button')).toHaveText(['PDF 서명·도장 넣기', 'PDF 글자 넣기·편집', 'PDF 용량 줄이기']);
  await page.locator('#qt-next').getByRole('button', { name: 'PDF 서명·도장 넣기' }).click();
  await expect(page).toHaveURL(/\/pdf-sign\/$/);
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'ready', { timeout: 60_000 });
  await expect(page.locator('#sg-name')).toHaveText('견적서.pdf');
});
