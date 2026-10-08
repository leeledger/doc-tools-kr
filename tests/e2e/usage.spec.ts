// Anonymous usage statistics e2e (brief handoff/ARCHITECT-BRIEF-USAGE.md, "Test map"). Runs only in the cloud-*
// projects, against dist-bgcloud/ (built with PUBLIC_USAGE_STATS=1). Every POST /api/usage is recorded from the
// browser context and answered 204 by page.route: nothing reaches a Function. The no-upload fixture stays on with
// exactly one allowed request, POST /api/usage (no query); the default (flag-off) projects keep the strict rule, which
// is the "off sends nothing" regression test.
import { readFileSync } from 'node:fs';
import type { Page, Request } from '@playwright/test';
import { validate } from '../../scripts/lib/usage.mjs';
import { expect, gotoReady, test } from './no-upload';
import { fixturePath, photoFixture, photoRuntime, runtimePath } from './paths';

test.use({ allowUpload: [{ method: 'POST', path: '/api/usage' }] });
test.describe.configure({ timeout: 120_000 });

const PORTRAIT = photoFixture('portrait_pd.jpg');
const PORTRAIT_NAME = 'portrait_pd';
const PORTRAIT_SIZE = String(readFileSync(PORTRAIT).length);
/** legal.ts reads build-time constants, so the date is read from its source here. */
const PRIVACY_USAGE = /PRIVACY_USAGE = '([^']+)'/.exec(readFileSync('src/data/legal.ts', 'utf8'))![1]!;
const KEYS = new Set(['e', 't', 'c', 'p', 'o', 'v', 'g', 'dl', 'via', 'd', 'br', 'b', 'w']);

interface Beacon {
  method: string;
  type: string;
  body: string;
  ev: Record<string, unknown>;
}

/** Records every POST /api/usage of the page's context and answers it 204. */
async function record(page: Page): Promise<Beacon[]> {
  const seen: Beacon[] = [];
  page.context().on('request', (r: Request) => {
    if (new URL(r.url()).pathname !== '/api/usage') return;
    const body = r.postData() ?? '';
    let ev: Record<string, unknown> = {};
    try {
      ev = JSON.parse(body) as Record<string, unknown>;
    } catch {
      // Left empty: the assertions below fail on it.
    }
    seen.push({ method: r.method(), type: r.headers()['content-type'] ?? '', body, ev });
  });
  await page.route('**/api/usage', (route) => route.fulfill({ status: 204, body: '' }));
  return seen;
}

/** Every beacon: POST, text/plain, a body the server accepts, whitelisted keys, nothing about the file. */
function expectClean(beacons: Beacon[]): void {
  for (const b of beacons) {
    expect(b.method).toBe('POST');
    expect(b.type).toMatch(/^text\/plain/);
    expect(validate(b.body), b.body).not.toBeNull();
    expect(Object.keys(b.ev).every((k) => KEYS.has(k)), b.body).toBe(true);
    expect(b.body).not.toContain(PORTRAIT_NAME);
    expect(b.body).not.toContain(PORTRAIT_SIZE);
  }
}

const canCompress = (page: Page): Promise<boolean> =>
  page.evaluate(() => typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function' && new OffscreenCanvas(1, 1).getContext('2d') !== null);

test('사진 용량 줄이기: pick, start (target-kb bucket), success, download, in order; nothing about the file', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/photo-compress/?target=200');
  test.skip(!(await canCompress(page)), 'This browser has no OffscreenCanvas (Playwright WebKit on Windows).');
  await page.setInputFiles('#ph-input', PORTRAIT);
  await expect(page.locator('#ph-list .info', { hasText: '확인 중' })).toHaveCount(0);
  await page.getByRole('button', { name: '사진 용량 줄이기', exact: true }).click();
  await expect(page.locator('#photo-tool')).toHaveAttribute('data-state', 'done', { timeout: 110_000 });
  await Promise.all([page.waitForEvent('download'), page.locator('#ph-list a[data-role="download"]').first().click()]);
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['pick', 'start', 'success', 'download']);
  expectClean(beacons);
  expect(beacons[1]!.ev).toMatchObject({ e: 'start', t: 'photo-compress', o: 'target-kb', v: 'le200' });
  for (const b of beacons) expect(b.ev).toMatchObject({ t: 'photo-compress', via: 'direct', w: 1 });
  expect(beacons.some((b) => b.ev.e === 'arrive')).toBe(false);
});

