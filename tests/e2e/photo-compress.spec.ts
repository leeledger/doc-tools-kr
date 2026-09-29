// 사진 용량 줄이기 e2e (brief Step 3). Every test runs under the no-upload fixture (./no-upload).
// Outputs are parsed in Node: sniff.ts for the structure, MozJPEG/WebP decoders for pixels.
import '../helpers/image-data';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { sniffImage } from '../../src/lib/image/sniff';
import { p3ToSrgb } from '../helpers/image-writers';
import { nodeCodecs } from '../helpers/photo-deps';
import { P3_PATCHES } from '../fixtures/build-photo.mjs';
import { expect, gotoReady, test } from './no-upload';
import { photoFixture, photoRuntime } from './paths';

const PORTRAIT = photoFixture('portrait_pd.jpg');
const SCENE = photoFixture('scene_cc0.jpg');
const ENGINE = /photo\.worker|mozjpeg_|squoosh_resize|webp_enc|\/esm-|\/encode-/;
const ZIP_CHUNK = /\/_astro\/zip[.-][^/]*\.js/;
const WEBP_WASM = /\/_astro\/webp_enc(_simd)?-[^/]*\.wasm/;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const tool = (page: Page) => page.locator('#photo-tool');
const rows = (page: Page) => page.locator('#ph-list > li');
const row = (page: Page, name: string) => rows(page).filter({ has: page.locator('.name', { hasText: name }) });

/** The page-side check the controller uses (canCompressPhotos): OffscreenCanvas with 2d and convertToBlob. */
const canCompress = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') return false;
    const c = new OffscreenCanvas(1, 1);
    return c.getContext('2d') !== null && typeof c.convertToBlob === 'function';
  });
const NO_CANVAS =
  'This browser has no OffscreenCanvas (Playwright WebKit on Windows): the page shows the unsupported notice instead, asserted in its own test (Arch F1).';

async function open(page: Page): Promise<void> {
  await gotoReady(page, '/photo-compress/');
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  test.skip(!(await canCompress(page)), NO_CANVAS);
}

async function pick(page: Page, paths: string[]): Promise<void> {
  await page.setInputFiles('#ph-input', paths);
  await expect(rows(page)).toHaveCount(paths.length);
  await expect(page.locator('#ph-list .info', { hasText: '확인 중' })).toHaveCount(0);
}

async function run(page: Page, button = '사진 용량 줄이기'): Promise<void> {
  await page.getByRole('button', { name: button, exact: true }).click();
  await expect(tool(page)).toHaveAttribute('data-state', 'done', { timeout: 110_000 });
}

async function download(page: Page, r: Locator): Promise<{ bytes: Uint8Array; name: string }> {
  const [d] = await Promise.all([page.waitForEvent('download'), r.getByRole('link', { name: /내려받기$/ }).click()]);
  return { bytes: new Uint8Array(readFileSync(await d.path())), name: d.suggestedFilename() };
}

async function chooseMode(page: Page, label: '목표 용량' | '비율' | '화질'): Promise<void> {
  await page.getByRole('radio', { name: label, exact: true }).check();
}

async function chooseTarget(page: Page, label: string): Promise<void> {
  await page.getByRole('radiogroup', { name: '목표 용량' }).getByText(label, { exact: true }).click();
}

const has = (b: Uint8Array, text: string): boolean => Buffer.from(b).includes(Buffer.from(text, 'latin1'));

/** JPEG structure: marker list before SOS, the first SOF marker, and where the scan ends. */
function jpegLayout(b: Uint8Array): { markers: number[]; sof: number; scanStart: number; eoi: number } {
  const markers: number[] = [];
  let i = 2;
  let sof = -1;
  while (i + 3 < b.length && b[i] === 0xff) {
    const m = b[i + 1]!;
    if (m === 0xda) break;
    markers.push(m);
    if (sof < 0 && m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) sof = m;
    i += 2 + ((b[i + 2]! << 8) | b[i + 3]!);
  }
  let e = i + 2;
  while (e + 1 < b.length && !(b[e] === 0xff && b[e + 1] === 0xd9)) e++;
  return { markers, sof, scanStart: i, eoi: e };
}

/** A clean, baseline JPEG: SOF0, no APP1, no EXIF/XMP/GPS bytes outside the scan, nothing after EOI. */
function expectCleanBaselineJpeg(b: Uint8Array): void {
  expect(b[0] === 0xff && b[1] === 0xd8, 'SOI').toBe(true);
  const l = jpegLayout(b);
  expect(l.sof, 'baseline SOF0').toBe(0xc0);
  expect(l.markers, 'no APP1').not.toContain(0xe1);
  expect(has(b, 'Exif'), 'Exif').toBe(false);
  expect(has(b, 'http://ns.adobe.com/xap'), 'XMP').toBe(false);
  // "GPS" may occur by chance inside entropy-coded data; the metadata areas must not hold it.
  expect(has(b.subarray(0, l.scanStart), 'GPS'), 'GPS before the scan').toBe(false);
  expect(l.eoi, 'nothing after EOI').toBe(b.length - 2);
}

