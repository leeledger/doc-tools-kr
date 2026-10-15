// 신분증 사본 만들기 (TOOLS1015 I1) end to end. The downloads are checked here in Node: JPEG pixels with @napi-rs/canvas,
// metadata with the site's own sniffer, the PDF with pdf-lib (objects) and pdf.js (text, rendered pixels). The photo is
// exif6_gps.jpg (stored 1200×900, orientation 6, GPS: shown 900×1200), so the copy must come out upright, 900×1200,
// with no EXIF or GPS left, and the pixels under a black box must be black in the JPG and in the PDF.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Download, Page } from '@playwright/test';
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { sniffImage } from '../../src/lib/image/sniff';
import { expect, gotoReady, test } from './no-upload';
import { photoFixture, photoRuntime } from './paths';

const EXIF6 = photoFixture('exif6_gps.jpg');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const ARRIVED = '방금 만든 파일을 가져왔습니다.';
const NAME_RE = /^신분증_사본_\d{8}\.(jpg|pdf)$/;
/** The first black box on a 900 × 1200 photo (mask.ts startMask: 40 % × 12 % in the middle). */
const BOX = { x: 270, y: 528, w: 360, h: 144 };

async function open(page: Page, file = EXIF6): Promise<void> {
  await gotoReady(page, '/id-copy/');
  await expect(page.locator('#ic-tool')).toHaveAttribute('data-state', 'empty');
  await page.setInputFiles('#ic-input', file);
  await expect(page.locator('#ic-tool')).toHaveAttribute('data-state', 'editing', { timeout: 30_000 });
}

async function make(page: Page): Promise<void> {
  await page.locator('#ic-run').click();
  await expect(page.locator('#ic-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
}

async function save(page: Page, which: 'jpg' | 'pdf'): Promise<{ name: string; bytes: Uint8Array }> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(`#ic-${which}`).click()]);
  const d = download as Download;
  return { name: d.suggestedFilename(), bytes: new Uint8Array(readFileSync((await d.path())!)) };
}

async function pixels(bytes: Uint8Array): Promise<{ w: number; h: number; at(x: number, y: number): number[] }> {
  const img = await loadImage(Buffer.from(bytes));
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  return { w: img.width, h: img.height, at: (x, y) => Array.from(d.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)) };
}

/** Every pixel inside `box` (2 pixels in from its edges, every 4th) is at most `max` in each channel. */
function expectDark(p: { at(x: number, y: number): number[] }, box: typeof BOX, max = 8): void {
  for (let y = box.y + 2; y < box.y + box.h - 2; y += 4)
    for (let x = box.x + 2; x < box.x + box.w - 2; x += 4) {
      const v = p.at(x, y);
      if (v.some((c) => c > max)) throw new Error(`pixel (${x}, ${y}) = ${v.join(',')} under the box`);
    }
}

test('JPG: upright, the box burned in black, no EXIF or GPS, fixed name; axe clean while editing and when done', async ({ page }) => {
  await open(page);
  expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await page.locator('#ic-add').click();
  await expect(page.locator('.ic-box')).toHaveCount(1);
  await expect(page.locator('.ic-box')).toBeFocused();
  await expect(page.locator('#ic-mark-note')).toHaveText('용도 문구를 넣으면 다른 곳에 쓰이는 것을 막는 데 도움이 됩니다.');
  await make(page);
  const out = await save(page, 'jpg');
  expect(out.name).toMatch(NAME_RE);
  expect(out.name.endsWith('.jpg')).toBe(true);
  expect([out.bytes[0], out.bytes[1]]).toEqual([0xff, 0xd8]);
  const s = sniffImage(out.bytes);
  expect(s.hasExif).toBe(false);
  expect(s.hasGps).toBe(false);
  expect(s.orientation).toBeUndefined();
  const p = await pixels(out.bytes);
  expect([p.w, p.h]).toEqual([900, 1200]);
  expectDark(p, BOX);
  // Outside the box the photo is still there (not a black page).
  expect(p.at(100, 100).some((c) => c > 30)).toBe(true);
  await expect(page.locator('#ic-save-name')).toContainText('신분증_사본_');
  expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});

test('PDF: one A4 page, one image, no text at all, the masked area renders black', async ({ page }) => {
  await open(page);
  await page.locator('#ic-add').click();
  await make(page);
  const out = await save(page, 'pdf');
  expect(out.name).toMatch(NAME_RE);
  expect(out.name.endsWith('.pdf')).toBe(true);
  const doc = await PDFDocument.load(out.bytes, { updateMetadata: false });
  expect(doc.getPageCount()).toBe(1);
  const size = doc.getPage(0).getSize();
  expect(Math.round(size.width)).toBe(595);
  expect(Math.round(size.height)).toBe(842);
  let images = 0;
  let fonts = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFRawStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    if (!dict) continue;
    if (dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) images++;
    if (dict.get(PDFName.of('Type')) === PDFName.of('Font')) fonts++;
  }
  expect(images).toBe(1);
  expect(fonts).toBe(0);
  const task = pdfjs.getDocument({ data: out.bytes.slice(), verbosity: 0 });
  const pdf = await task.promise;
  const pg = await pdf.getPage(1);
  expect((await pg.getTextContent()).items).toHaveLength(0);
  const vp = pg.getViewport({ scale: 1 });
  const c = createCanvas(Math.round(vp.width), Math.round(vp.height));
  const ctx = c.getContext('2d');
  await pg.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, canvas: c as unknown as HTMLCanvasElement, viewport: vp }).promise;
  await task.destroy();
  // 900 × 1200 on A4 with a 10 mm margin: scale (595.28 - 2 × 28.35) / 900, centred.
  const m = 72 / 25.4 * 10;
  const k = (595.28 - 2 * m) / 900;
  const top = (841.89 - 1200 * k) / 2;
  for (const [fx, fy] of [[0.3, 0.3], [0.5, 0.5], [0.7, 0.7]]) {
    const x = Math.round(m + (BOX.x + BOX.w * fx) * k);
    const y = Math.round(top + (BOX.y + BOX.h * fy) * k);
    const v = [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    expect(v.every((ch) => ch <= 20), `(${x}, ${y}) = ${v.join(',')}`).toBe(true);
  }
});