test('사진 PDF 변환 (TOOLS4 T2): pick, start (o=page, v=a4), success, download, in order; no file name, size or page count', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/jpg-to-pdf/');
  test.skip(!(await canCompress(page)), 'This browser has no OffscreenCanvas (Playwright WebKit on Windows).');
  await page.setInputFiles('#jp-input', PORTRAIT);
  await expect(page.locator('#jp-run')).toBeEnabled();
  await page.locator('#jp-run').click();
  await expect(page.locator('#jp-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await Promise.all([page.waitForEvent('download'), page.locator('#jp-download').click()]);
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['pick', 'start', 'success', 'download']);
  expectClean(beacons);
  expect(beacons[1]!.ev).toMatchObject({ e: 'start', t: 'jpg-to-pdf', o: 'page', v: 'a4' });
  for (const b of beacons) {
    expect(b.ev).toMatchObject({ t: 'jpg-to-pdf', via: 'direct', w: 1 });
    // No count of any kind (pages, photos): the weight is the only number, and no value holds 쪽 or 장.
    expect(Object.keys(b.ev).filter((k) => k !== 'w' && typeof b.ev[k] === 'number')).toEqual([]);
    expect(b.body).not.toMatch(/쪽|장/);
  }
});

test('PDF JPG 변환 (TOOLS4 T3): pick, start (o=ppi, v=p150), success, download, in order; wrong password = fail; no name, size, page count or password', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/pdf-to-jpg/');
  await page.setInputFiles('#pj-input', runtimePath('encrypted_userpw_1234'));
  await page.locator('#pj-pw-input').fill('0000');
  // Two submits at once (double Enter) are one attempt: exactly one fail(wrong-password) below (T3 review Should Fix 1).
  await page.locator('#pj-pw').evaluate((f: HTMLFormElement) => {
    f.requestSubmit();
    f.requestSubmit();
  });
  await expect(page.locator('#pj-pw-error')).not.toHaveText('');
  await page.locator('#pj-pw-input').fill('1234');
  await page.locator('#pj-pw-input').press('Enter');
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'ready');
  await page.locator('#pj-run').click();
  await expect(page.locator('#pj-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await Promise.all([page.waitForEvent('download'), page.locator('#pj-download').click()]);
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['pick', 'fail', 'start', 'success', 'download']);
  expectClean(beacons);
  expect(beacons[1]!.ev).toMatchObject({ e: 'fail', t: 'pdf-to-jpg', c: 'wrong-password', p: 'parse' });
  expect(beacons[2]!.ev).toMatchObject({ e: 'start', t: 'pdf-to-jpg', o: 'ppi', v: 'p150' });
  const size = String(readFileSync(runtimePath('encrypted_userpw_1234')).length);
  for (const b of beacons) {
    expect(b.ev).toMatchObject({ t: 'pdf-to-jpg', via: 'direct', w: 1 });
    expect(Object.keys(b.ev).filter((k) => k !== 'w' && typeof b.ev[k] === 'number')).toEqual([]);
    expect(b.body).not.toMatch(/쪽|장|encrypted/);
    // The typed passwords and the file size appear in no value (the build id b is a hash, left out of this check).
    for (const [k, v] of Object.entries(b.ev)) if (k !== 'b') expect(String(v), k).not.toMatch(new RegExp(`1234|0000|${size}`));
  }
});

test('PDF 암호 해제·설정 (TOOLS4 T4): lock = pick, start (o=action, v=lock), success, download; wrong password = fail; no password, file name or page count in any body', async ({ page }) => {
  const beacons = await record(page);
  const password = '문서딱암호12';
  await gotoReady(page, '/pdf-password/');
  await page.locator('label.chip', { hasText: '암호 걸기' }).click();
  await page.setInputFiles('#pp-input', fixturePath('gen_links_outline.pdf'));
  await page.locator('#pp-new').fill(password);
  await page.locator('#pp-again').fill(password);
  await page.locator('#pp-again').press('Enter');
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await Promise.all([page.waitForEvent('download'), page.locator('#pp-download').click()]);
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['pick', 'start', 'success', 'download']);
  expect(beacons[1]!.ev).toMatchObject({ e: 'start', t: 'pdf-password', o: 'action', v: 'lock' });

  // 암호 풀기 with a wrong password, then the right one.
  await page.locator('#pp-reset').click();
  await page.locator('label.chip', { hasText: '암호 풀기' }).click();
  await page.setInputFiles('#pp-input', runtimePath('encrypted_userpw_1234'));
  await page.locator('#pp-pw').fill('0000');
  await page.locator('#pp-pw').press('Enter');
  await expect(page.locator('#pp-unlock-error')).not.toHaveText('');
  await page.locator('#pp-pw').fill('1234');
  await page.locator('#pp-pw').press('Enter');
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['pick', 'start', 'success', 'download', 'pick', 'start', 'fail', 'start', 'success']);
  expect(beacons[5]!.ev).toMatchObject({ e: 'start', t: 'pdf-password', o: 'action', v: 'unlock' });
  expect(beacons[6]!.ev).toMatchObject({ e: 'fail', t: 'pdf-password', c: 'wrong-password', p: 'process' });
  expectClean(beacons);
  for (const b of beacons) {
    expect(b.ev).toMatchObject({ t: 'pdf-password', via: 'direct', w: 1 });
    expect(Object.keys(b.ev).filter((k) => k !== 'w' && typeof b.ev[k] === 'number')).toEqual([]);
    expect(b.body).not.toContain(password);
    expect(b.body).not.toMatch(/gen_links_outline|encrypted|쪽/);
    for (const [k, v] of Object.entries(b.ev)) if (k !== 'b') expect(String(v), k).not.toMatch(/1234|0000|문서딱/);
  }
});