async function pixel(img: ImageData, x: number, y: number): Promise<[number, number, number, number]> {
  const k = (y * img.width + x) * 4;
  return [img.data[k]!, img.data[k + 1]!, img.data[k + 2]!, img.data[k + 3]!];
}

/** Mean RGB of a square around (x, y). */
function mean(img: ImageData, x: number, y: number, r = 20): [number, number, number] {
  const s = [0, 0, 0];
  let n = 0;
  for (let yy = y - r; yy <= y + r; yy++) {
    for (let xx = x - r; xx <= x + r; xx++) {
      const k = (yy * img.width + xx) * 4;
      for (let c = 0; c < 3; c++) s[c]! += img.data[k + c]!;
      n++;
    }
  }
  return s.map((v) => v / n) as [number, number, number];
}

test.describe.configure({ timeout: 150_000 });

test('lazy load: nothing from the worker or the codecs before the button; WebP wasm only after WebP is chosen', async ({ page, network }) => {
  await open(page);
  await pick(page, [PORTRAIT]);
  // 30 KB: the portrait needs the MozJPEG final encode and a lanczos downscale (MozJPEG cannot fit the full size).
  // Nothing loads before the first interaction (setInputFiles is not one).
  expect(network.requests.map((r) => r.url()).filter((u) => ENGINE.test(u) || ZIP_CHUNK.test(u))).toEqual([]);
  await chooseTarget(page, '직접 입력');
  await page.getByLabel('목표 용량 (KB)').fill('30');
  // After an interaction the preload (Polish P.7) may warm the worker, never WebP or the ZIP chunk.
  expect(network.requests.map((r) => r.url()).filter((u) => WEBP_WASM.test(u) || ZIP_CHUNK.test(u))).toEqual([]);
  await run(page);
  const urls = () => network.requests.map((r) => r.url());
  for (const part of ['photo.worker', 'mozjpeg_enc', 'squoosh_resize']) expect(urls().some((u) => u.includes(part)), part).toBe(true);
  expect(urls().filter((u) => WEBP_WASM.test(u))).toEqual([]);
  expect(urls().filter((u) => ZIP_CHUNK.test(u))).toEqual([]);
  await page.getByText('저장 형식: JPG').click();
  await page.getByRole('radio', { name: 'WebP', exact: true }).check();
  await expect(page.getByText('저장 형식: WebP')).toBeVisible();
  expect(urls().filter((u) => WEBP_WASM.test(u))).toEqual([]);
  await run(page, '이 설정으로 다시 줄이기');
  expect(urls().filter((u) => WEBP_WASM.test(u)).length).toBe(1);
});

test('happy path, 200 KB: portrait and scene come out ≤ 200,000 bytes, baseline and clean; compare viewer works', async ({ page }) => {
  await open(page);
  await pick(page, [PORTRAIT, SCENE]);
  await chooseTarget(page, '200 KB');
  await run(page);
  const c = await nodeCodecs();
  for (const name of ['portrait_pd.jpg', 'scene_cc0.jpg']) {
    const r = row(page, name);
    await expect(r.locator('.ph-size')).toHaveText(/^[\d.,]+ KB → [\d.,]+ KB$/);
    await expect(r.locator('.ph-pct')).toHaveText(/^\d+% 줄었습니다$/);
    const { bytes, name: file } = await download(page, r);
    expect(file).toBe(name.replace('.jpg', '_압축.jpg'));
    expect(bytes.length).toBeLessThanOrEqual(200_000);
    expectCleanBaselineJpeg(bytes);
    const img = await c.decodeJpeg(bytes);
    const s = sniffImage(bytes);
    expect([s.width, s.height]).toEqual([img.width, img.height]);
    const dims = r.locator('.ph-dims');
    if (await dims.count()) await expect(dims).toHaveText(new RegExp(`→ ${img.width}×${img.height}$`));
    else await expect(r.locator('.info')).toContainText(`${img.width}×${img.height}`);
  }
  const cmp = page.locator('#ph-compare');
  await expect(cmp).toBeVisible();
  await expect(cmp.locator('.pc-img-orig')).toHaveAttribute('src', /^blob:/);
  await expect(cmp.locator('.pc-img-res')).toHaveAttribute('src', /^blob:/);
  await page.getByRole('slider', { name: '비교 위치' }).fill('20');
  await expect(cmp.locator('.pc-top')).toHaveAttribute('style', /inset\(0px 0px 0px 20%\)|inset\(0 0 0 20%\)/);
  await cmp.getByText('4×', { exact: true }).click();
  await expect(cmp.locator('.pc-stage')).toHaveAttribute('data-zoom', '4');
  await expect(cmp.locator('.pc-img-res')).toHaveAttribute('style', /scale\(4\)/);
  // 비교 on another row switches the viewer.
  await row(page, 'scene_cc0.jpg').getByRole('button', { name: /원본과 비교/ }).click();
  await expect(cmp.locator('.pc-caption')).toContainText('scene_cc0.jpg');
});

