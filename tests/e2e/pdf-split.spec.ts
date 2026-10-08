// PDF 나누기·쪽 편집 (TOOLS5 U2) end to end: a generated 5-page PDF whose page widths mark the pages (400, 410, … 440 pt)
// is edited (remove, turn, reorder) and saved in every mode; outputs are parsed with pdf-lib here (order by width,
// /Rotate on the right page, ZIP entries and names). Encrypted and signed inputs, range typos, removing every page,
// the page pictures and the lazy controller are covered too.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Download, Page } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { unzipSync } from 'fflate';
import { expect, gotoReady, test } from './no-upload';
import { RUNTIME_DIR, runtimePath } from './paths';

// One copy per worker process (a shared path can be rewritten by another worker's beforeAll while this one reads it).
const FIVE = join(RUNTIME_DIR, `ps-${process.pid}`, 'five.pdf');
const width = (src: number): number => 400 + src * 10;

test.beforeAll(async () => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 5; i++) doc.addPage([width(i), 600]);
  mkdirSync(dirname(FIVE), { recursive: true });
  writeFileSync(FIVE, await doc.save());
});

const row = (page: Page, src: number) => page.locator(`#ps-list li[data-id="${src}"]`);

async function open(page: Page, path: string): Promise<void> {
  await gotoReady(page, '/pdf-split/');
  await page.setInputFiles('#ps-input', path);
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', /ready|locked/);
}

/**
 * Waits until the page stops scrolling. The result (and 다시 편집하기) scrolls with `scroll-behavior: smooth`; a click aimed
 * while it moves can land on another element (seen on WebKit under parallel load).
 */
const settled = (page: Page) =>
  page.waitForFunction(() => new Promise<boolean>((r) => {
    const y = scrollY;
    requestAnimationFrame(() => requestAnimationFrame(() => r(scrollY === y)));
  }));

async function save(page: Page): Promise<{ name: string; bytes: Uint8Array }> {
  await page.locator('#ps-run').click();
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await settled(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#ps-download').click()]);
  const d = download as Download;
  return { name: d.suggestedFilename(), bytes: new Uint8Array(readFileSync(await d.path())) };
}

/** Each page as [source page (from its width), extra /Rotate]. */
async function pagesOf(bytes: Uint8Array, password?: string): Promise<[number, number][]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ...(password ? { password } : {}) });
  return doc.getPages().map((p) => [(Math.round(p.getSize().width) - 400) / 10 + 1, p.getRotation().angle]);
}

/** Picks a save mode and confirms the radio really changed (a click during a layout shift can miss). */
async function mode(page: Page, label: string): Promise<void> {
  const radio = page.getByRole('radio', { name: label });
  await expect(async () => {
    if (!(await radio.isChecked())) await page.locator('label.chip', { hasText: label }).click();
    await expect(radio).toBeChecked({ timeout: 1000 });
  }).toPass();
}

test('remove page 2, turn page 3, move page 5 to the top -> 편집한 PDF: 4 pages in that order, /Rotate on page 3 only', async ({ page }) => {
  await open(page, FIVE);
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#ps-list > li')).toHaveCount(5);
  await row(page, 1).locator('[data-role="remove"]').click();
  await expect(row(page, 1)).toHaveClass(/removed/);
  await expect(row(page, 1).locator('.name')).toHaveText('빼는 쪽');
  await row(page, 2).locator('[data-role="rotate"]').click();
  await expect(row(page, 2).locator('.info')).toContainText('90° 돌림');
  for (let k = 0; k < 4; k++) await row(page, 4).locator('[data-role="up"]').click();
  await expect(page.locator('#ps-list > li').first()).toHaveAttribute('data-id', '4');
  await expect(row(page, 4).locator('.name')).toHaveText('1쪽');
  await expect(page.locator('#ps-status')).toHaveText('원래 5쪽을 5개 중 1번째로 옮겼습니다.');
  await expect(page.locator('#ps-hint')).toHaveText('4쪽을 PDF 하나로 저장합니다.');
  const { name, bytes } = await save(page);
  expect(name).toBe('five_편집.pdf');
  expect(await pagesOf(bytes)).toEqual([
    [5, 0],
    [1, 0],
    [3, 90],
    [4, 0],
  ]);
  await expect(page.locator('#ps-summary')).toHaveText(/^4쪽 · /);

  // 다시 편집하기 keeps the edits.
  await page.locator('#ps-again').click();
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', 'ready');
  await settled(page);
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#ps-list > li').first()).toHaveAttribute('data-id', '4');
});

