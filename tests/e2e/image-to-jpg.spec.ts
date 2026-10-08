// 사진 JPG 변환 (TOOLS5 U1) end to end. The downloads are checked here in Node: type by magic bytes, pixels with
// @napi-rs/canvas, metadata with the site's own sniffer, ZIP entries with fflate. No OffscreenCanvas is needed (the
// page draws on an HTMLCanvasElement), so every project runs every test, Playwright WebKit on Windows included.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { Download, Page } from '@playwright/test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { unzipSync } from 'fflate';
import { sniffImage } from '../../src/lib/image/sniff';
import { expect, gotoReady, test } from './no-upload';
import { photoFixture, photoRuntime } from './paths';

const ALPHA = photoFixture('alpha.png'); // 800×600, transparent corners
const EXIF6 = photoFixture('exif6_gps.jpg'); // stored 1200×900, orientation 6, GPS: shown 900×1200
const PORTRAIT = photoFixture('portrait_pd.jpg'); // 1400×1750, no EXIF
const ANIM = photoFixture('anim.gif'); // 16×16, frame 1 white, frame 2 red

const items = (page: Page) => page.locator('#ij-list > li');
const item = (page: Page, name: string) => items(page).filter({ has: page.locator('.name', { hasText: name }) });

async function open(page: Page): Promise<void> {
  await gotoReady(page, '/image-to-jpg/');
  await expect(page.locator('#ij-tool')).toHaveAttribute('data-state', 'empty');
}

type Pick = string | { name: string; mimeType: string; buffer: Buffer };

const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', heic: 'image/heic', txt: 'text/plain' };

/** Playwright takes paths or buffers in one call, not both: paths become buffers when the two are mixed. */
const asBuffer = (p: Pick): Exclude<Pick, string> =>
  typeof p === 'string' ? { name: basename(p), mimeType: MIME[p.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream', buffer: readFileSync(p) } : p;

async function addChecked(page: Page, files: Pick[]): Promise<void> {
  const mixed = files.some((f) => typeof f !== 'string');
  await page.setInputFiles('#ij-input', (mixed ? files.map(asBuffer) : files) as Parameters<Page['setInputFiles']>[1]);
  await expect(items(page)).toHaveCount(files.length);
  await expect(page.locator('#ij-list .thumb-ph', { hasText: '확인 중' })).toHaveCount(0);
}

async function choose(page: Page, label: string): Promise<void> {
  await page.locator('label.chip', { hasText: label }).click();
}

/** Converts, waits for the result and downloads the main file. */
async function convert(page: Page): Promise<{ name: string; bytes: Uint8Array }> {
  await page.locator('#ij-run').click();
  await expect(page.locator('#ij-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#ij-download').click()]);
  const d = download as Download;
  return { name: d.suggestedFilename(), bytes: new Uint8Array(readFileSync(await d.path())) };
}

async function pixels(bytes: Uint8Array): Promise<{ w: number; h: number; at(x: number, y: number): number[] }> {
  const img = await loadImage(Buffer.from(bytes));
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  return { w: img.width, h: img.height, at: (x, y) => Array.from(d.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)) };
}

const ascii = (b: Uint8Array, from: number, to: number): string => String.fromCharCode(...b.subarray(from, to));

test('PNG with transparency -> JPG: a JPEG with white where it was clear, the note on the row, {base}.jpg', async ({ page }) => {
  await open(page);
  await addChecked(page, [ALPHA]);
  await expect(page.locator('#ij-run')).toHaveText('사진 1장 변환하기');
  await expect(page.locator('input[name="ij-to"][value="jpg"]')).toBeChecked();
  const out = await convert(page);
  expect(out.name).toBe('alpha.jpg');
  expect([out.bytes[0], out.bytes[1]]).toEqual([0xff, 0xd8]);
  const p = await pixels(out.bytes);
  expect([p.w, p.h]).toEqual([800, 600]);
  for (const v of p.at(2, 2).slice(0, 3)) expect(v).toBeGreaterThan(245);
  await expect(item(page, 'alpha.png').locator('.row-note')).toHaveText('투명한 부분은 흰색으로 바뀝니다.');
  await expect(page.locator('#ij-save-name')).toHaveText('저장될 이름: alpha.jpg');
  await expect(page.locator('#ij-headline')).toHaveText('JPG 사진이 준비되었습니다');
});

test('PNG with transparency -> PNG keeps the alpha; -> WebP gives RIFF/WEBP bytes with the alpha kept (on every engine)', async ({ page }) => {
  await open(page);
  await addChecked(page, [ALPHA]);
  await choose(page, 'PNG');
  await expect(page.locator('#ij-quality-group')).toBeHidden();
  let out = await convert(page);
  expect(out.name).toBe('alpha.png');
  expect(ascii(out.bytes, 1, 4)).toBe('PNG');
  expect((await pixels(out.bytes)).at(2, 2)[3]).toBe(0);

  await page.getByRole('button', { name: '다른 사진 처리하기' }).click();
  await addChecked(page, [ALPHA]);
  await choose(page, 'WebP');
  await expect(page.locator('#ij-quality-group')).toBeVisible();
  out = await convert(page);
  expect(out.name).toBe('alpha.webp');
  expect(ascii(out.bytes, 0, 4)).toBe('RIFF');
  expect(ascii(out.bytes, 8, 12)).toBe('WEBP');
  expect((await pixels(out.bytes)).at(2, 2)[3]).toBe(0);
});

