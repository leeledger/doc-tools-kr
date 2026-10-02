// 전자서명·도장 이미지 e2e (Sprint C, C1 test map). Every test runs under the no-upload fixture and records
// securitypolicyviolation events (none allowed). Downloads are read in Node: the PNG header (size, RGBA colour type).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import type { Download, Page, Route } from '@playwright/test';
import { COPY } from '../../src/tools/stamp-signature/copy';
import { expect, gotoReady, test } from './no-upload';

const INK = (name: string) => join(process.cwd(), 'tests', 'fixtures', 'ink', name);
const STAMP = INK('gt15.jpg');
const SIGN = INK('gt14.jpg');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const LAZY = /\/_astro\/(photo|pad)\.[\w-]{8}\.js|\/_astro\/ink\.worker/;

/** A PNG (RGB, 8 bit) drawn by `px(x, y)`, encoded here (no image library). */
function png(w: number, h: number, px: (x: number, y: number) => number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.fill(px(x, y), y * (w * 3 + 1) + 1 + x * 3, y * (w * 3 + 1) + 4 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Blank paper: nothing to find. */
const BLANK = { name: 'blank.png', mimeType: 'image/png', buffer: png(400, 300, () => 235) };
/** A dark page with a few bright specks: the whole page keys as ink. */
const DARK = { name: 'dark.png', mimeType: 'image/png', buffer: png(400, 300, (x, y) => (x % 16 < 2 && y % 16 < 2 ? 240 : 40)) };

/** Width, height and colour type of a saved PNG. */
async function pngInfo(d: Download): Promise<{ name: string; w: number; h: number; type: number }> {
  const buf = readFileSync((await d.path())!);
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(buf.subarray(12, 16).toString('latin1')).toBe('IHDR');
  return { name: d.suggestedFilename(), w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: buf[25]! };
}

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
});
test.afterEach(async ({ page }) => {
  if (page.isClosed() || page.url() === 'about:blank') return;
  const v = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => []);
  expect(v, 'securitypolicyviolation events').toEqual([]);
});

const photo = (page: Page) => page.locator('#ss-photo');

async function open(page: Page, file: string | typeof BLANK): Promise<void> {
  await page.setInputFiles('#ss-input', file);
}

async function ready(page: Page): Promise<void> {
  await expect(page.locator('#ss-download')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('#ss-previews')).toBeVisible();
}

async function save(page: Page, button = '#ss-download') {
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
  return pngInfo(d);
}

/** Alpha of the checkerboard preview at a share of its size (0..1). */
const alphaAt = (page: Page, fx: number, fy: number) =>
  page.locator('#ss-on-checker').evaluate((c: HTMLCanvasElement, [x, y]) => c.getContext('2d')!.getImageData(Math.floor(c.width * x!), Math.floor(c.height * y!), 1, 1).data[3], [fx, fy]);

async function chip(page: Page, label: string): Promise<void> {
  await photo(page).locator('label.chip', { hasText: label }).click();
}

async function notFound(route: Route): Promise<void> {
  const res = await route.fetch();
  await route.fulfill({ status: 404, headers: { ...res.headers(), 'content-type': 'text/plain' }, body: 'not found' });
}

test('the controls load on first use, the ink worker only after a photo; nothing leaves the device', async ({ page, network }) => {
  await gotoReady(page, '/stamp-signature/');
  expect(network.requests.filter((r) => LAZY.test(r.url())).map((r) => r.url()), 'controls with the page').toEqual([]);
  await open(page, STAMP);
  await ready(page);
  expect(network.requests.some((r) => /\/_astro\/ink\.worker/.test(r.url()))).toBe(true);
  expect(network.requests.some((r) => /\/_astro\/pad\./.test(r.url())), 'the pad before its tab').toBe(false);
});