test('orientation: EXIF 6 and 3 come out upright; GPS badge before and 위치 정보 지움 after; the trailer is gone', async ({ page }) => {
  await open(page);
  await pick(page, [photoFixture('exif6_gps.jpg'), photoRuntime('exif3.jpg')]);
  await expect(row(page, 'exif6_gps.jpg').locator('.badge')).toHaveText('위치 정보 있음');
  await chooseMode(page, '화질');
  await run(page);
  const c = await nodeCodecs();
  const red = (p: number[]) => p[0]! > 170 && p[1]! < 90 && p[2]! < 90;
  const blue = (p: number[]) => p[2]! > 170 && p[0]! < 90 && p[1]! < 110;

  const r6 = row(page, 'exif6_gps.jpg');
  await expect(r6.locator('.badge')).toHaveText('위치 정보 지움');
  const b6 = (await download(page, r6)).bytes;
  expect(has(b6, 'GPS-TRAILER')).toBe(false);
  expectCleanBaselineJpeg(b6);
  const i6 = await c.decodeJpeg(b6);
  expect([i6.width, i6.height]).toEqual([900, 1200]);
  // Stored top-left (red) is displayed top-right; stored top-right (blue) is displayed bottom-right.
  expect(red(await pixel(i6, i6.width - 40, 40)), 'red top-right').toBe(true);
  expect(blue(await pixel(i6, i6.width - 40, i6.height - 40)), 'blue bottom-right').toBe(true);

  const b3 = (await download(page, row(page, 'exif3.jpg'))).bytes;
  const i3 = await c.decodeJpeg(b3);
  expect([i3.width, i3.height]).toEqual([1200, 900]);
  expect(red(await pixel(i3, i3.width - 40, i3.height - 40)), 'red bottom-right').toBe(true);
  expect(blue(await pixel(i3, 40, i3.height - 40)), 'blue bottom-left').toBe(true);
});

test('stripped original: a 60 KB JPEG at 100 KB keeps its pixels and loses its EXIF', async ({ page }) => {
  const input = new Uint8Array(readFileSync(photoRuntime('small_60k.jpg')));
  await open(page);
  await pick(page, [photoRuntime('small_60k.jpg')]);
  await chooseTarget(page, '100 KB');
  await run(page);
  const r = row(page, 'small_60k.jpg');
  await expect(r.getByRole('note')).toContainText('이미 목표보다 작아 화질은 그대로 두고 사진 정보(EXIF)만 지웠습니다.');
  const { bytes } = await download(page, r);
  expect(bytes.length).toBeLessThanOrEqual(input.length);
  expect(has(bytes, 'Exif')).toBe(false);
  expect(has(bytes, 'camera comment')).toBe(false);
  const a = jpegLayout(input);
  const b = jpegLayout(bytes);
  expect(Buffer.from(bytes.subarray(b.scanStart, b.eoi + 2)).equals(Buffer.from(input.subarray(a.scanStart, a.eoi + 2)))).toBe(true);
});

test('P3: every patch is converted to sRGB (±8)', async ({ page }) => {
  await open(page);
  await pick(page, [photoFixture('p3_patches.jpg')]);
  await chooseMode(page, '화질');
  await page.getByLabel('화질 값').fill('60');
  await run(page);
  const { bytes } = await download(page, row(page, 'p3_patches.jpg'));
  const img = await (await nodeCodecs()).decodeJpeg(bytes);
  const problems: string[] = [];
  let raw = 0;
  P3_PATCHES.forEach((p, i) => {
    const got = mean(img, (i % 3) * 200 + 100, Math.floor(i / 3) * 200 + 100);
    const want = p3ToSrgb(p as [number, number, number]);
    if (got.some((v, k) => Math.abs(v - want[k]!) > 8)) problems.push(`patch ${p.join(',')}: got ${got.map(Math.round).join(',')}, want ${want.join(',')}`);
    if (got.every((v, k) => Math.abs(v - p[k]!) <= 8)) raw++;
  });
  // Flag (brief): a browser that returns the unconverted P3 values is reported, then skipped with the reason.
  test.skip(
    problems.length > 0 && raw === P3_PATCHES.length,
    `${test.info().project.name}: the decoder returned the raw Display-P3 values (no colour management; also in <img> on the main thread). Reported as a Flag in REVIEW-REQUEST.`,
  );
  expect(problems, 'colour management').toEqual([]);
});