test('사진 JPG 변환 (TOOLS5 U1): a batch with three HEIC this browser cannot open sends fail c=heic exactly once; then start (o=to, v=webp), success, download; no name, size or count', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/image-to-jpg/');
  const heic = readFileSync(photoRuntime('fake.heic'));
  const heics = ['IMG_0001.HEIC', 'IMG_0002.HEIC', 'IMG_0003.HEIC'].map((name) => ({ name, mimeType: 'image/heic', buffer: heic }));
  await page.setInputFiles('#ij-input', [...heics, { name: 'portrait_pd.jpg', mimeType: 'image/jpeg', buffer: readFileSync(PORTRAIT) }]);
  await expect(page.locator('#ij-list .file-error')).toHaveCount(3);
  await page.locator('label.chip', { hasText: 'WebP' }).click();
  await page.locator('#ij-run').click();
  await expect(page.locator('#ij-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await Promise.all([page.waitForEvent('download'), page.locator('#ij-download').click()]);
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['pick', 'fail', 'start', 'success', 'download']);
  expectClean(beacons);
  expect(beacons[1]!.ev).toMatchObject({ e: 'fail', t: 'image-to-jpg', c: 'heic', p: 'parse' });
  expect(typeof beacons[1]!.ev.br).toBe('string');
  expect(beacons[2]!.ev).toMatchObject({ e: 'start', t: 'image-to-jpg', o: 'to', v: 'webp' });
  for (const b of beacons) {
    expect(b.ev).toMatchObject({ t: 'image-to-jpg', via: 'direct', w: 1 });
    expect(Object.keys(b.ev).filter((k) => k !== 'w' && typeof b.ev[k] === 'number')).toEqual([]);
    expect(b.body).not.toMatch(/IMG_000|장/);
  }
});

test('PDF 용량 줄이기 with a file that is not a PDF: fail with code not-pdf', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/pdf-compress/');
  await page.setInputFiles('#cmp-input', runtimePath('not_a_pdf'));
  await expect(page.locator('#cmp-error')).toContainText('PDF 파일이 아니어서');
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['pick', 'fail']);
  expectClean(beacons);
  expect(beacons[1]!.ev).toMatchObject({ e: 'fail', t: 'pdf-compress', c: 'not-pdf', p: 'parse' });
  expect(typeof beacons[1]!.ev.br).toBe('string');
});

test('guide -> tool: the guide CTA sends one arrive (g, dl=1) and later events say via=guide; a direct open sends no arrive', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/guide/photo-kb/');
  await page.locator('.guide-cta a').click();
  await page.waitForURL(/\/photo-compress\/\?target=500$/);
  await page.waitForFunction(() => document.readyState === 'complete');
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['arrive']);
  expect(beacons[0]!.ev).toMatchObject({ e: 'arrive', t: 'photo-compress', g: 'photo-kb', dl: '1', via: 'guide' });
  test.skip(!(await canCompress(page)), 'This browser has no OffscreenCanvas (Playwright WebKit on Windows).');
  await page.setInputFiles('#ph-input', PORTRAIT);
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['arrive', 'pick']);
  expect(beacons[1]!.ev).toMatchObject({ e: 'pick', via: 'guide' });
  expectClean(beacons);

  const direct = await page.context().newPage();
  const directBeacons = await record(direct);
  await gotoReady(direct, '/photo-compress/');
  await direct.setInputFiles('#ph-input', PORTRAIT);
  await expect.poll(() => directBeacons.map((b) => b.ev.e)).toEqual(['pick']);
  expect(directBeacons[0]!.ev).toMatchObject({ via: 'direct' });
  await direct.close();
});

test('/privacy/ names the usage statistics: the section, its date, the cookie sentence', async ({ page }) => {
  await gotoReady(page, '/privacy/');
  const main = page.locator('main');
  await expect(page.locator('#usage')).toContainText('익명 사용 통계');
  await expect(main).toContainText('보내지 않는 것: 파일 이름, 크기, 내용, IP 주소, 쿠키, 나를 알아볼 수 있는 값.');
  await expect(main).toContainText(`${PRIVACY_USAGE}: 익명 사용 통계를 더함`);
  // The cloud build also has Google Analytics (owner 2026-10-08): its cookie sentence and later date win then
  // (ga.cloud.spec.ts checks them); without it, the cookieless sentence and the usage date.
  if ((await page.locator('#ga').count()) === 0) {
    await expect(main).toContainText('쿠키도 쓰지 않아요.');
    await expect(main).toContainText(`시행일: ${PRIVACY_USAGE}`);
  }
});
