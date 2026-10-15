// 도장 만들기 (STAMP1015) end to end, every project: 12 tiles painted in the web face (Hangul, Hanja), per-style limits,
// 붙이는 글자, a bad character, the PNG (fixed name, size from mm, transparent corners, colour, pHYs), 인주 질감 seeded,
// the system face when the slices cannot load, the radio group by keyboard, no Web Storage, the link to 서명, PDF에 찍기 into
// /pdf-sign/ (probe f: the pHYs PNG goes through its image path) and 이미지 복사 where supported (probe d).
import AxeBuilder from '@axe-core/playwright';
import type { Download, Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { expect, gotoReady, test } from './no-upload';
import { RUNTIME_DIR } from './paths';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const STYLES = ['round', 'round-double', 'oval', 'square-seal', 'square-round', 'square-inverse', 'rect-v', 'rect-h', 'plain', 'corp-round', 'corp-square', 'date-round'];

const tile = (page: Page, id: string) => page.locator(`.sm-tile[data-style="${id}"]`);

/** Opens the page, starts the controller and waits for the first paint. */
async function open(page: Page): Promise<void> {
  await gotoReady(page, '/stamp-maker/');
  await page.locator('#sm-text').focus();
  await expect(page.locator('#sm-tool')).toHaveAttribute('data-painted', /\d+/);
}

/** Types `text` and waits for the paint that follows it. */
async function type(page: Page, text: string): Promise<void> {
  const before = Number(await page.locator('#sm-tool').getAttribute('data-painted'));
  await page.locator('#sm-text').fill(text);
  await expect.poll(async () => Number(await page.locator('#sm-tool').getAttribute('data-painted'))).toBeGreaterThan(before);
}

const tileUrls = (page: Page): Promise<string[]> => page.$$eval('.sm-tile canvas', (cs) => (cs as HTMLCanvasElement[]).map((c) => c.toDataURL()));

async function save(page: Page): Promise<{ name: string; bytes: Buffer }> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#sm-save').click()]);
  const d = download as Download;
  return { name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) };
}

function today8(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** pHYs pixels per metre (x), or null. */
function phys(png: Buffer): number | null {
  const at = png.indexOf(Buffer.from('pHYs'));
  return at < 0 ? null : png.readUInt32BE(at + 4);
}

async function pixels(png: Buffer): Promise<{ w: number; h: number; data: Uint8ClampedArray }> {
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return { w: img.width, h: img.height, data: new Uint8ClampedArray(ctx.getImageData(0, 0, img.width, img.height).data) };
}

test('홍길동: 12 tiles painted in the web face, all different; the sample shows before typing; fonts only from /fonts/hwp/', async ({ page }) => {
  const fonts: string[] = [];
  const sheets: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'font') fonts.push(new URL(r.url()).pathname);
    if (r.resourceType() === 'stylesheet') sheets.push(new URL(r.url()).pathname);
  });
  await open(page);
  await expect(page.locator('#sm-sample')).toBeVisible();
  await expect(page.locator('.sm-tile')).toHaveCount(12);
  await type(page, '홍길동');
  await expect(page.locator('#sm-sample')).toBeHidden();
  await expect(page.locator('#sm-tool')).toHaveAttribute('data-fonts', 'ok');
  for (const id of STYLES) await expect(tile(page, id)).toHaveAttribute('aria-disabled', 'false');
  const urls = await tileUrls(page);
  expect(new Set(urls).size).toBe(12);
  expect(fonts.length).toBeGreaterThan(0);
  // The UI font and the HWP faces only, all same-origin.
  expect(fonts.filter((p) => !/^\/fonts\/hwp\/|^\/_astro\/anolim-ui/.test(p))).toEqual([]);
  expect(fonts.some((p) => p.startsWith('/fonts/hwp/'))).toBe(true);
  expect(sheets.filter((p) => p.startsWith('/fonts/hwp/hwp-fonts.'))).toHaveLength(1);
  // The page HTML itself never links them (check-dist too).
  expect(await page.locator('link[href*="/fonts/hwp/"]').count()).toBe(1);
});