test('용도 문구: with a place the copy changes across the photo (tiled); the date can be left out', async ({ page }) => {
  await open(page);
  await make(page);
  const plain = await pixels((await save(page, 'jpg')).bytes);
  await page.locator('#ic-edit').click();
  await expect(page.locator('#ic-tool')).toHaveAttribute('data-state', 'editing');
  await page.locator('#ic-place').fill('문서딱 회사');
  await expect(page.locator('#ic-mark-note')).toHaveText('');
  await page.locator('#ic-date').uncheck();
  await make(page);
  const marked = await pixels((await save(page, 'jpg')).bytes);
  expect([marked.w, marked.h]).toEqual([900, 1200]);
  // Changed pixels in each quarter of the photo: the watermark is repeated, not one line in the middle.
  for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    let changed = 0;
    for (let y = qy * 600; y < qy * 600 + 600; y += 3)
      for (let x = qx * 450; x < qx * 450 + 450; x += 3) {
        const a = plain.at(x, y);
        const b = marked.at(x, y);
        if (a.some((v, i) => Math.abs(v - b[i]!) > 24)) changed++;
      }
    expect(changed, `quarter ${qx},${qy}`).toBeGreaterThan(200);
  }
});

test('돌리기 turns the copy; 자르기 with Shift+arrows keeps only the chosen part', async ({ page }) => {
  await open(page);
  await page.locator('#ic-rotate').click();
  await make(page);
  const turned = await pixels((await save(page, 'jpg')).bytes);
  expect([turned.w, turned.h]).toEqual([1200, 900]);
  await page.locator('#ic-edit').click();
  await page.locator('#ic-crop').click();
  await expect(page.locator('#ic-crop')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#ic-crop')).toHaveText('자르기 끝');
  const crop = page.locator('.ic-crop-box');
  await expect(crop).toBeFocused();
  // Step = 1/200 of the long edge (6 pixels): 10 presses take 60 off the width, 5 take 30 off the height.
  for (let i = 0; i < 10; i++) await crop.press('Shift+ArrowLeft');
  for (let i = 0; i < 5; i++) await crop.press('Shift+ArrowUp');
  await page.locator('#ic-crop').click();
  await expect(page.locator('#ic-crop')).toHaveAttribute('aria-pressed', 'false');
  await make(page);
  const cropped = await pixels((await save(page, 'jpg')).bytes);
  expect([cropped.w, cropped.h]).toEqual([1140, 870]);
});

test('boxes: keys move and resize, Delete removes; at most 20', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 20; i++) await page.locator('#ic-add').click();
  await expect(page.locator('.ic-box')).toHaveCount(20);
  await expect(page.locator('#ic-add')).toBeDisabled();
  const last = page.locator('.ic-box').last();
  await last.press('Delete');
  await expect(page.locator('.ic-box')).toHaveCount(19);
  await expect(page.locator('#ic-add')).toBeEnabled();
  const box = page.locator('.ic-box').first();
  await box.focus();
  const before = await box.boundingBox();
  await box.press('ArrowRight');
  await box.press('Shift+ArrowDown');
  const after = await box.boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x);
  expect(after!.height).toBeGreaterThan(before!.height);
});

test('not a photo, and HEIC this device cannot open: plain messages, back to the picker (Chromium, Firefox for HEIC)', async ({ page, browserName }) => {
  await gotoReady(page, '/id-copy/');
  await page.setInputFiles('#ic-input', { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('not a photo') });
  await expect(page.locator('#ic-error')).toHaveText('사진 파일이 아닙니다. JPG·PNG·WebP 파일을 선택해 주세요.');
  await expect(page.locator('#ic-tool')).toHaveAttribute('data-state', 'empty');
  test.skip(browserName === 'webkit', 'Safari may decode HEIC.');
  await page.setInputFiles('#ic-input', photoRuntime('fake.heic'));
  await expect(page.locator('#ic-error')).toContainText('아이폰 사진(HEIC)');
  await expect(page.locator('#ic-tool')).toHaveAttribute('data-state', 'empty');
});

test('이어서 하기: the PDF opens in PDF 암호 걸기', async ({ page }) => {
  await open(page);
  await page.locator('#ic-add').click();
  await make(page);
  const group = page.getByRole('group', { name: '이 파일로 이어서 하기' });
  await expect(group.getByRole('button')).toHaveText(['PDF 암호 걸기', 'PDF 용량 줄이기']);
  await group.getByRole('button', { name: 'PDF 암호 걸기' }).click();
  await expect(page).toHaveURL(/\/pdf-password\/$/);
  await expect(page.locator('#pp-notice')).toHaveText(ARRIVED);
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'ask');
});

test('다른 사진으로 만들기 empties the page; nothing is kept in Web Storage', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => [localStorage.length, sessionStorage.length]);
  await page.locator('#ic-place').fill('은행');
  await make(page);
  await page.locator('#ic-reset').click();
  await expect(page.locator('#ic-tool')).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#ic-place')).toHaveValue('');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual(before);
});