test('CMYK: decodes, patch colours within ±24, and the note is shown', async ({ page }) => {
  await open(page);
  await pick(page, [photoFixture('cmyk.jpg')]);
  await run(page);
  const r = row(page, 'cmyk.jpg');
  await expect(r.getByRole('note')).toContainText('인쇄용 색상(CMYK) 사진을 화면용 색상으로 바꿨습니다.');
  const img = await (await nodeCodecs()).decodeJpeg((await download(page, r)).bytes);
  const expected: [number, number, [number, number, number]][] = [
    [100, 75, [0, 255, 255]],
    [300, 75, [255, 0, 255]],
    [100, 225, [255, 255, 0]],
    [300, 225, [127, 127, 127]],
  ];
  for (const [x, y, want] of expected) {
    const got = mean(img, x, y);
    expect(got.every((v, k) => Math.abs(v - want[k]!) <= 24), `(${x},${y}) got ${got.map(Math.round)} want ${want}`).toBe(true);
  }
});

test('transparency: JPG flattens onto white (with the note); WebP keeps alpha; an opaque RGBA PNG has no note', async ({ page }) => {
  await open(page);
  await pick(page, [photoFixture('alpha.png'), photoFixture('opaque_rgba.png')]);
  await run(page);
  const c = await nodeCodecs();
  const a = row(page, 'alpha.png');
  await expect(a.getByRole('note')).toContainText('투명한 부분은 흰색으로 채웠습니다.');
  const jpg = await c.decodeJpeg((await download(page, a)).bytes);
  const [r, g, b] = await pixel(jpg, 100, 300);
  expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(250);
  await expect(row(page, 'opaque_rgba.png').getByRole('note')).toHaveCount(0);

  await page.getByText('저장 형식: JPG').click();
  await page.getByRole('radio', { name: 'WebP', exact: true }).check();
  await expect(page.locator('#ph-fast')).toBeDisabled();
  await expect(page.locator('#ph-fast-reason')).toBeVisible();
  await run(page, '이 설정으로 다시 줄이기');
  const { bytes, name } = await download(page, row(page, 'alpha.png'));
  expect(name).toBe('alpha_압축.webp');
  expect(Buffer.from(bytes.subarray(0, 4)).toString('latin1')).toBe('RIFF');
  expect(Buffer.from(bytes.subarray(8, 12)).toString('latin1')).toBe('WEBP');
  expect(bytes.length).toBeLessThanOrEqual(500_000);
  const webp = await c.decodeWebp(bytes);
  expect((await pixel(webp, 100, 300))[3]).toBe(0);
  expect((await pixel(webp, 700, 300))[3]).toBe(255);
  await expect(row(page, 'alpha.png').getByRole('note')).toHaveCount(0);
});

test('modes: percent 50 %, quality 80, max long edge 800, free input 150 KB; invalid input blocks the button', async ({ page }) => {
  const size = readFileSync(PORTRAIT).length;
  await open(page);
  await pick(page, [PORTRAIT]);
  const r = row(page, 'portrait_pd.jpg');
  const runBtn = page.getByRole('button', { name: '사진 용량 줄이기', exact: true });

  await chooseTarget(page, '직접 입력');
  const kb = page.getByLabel('목표 용량 (KB)');
  for (const bad of ['5', 'abc']) {
    await kb.fill(bad);
    await expect(runBtn).toBeDisabled();
    await expect(page.locator('#ph-target-kb-error')).toHaveText('10부터 20,000 사이의 숫자(KB)를 입력해 주세요.');
  }
  await kb.fill('150');
  await expect(runBtn).toBeEnabled();
  await run(page);
  expect((await download(page, r)).bytes.length).toBeLessThanOrEqual(150_000);

  await chooseMode(page, '비율');
  await run(page, '이 설정으로 다시 줄이기');
  expect((await download(page, r)).bytes.length).toBeLessThanOrEqual(Math.floor(size / 2));

  await chooseMode(page, '화질');
  await expect(page.locator('#ph-quality-out')).toHaveText('80');
  await page.getByLabel('최대 크기 (긴 변)').selectOption('800');
  await run(page, '이 설정으로 다시 줄이기');
  await expect(r.locator('.ph-size')).toBeVisible();
  const img = await (await nodeCodecs()).decodeJpeg((await download(page, r)).bytes);
  expect(Math.max(img.width, img.height)).toBe(800);
  await expect(r.locator('.ph-dims')).toHaveText('1400×1750 → 640×800');
});

test('fast mode: the result is ≤ the target and still a clean baseline JPEG', async ({ page }) => {
  await open(page);
  await pick(page, [PORTRAIT]);
  await chooseTarget(page, '200 KB');
  await page.getByLabel('빠른 모드').check();
  await run(page);
  const { bytes } = await download(page, row(page, 'portrait_pd.jpg'));
  expect(bytes.length).toBeLessThanOrEqual(200_000);
  expectCleanBaselineJpeg(bytes);
});