test('static tiles: sample pictures and nothing else before a user signal; a tile pressed first is picked once the controller starts', async ({ page }) => {
  const fontRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/fonts/hwp/')) fontRequests.push(r.url());
  });
  await gotoReady(page, '/stamp-maker/');
  await expect(page.locator('.sm-tile')).toHaveCount(12);
  await expect(page.locator('.sm-tile-name')).toHaveText(['원형', '겹원', '타원', '사각 인감', '라운드 사각', '사각 음각', '세로 직사각', '가로 직사각', '선 없는 이름', '법인 직인', '사각 직인', '날짜 도장']);
  // Round 2 (review Must Fix 1): every tile shows its build-time sample picture before any signal, with no HWP font request.
  await expect.poll(() => page.$$eval('.sm-art img', (imgs) => (imgs as HTMLImageElement[]).map((i) => i.complete && i.naturalWidth))).toEqual(Array(12).fill(176));
  await page.waitForTimeout(1500);
  expect(await page.locator('#sm-tool').getAttribute('data-painted')).toBeNull();
  expect(await page.locator('link[href*="/fonts/hwp/"]').count()).toBe(0);
  expect(fontRequests).toEqual([]);
  await expect(page.locator('.sm-art img:visible')).toHaveCount(12);
  await tile(page, 'oval').click();
  await expect(tile(page, 'oval')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#sm-panel')).toBeVisible();
  await expect(page.locator('#sm-tool')).toHaveAttribute('data-painted', /\d+/);
  // Live tiles replace the pictures: hidden, and every canvas has ink.
  await expect(page.locator('.sm-art img:visible')).toHaveCount(0);
  const inked = await page.$$eval('.sm-tile canvas', (cs) =>
    (cs as HTMLCanvasElement[]).map((c) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0)),
  );
  expect(inked).toEqual(Array(12).fill(true));
});

test('limits: 7 syllables disable the round styles with their text; Hanja paints; an emoji is named and blocks the grid and save', async ({ page }) => {
  await open(page);
  await type(page, '남궁가나다라마');
  for (const id of ['round', 'round-double', 'oval', 'rect-v', 'date-round']) {
    await expect(tile(page, id)).toHaveAttribute('aria-disabled', 'true');
    await expect(tile(page, id).locator('.sm-tile-over')).toHaveText('글자가 많아 이 모양에는 넣지 못해요');
  }
  for (const id of ['square-seal', 'rect-h', 'plain', 'corp-round', 'corp-square']) await expect(tile(page, id)).toHaveAttribute('aria-disabled', 'false');
  await type(page, '洪吉童');
  await expect(page.locator('#sm-tool')).toHaveAttribute('data-fonts', 'ok');
  for (const id of STYLES) await expect(tile(page, id)).toHaveAttribute('aria-disabled', 'false');
  await tile(page, 'square-seal').click();
  await expect(page.locator('#sm-save')).toBeEnabled();
  await page.locator('#sm-text').fill('홍😀');
  await expect(page.locator('#sm-error')).toHaveText('도장에 넣을 수 없는 글자: 😀');
  await expect(page.locator('#sm-grid')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#sm-save')).toBeDisabled();
  await expect(page.locator('#sm-text')).toHaveAttribute('aria-invalid', 'true');
  expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await type(page, '홍길동');
  await expect(page.locator('#sm-error')).toBeHidden();
  await expect(page.locator('#sm-save')).toBeEnabled();
});

test('사각 인감: 자동 adds 인 (the bottom-left cell has ink), 붙이지 않음 changes it; PNG name, 354 / 709 pixels, corners clear, red, pHYs', async ({ page }) => {
  await open(page);
  await type(page, '홍길동');
  await tile(page, 'square-seal').click();
  await expect(tile(page, 'square-seal')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#sm-size-info')).toHaveText('15 mm (354×354픽셀)');
  const auto = await save(page);
  expect(auto.name).toBe(`도장_square-seal_${today8()}.png`);
  expect(auto.bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(phys(auto.bytes)).toBe(23622);
  const a = await pixels(auto.bytes);
  expect([a.w, a.h]).toEqual([354, 354]);
  const alpha = (x: number, y: number): number => a.data[(y * a.w + x) * 4 + 3]!;
  expect([alpha(0, 0), alpha(a.w - 1, 0), alpha(0, a.h - 1), alpha(a.w - 1, a.h - 1)]).toEqual([0, 0, 0, 0]);
  // Opaque pixels are the 인주 red (D6 #D0202E) within the encoder's rounding.
  let red = 0;
  let off = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i + 3] !== 255) continue;
    red++;
    if (Math.abs(a.data[i]! - 0xd0) + Math.abs(a.data[i + 1]! - 0x20) + Math.abs(a.data[i + 2]! - 0x2e) > 6) off++;
  }
  expect(off).toBe(0);
  expect(red).toBeGreaterThan(354 * 354 * 0.05);
  // The 인 sits in the bottom-left cell (column-major, right -> left).
  let quarter = 0;
  for (let y = 190; y < 330; y++) for (let x = 30; x < 170; x++) if (a.data[(y * a.w + x) * 4 + 3]! > 128) quarter++;
  expect(quarter).toBeGreaterThan(300);
  await page.locator('#sm-suffix').selectOption('none');
  const none = await save(page);
  expect(none.bytes.equals(auto.bytes)).toBe(false);
  await page.locator('#sm-double').check();
  await expect(page.locator('#sm-size-info')).toHaveText('15 mm (709×709픽셀)');
  const big = await save(page);
  expect(phys(big.bytes)).toBe(47244);
  const b = await pixels(big.bytes);
  expect([b.w, b.h]).toEqual([709, 709]);
});