test('고른 쪽만 새 PDF로: pages 2-3 picked -> {base}_추출.pdf with those two; bulk 돌리기 turns only the picked pages', async ({ page }) => {
  await open(page, FIVE);
  await mode(page, '고른 쪽만 새 PDF로');
  await expect(page.locator('#ps-run')).toBeDisabled();
  await expect(page.locator('#ps-hint')).toHaveText('새 PDF로 만들 쪽을 골라 주세요.');
  await row(page, 1).locator('[data-role="pick"]').check();
  await row(page, 2).locator('[data-role="pick"]').check();
  await expect(page.locator('#ps-rotate-sel')).toBeEnabled();
  await page.locator('#ps-rotate-sel').click();
  await page.locator('#ps-rotate-sel').click();
  await expect(page.locator('#ps-run')).toHaveText('고른 2쪽 저장');
  const { name, bytes } = await save(page);
  expect(name).toBe('five_추출.pdf');
  expect(await pagesOf(bytes)).toEqual([
    [2, 180],
    [3, 180],
  ]);
});

test('범위대로 나누기 "1-2 / 3-5" -> ZIP with two PDFs (2 and 3 pages); 한 쪽씩 -> five; 몇 쪽씩 2 -> 2, 2, 1', async ({ page }) => {
  await open(page, FIVE);
  await mode(page, '범위대로 나누기');
  await expect(page.locator('#ps-run')).toBeDisabled();
  await page.locator('#ps-ranges').fill('1-2\n3-5');
  await expect(page.locator('#ps-run')).toHaveText('PDF 2개로 나누기');
  let out = await save(page);
  expect(out.name).toBe('five_나누기.zip');
  let zip = unzipSync(out.bytes);
  expect(Object.keys(zip)).toEqual(['five_1-2.pdf', 'five_3-5.pdf']);
  expect(await pagesOf(zip['five_1-2.pdf']!)).toEqual([
    [1, 0],
    [2, 0],
  ]);
  expect((await pagesOf(zip['five_3-5.pdf']!)).map(([p]) => p)).toEqual([3, 4, 5]);
  await expect(page.locator('#ps-headline')).toHaveText('PDF 2개가 ZIP 파일로 준비되었습니다');

  await page.locator('#ps-again').click();
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', 'ready');
  await settled(page);
  await mode(page, '한 쪽씩 나누기');
  await expect(page.locator('#ps-run')).toHaveText('PDF 5개로 나누기');
  out = await save(page);
  zip = unzipSync(out.bytes);
  expect(Object.keys(zip)).toEqual(['five_1.pdf', 'five_2.pdf', 'five_3.pdf', 'five_4.pdf', 'five_5.pdf']);
  expect(await pagesOf(zip['five_4.pdf']!)).toEqual([[4, 0]]);

  await page.locator('#ps-again').click();
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', 'ready');
  await settled(page);
  await mode(page, '몇 쪽씩 나누기');
  await page.locator('#ps-every').fill('2');
  await expect(page.locator('#ps-run')).toHaveText('PDF 3개로 나누기');
  out = await save(page);
  zip = unzipSync(out.bytes);
  expect(Object.keys(zip)).toEqual(['five_1-2.pdf', 'five_3-4.pdf', 'five_5.pdf']);
});