test('WebP where the canvas cannot save it (toBlob gives PNG, as Safari may): the @jsquash/webp worker makes RIFF/WEBP with the alpha kept', async ({ page }) => {
  // Every engine Playwright ships saves WebP itself (logged probe), so the fallback is forced here.
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, type?: string, q?: number) {
      real.call(this, cb, type === 'image/webp' ? 'image/png' : type, q);
    };
  });
  await open(page);
  await addChecked(page, [ALPHA]);
  await choose(page, 'WebP');
  const out = await convert(page);
  expect(out.name).toBe('alpha.webp');
  expect(ascii(out.bytes, 0, 4)).toBe('RIFF');
  expect(ascii(out.bytes, 8, 12)).toBe('WEBP');
  const p = await pixels(out.bytes);
  expect([p.w, p.h]).toEqual([800, 600]);
  expect(p.at(2, 2)[3]).toBe(0);
});

test('WebP fails on this device (canvas gives PNG, the fallback encoder does not load): the row says so; 저장 형식 JPG brings it back and it converts (review Must Fix)', async ({ page }) => {
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, type?: string, q?: number) {
      real.call(this, cb, type === 'image/webp' ? 'image/png' : type, q);
    };
  });
  await page.route(/webp_enc/, (route) => route.abort());
  await open(page);
  await addChecked(page, [ALPHA]);
  await choose(page, 'WebP');
  await page.locator('#ij-run').click();
  await expect(item(page, 'alpha.png').locator('.file-error')).toHaveText('이 형식으로 저장하지 못했습니다. 다른 저장 형식을 골라 다시 해 주세요.', { timeout: 30_000 });
  await expect(page.locator('#ij-tool')).toHaveAttribute('data-state', 'listing');
  // The same format may be retried: the run button stays on.
  await expect(page.locator('#ij-run')).toHaveText('사진 1장 변환하기');
  await expect(page.locator('#ij-run')).toBeEnabled();
  await choose(page, 'JPG');
  await expect(item(page, 'alpha.png').locator('.file-error')).toHaveCount(0);
  const out = await convert(page);
  expect(out.name).toBe('alpha.jpg');
  expect([out.bytes[0], out.bytes[1]]).toEqual([0xff, 0xd8]);
});

test('orientation-6 JPEG with GPS -> upright, no EXIF or GPS; a JPEG with GPS and a comment at 높음 -> stripped as is, no EXIF, GPS or comment', async ({ page }) => {
  await open(page);
  await addChecked(page, [EXIF6]);
  let out = await convert(page);
  let s = sniffImage(out.bytes);
  expect([s.width, s.height]).toEqual([900, 1200]);
  expect([s.hasExif, s.hasGps, s.hasXmp]).toEqual([false, false, false]);

  await page.getByRole('button', { name: '다른 사진 처리하기' }).click();
  const tagged = photoRuntime('small_60k.jpg');
  await addChecked(page, [tagged]);
  out = await convert(page);
  s = sniffImage(out.bytes);
  expect([s.hasExif, s.hasGps, s.hasXmp]).toEqual([false, false, false]);
  expect(Buffer.from(out.bytes).toString('latin1')).not.toContain('camera comment');
  // The strip path keeps the scan data: the file is the original minus its metadata.
  expect(out.bytes.length).toBeLessThan(readFileSync(tagged).length);
  expect(out.bytes.length).toBeGreaterThan(readFileSync(tagged).length - 2_000);

  // 보통: re-encoded even when upright, still no metadata.
  await page.getByRole('button', { name: '다른 사진 처리하기' }).click();
  await addChecked(page, [tagged]);
  await choose(page, '보통');
  out = await convert(page);
  s = sniffImage(out.bytes);
  expect([s.hasExif, s.hasGps]).toEqual([false, false]);
});

test('three photos -> one ZIP {first}_jpg.zip with three unique names; each row has its own download', async ({ page }) => {
  await open(page);
  await addChecked(page, [photoRuntime('scene.jpg'), photoRuntime('scene.png'), ALPHA]);
  await expect(page.locator('#ij-run')).toHaveText('사진 3장 변환하기');
  const out = await convert(page);
  expect(out.name).toBe('scene_jpg.zip');
  const files = unzipSync(out.bytes);
  expect(Object.keys(files)).toEqual(['scene.jpg', 'scene_2.jpg', 'alpha.jpg']);
  for (const b of Object.values(files)) expect([b[0], b[1]]).toEqual([0xff, 0xd8]);
  await expect(page.locator('#ij-headline')).toHaveText('JPG 사진 3장이 ZIP 파일로 준비되었습니다');
  const rowLinks = page.locator('#ij-list a[data-role="download"]');
  await expect(rowLinks).toHaveCount(3);
  await expect(rowLinks.nth(1)).toHaveAttribute('download', 'scene_2.jpg');
  const [d] = await Promise.all([page.waitForEvent('download'), rowLinks.nth(2).click()]);
  expect((d as Download).suggestedFilename()).toBe('alpha.jpg');
});

