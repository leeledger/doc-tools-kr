// 사진 배경 지우기, cloud path (C2-cloud, brief handoff/ARCHITECT-BRIEF-C2-CLOUD.md §10). Runs only in the cloud-*
// projects, against dist-bgcloud/ (PUBLIC_BG_REMOVE=1, PUBLIC_BG_CLOUD=1). /api/remove-bg never reaches Cloudflare:
// page.route answers it with committed RGBA WebP fixtures (tests/fixtures/build-bgcloud.mjs) or an error status.
// The no-upload fixture stays on, with exactly one allowed request: POST /api/remove-bg (no query); every other
// request of every test is held to the strict rule.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import type { Page, Request, Route } from '@playwright/test';
import { sniffImage } from '../../src/lib/image/sniff';
import { CLOUD, COPY } from '../../src/tools/remove-background/copy';
import { expect, gotoReady, test } from './no-upload';

test.use({ allowUpload: [{ method: 'POST', path: '/api/remove-bg' }] });
test.describe.configure({ timeout: 90_000 });

const PATH = '/remove-background/';
const API = /\/api\/remove-bg$/;
const FIX = join(process.cwd(), 'tests', 'fixtures');
const DISC = readFileSync(join(FIX, 'bgcloud', 'disc.webp'));
const EMPTY = readFileSync(join(FIX, 'bgcloud', 'empty.webp'));
const GPS = { name: 'gps.jpg', mimeType: 'image/jpeg', buffer: readFileSync(join(FIX, 'photo', 'exif6_gps.jpg')) };
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
/** Anything only the on-device path loads. */
const DEVICE = /\/vendor\/(onnxruntime-web|birefnet-lite-512)\//;