test('batch + ZIP: 3 of 4 finish, the summary is announced, the ZIP has 3 deduped UTF-8 names', async ({ page, network }) => {
  await open(page);
  await pick(page, [photoRuntime('사진.jpg'), photoRuntime('scene.jpg'), photoRuntime('scene.png'), photoRuntime('not_image.txt')]);
  await expect(row(page, 'not_image.txt').locator('.file-error')).toHaveText('사진 파일이 아닙니다. JPG·PNG·WebP 파일을 선택해 주세요.');
  await chooseTarget(page, '200 KB');
  await run(page);
  await expect(rows(page).filter({ has: page.getByRole('link', { name: /내려받기$/ }) })).toHaveCount(3);
  await expect(page.locator('#ph-status')).toHaveText('4장 중 3장을 줄였습니다. 1장은 줄이지 못했습니다.');
  expect(network.requests.map((r) => r.url()).filter((u) => ZIP_CHUNK.test(u))).toEqual([]);
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '모두 내려받기 (ZIP)' }).click()]);
  expect(network.requests.map((r) => r.url()).filter((u) => ZIP_CHUNK.test(u)).length).toBe(1);
  expect(d.suggestedFilename()).toBe('사진_압축_3장.zip');
  const entries = unzipSync(new Uint8Array(readFileSync(await d.path())));
  expect(Object.keys(entries).sort()).toEqual(['scene_압축.jpg', 'scene_압축_2.jpg', '사진_압축.jpg'].sort());
  for (const bytes of Object.values(entries)) expect(sniffImage(bytes).format).toBe('jpeg');
});

test('bad inputs: HEIC guidance, animated GIF, truncated JPEG, text and a 0-byte file', async ({ page }) => {
  await open(page);
  await pick(page, [photoRuntime('fake.heic'), photoFixture('anim.gif'), photoRuntime('truncated.jpg'), photoRuntime('not_image.txt'), photoRuntime('zero.jpg')]);
  const err = (name: string) => row(page, name).locator('.file-error');
  await expect(err('anim.gif')).toHaveText('움직이는 이미지(GIF·WebP·PNG)는 아직 줄일 수 없습니다. 움직이지 않는 사진 파일을 선택해 주세요.');
  await expect(err('truncated.jpg')).toHaveText(/^파일이 중간에 끊겨 있습니다\. /);
  await expect(err('not_image.txt')).toHaveText('사진 파일이 아닙니다. JPG·PNG·WebP 파일을 선택해 주세요.');
  await expect(err('zero.jpg')).toHaveText('사진 파일이 아닙니다. JPG·PNG·WebP 파일을 선택해 주세요.');
  await run(page);
  await expect(err('fake.heic')).toHaveText(/^아이폰 사진 형식\(HEIC\)은 이 브라우저에서 열 수 없습니다\./);
  await expect(page.locator('#ph-status')).toHaveText('5장 중 0장을 줄였습니다. 5장은 줄이지 못했습니다.');
});

test('limits: a 20,000 × 1,000 panorama works on PC and is refused on a phone', async ({ page, isMobile }) => {
  await open(page);
  await pick(page, [photoRuntime('pano_20000x1000.jpg')]);
  const r = row(page, 'pano_20000x1000.jpg');
  if (isMobile) {
    await expect(r.locator('.file-error')).toHaveText('휴대폰에서는 긴 변이 16,384 px 이하인 사진만 줄일 수 있습니다. 휴대폰 브라우저가 그릴 수 있는 최대 크기이기 때문입니다.');
    await expect(page.getByRole('button', { name: '사진 용량 줄이기', exact: true })).toBeDisabled();
    return;
  }
  await chooseTarget(page, '100 KB');
  await run(page);
  expect((await download(page, r)).bytes.length).toBeLessThanOrEqual(100_000);
});

test('limits: a 5000 × 3750 photo on a phone is processed at 4,096 px with the note', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The 4,096 px working edge applies to phones only (LIMITS.desktop.workingLongEdge is null, unit-tested).');
  await open(page);
  await pick(page, [photoRuntime('big_5000x3750.jpg')]);
  await chooseMode(page, '화질');
  await run(page);
  const r = row(page, 'big_5000x3750.jpg');
  await expect(r.getByRole('note')).toContainText('휴대폰에서는 긴 변 4,096 px까지 줄여서 처리합니다.');
  const img = await (await nodeCodecs()).decodeJpeg((await download(page, r)).bytes);
  expect(Math.max(img.width, img.height)).toBeLessThanOrEqual(4096);
  await expect(page.locator('#ph-compare .pc-caption')).toHaveText('원본(휴대폰에서 줄여 불러온 사진)');
});

