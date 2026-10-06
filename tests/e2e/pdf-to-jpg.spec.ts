// PDF JPG 변환 (TOOLS4 T3) end to end: a generated 3-page PDF (A4, Letter, A4 landscape) -> ZIP of 3 JPEGs with the
// sizes points / 72 × ppi; one page -> one JPEG; a /Rotate 90 page comes out turned; the encrypted fixture asks for its
// password; a range past the last page and a non-PDF get messages. The downloads are parsed here.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Download, Page } from '@playwright/test';
import { PDFDocument, rgb } from '@cantoo/pdf-lib';
import { unzipSync } from 'fflate';
import { readJfif } from '../../src/lib/image/jfif';
import { RESTRICTED_NOTE } from '../../src/tools/pdf-to-jpg/guards';
import { expect, gotoReady, test } from './no-upload';
import { RUNTIME_DIR, fixturePath, runtimePath } from './paths';

// One copy per worker process: a shared path was rewritten by another worker's beforeAll while this one read it.
const THREE = join(RUNTIME_DIR, `pj-${process.pid}`, 'pdf_to_jpg_3p.pdf');
const SIZES: [number, number][] = [
  [595.28, 841.89],
  [612, 792],
  [841.89, 595.28],
];
const px = (pt: number, ppi: number): number => Math.round((pt / 72) * ppi);

test.beforeAll(async () => {
  const doc = await PDFDocument.create();
  for (const [i, [w, h]] of SIZES.entries()) {
    const p = doc.addPage([w, h]);
    p.drawRectangle({ x: 40, y: 40, width: w / 2, height: h / 3, color: rgb(i === 0 ? 1 : 0, i === 1 ? 0.6 : 0, i === 2 ? 1 : 0) });
  }
  mkdirSync(dirname(THREE), { recursive: true });
  writeFileSync(THREE, await doc.save());
});

/** Width and height from the first SOF marker of a JPEG. */
function jpegSize(b: Uint8Array): { w: number; h: number } {
  expect([b[0], b[1]]).toEqual([0xff, 0xd8]);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error('bad marker');
    const m = b[i + 1]!;
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5]! << 8) | b[i + 6]!, w: (b[i + 7]! << 8) | b[i + 8]! };
    i += 2 + len;
  }
  throw new Error('no SOF');
}

async function open(page: Page, path: string): Promise<void> {
  await gotoReady(page, '/pdf-to-jpg/');
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'empty');
  await page.setInputFiles('#pj-input', path);
}

async function convert(page: Page): Promise<{ name: string; bytes: Uint8Array }> {
  await page.locator('#pj-run').click();
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'done', { timeout: 45_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: '내려받기' }).click()]);
  const d = download as Download;
  return { name: d.suggestedFilename(), bytes: new Uint8Array(readFileSync(await d.path())) };
}

test('all pages at 보통: one ZIP with three JPEGs, each points / 72 × 150 pixels, named {base}_p001.jpg …', async ({ page }) => {
  await open(page, THREE);
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pj-info')).toHaveText(/^3쪽 · /);
  await expect(page.locator('input[name="pj-ppi"][value="p150"]')).toBeChecked();
  await expect(page.locator('#pj-run')).toHaveText('3쪽을 JPG로 변환');
  await expect(page.locator('#pj-range-hint')).toHaveText('비워 두면 모든 쪽(3쪽)을 변환합니다.');
  await expect(page.locator('#pj-hint')).toContainText('A4 한 쪽이 1,240×1,754픽셀 사진이 됩니다.');
  const { name, bytes } = await convert(page);
  expect(name).toBe('pdf_to_jpg_3p_jpg.zip');
  await expect(page.locator('#pj-headline')).toHaveText('JPG 사진 3장이 ZIP 파일로 준비되었습니다');
  await expect(page.locator('#pj-summary')).toHaveText(/^3쪽 · ZIP · [\d.,]+ (KB|MB)$/);
  await expect(page.locator('#pj-notes')).toBeHidden();
  const files = unzipSync(bytes);
  expect(Object.keys(files)).toEqual(['pdf_to_jpg_3p_p001.jpg', 'pdf_to_jpg_3p_p002.jpg', 'pdf_to_jpg_3p_p003.jpg']);
  Object.values(files).forEach((f, i) => {
    const s = jpegSize(f);
    expect(Math.abs(s.w - px(SIZES[i]![0], 150)), `page ${i + 1} width`).toBeLessThanOrEqual(1);
    expect(Math.abs(s.h - px(SIZES[i]![1], 150)), `page ${i + 1} height`).toBeLessThanOrEqual(1);
    // The JFIF header says 150 pixels per inch, so Word/HWP insert the page at paper size (T3 review Should Fix 5).
    expect(readJfif(f), `page ${i + 1} density`).toEqual({ units: 1, x: 150, y: 150 });
  });
});

test('range "2": one JPEG of the Letter page; 선명 draws page 1 at 300 ppi; 다시 변환 keeps the file', async ({ page }) => {
  await open(page, THREE);
  await page.locator('#pj-range').fill('2');
  await expect(page.locator('#pj-run')).toHaveText('1쪽을 JPG로 변환');
  let out = await convert(page);
  expect(out.name).toBe('pdf_to_jpg_3p_p002.jpg');
  await expect(page.locator('#pj-headline')).toHaveText('JPG 사진이 준비되었습니다');
  await expect(page.locator('#pj-summary')).toHaveText(/^2쪽 · JPG · /);
  expect(jpegSize(out.bytes)).toEqual({ w: px(612, 150), h: px(792, 150) });

  await page.getByRole('button', { name: '쪽·선명도 바꿔 다시 변환' }).click();
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'ready');
  await page.locator('#pj-range').fill('1');
  await page.locator('label.chip', { hasText: '선명' }).click();
  await expect(page.locator('#pj-hint')).toContainText('2,480×3,508픽셀');
  out = await convert(page);
  expect(jpegSize(out.bytes)).toEqual({ w: 2480, h: 3508 });
  expect(readJfif(out.bytes)).toEqual({ units: 1, x: 300, y: 300 });
});