test('animated GIF: the first frame and the note (Unverified c)', async ({ page }) => {
  await open(page);
  await addChecked(page, [ANIM]);
  await choose(page, 'PNG');
  const out = await convert(page);
  const p = await pixels(out.bytes);
  expect(p.at(8, 8).slice(0, 3)).toEqual([255, 255, 255]);
  await expect(item(page, 'anim.gif').locator('.row-note')).toHaveText('움직이는 사진은 첫 장면만 저장했습니다.');
});

test('TIFF and a text file: row messages; the other photo still converts', async ({ page }) => {
  await open(page);
  const tiff = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, ...new Array(64).fill(0)]);
  await addChecked(page, [{ name: 'scan.tif', mimeType: 'image/tiff', buffer: tiff }, photoRuntime('not_image.txt'), PORTRAIT]);
  await expect(item(page, 'scan.tif').locator('.file-error')).toHaveText('TIFF 형식은 아직 바꿀 수 없습니다.');
  await expect(item(page, 'not_image.txt').locator('.file-error')).toHaveText('사진 파일이 아닙니다. JPG·PNG·WebP 파일을 선택해 주세요.');
  await expect(page.locator('#ij-run')).toHaveText('사진 1장 변환하기');
  await expect(page.locator('#ij-hint')).toHaveText('문제가 있는 사진은 빼고 바꿉니다.');
  const out = await convert(page);
  expect(out.name).toBe('portrait_pd.jpg');
  await expect(page.locator('#ij-summary')).toContainText('바꾸지 못한 사진 2장');
});

test('HEIC this device cannot open: the iPhone guidance on the row, the other photo converts (Chromium, Firefox)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Safari may decode HEIC.');
  await open(page);
  await addChecked(page, [photoRuntime('fake.heic'), PORTRAIT]);
  await expect(item(page, 'fake.heic').locator('.file-error')).toContainText('아이폰 설정 > 카메라 > 포맷에서 「높은 호환성」');
  await expect(page.locator('#ij-run')).toBeEnabled();
  const out = await convert(page);
  expect(out.name).toBe('portrait_pd.jpg');
});

test('취소 while converting: back to the list with every photo kept, no file offered, the photo in progress dropped; a new run still works', async ({ page }) => {
  await open(page);
  // A mid-size photo: the one in progress when 취소 lands must finish within the wait below (the page is busy meanwhile).
  const photo = readFileSync(PORTRAIT);
  const files = Array.from({ length: 4 }, (_, i) => ({ name: `big_${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: photo }));
  await addChecked(page, files);
  await choose(page, 'PNG');
  // 취소 lands while the first photo is still being drawn (engines differ too much in speed to race a click).
  await page.evaluate(() => {
    document.getElementById('ij-run')!.click();
    document.getElementById('ij-cancel')!.click();
  });
  await expect(page.locator('#ij-tool')).toHaveAttribute('data-state', 'listing');
  await expect(page.locator('#ij-status')).toHaveText('변환을 멈췄습니다. 사진 목록은 그대로 있습니다.');
  await expect(items(page)).toHaveCount(4);
  await expect(page.locator('#ij-run')).toBeFocused();
  // The photo that was in progress finishes in the background and is dropped: no result, no links.
  await page.waitForTimeout(3_000);
  await expect(page.locator('#ij-tool')).toHaveAttribute('data-state', 'listing');
  await expect(page.locator('#ij-download')).not.toHaveAttribute('href');
  await expect(page.locator('#ij-list a[data-role="download"]')).toHaveCount(0);

  for (const [k, n] of [3, 4].entries()) {
    await page.getByRole('button', { name: `big_${n}.jpg 삭제` }).click();
    await expect(items(page), `after removing big_${n}`).toHaveCount(3 - k);
  }
  await choose(page, 'JPG');
  const out = await convert(page);
  expect(Object.keys(unzipSync(out.bytes))).toEqual(['big_1.jpg', 'big_2.jpg']);
});

test('the controller loads only after the first interaction, not with the page', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(new URL(r.url()).pathname);
  });
  await gotoReady(page, '/image-to-jpg/');
  await page.waitForTimeout(500);
  expect(scripts.filter((s) => /controller|webp_enc|wasm-browser/.test(s))).toEqual([]);
  await page.setInputFiles('#ij-input', PORTRAIT);
  await expect(items(page)).toHaveCount(1);
  expect(scripts.some((s) => /controller/.test(s))).toBe(true);
  expect(scripts.filter((s) => /webp_enc/.test(s))).toEqual([]);
});