test('photo tab, 도장: previews (transparent around, ink inside), 도장.png with alpha, each size downscales', async ({ page }) => {
  await gotoReady(page, '/stamp-signature/');
  await open(page, STAMP);
  await ready(page);
  await expect(page.locator('#ss-save-name')).toContainText('도장.png');
  expect(await alphaAt(page, 0.01, 0.01)).toBe(0);
  const full = await save(page);
  expect(full).toMatchObject({ name: '도장.png', type: 6 });
  const long = Math.max(full.w, full.h);
  for (const size of [1000, 600, 300]) {
    const label = `긴 변 ${size.toLocaleString('ko-KR')}픽셀`;
    const input = photo(page).locator('label.chip', { hasText: label }).locator('input');
    if (size > long) {
      await expect(input).toBeDisabled();
      continue;
    }
    await chip(page, label);
    const s = size.toLocaleString('ko-KR');
    await expect(page.locator('#ss-save-name')).toHaveText(new RegExp(`· (${s}×[\\d,]+|[\\d,]+×${s})픽셀$`));
    const out = await save(page);
    expect(out.type).toBe(6);
    expect(Math.max(out.w, out.h)).toBe(size);
  }
  // 여백 없이 자르기 makes the crop tighter.
  const fullText = `${full.w.toLocaleString('ko-KR')}×${full.h.toLocaleString('ko-KR')}픽셀`;
  await chip(page, '원본 크기');
  await expect(page.locator('#ss-save-name')).toContainText(fullText);
  await photo(page).getByLabel('여백 없이 자르기').check();
  await expect(page.locator('#ss-save-name')).not.toContainText(fullText);
  const tight = await save(page);
  expect(tight.w).toBeLessThan(full.w);
  expect(tight.h).toBeLessThan(full.h);
});

test('modes: 빨간 도장 keeps the stamp, 검정·파란 서명 drops it (no ink message, no download); a signature is 서명.png', async ({ page }) => {
  await gotoReady(page, '/stamp-signature/');
  await open(page, STAMP);
  await ready(page);
  await photo(page).getByRole('radio', { name: '검정·파란 서명' }).check();
  await expect(page.locator('#ss-error')).toHaveText(COPY.noink);
  await expect(page.locator('#ss-download')).toBeDisabled();
  await expect(page.locator('#ss-previews')).toBeHidden();
  await photo(page).getByRole('radio', { name: '빨간 도장' }).check();
  await ready(page);
  await expect(page.locator('#ss-error')).toBeHidden();
  for (const color of ['검은색', '파란색', '사진 속 색']) {
    await chip(page, color);
    await ready(page);
  }
  await page.locator('#ss-new').click();
  // A new photo starts from the defaults (자동).
  await open(page, SIGN);
  await ready(page);
  await expect(photo(page).getByRole('radio', { name: '자동' })).toBeChecked();
  await photo(page).getByRole('radio', { name: '검정·파란 서명' }).check();
  await ready(page);
  await page.locator('#ss-strength').fill('2');
  await expect(page.locator('#ss-strength-out')).toHaveText('아주 진하게');
  await ready(page);
  expect(await save(page)).toMatchObject({ name: '서명.png', type: 6 });
  // 빨간 도장 on a blue signature finds nothing: the message blocks the download (Arch ruling 5, C1 review).
  await photo(page).getByRole('radio', { name: '빨간 도장' }).check();
  await expect(page.locator('#ss-error')).toHaveText(COPY.noink);
  await expect(page.locator('#ss-download')).toBeDisabled();
  // A photo picked straight from the input (not through 다른 사진 고르기) also starts from the defaults (ruling 3).
  await open(page, STAMP);
  await ready(page);
  await expect(photo(page).getByRole('radio', { name: '자동' })).toBeChecked();
  await expect(page.locator('#ss-strength-out')).toHaveText('보통');
  await expect(page.locator('#ss-save-name')).toContainText('도장.png');
});