test('인주 질감: the same seed saves identical bytes; 질감 다시 만들기 changes them', async ({ page }) => {
  await open(page);
  await type(page, '홍길동');
  await tile(page, 'round').click();
  await page.locator('#sm-texture').check();
  await expect(page.locator('#sm-reseed')).toBeVisible();
  const one = await save(page);
  const two = await save(page);
  expect(one.bytes.equals(two.bytes)).toBe(true);
  await page.locator('#sm-reseed').click();
  const three = await save(page);
  expect(three.bytes.equals(one.bytes)).toBe(false);
});

test('font slices blocked: the note shows, tiles still paint (system face, different from the web face), save works', async ({ page }) => {
  await open(page);
  await type(page, '홍길동');
  const web = await tileUrls(page);
  await page.route(/\/fonts\/hwp\//, (r) => r.abort());
  await page.reload();
  await page.locator('#sm-text').focus();
  await expect(page.locator('#sm-tool')).toHaveAttribute('data-painted', /\d+/);
  await type(page, '홍길동');
  await expect(page.locator('#sm-note')).toHaveText('글꼴을 받지 못해 기본 글꼴로 보여 드려요. 인터넷 연결을 확인해 주세요.');
  await expect(page.locator('#sm-tool')).toHaveAttribute('data-fonts', 'system');
  const system = await tileUrls(page);
  expect(new Set(system).size).toBe(12);
  // Probe a: the web face really painted (the system-face tiles differ).
  expect(system.filter((u, i) => u === web[i])).toEqual([]);
  await tile(page, 'round').click();
  const png = await save(page);
  expect(phys(png.bytes)).toBe(23622);
});

test('radio group: one tab stop, arrows move and pick, Enter / Space pick; nothing stored; 서명도 만들기 opens /stamp-signature/', async ({ page }) => {
  await open(page);
  const storage = (): Promise<[number, number]> => page.evaluate(() => [localStorage.length, sessionStorage.length]);
  const before = await storage();
  await type(page, '홍길동');
  await expect(page.locator('.sm-tile[tabindex="0"]')).toHaveCount(1);
  await tile(page, 'round').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tile(page, 'round-double')).toHaveAttribute('aria-checked', 'true');
  await expect(tile(page, 'round-double')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(tile(page, 'date-round')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Home');
  await expect(tile(page, 'round')).toHaveAttribute('aria-checked', 'true');
  await tile(page, 'oval').focus();
  await page.keyboard.press('Enter');
  await expect(tile(page, 'oval')).toHaveAttribute('aria-checked', 'true');
  await tile(page, 'plain').focus();
  await page.keyboard.press('Space');
  await expect(tile(page, 'plain')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.sm-tile[aria-checked="true"]')).toHaveCount(1);
  expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  await save(page);
  expect(await storage()).toEqual(before);
  await page.locator('#sm-sign').click();
  await expect(page).toHaveURL(/\/stamp-signature\/$/);
});

test('corp and date styles: 가운데 글자 and the date fields show for their style only; 법인 직인 saves at 24 mm', async ({ page }) => {
  await open(page);
  await type(page, '문서딱 주식회사');
  await tile(page, 'corp-round').click();
  await expect(page.locator('#sm-center')).toBeVisible();
  await expect(page.locator('#sm-date')).toBeHidden();
  await expect(page.locator('#sm-size-info')).toHaveText('24 mm (567×567픽셀)');
  await page.locator('#sm-center').fill('대표');
  const png = await save(page);
  expect(png.name).toBe(`도장_corp-round_${today8()}.png`);
  await type(page, '홍길동');
  await tile(page, 'date-round').click();
  await expect(page.locator('#sm-center')).toBeHidden();
  await expect(page.locator('#sm-date')).toBeVisible();
  await expect(page.locator('#sm-label')).toBeVisible();
  await expect(page.locator('#sm-size-info')).toHaveText('18 mm (425×425픽셀)');
});

test.describe('PDF에 찍기 and 이미지 복사 (S3)', () => {
  const DIR = join(RUNTIME_DIR, `sm-${process.pid}`);
  const ONE = join(DIR, 'one.pdf');

  test.beforeAll(async () => {
    mkdirSync(DIR, { recursive: true });
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    writeFileSync(ONE, await doc.save());
  });

  /** scrollY unchanged for 250 ms (the pdf-sign spec's helper: the result scrolls into view smoothly). */
  const settled = (page: Page) =>
    page.evaluate(() => new Promise<void>((r) => {
      let y = scrollY;
      let since = performance.now();
      const tick = (now: number) => {
        if (scrollY !== y) {
          y = scrollY;
          since = now;
        }
        if (now - since >= 250) r();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));

  test('PDF에 찍기 opens /pdf-sign/ naming 도장 만들기; the stamp (with pHYs) is placed and saved as one image with a soft mask', async ({ page }) => {
    await open(page);
    await type(page, '홍길동');
    await tile(page, 'round').click();
    await Promise.all([page.waitForURL('**/pdf-sign/'), page.locator('#sm-pdf').click()]);
    await expect(page.locator('#sg-notice')).toHaveText('도장 만들기에서 만든 그림을 가져왔습니다. 이제 PDF 파일을 고르세요.');
    expect(await page.evaluate(() => [sessionStorage.getItem('docttak:sign-png'), sessionStorage.getItem('docttak:sign-from')])).toEqual([null, null]);
    await page.setInputFiles('#sg-input', ONE);
    await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#sg-image-info')).toHaveText('도장 만들기에서 가져온 그림');
    await expect(page.locator('.sign-box')).toHaveCount(1);
    await page.locator('#sg-run').click();
    await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
    await settled(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#sg-download').click()]);
    const doc = await PDFDocument.load(readFileSync((await (download as Download).path())!), { updateMetadata: false });
    expect(doc.getPageCount()).toBe(1);
    const xobjects = doc.getPage(0).node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
    const images = xobjects.keys().map((k) => xobjects.lookup(k) as PDFRawStream).filter((s) => s.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
    expect(images).toHaveLength(1);
    expect(images[0]!.dict.get(PDFName.of('SMask'))).toBeTruthy();
  });

  test('a full storage keeps the page and asks for the download path', async ({ page }) => {
    await open(page);
    await type(page, '홍길동');
    await tile(page, 'round').click();
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('full', 'QuotaExceededError');
      };
    });
    await page.locator('#sm-pdf').click();
    await expect(page.locator('#sm-error')).toHaveText('PNG를 내려받은 뒤 PDF 서명·도장 넣기에서 골라 주세요.');
    await expect(page).toHaveURL(/\/stamp-maker\/$/);
  });

  test('이미지 복사: shown only where a PNG can go to the clipboard; Chromium copies the same PNG', async ({ page, context, browserName }) => {
    await open(page);
    await type(page, '홍길동');
    await tile(page, 'round').click();
    const offered = await page.evaluate(() => {
      const CI = (window as unknown as { ClipboardItem?: { supports?: (t: string) => boolean } }).ClipboardItem;
      return !!CI && typeof navigator.clipboard?.write === 'function' && (typeof CI.supports !== 'function' || CI.supports('image/png'));
    });
    test.info().annotations.push({ type: 'probe d', description: `${test.info().project.name}: 이미지 복사 ${offered ? 'shown' : 'hidden'}` });
    await expect(page.locator('#sm-copy')).toBeVisible({ visible: offered });
    if (browserName !== 'chromium' || !offered) return;
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#sm-copy').click();
    await expect(page.locator('#sm-status')).toHaveText('복사했어요. 한글·워드에 붙여 넣으세요.');
    const head = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      const blob = await item!.getType('image/png');
      return Array.from(new Uint8Array(await blob.arrayBuffer()).subarray(0, 8));
    });
    expect(head).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});
