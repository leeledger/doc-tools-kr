// 사진 배경 지우기 e2e (Sprint C, C2 test map). Runs only in the bg-* projects, against the flag-on build (dist-bg/,
// PUBLIC_BG_REMOVE=1). Every test runs under the no-upload fixture and records securitypolicyviolation events.
// The page flow uses a KB-size stand-in model (tests/fixtures/bgremove/tiny.onnx, scripts/model/birefnet/tiny.py)
// served with page.route in place of the real parts: the page code has no test hook. The engine (onnxruntime-web)
// is the real one from the build. One test (@model, chromium only, WASM) runs the real model on a CC0 fixture.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync, gunzipSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { Download, Page, Route } from '@playwright/test';
import { resizeMask } from '../../src/lib/bgremove/infer';
import { COPY } from '../../src/tools/remove-background/copy';

import { expect, gotoReady, test } from './no-upload';

const FIX = join(process.cwd(), 'tests', 'fixtures', 'bgremove');
/** The build's model pin (copy-vendor writes it; the flag-on build bundles it into the controller chunk). */
const PIN = JSON.parse(readFileSync(join(process.cwd(), 'src', 'generated', 'bgremove.json'), 'utf8')).model as { exportId: string; bytes: number; sha256Total: string };
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const PATH = '/remove-background/';
/** Anything the tool loads after a pick: the controller, its workers, the engine, the model. */
const HEAVY = /\/_astro\/(bg\.[\w-]{8}|infer\.worker|fusion\.worker)|\/vendor\/(onnxruntime-web|birefnet-lite-512)\//;
const MODEL = /\/vendor\/birefnet-lite-512\//;
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

/** An RGB PNG drawn by `px(x, y)` -> [r, g, b] (no image library). */
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

/** A red disc on light grey: the stand-in model keeps the disc. */
const SUBJECT = { name: '빨간공.png', mimeType: 'image/png', buffer: png(600, 400, (x, y) => ((x - 300) ** 2 + (y - 200) ** 2 < 120 ** 2 ? [220, 30, 30] : [230, 230, 230])) };
/** Flat grey: nothing to keep. */
const FLAT = { name: '회색.png', mimeType: 'image/png', buffer: png(300, 200, () => [230, 230, 230]) };

/**
 * Serves the stand-in model (2 parts + manifest) for the real model URLs. Responses carry the headers of the real
 * manifest response (CSP, cache), as the no-upload fixture checks them. `corrupt`: the second part is damaged.
 */
async function stubModel(page: Page, opts: { corrupt?: boolean } = {}): Promise<{ hits: string[] }> {
  const tiny = readFileSync(join(FIX, 'tiny.onnx'));
  const cut = Math.ceil(tiny.length / 2);
  const parts = [tiny.subarray(0, cut), tiny.subarray(cut)];
  const manifest = {
    exportId: PIN.exportId,
    bytes: tiny.length,
    parts: parts.map((b, i) => ({ name: `model.part${i}`, bytes: b.length, sha256: sha(b) })),
    sha256Total: sha(tiny),
  };
  // The page pins the model (bytes and total SHA-256 from src/generated/bgremove.json, bundled in the controller
  // chunk): the test rewrites those two values in the served chunk to the stand-in's. The page code is unchanged.
  await page.route(/\/_astro\/bg\.[\w-]+\.js$/, async (route: Route) => {
    const real = await route.fetch();
    const body = (await real.text()).replaceAll(PIN.sha256Total, manifest.sha256Total).replaceAll(`bytes:${PIN.bytes}`, `bytes:${tiny.length}`);
    if (!body.includes(manifest.sha256Total)) throw new Error('the model pin is not in the controller chunk');
    const h = { ...real.headers() };
    delete h['content-length'];
    delete h['content-encoding'];
    await route.fulfill({ status: 200, headers: h, body });
  });
  const hits: string[] = [];
  let headers: Record<string, string> | null = null;
  await page.route(MODEL, async (route: Route) => {
    const url = route.request().url();
    hits.push(url);
    if (!headers) {
      const real = await route.fetch({ url: url.replace(/[^/]+$/, 'manifest.json') });
      headers = { ...real.headers() };
      delete headers['content-length'];
      delete headers['content-encoding'];
    }
    const name = url.split('/').pop()!;
    if (name === 'manifest.json') return route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(manifest) });
    const i = Number(/^model\.part(\d+)$/.exec(name)?.[1] ?? -1);
    if (!parts[i]) return route.fulfill({ status: 404, headers, body: '' });
    const body = Buffer.from(parts[i]!);
    if (opts.corrupt && i === 1) body[body.length - 1] ^= 0xff;
    return route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'application/octet-stream' }, body });
  });
  return { hits };
}