/** Serves the real worker script with `prelude` in front (ES imports are hoisted), never cached. */
async function patchWorker(page: Page, prelude: string): Promise<void> {
  await page.context().route(/\/_astro\/photo\.worker[^/]*\.js/, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: `${prelude}\n${await res.text()}`, headers: { ...res.headers(), 'cache-control': 'no-store' } });
  });
}

test('cancel mid-batch: the finished row keeps its download, the others go back to 대기; a re-run completes', async ({ page }) => {
  await open(page);
  await pick(page, [PORTRAIT, SCENE, photoFixture('opaque_rgba.png')]);
  await chooseTarget(page, '200 KB');
  // Hold every message about rows 2 and 3, so the run is still busy with them when cancel is pressed.
  await patchWorker(page, `{ const post = self.postMessage.bind(self); self.postMessage = (m, t) => { if (m && (m.id === 2 || m.id === 3 || m.type === 'run-done')) return; post(m, t); }; }`);
  await page.getByRole('button', { name: '사진 용량 줄이기', exact: true }).click();
  await expect(tool(page)).toHaveAttribute('data-state', 'working');
  await expect(row(page, 'portrait_pd.jpg').getByRole('link', { name: /내려받기$/ })).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#ph-progress-text')).toContainText('사진 줄이는 중… (2/3)');
  await page.getByRole('button', { name: '취소' }).click();
  await expect(tool(page)).toHaveAttribute('data-state', 'done');
  await expect(row(page, 'portrait_pd.jpg').getByRole('link', { name: /내려받기$/ })).toBeVisible();
  for (const name of ['scene_cc0.jpg', 'opaque_rgba.png']) await expect(row(page, name).locator('.ph-status')).toHaveText('대기');
  await expect(page.locator('#ph-status')).toContainText('취소');
  await page.context().unroute(/\/_astro\/photo\.worker[^/]*\.js/);
  await run(page, '이 설정으로 다시 줄이기');
  await expect(rows(page).filter({ has: page.getByRole('link', { name: /내려받기$/ }) })).toHaveCount(3);
});

test('worker crash on item 2: that row fails, a fresh worker finishes rows 3 and 4', async ({ page }) => {
  await open(page);
  await pick(page, [PORTRAIT, SCENE, photoFixture('opaque_rgba.png'), photoFixture('exif6_gps.jpg')]);
  await chooseTarget(page, '200 KB');
  await patchWorker(page, `{ const post = self.postMessage.bind(self); self.postMessage = (m, t) => { if (m && m.id === 2) { if (m.type === 'item-phase') setTimeout(() => { throw new Error('simulated crash'); }); return; } post(m, t); }; }`);
  await run(page);
  await expect(row(page, 'scene_cc0.jpg').locator('.file-error')).toHaveText(/기기 메모리가 부족합니다|처리 중 문제가 생겼습니다/);
  for (const name of ['portrait_pd.jpg', 'opaque_rgba.png', 'exif6_gps.jpg']) await expect(row(page, name).getByRole('link', { name: /내려받기$/ })).toBeVisible();
  await expect(page.locator('#ph-status')).toHaveText('4장 중 3장을 줄였습니다. 1장은 줄이지 못했습니다.');
});

test('keyboard only: pick, compress, download, then the compare slider, zoom and pan keys', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile, 'Keyboard-only flow is a desktop scenario; mobile projects cover touch.');
  await open(page);
  const tabTo = async (predicate: string, max = 60): Promise<void> => {
    for (let i = 0; i < max; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(predicate)) return;
    }
    throw new Error(`focus never reached: ${predicate}`);
  };
  await tabTo(`document.activeElement?.id === 'ph-input'`);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press(browserName === 'webkit' ? 'Space' : 'Enter')]);
  await chooser.setFiles(PORTRAIT);
  await expect(rows(page)).toHaveCount(1);
  // 목표 용량 chips are a radio group: Tab lands on the checked 500 KB, arrows move to 200 KB.
  await tabTo(`document.activeElement?.getAttribute('name') === 'ph-target'`);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('input[name="ph-target"][value="200"]')).toBeChecked();
  await tabTo(`document.activeElement?.id === 'ph-run'`);
  await expect(page.locator('#ph-run')).toBeEnabled();
  await page.keyboard.press('Enter');
  await expect(tool(page)).toHaveAttribute('data-state', 'done', { timeout: 110_000 });
  await expect(page.locator(':focus')).toHaveAttribute('data-role', 'download');
  const [d] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(sniffImage(new Uint8Array(readFileSync(await d.path()))).format).toBe('jpeg');

  await tabTo(`document.activeElement?.id === 'ph-slider'`);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#ph-slider')).toHaveValue('52');
  await page.keyboard.press('Tab');
  await expect(page.locator('input.pc-zoom[value="1"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('input.pc-zoom[value="4"]')).toBeChecked();
  const stage = page.locator('.pc-stage');
  await stage.focus();
  const before = await page.locator('.pc-img-res').getAttribute('style');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  expect(await page.locator('.pc-img-res').getAttribute('style')).not.toBe(before);
  await expect(page.locator('.pc-img-res')).toHaveAttribute('style', /scale\(4\)/);
});