test('area check: blank paper and a dark page get their message and no download', async ({ page }) => {
  await gotoReady(page, '/stamp-signature/');
  await open(page, BLANK);
  await expect(page.locator('#ss-error')).toHaveText(COPY.noink, { timeout: 30_000 });
  await expect(page.locator('#ss-download')).toBeDisabled();
  await page.locator('#ss-new').click();
  await open(page, DARK);
  await expect(page.locator('#ss-error')).toHaveText(COPY.allpaper, { timeout: 30_000 });
  await expect(page.locator('#ss-download')).toBeDisabled();
  await expect(page.locator('#ss-previews')).toBeHidden();
});

test('not a photo, and a worker that cannot load: clear messages', async ({ page }) => {
  await gotoReady(page, '/stamp-signature/');
  await open(page, { name: 'note.png', mimeType: 'image/png', buffer: Buffer.from('not an image at all') });
  await expect(page.locator('#ss-error')).toHaveText('사진 파일이 아닙니다. JPG·PNG·WebP 파일을 선택해 주세요.');
  await page.route(/\/_astro\/ink\.worker/, notFound);
  await open(page, STAMP);
  await expect(page.locator('#engine-error')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#engine-error')).toContainText('파일에는 문제가 없습니다');
});

test('draw tab: download disabled until a stroke; stroke -> 서명.png with alpha; 되돌리기 and 지우기', async ({ page }) => {
  await gotoReady(page, '/stamp-signature/');
  await page.getByRole('tab', { name: '직접 그리기' }).click();
  await expect(page.locator('#ss-draw')).toBeVisible();
  await expect(page.locator('#ss-photo')).toBeHidden();
  const download = page.locator('#ss-pad-download');
  await expect(download).toBeDisabled();
  await expect(page.locator('#ss-pad-reason')).toHaveText(COPY.padEmpty);
  const stroke = async (y: number): Promise<void> => {
    // Measured each time: clicking a button below may have scrolled the page.
    await page.locator('#ss-pad').scrollIntoViewIfNeeded();
    const box = (await page.locator('#ss-pad').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width * (0.2 + i * 0.05), box.y + box.height * (y + (i % 2 ? 0.1 : -0.1)));
    await page.mouse.up();
  };
  await stroke(0.5);
  await expect(download).toBeEnabled();
  await expect(page.locator('#ss-pad-reason')).toBeHidden();
  await page.locator('#ss-draw label.chip', { hasText: '파란색' }).click();
  const out = await save(page, '#ss-pad-download');
  expect(out).toMatchObject({ name: '서명.png', type: 6 });
  expect(out.w).toBeGreaterThan(out.h);
  await page.getByRole('button', { name: '되돌리기' }).click();
  await expect(download).toBeDisabled();
  await stroke(0.3);
  await stroke(0.7);
  await page.getByRole('button', { name: '지우기' }).click();
  await expect(download).toBeDisabled();
  await expect(page.getByRole('button', { name: '되돌리기' })).toBeDisabled();
});

test('tabs: arrow keys move between the tabs and their panels', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Keyboard navigation of the tabs is a desktop path.');
  await gotoReady(page, '/stamp-signature/');
  const photoTab = page.getByRole('tab', { name: '사진으로 만들기' });
  const drawTab = page.getByRole('tab', { name: '직접 그리기' });
  await expect(photoTab).toHaveAttribute('aria-selected', 'true');
  await photoTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(drawTab).toBeFocused();
  await expect(drawTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#ss-draw')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(photoTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#ss-photo')).toBeVisible();
});

test('axe: empty, result, area message, draw tab with a stroke', async ({ page }) => {
  const check = async (state: string): Promise<void> => {
    const v = (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations;
    expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`), state).toEqual([]);
  };
  await gotoReady(page, '/stamp-signature/');
  await check('empty');
  await open(page, STAMP);
  await ready(page);
  await check('result');
  await photo(page).getByRole('radio', { name: '검정·파란 서명' }).check();
  await expect(page.locator('#ss-error')).toHaveText(COPY.noink);
  await check('area message');
  await page.getByRole('tab', { name: '직접 그리기' }).click();
  const box = (await page.locator('#ss-pad').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 60);
  await page.mouse.up();
  await expect(page.locator('#ss-pad-download')).toBeEnabled();
  await check('draw');
});
