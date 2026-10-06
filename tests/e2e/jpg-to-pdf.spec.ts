// 사진 PDF 변환 (TOOLS4 T2) end to end: three photos (a plain portrait JPEG, an EXIF orientation-6 JPEG, a PNG with
// alpha), the PNG moved from last to first, A4 and 사진 크기에 맞춤; the downloaded PDF is parsed here with pdf-lib.
import { readFileSync } from 'node:fs';
import type { Download, Page } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { expect, gotoReady, test } from './no-upload';
import { photoFixture, photoRuntime } from './paths';

const PORTRAIT = photoFixture('portrait_pd.jpg'); // 1400×1750, no EXIF: embedded as it is
const EXIF6 = photoFixture('exif6_gps.jpg'); // stored 1200×900, orientation 6: shown 900×1200, re-drawn
const ALPHA = photoFixture('alpha.png'); // 800×600 with transparency: PNG
const A4_W = 595.28;
const A4_H = 841.89;

const items = (page: Page) => page.locator('#jp-list > li');
const item = (page: Page, name: string) => items(page).filter({ has: page.locator('.name', { hasText: name }) });

const canDraw = (page: Page): Promise<boolean> =>
  page.evaluate(() => typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function' && new OffscreenCanvas(1, 1).getContext('2d') !== null);

async function open(page: Page): Promise<void> {
  await gotoReady(page, '/jpg-to-pdf/');
  test.skip(!(await canDraw(page)), 'This browser has no OffscreenCanvas (Playwright WebKit on Windows).');
  await expect(page.locator('#jp-tool')).toHaveAttribute('data-state', 'empty');
}

async function addChecked(page: Page, paths: string[]): Promise<void> {
  await page.setInputFiles('#jp-input', paths);
  await expect(items(page)).toHaveCount(paths.length);
  await expect(page.locator('#jp-list .thumb-ph', { hasText: '확인 중' })).toHaveCount(0);
}

async function buildBytes(page: Page): Promise<Uint8Array> {
  await page.locator('#jp-run').click();
  await expect(page.locator('#jp-tool')).toHaveAttribute('data-state', 'done', { timeout: 45_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: '내려받기' }).click()]);
  return new Uint8Array(readFileSync(await (download as Download).path()));
}

/** Builds, downloads and parses the PDF (updateMetadata off: the producer must stay as the tool wrote it). */
const build = async (page: Page): Promise<PDFDocument> => PDFDocument.load(await buildBytes(page), { updateMetadata: false });

const sizes = (doc: PDFDocument) => doc.getPages().map((p) => p.getSize());

test('A4: three photos, the PNG moved to the front, pages in that order, the orientation-6 photo upright, metadata only 문서딱', async ({ page }) => {
  await open(page);
  await addChecked(page, [PORTRAIT, EXIF6, ALPHA]);
  await expect(item(page, 'portrait_pd.jpg').locator('canvas')).toHaveCount(1);
  await expect(page.locator('#jp-run')).toHaveText('사진 3장으로 PDF 만들기');
  await expect(page.locator('input[name="jp-page"][value="a4"]')).toBeChecked();
  // Move the last (PNG) to the front with the buttons.
  await page.getByRole('button', { name: 'alpha.png 위로 이동' }).click();
  await page.getByRole('button', { name: 'alpha.png 위로 이동' }).click();
  await expect(items(page).first()).toContainText('alpha.png');
  await expect(page.locator('#jp-status')).toContainText('1번째');

  const doc = await build(page);
  await expect(page.locator('#jp-summary')).toHaveText(/^3쪽 · [\d.,]+ (KB|MB)$/);
  await expect(page.locator('#jp-save-name')).toHaveText('저장될 이름: alpha.pdf');
  const [first, second, third] = sizes(doc);
  // Landscape PNG -> landscape A4; the two portrait photos (one only after its EXIF rotation) -> portrait A4.
  expect(first!.width).toBeCloseTo(A4_H, 0);
  expect(first!.height).toBeCloseTo(A4_W, 0);
  for (const s of [second!, third!]) {
    expect(Math.abs(s.width - A4_W)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(s.height - A4_H)).toBeLessThanOrEqual(0.5);
  }
  expect(doc.getProducer()).toBe('문서딱');
  expect(doc.getCreator()).toBe('문서딱');
  expect(doc.getTitle()).toBeUndefined();

  await page.getByRole('button', { name: '다른 사진 처리하기' }).click();
  await expect(page.locator('#jp-tool')).toHaveAttribute('data-state', 'empty');
});