/** An RGB PNG drawn by `px(x, y)` (no image library). */
function png(w: number, h: number, px: (x: number, y: number) => [number, number, number]): Buffer {
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
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(px(x, y), y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** A red disc on light grey, 600×400 (the disc.webp fixture is its alpha). */
const SUBJECT = { name: '빨간공.png', mimeType: 'image/png', buffer: png(600, 400, (x, y) => ((x - 300) ** 2 + (y - 200) ** 2 < 120 ** 2 ? [220, 30, 30] : [230, 230, 230])) };
/** The same picture at 2400×1600: the copy that is sent must be 1024×683. */
const BIG = { name: '큰사진.png', mimeType: 'image/png', buffer: png(2400, 1600, (x, y) => ((x - 1200) ** 2 + (y - 800) ** 2 < 480 ** 2 ? [220, 30, 30] : [230, 230, 230])) };

type Answer = { status: number; body?: Buffer | string; type?: string } | 'hold' | 'abort';

/** Answers POST /api/remove-bg in order (the last answer repeats) and records every request's body. */
async function api(page: Page, ...answers: Answer[]): Promise<{ bodies: Buffer[]; types: string[]; held: Route[] }> {
  const bodies: Buffer[] = [];
  const types: string[] = [];
  const held: Route[] = [];
  await page.route(API, async (route: Route) => {
    const r: Request = route.request();
    expect(r.method()).toBe('POST');
    bodies.push(r.postDataBuffer() ?? Buffer.alloc(0));
    types.push((await r.allHeaders())['content-type'] ?? '');
    const a = answers[Math.min(bodies.length - 1, answers.length - 1)]!;
    if (a === 'hold') return void held.push(route);
    if (a === 'abort') return route.abort('failed');
    const isImage = Buffer.isBuffer(a.body);
    await route.fulfill({
      status: a.status,
      headers: { 'content-type': a.type ?? (isImage ? 'image/webp' : 'application/json'), 'cache-control': 'no-store, private' },
      body: a.body ?? '',
    });
  });
  return { bodies, types, held };
}

const ok: Answer = { status: 200, body: DISC };
const pick = (page: Page, file: typeof SUBJECT) => page.setInputFiles('#bg-input', file);

async function ready(page: Page): Promise<void> {
  await expect(page.locator('#bg-ready')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#bg-tool')).toHaveAttribute('data-state', 'ready');
}

/** The result canvas pixel at (x, y), as RGBA. */
const pixel = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => Array.from((document.getElementById('bg-canvas') as HTMLCanvasElement).getContext('2d')!.getImageData(px!, py!, 1, 1).data), [x, y]);

/** The JPEG markers before the first scan. */
function markers(b: Buffer): number[] {
  const out: number[] = [];
  let i = 2;
  while (i + 3 < b.length && b[i] === 0xff) {
    out.push(b[i + 1]!);
    if (b[i + 1] === 0xda) break;
    i += 2 + b.readUInt16BE(i + 2);
  }
  return out;
}

function expectCleanCopy(body: Buffer, w: number, h: number): void {
  const s = sniffImage(new Uint8Array(body));
  expect(s.format).toBe('jpeg');
  expect([s.width, s.height]).toEqual([w, h]);
  expect(Math.max(s.width!, s.height!)).toBeLessThanOrEqual(1024);
  expect(markers(body)).not.toContain(0xe1);
  expect(s.hasExif || s.hasXmp || s.hasGps).toBe(false);
  expect(body.length).toBeLessThan(2_000_000);
}

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

test('notice above the picker; a pick sends nothing; 배경 지우기 sends one copy, keeps the alpha and the photo colours', async ({ page }) => {
  const seen: string[] = [];
  page.on('request', (r) => seen.push(`${r.method()} ${r.url()}`));
  const { bodies, types } = await api(page, ok);
  await gotoReady(page, PATH);
  const notice = page.locator('#bg-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(CLOUD.notice);
  await expect(notice.locator('a')).toHaveAttribute('href', '/privacy/#bg');
  await expect(notice).toContainText(/보내고 싶지 않으면 사진을 보내지 않고 기기에서 처리를 고르세요 \(처음 한 번 약 \d+ MB\)\./);
  await expect(page.locator('.bg-privacy')).toHaveCount(0);
  await expect(page.locator('.lead')).not.toContainText('이 기기 안에서만');

  await pick(page, SUBJECT);
  await ready(page);
  await expect(page.locator('#bg-send')).toBeFocused();
  await expect(page.locator('#bg-send')).toHaveAttribute('aria-describedby', 'bg-notice');
  await expect(page.locator('#bg-device')).toHaveText(/^사진을 보내지 않고 기기에서 처리 \(처음 한 번 약 \d+ MB 받기\)$/);
  await page.waitForTimeout(500);
  expect(bodies).toHaveLength(0);
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

  await page.locator('#bg-send').click();
  await expect(page.locator('#bg-result')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#bg-download')).toBeEnabled();
  await expect(page.locator('#bg-save-name')).toContainText('누끼.png · 600×400픽셀');
  expect(bodies).toHaveLength(1);
  expect(types[0]).toBe('image/jpeg');
  expectCleanCopy(bodies[0]!, 600, 400);
  // The alpha came from the answer; the colours from the photo on the device (the fixture's RGB is pure red).
  const centre = await pixel(page, 300, 200);
  expect(centre[3]).toBe(255);
  expect(Math.abs(centre[0]! - 220) + Math.abs(centre[1]! - 30) + Math.abs(centre[2]! - 30)).toBeLessThan(30);
  expect((await pixel(page, 10, 10))[3]).toBe(0);
  // Only the page, its scripts and the one POST: never the on-device engine or model.
  expect(seen.filter((s) => DEVICE.test(s))).toEqual([]);
  expect(seen.filter((s) => s.startsWith('POST'))).toHaveLength(1);
});

test('a large photo is sent as a 1024 px copy; a GPS-tagged, rotated JPEG leaves without EXIF and upright', async ({ page }) => {
  const { bodies } = await api(page, { status: 500, body: '{"error":"engine"}' });
  await gotoReady(page, PATH);
  await pick(page, BIG);
  await ready(page);
  await page.locator('#bg-send').click();
  await expect(page.locator('#bg-error')).toHaveText(CLOUD.failed, { timeout: 30_000 });
  expectCleanCopy(bodies[0]!, 1024, 683);

  await pick(page, GPS);
  await ready(page);
  await page.locator('#bg-send').click();
  await expect(page.locator('#bg-error')).toHaveText(CLOUD.failed, { timeout: 30_000 });
  // exif6_gps.jpg is 1200×900 stored with orientation 6: the copy is upright (portrait) and capped at 1024.
  expectCleanCopy(bodies[1]!, 768, 1024);
  expect(bodies[1]!.includes(Buffer.from('Exif\0\0', 'latin1'))).toBe(false);
});

test('429: the busy line with 다시 시도 and 기기에서 처리; 다시 시도 sends once more and finishes', async ({ page }) => {
  const { bodies } = await api(page, { status: 429, body: '{"error":"busy"}' }, ok);
  await gotoReady(page, PATH);
  await pick(page, SUBJECT);
  await ready(page);
  await page.locator('#bg-send').click();
  await expect(page.locator('#bg-error')).toHaveText(CLOUD.busy, { timeout: 30_000 });
  await expect(page.locator('#bg-retry')).toBeVisible();
  await expect(page.locator('#bg-device-retry')).toHaveText(CLOUD.deviceButton);
  // Nothing is retried by itself.
  await page.waitForTimeout(1000);
  expect(bodies).toHaveLength(1);
  await page.locator('#bg-retry').click();
  await expect(page.locator('#bg-result')).toBeVisible({ timeout: 30_000 });
  expect(bodies).toHaveLength(2);
  await expect(page.locator('#bg-error')).toBeHidden();
});

test('503 quota: the notice, and the on-device consent opens without a second request; nothing is remembered', async ({ page }) => {
  const seen: string[] = [];
  page.on('request', (r) => seen.push(r.url()));
  const { bodies } = await api(page, { status: 503, body: '{"error":"quota"}' });
  await gotoReady(page, PATH);
  await pick(page, SUBJECT);
  await ready(page);
  await page.locator('#bg-send').click();
  await expect(page.locator('#bg-error')).toHaveText(CLOUD.quota, { timeout: 30_000 });
  await expect(page.locator('#bg-consent')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#bg-retry')).toBeHidden();
  expect(bodies).toHaveLength(1);
  expect(seen.filter((u) => DEVICE.test(u) && !u.endsWith('/manifest.json'))).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('docttak-bg-mode'))).toBeNull();
  // 취소 in the consent panel: back to the picker.
  await page.locator('#bg-consent-cancel').click();
  await expect(page.locator('#bg-drop')).toBeVisible();
});

test('5xx, a dropped connection and 30 s without an answer: the "지금은 처리할 수 없어요" line with both buttons', async ({ page }) => {
  await page.clock.install();
  const { bodies, held } = await api(page, { status: 502, body: '{"error":"engine"}' }, 'abort', 'hold');
  await gotoReady(page, PATH);
  await pick(page, SUBJECT);
  await ready(page);
  await page.locator('#bg-send').click();
  await expect(page.locator('#bg-error')).toHaveText(CLOUD.failed, { timeout: 30_000 });
  await expect(page.locator('#bg-device-retry')).toBeVisible();
  await page.locator('#bg-retry').click();
  await expect.poll(() => bodies.length).toBe(2);
  await expect(page.locator('#bg-error')).toHaveText(CLOUD.failed, { timeout: 30_000 });
  await page.locator('#bg-retry').click();
  await expect.poll(() => held.length).toBe(1);
  await expect(page.locator('#bg-progress-text')).toHaveText(CLOUD.sending);
  await page.clock.runFor(2_000);
  await expect(page.locator('#bg-progress-text')).toHaveText(CLOUD.working);
  await page.clock.runFor(30_000);
  await expect(page.locator('#bg-error')).toHaveText(CLOUD.failed, { timeout: 30_000 });
  await expect(page.locator('#bg-retry')).toBeVisible();
  await expect(page.locator('#bg-device-retry')).toBeVisible();
  expect(bodies).toHaveLength(3);
  await held[0]!.abort().catch(() => undefined);
});

test('취소 while sending: back to the picker, no result', async ({ page }) => {
  const { held } = await api(page, 'hold');
  await gotoReady(page, PATH);
  await pick(page, SUBJECT);
  await ready(page);
  await page.locator('#bg-send').click();
  await expect.poll(() => held.length).toBe(1);
  await page.locator('#bg-cancel').click();
  await expect(page.locator('#bg-drop')).toBeVisible();
  await expect(page.locator('#bg-tool')).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#bg-status')).toHaveText(CLOUD.sendCancelled);
  await held[0]!.fulfill({ status: 200, headers: { 'content-type': 'image/webp' }, body: DISC }).catch(() => undefined);
  await page.waitForTimeout(500);
  await expect(page.locator('#bg-result')).toBeHidden();
});

test('an answer with no subject shows the nosubject panel', async ({ page }) => {
  await api(page, { status: 200, body: EMPTY });
  await gotoReady(page, PATH);
  await pick(page, SUBJECT);
  await ready(page);
  await page.locator('#bg-send').click();
  await expect(page.locator('#bg-nosubject')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#bg-nosubject-text')).toHaveText(COPY.nosubject);
});

test('"사진을 보내지 않고 기기에서 처리": the C2 consent, remembered on reload (no ready panel, nothing sent), and undone', async ({ page }) => {
  const { bodies } = await api(page, ok);
  await gotoReady(page, PATH);
  await pick(page, SUBJECT);
  await ready(page);
  await page.locator('#bg-device').click();
  await expect(page.locator('#bg-consent')).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => localStorage.getItem('docttak-bg-mode'))).toBe('device');
  await page.locator('#bg-consent-cancel').click();
  await expect(page.locator('#bg-mode')).toBeVisible();
  await expect(page.locator('#bg-mode')).toContainText(CLOUD.modeLine);

  await gotoReady(page, PATH);
  await pick(page, SUBJECT);
  await expect(page.locator('#bg-consent')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#bg-ready')).toBeHidden();
  await page.locator('#bg-consent-cancel').click();
  await expect(page.locator('#bg-drop')).toBeVisible();
  await expect(page.locator('#bg-mode')).toBeVisible();
  await page.locator('#bg-mode-back').click();
  await expect(page.locator('#bg-mode')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('docttak-bg-mode'))).toBeNull();
  await pick(page, SUBJECT);
  await ready(page);
  expect(bodies).toHaveLength(0);
});

test('the exception wording is on the home, privacy and terms pages, with the officer line; never on another tool', async ({ page }) => {
  await gotoReady(page, '/');
  await expect(page.locator('.hero-note')).toHaveText('* 배경 지우기만 예외예요. 사진을 잠깐 보내 처리하고 바로 지워요. 원하면 보내지 않고 처리할 수도 있어요.');
  await gotoReady(page, '/privacy/');
  await expect(page.locator('#bg')).toHaveText('3. 배경 지우기에서 사진을 보내는 경우');
  await expect(page.locator('.prose')).toContainText('개인정보 보호책임자');
  await expect(page.locator('.prose')).toContainText('이름 이종림, 연락처 robotncoding@kakao.com');
  await gotoReady(page, '/terms/');
  await expect(page.locator('.prose')).toContainText('다만 사진 배경 지우기는 예외로');
  await gotoReady(page, '/photo-compress/');
  await expect(page.locator('body')).not.toContainText('배경 지우기는 예외');
  await expect(page.locator('body')).not.toContainText('Cloudflare(미국 회사)');
});