test('range typos: "3-1" and "9" get messages, the button stays off; every page removed -> off with its message', async ({ page }) => {
  await open(page, FIVE);
  await mode(page, '범위대로 나누기');
  await page.locator('#ps-ranges').fill('3-1');
  await expect(page.locator('#ps-ranges-error')).toHaveText('쪽 범위는 작은 번호부터 「3-5」처럼 입력해 주세요.');
  await expect(page.locator('#ps-ranges')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#ps-run')).toBeDisabled();
  await page.locator('#ps-ranges').fill('1-2\n9');
  await expect(page.locator('#ps-ranges-error')).toHaveText('2번째 줄: 남은 쪽은 5쪽까지입니다. 1부터 5 사이의 쪽 번호를 입력해 주세요.');
  await expect(page.locator('#ps-run')).toBeDisabled();
  await page.locator('#ps-ranges').fill('1-2');
  await expect(page.locator('#ps-ranges-error')).toHaveText('');
  await expect(page.locator('#ps-run')).toBeEnabled();

  await mode(page, '편집한 PDF 하나로');
  // 「고른 쪽 빼기」 disables itself once its pages are out: focus moves to 「모두 선택」, or to the first 되살리기 when
  // no page is left to choose (U2 review).
  await row(page, 4).locator('[data-role="pick"]').check();
  await page.locator('#ps-remove-sel').click();
  await expect(page.locator('#ps-all')).toBeFocused();
  await page.locator('#ps-all').click();
  await expect(page.locator('#ps-all')).toHaveText('선택 해제');
  await page.locator('#ps-remove-sel').click();
  await expect(page.locator('#ps-list li.removed')).toHaveCount(5);
  await expect(row(page, 0).locator('[data-role="remove"]')).toBeFocused();
  await expect(page.locator('#ps-run')).toBeDisabled();
  await expect(page.locator('#ps-hint')).toHaveText('쪽을 하나 이상 남겨 주세요.');
  await row(page, 0).locator('[data-role="remove"]').click();
  await expect(page.locator('#ps-run')).toBeEnabled();
});

test('encrypted PDF: password prompt, wrong then right; the saved PDF opens without a password and says so', async ({ page }) => {
  await open(page, runtimePath('encrypted_userpw_1234'));
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', 'locked');
  await expect(page.locator('#ps-pw-input')).toBeFocused();
  await page.locator('#ps-pw-input').fill('0000');
  await page.locator('#ps-pw-input').press('Enter');
  await expect(page.locator('#ps-pw-error')).toHaveText('비밀번호가 맞지 않습니다. 다시 입력해 주세요.');
  await page.locator('#ps-pw-input').fill('1234');
  await page.locator('#ps-pw-input').press('Enter');
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#ps-info')).toHaveText(/^7쪽 · /);
  await row(page, 0).locator('[data-role="remove"]').click();
  const { name, bytes } = await save(page);
  expect(name).toBe('encrypted_userpw_1234_편집.pdf');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  expect(doc.getPageCount()).toBe(6);
  expect(doc.isEncrypted).toBe(false);
  await expect(page.locator('#ps-notes')).toContainText('저장한 PDF에는 비밀번호가 걸려 있지 않습니다.');
});

test('signed PDF: the result warns that the signature is no longer valid; an unsigned one shows no note; an owner-only file gets the merge note', async ({ page }) => {
  await open(page, runtimePath('signed_fake'));
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', 'ready');
  await save(page);
  await expect(page.locator('#ps-notes')).toContainText('전자서명이 들어 있는 문서입니다.');

  await page.locator('#ps-reset').click();
  await page.setInputFiles('#ps-input', FIVE);
  await save(page);
  await expect(page.locator('#ps-notes')).toBeHidden();

  await page.locator('#ps-reset').click();
  await page.setInputFiles('#ps-input', runtimePath('owner_restricted'));
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#ps-notice')).toHaveText('보안 설정(편집 제한)이 해제된 사본이 만들어집니다.');
});

test('page pictures are drawn for the rows and turn with 돌리기; a file that is not a PDF gets a message', async ({ page }) => {
  await open(page, FIVE);
  await expect(page.locator('#ps-notice')).toBeHidden();
  await expect(page.locator('#ps-run')).toHaveAttribute('aria-describedby', 'ps-hint');
  await expect(page.locator('#ps-list .thumb canvas')).toHaveCount(5);
  await row(page, 0).locator('[data-role="rotate"]').click();
  await expect(row(page, 0).locator('.thumb canvas')).toHaveAttribute('style', /rotate\(90deg\)/);

  await page.locator('#ps-change').click();
  await page.setInputFiles('#ps-input', runtimePath('not_a_pdf'));
  await expect(page.locator('#ps-error')).toHaveText('PDF 파일이 아닙니다. PDF 파일을 골라 주세요.');
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', 'empty');

  // Two PDFs dropped at once: the first opens and the notice saying so stays after the open (U2 review).
  const dt = await page.evaluateHandle((b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const t = new DataTransfer();
    for (const name of ['a.pdf', 'b.pdf']) t.items.add(new File([bin], name, { type: 'application/pdf' }));
    return t;
  }, readFileSync(FIVE).toString('base64'));
  await page.dispatchEvent('#ps-drop', 'dragover', { dataTransfer: dt });
  await page.dispatchEvent('#ps-drop', 'drop', { dataTransfer: dt });
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#ps-notice')).toHaveText('PDF 파일은 한 번에 하나만 편집할 수 있어 첫 번째 파일만 열었습니다.');
  await expect(page.locator('#ps-list li')).toHaveCount(5);
});

test('axe: the page list (a removed and a turned page, 범위대로 나누기 with an error) and the result have no serious or critical violations', async ({ page }) => {
  const serious = async () =>
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ') + ' ' + n.failureSummary).join(' | ')}`);
  await open(page, FIVE);
  await expect(page.locator('#ps-list .thumb canvas')).toHaveCount(5);
  await row(page, 1).locator('[data-role="remove"]').click();
  await row(page, 2).locator('[data-role="rotate"]').click();
  await mode(page, '범위대로 나누기');
  await page.locator('#ps-ranges').fill('9');
  // At phone widths the sticky actions bar covers whatever row is behind it at this scroll position (the PDF 합치기
  // pattern); axe would count that row's buttons as obscured. The list is checked scrolled to its top.
  await page.locator('#ps-list').evaluate((e) => e.scrollIntoView({ block: 'start' }));
  expect(await serious()).toEqual([]);
  await page.locator('#ps-ranges').fill('1-2\n3');
  await save(page);
  expect(await serious()).toEqual([]);
});

test('pointer drag moves a page through the same path as the buttons', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mouse drag; the shared drag helper has its touch test in polish.spec (PDF 합치기).');
  await open(page, FIVE);
  await expect(page.locator('#ps-list > li')).toHaveCount(5);
  const h = (await row(page, 0).locator('.drag-handle').boundingBox())!;
  const last = (await row(page, 2).boundingBox())!;
  const from = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
  const toY = last.y + last.height * 0.75;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(from.x, from.y + ((toY - from.y) * k) / 8);
  await page.mouse.up();
  await expect.poll(() => page.locator('#ps-list > li').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id))).toEqual(['1', '2', '0', '3', '4']);
  await expect(page.locator('#ps-status')).toHaveText('원래 1쪽을 5개 중 3번째로 옮겼습니다.');
});

test('the controller, pdf.js and pdf-lib load only after the first interaction, not with the page', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(new URL(r.url()).pathname);
  });
  await gotoReady(page, '/pdf-split/');
  await page.waitForTimeout(500);
  expect(scripts.filter((s) => /\/pdf\.[\w-]{8}\.js$|inspect|pdfjs|pdf\.worker|merge\.worker|controller/.test(s))).toEqual([]);
});