test('axe: empty, ready (details open, 직접 입력) and done (compare visible)', async ({ page }) => {
  const serious = async () =>
    (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  await open(page);
  expect(await serious()).toEqual([]);
  await pick(page, [PORTRAIT, photoRuntime('not_image.txt')]);
  await page.getByText('저장 형식: JPG').click();
  await chooseTarget(page, '직접 입력');
  await page.getByLabel('목표 용량 (KB)').fill('5');
  await expect(page.locator('#ph-target-kb-error')).not.toBeEmpty();
  expect(await serious()).toEqual([]);
  await page.getByLabel('목표 용량 (KB)').fill('300');
  await run(page);
  await expect(page.locator('#ph-compare')).toBeVisible();
  expect(await serious()).toEqual([]);
});

test('SEO and wiring: title, description, JSON-LD, the pdf-compress link back here', async ({ page }) => {
  await gotoReady(page, '/photo-compress/');
  await expect(page).toHaveTitle('사진 용량 줄이기 — 업로드 없이 브라우저에서 무료로 | 안올림');
  await expect(page.locator('h1')).toHaveText('사진 용량 줄이기');
  await expect(page.locator('.related').getByRole('link', { name: 'PDF 용량 줄이기' })).toHaveAttribute('href', '/pdf-compress/');
  await expect(page.locator('.related').getByRole('link', { name: 'PDF 합치기' })).toHaveAttribute('href', '/pdf-merge/');
  await expect(page.locator('.faq details')).toHaveCount(6);
  await expect(page.locator('#ph-input')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif');
  await expect(page.getByText('사진은 이 기기 밖으로 전송되지 않습니다.')).toBeVisible();
  await gotoReady(page, '/pdf-compress/');
  // The done state of PDF 용량 줄이기 links here (its visibility is checked in pdf-compress.spec.ts).
  await expect(page.locator('#cmp-result a[href="/photo-compress/"]')).toHaveText('사진 용량 줄이기');
});

test('engine load failure: its own message with 새로고침, rows back to 대기, never a file error', async ({ page }) => {
  await open(page);
  await pick(page, [PORTRAIT, SCENE]);
  // A deploy removed the chunk: 404 (with the site's headers, CSP included).
  await page.context().route(/\/_astro\/photo\.worker[^/]*\.js/, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ status: 404, body: 'gone', headers: { ...res.headers(), 'content-type': 'text/plain', 'cache-control': 'no-store' } });
  });
  await page.getByRole('button', { name: '사진 용량 줄이기', exact: true }).click();
  const banner = page.locator('#engine-error');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('처리 도구를 불러오지 못했습니다.');
  await expect(banner).toContainText('파일에는 문제가 없습니다.');
  await expect(banner.getByRole('button', { name: '새로고침' })).toBeFocused();
  await expect(page.locator('#ph-list .file-error')).toHaveCount(0);
  await expect(page.locator('#ph-list .ph-status')).toHaveText(['대기', '대기']);
  // The alert cleared the polite status (Polish P.17).
  await expect(page.locator('#ph-status')).toHaveText('');
  await page.context().unroute(/\/_astro\/photo\.worker[^/]*\.js/);
  await chooseTarget(page, '200 KB');
  await run(page);
  await expect(banner).toBeHidden();
  await expect(page.locator('#ph-status')).toHaveText('2장 중 2장을 줄였습니다.');
});

test('done on a phone: the headline and the first download are in view and focused; no drop hint on touch', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile layout check (touch device, small viewport).');
  await open(page);
  await expect(page.locator('#ph-drop .drop-hint')).toBeHidden();
  await pick(page, [PORTRAIT]);
  await chooseTarget(page, '200 KB');
  await run(page);
  await expect(page.locator('#ph-headline')).toHaveText(/^1장 중 1장을 줄였습니다\. [\d.,]+ KB → [\d.,]+ KB$/);
  await expect(page.locator('#ph-headline')).toBeInViewport();
  const dl = row(page, 'portrait_pd.jpg').getByRole('link', { name: /내려받기$/ });
  await expect(dl).toBeFocused();
  await expect(dl).toBeInViewport();
});