test('사진 크기에 맞춤: each page has its photo\'s shape (order kept), the orientation-6 photo is portrait 3:4; a turned photo turns its page', async ({ page }) => {
  await open(page);
  await addChecked(page, [PORTRAIT, EXIF6, ALPHA]);
  await page.locator('label.chip', { hasText: '사진 크기에 맞춤' }).click();
  await expect(page.locator('#jp-orient-group')).toBeHidden();
  await expect(page.locator('#jp-margin-group')).toBeHidden();
  let doc = await build(page);
  const ratios = sizes(doc).map((s) => s.width / s.height);
  expect(ratios[0]).toBeCloseTo(1400 / 1750, 2);
  expect(ratios[1]).toBeCloseTo(900 / 1200, 2);
  expect(ratios[2]).toBeCloseTo(800 / 600, 2);
  for (const s of sizes(doc)) expect(Math.max(s.width, s.height)).toBeCloseTo(A4_H, 1);

  // Turn the PNG once to the right: its page becomes portrait 3:4.
  await page.getByRole('button', { name: '다른 사진 처리하기' }).click();
  await addChecked(page, [ALPHA]);
  await page.getByRole('button', { name: 'alpha.png 오른쪽으로 돌리기' }).click();
  await expect(item(page, 'alpha.png').locator('.info')).toContainText('90° 돌림');
  doc = await build(page);
  const [s] = sizes(doc);
  expect(s!.width / s!.height).toBeCloseTo(600 / 800, 2);
});

test('a file that is not a photo gets a row message and blocks the run until removed; the other photos stay', async ({ page }) => {
  await open(page);
  await addChecked(page, [PORTRAIT, photoRuntime('not_image.txt')]);
  const bad = item(page, 'not_image.txt');
  await expect(bad.locator('.file-error')).toHaveText('사진 파일이 아닙니다. JPG·PNG·WebP 파일을 선택해 주세요.');
  await expect(page.locator('#jp-run')).toBeDisabled();
  await expect(page.locator('#jp-hint')).toHaveText('문제가 있는 사진을 목록에서 빼면 PDF를 만들 수 있습니다.');
  await page.getByRole('button', { name: 'not_image.txt 삭제' }).click();
  await expect(items(page)).toHaveCount(1);
  await expect(page.locator('#jp-run')).toBeEnabled();
  const doc = await build(page);
  expect(doc.getPageCount()).toBe(1);
});

test('a JPEG with EXIF (GPS) and a comment goes in as it is, without them: the PDF holds no EXIF, GPS or comment', async ({ page }) => {
  await open(page);
  await addChecked(page, [photoRuntime('small_60k.jpg')]);
  const bytes = await buildBytes(page);
  const text = Buffer.from(bytes).toString('latin1');
  expect(text).toContain('/DCTDecode');
  expect(text).not.toContain(`Exif${String.fromCharCode(0)}`);
  expect(text).not.toMatch(/GPS/);
  expect(text).not.toContain('camera comment');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  expect(doc.getPageCount()).toBe(1);
});

test('HEIC this device cannot open: the iPhone guidance on the row (Chromium)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Only Chromium is known not to decode HEIC (Safari may).');
  await open(page);
  await addChecked(page, [photoRuntime('fake.heic')]);
  await expect(item(page, 'fake.heic').locator('.file-error')).toContainText('아이폰 설정 > 카메라 > 포맷에서 「높은 호환성」');
  await expect(page.locator('#jp-run')).toBeDisabled();
});

test('the controller and pdf-lib load only after the first interaction, not with the page', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(new URL(r.url()).pathname);
  });
  await gotoReady(page, '/jpg-to-pdf/');
  await page.waitForTimeout(500);
  expect(scripts.filter((s) => /images\.worker|controller/.test(s))).toEqual([]);
});