test.describe.configure({ timeout: 180_000 });

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

const pick = (page: Page, file: string | typeof SUBJECT) => page.setInputFiles('#bg-input', file);

async function agree(page: Page): Promise<void> {
  await expect(page.locator('#bg-consent')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: '받고 시작' }).click();
}

async function done(page: Page): Promise<void> {
  await expect(page.locator('#bg-result')).toBeVisible({ timeout: 150_000 });
  await expect(page.locator('#bg-download')).toBeEnabled();
}

async function save(page: Page): Promise<{ name: string; buf: Buffer }> {
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#bg-download').click()]);
  return { name: (d as Download).suggestedFilename(), buf: readFileSync((await d.path())!) };
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('page load: no engine or model request, crossOriginIsolated, COEP only on this page', async ({ page, request }) => {
  const seen: string[] = [];
  page.on('request', (r) => seen.push(r.url()));
  const res = await gotoReady(page, PATH);
  expect(res!.headers()['cross-origin-embedder-policy']).toBe('require-corp');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await page.waitForTimeout(1500);
  expect(seen.filter((u) => HEAVY.test(u))).toEqual([]);
  // The limits and the size are stated above the picker; the stamp tool is one link away.
  await expect(page.locator('.bg-intro')).toContainText('유리나 투명한 물건, 여러 사람이 함께 나온 사진, 복잡한 배경은 잘 안 될 수 있어요.');
  await expect(page.locator('.bg-intro')).toContainText(/처음 한 번 약 \d+ MB를 받아요\./);
  await expect(page.locator('.bg-intro a')).toHaveAttribute('href', '/stamp-signature/');
  // Arch C2 round 2: never for ID photos; the limits say so, with the 외교부 source.
  await expect(page.locator('.bg-intro')).not.toContainText('증명사진');
  await expect(page.locator('.bg-limits')).toContainText('여권·증명사진 제출용으로는 쓰지 마세요.');
  await expect(page.locator('.bg-limits a')).toHaveAttribute('href', 'https://www.passport.go.kr/home/kor/contents.do?menuPos=12');
  await expect(page.locator('#bg-tool a[href="/id-photo/"]')).toHaveCount(0);
  for (const other of ['/', '/stamp-signature/', '/id-photo/']) {
    const h = (await request.get(other)).headers();
    expect(h['cross-origin-embedder-policy'], other).toBeUndefined();
    expect(h['cross-origin-opener-policy'], other).toBe('same-origin');
  }
});

test('consent: 취소 downloads nothing; 받고 시작 downloads with progress, cuts out, saves PNG and JPG; the second photo needs no consent', async ({ page }) => {
  const { hits } = await stubModel(page);
  await gotoReady(page, PATH);
  await pick(page, SUBJECT);
  await expect(page.locator('#bg-consent-text')).toHaveText(/^배경을 지우는 프로그램 [\d.]+ MB를 한 번 받아요 \(와이파이 권장\)\.$/, { timeout: 30_000 });
  await page.locator('#bg-consent-cancel').click();
  await expect(page.locator('#bg-drop')).toBeVisible();
  await expect(page.locator('#bg-consent')).toBeHidden();
  expect(hits).toEqual([]);

  await pick(page, SUBJECT);
  await agree(page);
  await done(page);
  expect(hits.some((u) => u.endsWith('/manifest.json'))).toBe(true);
  await expect(page.locator('#bg-done-title')).toBeFocused();
  await expect(page.locator('#bg-tool')).toHaveAttribute('data-state', 'done');
  await expect(page.locator('#bg-save-name')).toContainText('누끼.png · 600×400픽셀');

  const t = await save(page);
  expect(t.name).toBe('누끼.png');
  expect(t.buf.subarray(0, 8)).toEqual(PNG_MAGIC);
  expect([t.buf.readUInt32BE(16), t.buf.readUInt32BE(20), t.buf[25]]).toEqual([600, 400, 6]);

  await page.getByRole('radio', { name: '흰색' }).check();
  await expect(page.locator('#bg-stage')).toHaveAttribute('data-bg', 'white');
  await expect(page.locator('#bg-download')).toHaveText('JPG로 내려받기');
  const w = await save(page);
  expect(w.name).toBe('누끼-흰배경.jpg');
  expect(w.buf.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  await page.getByRole('radio', { name: 'PNG' }).check();
  expect((await save(page)).name).toBe('누끼-흰배경.png');
  await page.getByRole('radio', { name: '파란색' }).check();
  expect((await save(page)).name).toBe('누끼-파란배경.png');

  const compare = page.locator('#bg-compare');
  await compare.click();
  await expect(compare).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#bg-canvas')).toHaveAttribute('aria-label', '원본 사진');
  await compare.click();
  await expect(page.locator('#bg-canvas')).toHaveAttribute('aria-label', /배경을 지운 결과 미리보기, 파란색 배경/);

  // Second photo: everything is in this tool's Cache Storage, so no consent and no model request.
  const before = hits.length;
  await page.locator('#bg-new').click();
  await pick(page, SUBJECT);
  await done(page);
  await expect(page.locator('#bg-consent')).toBeHidden();
  expect(hits.length).toBe(before);
});

test('no subject: the message and the /stamp-signature/ pointer, no download', async ({ page }) => {
  await stubModel(page);
  await gotoReady(page, PATH);
  await pick(page, FLAT);
  await agree(page);
  await expect(page.locator('#bg-nosubject')).toBeVisible({ timeout: 150_000 });
  await expect(page.locator('#bg-nosubject')).toContainText(COPY.nosubject);
  await expect(page.locator('#bg-nosubject a')).toHaveAttribute('href', '/stamp-signature/');
  await expect(page.locator('#bg-result')).toBeHidden();
  await page.locator('#bg-nosubject [data-new]').click();
  await expect(page.locator('#bg-drop')).toBeVisible();
});

test('a damaged part: "손상" error, nothing cached for it; 다시 시도 with a good part works', async ({ page }) => {
  await stubModel(page, { corrupt: true });
  await gotoReady(page, PATH);
  await pick(page, SUBJECT);
  await agree(page);
  await expect(page.locator('#bg-error')).toHaveText(COPY.corrupt, { timeout: 60_000 });
  await expect(page.locator('#bg-retry')).toBeVisible();
  await page.unroute(MODEL);
  await stubModel(page);
  await page.locator('#bg-retry').click();
  await done(page);
});

test('axe: empty, consent, result, no subject', async ({ page }) => {
  const check = async (state: string): Promise<void> => {
    const v = (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations;
    expect(v.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`), state).toEqual([]);
  };
  await stubModel(page);
  await gotoReady(page, PATH);
  await check('empty');
  await pick(page, SUBJECT);
  await expect(page.locator('#bg-consent')).toBeVisible({ timeout: 30_000 });
  await check('consent');
  await page.getByRole('button', { name: '받고 시작' }).click();
  await done(page);
  await check('result');
  await page.locator('#bg-new').click();
  await pick(page, FLAT);
  await expect(page.locator('#bg-nosubject')).toBeVisible({ timeout: 150_000 });
  await check('no subject');
});

test('@model the real model on the WASM engine: IoU ≥ 0.99 against the stored Python mask (CC0 fixture)', async ({ page }, info) => {
  test.skip(info.project.name !== 'bg-chromium', 'real model: chromium only (brief C2 test map)');
  test.setTimeout(600_000);
  // WASM: the page sees no WebGPU (test-side; the page code is unchanged).
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
  await gotoReady(page, PATH);
  await pick(page, join(FIX, 'cc0-dog.jpg'));
  await agree(page);
  await expect(page.locator('#bg-result')).toBeVisible({ timeout: 540_000 });
  const t = await save(page);
  const img = await loadImage(t.buf);
  expect([img.width, img.height]).toEqual([640, 480]);
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const alpha = g.getImageData(0, 0, img.width, img.height).data;
  const u16 = new Uint16Array(new Uint8Array(gunzipSync(readFileSync(join(FIX, 'cc0-dog.mask.u16.gz')))).buffer);
  const ref = resizeMask(Float32Array.from(u16, (v) => v / 65535), 512, 512, img.width, img.height);
  let inter = 0;
  let union = 0;
  for (let i = 0; i < ref.length; i++) {
    const a = alpha[i * 4 + 3]! > 127;
    const b = ref[i]! > 127;
    if (a && b) inter++;
    if (a || b) union++;
  }
  expect(inter / union).toBeGreaterThanOrEqual(0.99);
});