test('a page with /Rotate 90 comes out turned (landscape)', async ({ page }) => {
  await open(page, fixturePath('gen_landscape_rotated.pdf'));
  await page.locator('#pj-range').fill('2');
  const { bytes } = await convert(page);
  const s = jpegSize(bytes);
  expect(s.w).toBeGreaterThan(s.h);
  expect(Math.abs(s.w - 1754)).toBeLessThanOrEqual(1);
});

test('encrypted PDF: password prompt, a wrong one gets a retry message, the right one opens it', async ({ page }) => {
  await open(page, runtimePath('encrypted_userpw_1234'));
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'locked');
  await expect(page.locator('#pj-pw-input')).toBeFocused();
  await page.locator('#pj-pw-input').fill('0000');
  await page.getByRole('button', { name: '확인' }).click();
  await expect(page.locator('#pj-pw-error')).toHaveText('비밀번호가 맞지 않습니다. 다시 입력해 주세요.');
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'locked');
  await page.locator('#pj-pw-input').fill('1234');
  await page.locator('#pj-pw-input').press('Enter');
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pj-info')).toHaveText(/^7쪽 · /);
  await page.locator('#pj-range').fill('1');
  const { name, bytes } = await convert(page);
  expect(name).toBe('encrypted_userpw_1234_p001.jpg');
  expect(jpegSize(bytes).w).toBeGreaterThan(500);
});

test('password submitted twice at once (double Enter): one attempt, the file opens and converts (T3 review Should Fix 1)', async ({ page }) => {
  await open(page, runtimePath('encrypted_userpw_1234'));
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'locked');
  await page.locator('#pj-pw-input').fill('1234');
  await page.locator('#pj-pw').evaluate((f: HTMLFormElement) => {
    f.requestSubmit();
    f.requestSubmit();
  });
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pj-info')).toHaveText(/^7쪽 · /);
  await page.locator('#pj-range').fill('2');
  const { name } = await convert(page);
  expect(name).toBe('encrypted_userpw_1234_p002.jpg');
});

test('copy/print-limited PDF (no open password): converts with a one-line notice; an unrestricted one shows none', async ({ page }) => {
  await open(page, runtimePath('owner_no_copy'));
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pj-notice')).toHaveText(RESTRICTED_NOTE);
  await page.locator('#pj-range').fill('1');
  const { name } = await convert(page);
  expect(name).toBe('owner_no_copy_p001.jpg');
  await expect(page.locator('#pj-notice')).toHaveText(RESTRICTED_NOTE);

  await open(page, runtimePath('owner_restricted'));
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pj-notice')).toBeHidden();
});

test('range "9" on three pages and a reversed range get messages and start nothing', async ({ page }) => {
  await open(page, THREE);
  await page.locator('#pj-range').fill('9');
  await page.locator('#pj-run').click();
  await expect(page.locator('#pj-range-error')).toHaveText('이 파일은 3쪽까지 있습니다. 1부터 3 사이의 쪽 번호를 입력해 주세요.');
  await expect(page.locator('#pj-range')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'ready');
  await page.locator('#pj-range').fill('3-1');
  await expect(page.locator('#pj-range-error')).toHaveText('');
  await page.locator('#pj-range').press('Enter');
  await expect(page.locator('#pj-range-error')).toHaveText('쪽 범위는 작은 번호부터 「3-5」처럼 입력해 주세요.');
});

test('a file that is not a PDF: message, back to the picker', async ({ page }) => {
  await open(page, runtimePath('not_a_pdf'));
  await expect(page.locator('#pj-error')).toHaveText('PDF 파일이 아닙니다. PDF 파일을 골라 주세요.');
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'empty');
});

test('취소 during a run: back to ready with the file kept, nothing offered', async ({ page }) => {
  await open(page, runtimePath('scan_multi_40'));
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'ready');
  await page.locator('label.chip', { hasText: '선명' }).click();
  await page.locator('#pj-run').click();
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'working');
  await page.getByRole('button', { name: '취소' }).click();
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pj-status')).toHaveText('변환을 취소했습니다. 파일은 그대로 있습니다.');
  await expect(page.locator('#pj-info')).toHaveText(/^40쪽 · /);
  await page.waitForTimeout(1000);
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pj-download')).not.toHaveAttribute('href', /.+/);
});

test('취소, run again, 취소 again: the second cancel still stops the run (T3 review Should Fix 2)', async ({ page }) => {
  await open(page, runtimePath('scan_multi_40'));
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'ready');
  await page.locator('label.chip', { hasText: '선명' }).click();
  for (let round = 0; round < 2; round++) {
    await page.locator('#pj-run').click();
    await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'working');
    await page.getByRole('button', { name: '취소' }).click();
    await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'ready');
  }
  await page.waitForTimeout(1000);
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pj-download')).not.toHaveAttribute('href', /.+/);
});

test('the controller and pdf.js load only after the first interaction, not with the page', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(new URL(r.url()).pathname);
  });
  await gotoReady(page, '/pdf-to-jpg/');
  await page.waitForTimeout(500);
  expect(scripts.filter((s) => /\/pdf\.[\w-]{8}\.js$|inspect|pdfjs|pdf\.worker|controller/.test(s))).toEqual([]);
});