test('unsupported browser: without OffscreenCanvas the notice shows and the picker is disabled; otherwise neither', async ({ page, network }) => {
  await gotoReady(page, '/photo-compress/');
  const notice = page.locator('#ph-unsupported');
  if (await canCompress(page)) {
    await expect(notice).toBeHidden();
    await expect(page.locator('#ph-input')).toBeEnabled();
    return;
  }
  await expect(notice).toBeVisible();
  await expect(notice).toHaveText('이 브라우저에서는 사진 줄이기를 쓸 수 없습니다. Safari 16.4 이상, Chrome, Edge, Firefox 최신 버전에서 이용해 주세요.');
  await expect(page.locator('#ph-input')).toBeDisabled();
  await page.locator('#ph-pick').click({ force: true });
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '사진 용량 줄이기', exact: true })).toBeHidden();
  // Nothing from the engine was requested; the no-upload fixture checks every request after the test.
  expect(network.requests.map((r) => r.url()).filter((u) => ENGINE.test(u))).toEqual([]);
});

test('target mode, already small: nothing to remove keeps the original; re-saved for EXIF/orientation with the note, ≤ target', async ({ page }) => {
  await open(page);
  await pick(page, [PORTRAIT, photoFixture('exif6_gps.jpg')]);
  await run(page);
  const p = row(page, 'portrait_pd.jpg');
  await expect(p.getByRole('note')).toHaveText('더 줄일 수 없는 사진입니다. 원본을 그대로 쓰세요.');
  await expect(p.getByRole('link', { name: /내려받기$/ })).toHaveCount(0);
  const e = row(page, 'exif6_gps.jpg');
  // The re-saved file grew (25 KB → ~86 KB): the size line says so and why; never "0 % 줄었습니다".
  await expect(e.locator('.ph-size')).toHaveText(
    /^[\d.,]+ KB → [\d.,]+ KB \(늘어남\) — 위치 정보 등 개인정보를 지우고 방향을 바로잡느라 다시 저장했습니다\. 목표 용량 안입니다\.$/,
  );
  await expect(e.locator('.ph-pct')).toHaveCount(0);
  await expect(e.getByRole('note')).toHaveCount(0);
  const { bytes } = await download(page, e);
  expect(bytes.length).toBeLessThanOrEqual(500_000);
  expectCleanBaselineJpeg(bytes);
  const img = await (await nodeCodecs()).decodeJpeg(bytes);
  expect([img.width, img.height]).toEqual([900, 1200]);
});

test('quality mode, privacy first: a rotated photo with GPS and no size gain is offered re-saved, not "keep the original"', async ({ page }) => {
  await open(page);
  await pick(page, [photoFixture('exif6_gps.jpg')]);
  await chooseMode(page, '화질');
  await page.getByLabel('화질 값').fill('95');
  await run(page);
  const e = row(page, 'exif6_gps.jpg');
  await expect(e.getByText('원본을 그대로 쓰세요')).toHaveCount(0);
  await expect(e.locator('.ph-size')).toHaveText(/\(늘어남\) — 위치 정보 등 개인정보를 지우고 방향을 바로잡느라 다시 저장했습니다\.$/);
  const { bytes } = await download(page, e);
  expectCleanBaselineJpeg(bytes);
  expect(has(bytes, 'GPS-TRAILER')).toBe(false);
});

test.describe('compare viewer at 1280 × 900', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test('a portrait result keeps its aspect ratio (box within 1 % of outW/outH)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop viewport check.');
    await open(page);
    await pick(page, [PORTRAIT]);
    await chooseTarget(page, '200 KB');
    await run(page);
    const box = await page.locator('#ph-compare .pc-stage').boundingBox();
    const dims = (await row(page, 'portrait_pd.jpg').locator('.ph-dims').count())
      ? (await row(page, 'portrait_pd.jpg').locator('.ph-dims').textContent())!.split('→')[1]!.trim()
      : '1400×1750';
    const [w, h] = dims.split('×').map(Number);
    expect(h!).toBeGreaterThan(w!);
    const ratio = box!.width / box!.height;
    expect(Math.abs(ratio / (w! / h!) - 1), `stage ${box!.width}×${box!.height} vs ${dims}`).toBeLessThan(0.01);
  });
});

test('a clean PNG under the target that grows as JPG gets the neutral line, never the privacy reason', async ({ page }) => {
  await open(page);
  await pick(page, [photoFixture('opaque_rgba.png')]);
  await run(page);
  const r = row(page, 'opaque_rgba.png');
  await expect(r.locator('.ph-size')).toHaveText(
    /^[\d.,]+ KB → [\d.,]+ KB \(늘어남\) — JPG로 바꾸느라 용량이 늘었습니다\. 제출처가 원래 형식을 받는다면 원본을 쓰셔도 됩니다\. 목표 용량 안입니다\.$/,
  );
  await expect(r).not.toContainText('개인정보');
  await expect(r.locator('.ph-pct')).toHaveCount(0);
  const { bytes } = await download(page, r);
  expect(bytes.length).toBeLessThanOrEqual(500_000);
});
