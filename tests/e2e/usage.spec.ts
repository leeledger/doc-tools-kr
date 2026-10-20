// Anonymous usage statistics e2e (brief handoff/ARCHITECT-BRIEF-USAGE.md, "Test map"). Runs only in the cloud-*
// projects, against dist-bgcloud/ (built with PUBLIC_USAGE_STATS=1). Every POST /api/usage is recorded from the
// browser context and answered 204 by page.route: nothing reaches a Function. The no-upload fixture stays on with
// exactly one allowed request, POST /api/usage (no query); the default (flag-off) projects keep the strict rule, which
// is the "off sends nothing" regression test.
import { readFileSync } from 'node:fs';

import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { createCanvas } from '@napi-rs/canvas';
import type { Locator, Page, Request } from '@playwright/test';
import { validate } from '../../scripts/lib/usage.mjs';
import { AFF_ENABLED } from '../../src/data/affiliate';
import { expect, gotoReady, test } from './no-upload';
import { startHost } from './host-page';
import { fixturePath, photoFixture, photoRuntime, runtimePath } from './paths';

test.use({ allowUpload: [{ method: 'POST', path: '/api/usage' }] });
test.describe.configure({ timeout: 120_000 });

const PORTRAIT = photoFixture('portrait_pd.jpg');
const PORTRAIT_NAME = 'portrait_pd';
const PORTRAIT_SIZE = String(readFileSync(PORTRAIT).length);
/** legal.ts reads build-time constants, so the date is read from its source here. */
const PRIVACY_USAGE = /PRIVACY_USAGE = '([^']+)'/.exec(readFileSync('src/data/legal.ts', 'utf8'))![1]!;
const PRIVACY_OUT = /PRIVACY_OUT = '([^']+)'/.exec(readFileSync('src/data/legal.ts', 'utf8'))![1]!;
const PRIVACY_OUT_ID_PHOTO = /PRIVACY_OUT_ID_PHOTO = '([^']+)'/.exec(readFileSync('src/data/legal.ts', 'utf8'))![1]!;
const PRIVACY_EMBED = /PRIVACY_EMBED = '([^']+)'/.exec(readFileSync('src/data/legal.ts', 'utf8'))![1]!;
const PRIVACY_UTM = /PRIVACY_UTM = '([^']+)'/.exec(readFileSync('src/data/legal.ts', 'utf8'))![1]!;
const PRIVACY_ADS = /PRIVACY_ADS = '([^']+)'/.exec(readFileSync('src/data/legal.ts', 'utf8'))![1]!;
const PRIVACY_AFF_OFF = /PRIVACY_AFF_OFF = '([^']+)'/.exec(readFileSync('src/data/legal.ts', 'utf8'))![1]!;
const KEYS = new Set(['e', 't', 'c', 'p', 'o', 'v', 'g', 'dl', 'via', 'd', 'br', 'b', 'us', 'uc', 'w']);

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

test('PDF 나누기·쪽 편집 (TOOLS5 U2): range split = pick, start (o=save, v=ranges), success, download; no range, count or file name in any body', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/pdf-split/');
  await page.setInputFiles('#ps-input', fixturePath('gen_links_outline.pdf'));
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', 'ready');
  await page.locator('label.chip', { hasText: '범위대로 나누기' }).click();
  await page.locator('#ps-ranges').fill('1-2\n3');
  await page.locator('#ps-run').click();
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await Promise.all([page.waitForEvent('download'), page.locator('#ps-download').click()]);
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['pick', 'start', 'success', 'download']);
  expectClean(beacons);
  expect(beacons[1]!.ev).toMatchObject({ e: 'start', t: 'pdf-split', o: 'save', v: 'ranges' });
  for (const b of beacons) {
    expect(b.ev).toMatchObject({ t: 'pdf-split', via: 'direct', w: 1 });
    expect(Object.keys(b.ev).filter((k) => k !== 'w' && typeof b.ev[k] === 'number')).toEqual([]);
    expect(b.body).not.toMatch(/gen_links_outline|1-2|쪽|나누기/);
  }
});

test('PDF 서명·도장 넣기 (TOOLS5 U3): 모든 쪽 = pick, start (o=place, v=all), success, download; no file name, page, range or position in any body', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/pdf-sign/');
  await page.setInputFiles('#sg-input', fixturePath('gen_links_outline.pdf'));
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'ready');
  await page.setInputFiles('#sg-image-input', PORTRAIT);
  await expect(page.locator('.sign-box')).toHaveCount(1);
  await page.locator('label.chip', { hasText: '모든 쪽' }).click();
  await page.locator('#sg-run').click();
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await Promise.all([page.waitForEvent('download'), page.locator('#sg-download').click()]);
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['pick', 'start', 'success', 'download']);
  expectClean(beacons);
  expect(beacons[1]!.ev).toMatchObject({ e: 'start', t: 'pdf-sign', o: 'place', v: 'all' });
  for (const b of beacons) {
    expect(b.ev).toMatchObject({ t: 'pdf-sign', via: 'direct', w: 1 });
    expect(Object.keys(b.ev).filter((k) => k !== 'w' && typeof b.ev[k] === 'number')).toEqual([]);
    expect(b.body).not.toMatch(new RegExp(`gen_links_outline|${PORTRAIT_NAME}|쪽|서명`));
  }
});

test('HWPX HWP 변환 (HWPX2HWP): pick, start, success, download, in order; an .hwp is fail c=already-hwp p=parse; no file name, size, page count or loss in any body', async ({ page }) => {
  test.setTimeout(180_000);
  const beacons = await record(page);
  await gotoReady(page, '/hwpx-to-hwp/');
  await page.setInputFiles('#hx-input', join(process.cwd(), 'tests', 'corpus', 'hwp', 'adm14.hwpx'));
  await expect(page.locator('#hwp-tool')).toHaveAttribute('data-state', 'done', { timeout: 150_000 });
  await Promise.all([page.waitForEvent('download'), page.locator('#hx-save').click()]);
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['pick', 'start', 'success', 'download']);
  await page.locator('#hx-reset').click();
  await page.setInputFiles('#hx-input', join(process.cwd(), 'tests', 'corpus', 'hwp', 'law05.hwp'));
  await expect(page.locator('#hwp-tool')).toHaveAttribute('data-state', 'error');
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['pick', 'start', 'success', 'download', 'pick', 'fail']);
  expectClean(beacons);
  expect(beacons[5]!.ev).toMatchObject({ e: 'fail', t: 'hwpx-to-hwp', c: 'already-hwp', p: 'parse' });
  for (const b of beacons) {
    expect(b.ev).toMatchObject({ t: 'hwpx-to-hwp', via: 'direct', w: 1 });
    expect(Object.keys(b.ev).filter((k) => k !== 'w' && typeof b.ev[k] === 'number')).toEqual([]);
    expect(b.body).not.toMatch(/adm14|law05|\.hwpx?\b|쪽|loss|기타/);
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

test('글자수 세기 (TOOLS1015 C1): pick on the first text, start (o=basis, v=nospace) once when a goal is set, next (v=id-photo) from the 자소서 chain; never the text, a count or the goal', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/char-count/');
  await page.locator('#cc-text').pressSequentially('자소서 첫 문장');
  await page.locator('#cc-text').fill('자소서 첫 문장입니다. 비밀 문구 XYZ');
  await page.locator('#cc-basis').selectOption('nospace');
  await page.getByRole('button', { name: '1,500자' }).click();
  await page.getByRole('button', { name: '700자' }).click();
  await page.locator('#cc-chain').getByRole('link', { name: '사람인 규격으로 맞추기' }).click();
  await page.waitForURL(/\/id-photo\/\?preset=saramin$/);
  await expect.poll(() => beacons.map((b) => `${b.ev.e} ${b.ev.t}`)).toEqual(['pick char-count', 'start char-count', 'next char-count']);
  expectClean(beacons);
  expect(beacons[1]!.ev).toMatchObject({ e: 'start', t: 'char-count', o: 'basis', v: 'nospace' });
  expect(beacons[2]!.ev).toMatchObject({ e: 'next', t: 'char-count', o: 'next', v: 'id-photo' });
  for (const b of beacons) {
    expect(Object.keys(b.ev).filter((k) => k !== 'w' && typeof b.ev[k] === 'number')).toEqual([]);
    expect(b.body).not.toMatch(/자소서|XYZ|비밀|1,500/);
    for (const [k, v] of Object.entries(b.ev)) if (k !== 'b') expect(String(v), k).not.toMatch(/^(1500|700|\d{2,})$/);
  }
});

test('영문 이름 변환기 (ROMANIZE1016 D6): start once at the first valid result, download (o=form) per 복사, next (v=id-photo) once from the 여권 사진 button; never the name, its parts, the surname choice or case', async ({ page, context, browserName }) => {
  const beacons = await record(page);
  // Copy must reach the clipboard to count: grant it where Playwright can (Chromium); elsewhere stub writeText.
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  else await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.resolve() }, configurable: true }));
  await gotoReady(page, '/english-name/');
  await page.locator('#en-sur').fill('홍');
  await page.locator('#en-given').fill('길동');
  await expect(page.locator('#en-joined')).toHaveText('HONG GILDONG');
  await page.locator('#en-given').fill('길순');
  await expect(page.locator('#en-joined')).toHaveText('HONG GILSUN');
  await page.getByLabel('첫 글자만 대문자').check();
  await page.getByRole('button', { name: '붙임표 넣기 복사' }).click();
  await expect(page.locator('#en-status')).toHaveText('복사했어요');
  await page.getByRole('button', { name: '빈칸 넣기 복사' }).click();
  await page.locator('#en-chain').getByRole('link', { name: '여권 사진 규격 맞추기' }).click();
  await page.waitForURL(/\/id-photo\/\?preset=passport_online$/);
  await expect.poll(() => beacons.map((b) => `${b.ev.e} ${b.ev.t}`)).toEqual(['start english-name', 'download english-name', 'download english-name', 'next english-name']);
  expectClean(beacons);
  expect(beacons[0]!.ev).not.toHaveProperty('o');
  expect(beacons[1]!.ev).toMatchObject({ e: 'download', t: 'english-name', o: 'form', v: 'hyphen' });
  expect(beacons[2]!.ev).toMatchObject({ e: 'download', t: 'english-name', o: 'form', v: 'space' });
  expect(beacons[3]!.ev).toMatchObject({ e: 'next', t: 'english-name', o: 'next', v: 'id-photo' });
  for (const b of beacons) expect(b.body).not.toMatch(/홍|길동|길순|HONG|Hong|GIL|Gil|title|upper/i);
});

test('신분증 사본 만들기 (TOOLS1015 I1): pick, start (o=mark, v=on), success, download; never the 용도 문구, the date, boxes or the file name', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/id-copy/');
  await page.setInputFiles('#ic-input', photoFixture('exif6_gps.jpg'));
  await expect(page.locator('#ic-tool')).toHaveAttribute('data-state', 'editing', { timeout: 30_000 });
  await page.locator('#ic-add').click();
  await page.locator('#ic-place').fill('비밀상사');
  await page.locator('#ic-run').click();
  await expect(page.locator('#ic-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await Promise.all([page.waitForEvent('download'), page.locator('#ic-jpg').click()]);
  await expect.poll(() => beacons.map((b) => `${b.ev.e} ${b.ev.t}`)).toEqual(['pick id-copy', 'start id-copy', 'success id-copy', 'download id-copy']);
  expectClean(beacons);
  expect(beacons[1]!.ev).toMatchObject({ e: 'start', t: 'id-copy', o: 'mark', v: 'on' });
  for (const b of beacons) expect(b.body).not.toMatch(/비밀상사|제출용|exif6|신분증_사본|\d{4}\.\d{2}\.\d{2}/);
});

test('PDF 글자 넣기·편집 (TOOLS1015 E1): pick, start (o=items, v=mix), success, download; never the text, the date, sizes or places; a font that cannot be fetched sends fail c=font', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/pdf-edit/');
  await page.setInputFiles('#ed-input', fixturePath('gen_scan_a6.pdf'));
  await expect(page.locator('#ed-tool')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(page.locator('#ed-stage canvas.sign-page')).toHaveCount(1);
  await page.locator('#ed-add-text').click();
  await page.locator('#ed-text').fill('비밀상사 홍길동');
  await page.locator('#ed-add-white').click();
  await page.locator('#ed-run').click();
  await expect(page.locator('#ed-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await Promise.all([page.waitForEvent('download'), page.locator('#ed-download').click()]);
  await expect.poll(() => beacons.map((b) => `${b.ev.e} ${b.ev.t}`)).toEqual(['pick pdf-edit', 'start pdf-edit', 'success pdf-edit', 'download pdf-edit']);
  expectClean(beacons);
  expect(beacons[1]!.ev).toMatchObject({ e: 'start', t: 'pdf-edit', o: 'items', v: 'mix' });
  for (const b of beacons) expect(b.body).not.toMatch(/비밀상사|홍길동|gen_scan|작성|\d{4}\. \d/);
  // Fonts blocked: the save fails with the font code.
  await page.locator('#ed-again').click();
  await page.route('**/fonts/hwp/**', (r) => r.abort());
  await page.locator('#ed-run').click();
  await expect(page.locator('#ed-error')).toHaveText('글꼴을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 저장해 주세요.', { timeout: 30_000 });
  await expect.poll(() => beacons.filter((b) => b.ev.e === 'fail').map((b) => b.ev)).toEqual([expect.objectContaining({ e: 'fail', t: 'pdf-edit', c: 'font', p: 'process' })]);
  expectClean(beacons);
});

test('도장 만들기 (STAMP1015 D8): start (o=style) once, success, download, next to pdf-sign; never the text, its script, the file name or the date; blocked faces send fail c=font once', async ({ page }) => {
  const beacons = await record(page);
  const painted = async (n: number): Promise<void> => {
    await expect.poll(async () => Number((await page.locator('#sm-tool').getAttribute('data-painted')) ?? 0)).toBeGreaterThan(n);
  };
  await gotoReady(page, '/stamp-maker/');
  await page.locator('#sm-text').focus();
  await painted(0);
  await page.locator('#sm-text').fill('홍길동洪');
  await painted(1);
  await page.locator('.sm-tile[data-style="square-seal"]').click();
  await page.locator('.sm-tile[data-style="round"]').click();
  await Promise.all([page.waitForEvent('download'), page.locator('#sm-save').click()]);
  await Promise.all([page.waitForURL('**/pdf-sign/'), page.locator('#sm-pdf').click()]);
  // Let /pdf-sign/ finish reading the picture before leaving (leaving mid-read is not part of this test).
  await expect(page.locator('#sg-notice')).toHaveText('도장 만들기에서 만든 그림을 가져왔습니다. 이제 PDF 파일을 고르세요.');
  const mine = () => beacons.filter((b) => b.ev.t === 'stamp-maker');
  await expect.poll(() => mine().map((b) => b.ev.e)).toEqual(['start', 'success', 'download', 'success', 'next']);
  expectClean(beacons);
  expect(mine()[0]!.ev).toMatchObject({ e: 'start', t: 'stamp-maker', o: 'style', v: 'square-seal' });
  expect(mine()[4]!.ev).toMatchObject({ e: 'next', t: 'stamp-maker', o: 'next', v: 'pdf-sign' });
  for (const b of beacons) expect(b.body).not.toMatch(/홍길동|洪|도장_|round|hangul|hanja|#D0202E|\d{4}\.\d{2}\.\d{2}/);
  // Faces blocked: one fail c=font (phase load), however often it repaints.
  const before = beacons.length;
  await page.route('**/fonts/hwp/**', (r) => r.abort());
  await gotoReady(page, '/stamp-maker/');
  await page.locator('#sm-text').focus();
  await expect(page.locator('#sm-note')).toBeVisible({ timeout: 15_000 });
  await page.locator('#sm-text').fill('김');
  await expect(page.locator('#sm-tool')).toHaveAttribute('data-fonts', 'system');
  await page.locator('#sm-text').fill('김수');
  await page.waitForTimeout(500);
  await expect.poll(() => beacons.slice(before).filter((b) => b.ev.e === 'fail' && b.ev.t === 'stamp-maker').map((b) => b.ev)).toEqual([expect.objectContaining({ e: 'fail', t: 'stamp-maker', c: 'font', p: 'load' })]);
  expectClean(beacons);
});

test('위임장 만들기 (FORM1020 D7, D9): start (o=build, filled|blank), success, download (o=format, hwp|pdf), next to pdf-sign; never a typed value, a length or the file name', async ({ page }) => {
  test.setTimeout(300_000);
  const beacons = await record(page);
  await gotoReady(page, '/power-of-attorney/');
  await page.locator('[data-field="giverName"]').fill('홍길동');
  await page.locator('[data-field="giverPhone"]').fill('010-1234-5678');
  await page.locator('[data-field="task"]').fill('등본 발급 신청');
  await page.locator('#pa-make').click();
  await expect(page.locator('#pa-tool')).toHaveAttribute('data-state', 'ready', { timeout: 180_000 });
  await Promise.all([page.waitForEvent('download'), page.locator('#pa-hwp').click()]);
  await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.locator('#pa-pdf').click()]);
  await page.locator('#pa-blank').click();
  await expect(page.locator('#pa-tool')).toHaveAttribute('data-state', 'ready', { timeout: 180_000 });
  await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.locator('#pa-pdf').click()]);
  await Promise.all([page.waitForURL('**/pdf-sign/'), page.locator('#pa-next').getByRole('button', { name: 'PDF 서명·도장 넣기' }).click()]);
  await expect(page.locator('#sg-notice')).toHaveText('방금 만든 파일을 가져왔습니다.');
  const mine = () => beacons.filter((b) => b.ev.t === 'power-of-attorney');
  await expect.poll(() => mine().map((b) => [b.ev.e, b.ev.o ?? '', b.ev.v ?? ''].join(' '))).toEqual([
    'start build filled',
    'success  ',
    'download format hwp',
    'download format pdf',
    'start build blank',
    'success  ',
    'download format pdf',
    'next next pdf-sign',
  ]);
  expectClean(beacons);
  for (const b of beacons) expect(b.body).not.toMatch(/홍길동|010-1234|5678|등본|위임장\.|\.hwp|\.pdf/);
});

test('이어서 하기 (CHAIN): the click sends next (o=next, v=target) before the next tool opens; the file arrives there', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/pdf-compress/');
  await page.setInputFiles('#cmp-input', fixturePath('gen_scan_a6.pdf'));
  await expect(page.locator('#cmp-info')).toContainText('1쪽');
  await page.locator('#cmp-run').click();
  await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', 'done', { timeout: 45_000 });
  await page.getByRole('group', { name: '이 파일로 이어서 하기' }).getByRole('button', { name: 'PDF 서명·도장 넣기' }).click();
  await expect(page).toHaveURL(/\/pdf-sign\/$/);
  await expect(page.locator('#sg-notice')).toHaveText('방금 만든 파일을 가져왔습니다.');
  await expect.poll(() => beacons.map((b) => `${b.ev.e} ${b.ev.t}`)).toContain('next pdf-compress');
  expectClean(beacons);
  const next = beacons.filter((b) => b.ev.e === 'next');
  expect(next).toHaveLength(1);
  expect(next[0]!.ev).toMatchObject({ e: 'next', t: 'pdf-compress', o: 'next', v: 'pdf-sign' });
  expect(next[0]!.body).not.toContain('gen_scan');
});

test('REV5 embed widget in another site\'s frame: pick, start, success, download, all via=embed; never the host site, no arrive', async ({ page, network, baseURL }) => {
  const beacons = await record(page);
  // The host page is another site (tests/e2e/host-page.ts: localhost against our 127.0.0.1); its own requests are taken
  // off the no-upload log (they are the test's page, not ours).
  const site = await startHost();
  try {
    await page.goto(site.url(`${baseURL}/embed/id-photo/`), { waitUntil: 'domcontentloaded' });
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('#idp-tool')).toHaveAttribute('data-state', 'empty');
    await frame.locator('#idp-preset').selectOption('passport_online');
    await frame.locator('#idp-input').setInputFiles(PORTRAIT);
    await expect(frame.locator('#idp-tool')).toHaveAttribute('data-state', /^(adjust|blocked)$/, { timeout: 90_000 });
    await frame.locator('#idp-confirm').check();
    await frame.locator('#idp-save').click();
    await expect(frame.locator('#idp-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
    await Promise.all([page.waitForEvent('download'), frame.locator('#idp-download').click()]);
    await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['pick', 'start', 'success', 'download']);
    expectClean(beacons);
    for (const b of beacons) {
      expect(b.ev).toMatchObject({ t: 'id-photo', via: 'embed', w: 1 });
      expect(b.body).not.toMatch(/studio|localhost|https?:/);
    }
    site.drop(network);
  } finally {
    await site.close();
  }
});

test('인화·사진관 링크 (REV2): a click on the info link sends exactly one out (v=photo-studio); no URL in the body', async ({ page, network }) => {
  const beacons = await record(page);
  const studio = /^https:\/\/map\.naver\.com\//;
  // The external site is a stub: no test reaches Naver.
  await page.context().route(studio, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }));
  await gotoReady(page, '/id-photo/');
  await page.selectOption('#idp-preset', 'passport_online');
  await page.setInputFiles('#idp-input', PORTRAIT);
  await expect(page.locator('#idp-tool')).toHaveAttribute('data-state', /^(adjust|blocked)$/, { timeout: 90_000 });
  await page.locator('#idp-confirm').check();
  await page.locator('#idp-save').click();
  await expect(page.locator('#idp-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await expect.poll(() => beacons.map((b) => b.ev.e)).toContain('success');
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('#idp-print-links a[data-out="photo-studio"]').click()]);
  await popup.waitForLoadState();
  await popup.close();
  await expect.poll(() => beacons.filter((b) => b.ev.e === 'out').length).toBe(1);
  expectClean(beacons);
  const out = beacons.filter((b) => b.ev.e === 'out');
  expect(out[0]!.ev).toEqual({ e: 'out', t: 'id-photo', o: 'out', v: 'photo-studio', via: 'direct', d: expect.any(String), b: expect.any(String), w: 1 });
  expect(out[0]!.body).not.toMatch(/https?:|naver|%EC/i);
  // The opened tab's navigation went to the stub only (bodiless GETs of exactly the link's URL); it is the link, not
  // page data, so it leaves the no-upload log (upload-guard is not widened).
  const external = network.requests.filter((r) => studio.test(r.url()));
  expect(external.length).toBeGreaterThan(0);
  for (const r of external) {
    expect([r.method(), r.url(), r.postDataBuffer()]).toEqual(['GET', 'https://map.naver.com/p/search/%EC%82%AC%EC%A7%84%EA%B4%80', null]);
    network.requests.splice(network.requests.indexOf(r), 1);
  }
});

test('쿠팡 제휴 링크 (REV2 round 2; this build has PUBLIC_AFF_COUPANG=1 like production): disclosure first, three sponsored links, a click sends out with the link kind only', async ({ page, network }) => {
  test.skip(!AFF_ENABLED, 'ADS1020 D1: the Coupang links are off in code (src/data/affiliate.ts AFF_ENABLED)');
  const beacons = await record(page);
  const COUPANG = 'https://link.coupang.com/a/hM1VvrGKdg';
  // The external site is a stub: no test reaches Coupang.
  await page.context().route(/^https:\/\/link\.coupang\.com\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }));
  await gotoReady(page, '/id-photo/');
  await page.selectOption('#idp-preset', 'passport_online');
  await page.setInputFiles('#idp-input', PORTRAIT);
  await expect(page.locator('#idp-tool')).toHaveAttribute('data-state', /^(adjust|blocked)$/, { timeout: 90_000 });
  await page.locator('#idp-confirm').check();
  await page.locator('#idp-save').click();
  await expect(page.locator('#idp-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  const group = page.locator('#idp-print-links .out-links');
  await expect(group).toBeVisible();
  // The disclosure is the group's first element, at body size and colour (not the muted hint style).
  const disclosure = group.locator('> p').first();
  await expect(disclosure).toHaveText('광고: 아래 링크로 주문하면 문서딱이 수수료를 받을 수 있어요. 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.');
  const look = (l: Locator) =>
    l.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.color, s.fontSize];
    });
  expect(await look(disclosure)).toEqual(await look(page.locator('#idp-print-links > p').first()));
  const links = group.locator('a');
  await expect(links).toHaveText(['포토프린터 (쿠팡, 광고, 새 창)', '포토프린터 인화지 (쿠팡, 광고, 새 창)', '흰색 촬영 배경천 (쿠팡, 광고, 새 창)']);
  for (const a of await links.all()) {
    await expect(a).toHaveAttribute('rel', 'sponsored noopener');
    await expect(a).toHaveAttribute('target', '_blank');
  }
  const [popup] = await Promise.all([page.waitForEvent('popup'), links.first().click()]);
  await popup.waitForLoadState();
  expect(popup.url()).toBe(COUPANG);
  await popup.close();
  await expect.poll(() => beacons.filter((b) => b.ev.e === 'out').length).toBe(1);
  expectClean(beacons);
  const out = beacons.find((b) => b.ev.e === 'out')!;
  expect(out.ev).toMatchObject({ e: 'out', t: 'id-photo', o: 'out', v: 'cp-printer' });
  expect(out.body).not.toMatch(/https?:|coupang\.com|hM1/i);
  // As in the info-link test: only the opened tab's own navigation to exactly the link's URL leaves the no-upload log.
  const external = network.requests.filter((r) => r.url().startsWith('https://link.coupang.com/'));
  expect(external.length).toBeGreaterThan(0);
  for (const r of external) {
    expect([r.method(), r.url(), r.postDataBuffer()]).toEqual(['GET', COUPANG, null]);
    network.requests.splice(network.requests.indexOf(r), 1);
  }
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
  await expect(main).toContainText('이어서 하기(보낸 도구·받을 도구 이름)');
  // ADS1020 D7: with the Coupang links off in code the count names only the 사진관 찾기 link, and the change log says so.
  await expect(main).toContainText('증명사진 결과 화면의 사진관 찾기 링크를 눌렀는지(링크 종류와 화면 이름만)');
  await expect(main).toContainText(`${PRIVACY_AFF_OFF}: 상품 링크를 없애고 익명 사용 통계의 상품 링크 누름 항목을 지움`);
  await expect(main).toContainText(`${PRIVACY_OUT}: 익명 사용 통계에 도구 결과 화면과 안내 글의 상품 링크 누름을 더함`);
  await expect(main).toContainText(`${PRIVACY_OUT_ID_PHOTO}: 익명 사용 통계에 증명사진 결과 화면의 사진관·인화 관련 링크와 상품 링크 누름을 더함`);
  // REV5: the embed widget count (via=embed) is the newest change.
  await expect(main).toContainText('안내 글에서 넘어왔는지, 다른 누리집에 넣은 도구에서 쓴 것인지, 기기 종류');
  await expect(main).toContainText(`${PRIVACY_EMBED}: 익명 사용 통계에 다른 누리집에 넣은 도구에서 쓴 것인지를 더함`);
  // REQ1014-A D18: the link marker (no "utm" on the page) and its 3-hour tab storage are the newest change.
  await expect(main).toContainText("어느 링크로 들어왔는지: 블로그 등 링크 주소에 붙은 표시 중 정해진 이름(예: 네이버 블로그, 티스토리, 문서딱 앱)과 글 이름. 정해진 형식이 아니면 '기타'로만 셉니다.");
  await expect(main).toContainText('이 표시는 이 창을 닫으면 지워지는 저장 공간에 최대 3시간 기억해, 같은 창에서 이어서 쓴 도구에도 함께 셉니다.');
  await expect(main).toContainText(`${PRIVACY_UTM}: 익명 사용 통계에 어느 링크로 들어왔는지(정해진 링크 표시)를 더함`);
  await expect(main).not.toContainText(/utm/i);
  // ADDREN1016: the cloud build also has 영문주소 변환기 on, whose section is newer (src/data/legal.ts PRIVACY_REVISED).
  // ADS1020: AdSense (#ads) is newest when on, else the product links taken out of the count (PRIVACY_AFF_OFF).
  await expect(main).toContainText(`시행일: ${(await page.locator('#ads').count()) ? PRIVACY_ADS : PRIVACY_AFF_OFF}`);
  // The cloud build also has Google Analytics (owner 2026-10-08): its cookie sentence wins then (ga.cloud.spec.ts
  // checks it); without it, the cookieless sentence. The date is the embed count's (REV5) in both.
  if ((await page.locator('#ga').count()) === 0) {
    await expect(main).toContainText('쿠키도 쓰지 않아요.');
  }
});

// ---------- REV3: link blocks on result screens and guides (this build has PUBLIC_AFF_COUPANG=1 like production) ----------

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const DISCLOSURE = '광고: 아래 링크로 주문하면 문서딱이 수수료를 받을 수 있어요. 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
const COUPANG_HOST = /^https:\/\/link\.coupang\.com\//;

/** Stubs link.coupang.com (no test reaches Coupang). */
const stubCoupang = (page: Page) => page.context().route(COUPANG_HOST, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }));

/** Clicks `link`, checks the popup opened its href (the stub), and takes the popup's own GETs of exactly that URL off the no-upload log. */
async function openPopup(page: Page, link: Locator, network: { requests: Request[] }): Promise<void> {
  const href = (await link.getAttribute('href'))!;
  const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
  await popup.waitForLoadState();
  expect(popup.url()).toBe(href);
  await popup.close();
  const external = network.requests.filter((r) => COUPANG_HOST.test(r.url()));
  expect(external.length).toBeGreaterThan(0);
  for (const r of external) {
    expect([r.method(), r.url(), r.postDataBuffer()]).toEqual(['GET', href, null]);
    network.requests.splice(network.requests.indexOf(r), 1);
  }
}

/** The block's shape: the disclosure first, then the lead line, then sponsored new-tab links named 광고. */
async function expectBlock(block: Locator, lead: string, dests: string[]): Promise<void> {
  await expect(block.locator('> p').first()).toHaveText(DISCLOSURE);
  await expect(block.locator('> p').nth(1)).toHaveText(lead);
  const links = block.locator('a');
  expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute('data-out')))).toEqual(dests);
  for (const a of await links.all()) {
    await expect(a).toHaveAttribute('rel', 'sponsored noopener');
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toHaveAttribute('href', COUPANG_HOST);
    await expect(a).toContainText('광고');
  }
  // The system font (the copy is not in the UI font subset).
  expect(await block.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^-apple-system/);
}

test('REV3 PDF 합치기: the block shows only with a result, inside it before 이어서 하기; a click opens a new tab and sends out (t=pdf-merge, v=cp-mfp); axe', async ({ page, network }) => {
  test.skip(!AFF_ENABLED, 'ADS1020 D1: the Coupang links are off in code (src/data/affiliate.ts AFF_ENABLED)');
  const beacons = await record(page);
  await stubCoupang(page);
  await gotoReady(page, '/pdf-merge/');
  const block = page.locator('#merge-result .out-links');
  await expect(block).toHaveCount(1);
  await expect(block).toBeHidden();
  await page.setInputFiles('#merge-input', [fixturePath('kr_law_form.pdf'), fixturePath('irs_fw9.pdf')]);
  await expect(page.locator('#merge-list .info').nth(1)).toContainText('쪽');
  await page.locator('#merge-run').click();
  await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'done', { timeout: 45_000 });
  await expect(block).toBeVisible();
  await expectBlock(block, '종이로 내야 하면', ['cp-mfp']);
  expect(await page.evaluate(() => {
    const b = document.querySelector('#merge-result .out-links')!;
    return Boolean(document.getElementById('merge-download')!.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(b.compareDocumentPosition(document.getElementById('merge-next')!) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await expect.poll(() => beacons.map((b) => b.ev.e)).toContain('success');
  await openPopup(page, block.locator('a').first(), network);
  await expect.poll(() => beacons.filter((b) => b.ev.e === 'out').length).toBe(1);
  expectClean(beacons);
  const out = beacons.find((b) => b.ev.e === 'out')!;
  expect(out.ev).toEqual({ e: 'out', t: 'pdf-merge', o: 'out', v: 'cp-mfp', via: 'direct', d: expect.any(String), b: expect.any(String), w: 1 });
  expect(out.body).not.toMatch(/https?:|coupang|hM4/i);
});

test('STAMP1015 도장 만들기: the 실물 도장 block shows with the picked stamp, below the buttons; a click sends { e: out, t: stamp-maker, v: cp-stamp }', async ({ page, network }) => {
  test.skip(!AFF_ENABLED, 'ADS1020 D1: the Coupang links are off in code (src/data/affiliate.ts AFF_ENABLED)');
  const beacons = await record(page);
  await stubCoupang(page);
  await gotoReady(page, '/stamp-maker/');
  const block = page.locator('#sm-aff .out-links');
  await page.locator('#sm-text').focus();
  await expect(page.locator('#sm-tool')).toHaveAttribute('data-painted', /\d+/);
  await expect(block).toBeHidden();
  await page.locator('#sm-text').fill('홍길동');
  await page.locator('.sm-tile[data-style="round"]').click();
  await expect(block).toBeVisible();
  await expectBlock(block, '실물 도장이 필요할 때', ['cp-stamp']);
  expect(await page.evaluate(() => Boolean(document.getElementById('sm-save')!.compareDocumentPosition(document.querySelector('#sm-aff .out-links')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  await openPopup(page, block.locator('a'), network);
  await expect.poll(() => beacons.filter((b) => b.ev.e === 'out').length).toBe(1);
  expectClean(beacons);
  const out = beacons.find((b) => b.ev.e === 'out')!;
  expect(out.ev).toEqual({ e: 'out', t: 'stamp-maker', o: 'out', v: 'cp-stamp', via: 'direct', d: expect.any(String), b: expect.any(String), w: 1 });
  expect(out.body).not.toMatch(/https?:|coupang|홍길동/i);
});

test('REV3 PDF 서명·도장 넣기: a click on the result block sends exactly { e: out, t: pdf-sign, o: out, v: cp-stamp } with no URL', async ({ page, network }) => {
  test.skip(!AFF_ENABLED, 'ADS1020 D1: the Coupang links are off in code (src/data/affiliate.ts AFF_ENABLED)');
  const beacons = await record(page);
  await stubCoupang(page);
  await gotoReady(page, '/pdf-sign/');
  await page.setInputFiles('#sg-input', fixturePath('gen_links_outline.pdf'));
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'ready');
  await page.setInputFiles('#sg-image-input', PORTRAIT);
  await expect(page.locator('.sign-box')).toHaveCount(1);
  await page.locator('#sg-run').click();
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  const block = page.locator('#sg-result .out-links');
  await expect(block).toBeVisible();
  await expectBlock(block, '실물 도장이 필요할 때', ['cp-stamp']);
  await openPopup(page, block.locator('a'), network);
  await expect.poll(() => beacons.filter((b) => b.ev.e === 'out').length).toBe(1);
  expectClean(beacons);
  const out = beacons.find((b) => b.ev.e === 'out')!;
  expect(out.ev).toEqual({ e: 'out', t: 'pdf-sign', o: 'out', v: 'cp-stamp', via: 'direct', d: expect.any(String), b: expect.any(String), w: 1 });
  expect(out.body).not.toMatch(/https?:|coupang|hM1/i);
});

test('REV3 guide (passport-photo): the first-part line under the H1, the block first in the aside; a click sends one out with g and via=guide; axe', async ({ page, network }) => {
  test.skip(!AFF_ENABLED, 'ADS1020 D1: the Coupang links are off in code (src/data/affiliate.ts AFF_ENABLED)');
  const beacons = await record(page);
  await stubCoupang(page);
  await gotoReady(page, '/guide/passport-photo/');
  const top = page.locator('h1 + p.guide-aff-top');
  await expect(top).toHaveText('이 글에는 쿠팡 파트너스 광고 링크가 있어요. 링크로 사면 문서딱이 수수료를 받을 수 있어요.');
  // Small muted text, below the H1 (never the LCP candidate in size).
  const size = (sel: string) => page.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await size('p.guide-aff-top')).toBeLessThan(await size('.guide-answer'));
  for (const sel of ['meta[name="description"]', 'meta[property="og:description"]']) await expect(page.locator(sel)).not.toHaveAttribute('content', /쿠팡|광고 링크/);
  expect((await page.locator('script[type="application/ld+json"]').allTextContents()).join('')).not.toMatch(/쿠팡|광고 링크/);
  const first = page.locator('aside.guide-more > section').first();
  await expect(first.locator('h2')).toHaveText('도움이 되는 물건 (광고)');
  const block = first.locator('.out-links');
  await expect(block).toHaveAttribute('data-guide', 'passport-photo');
  await expectBlock(block, '집에서 직접 찍고 뽑으려면', ['cp-tripod', 'cp-backdrop', 'cp-printer']);
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  expect(beacons).toEqual([]);
  await openPopup(page, block.locator('a[data-out="cp-backdrop"]'), network);
  await expect.poll(() => beacons.length).toBe(1);
  expectClean(beacons);
  expect(beacons[0]!.ev).toEqual({ e: 'out', t: 'id-photo', o: 'out', v: 'cp-backdrop', g: 'passport-photo', via: 'guide', d: expect.any(String), b: expect.any(String), w: 1 });
  expect(beacons[0]!.body).not.toMatch(/https?:|coupang|hM1/i);
});

test('ADS1020 D1: this build has PUBLIC_AFF_COUPANG=1 like production, and still no Coupang link, block or first-part line anywhere', async ({ page }) => {
  test.skip(AFF_ENABLED, 'only while the Coupang links are off in code');
  for (const path of ['/id-photo/', '/pdf-merge/', '/pdf-sign/', '/stamp-maker/', '/hwp-viewer/', '/jpg-to-pdf/', '/remove-background/', '/guide/passport-photo/', '/guide/hwp-on-phone/', '/guide/stamp-image/']) {
    await page.goto(path);
    await expect(page.locator('a[rel~="sponsored"]'), path).toHaveCount(0);
    await expect(page.locator('a[href^="https://link.coupang.com/"]'), path).toHaveCount(0);
    await expect(page.locator('.guide-aff-top'), path).toHaveCount(0);
    await expect(page.locator('main'), path).not.toContainText('쿠팡');
  }
  // /id-photo/ keeps its 사진관 찾기 info link (not sponsored), alone.
  await page.goto('/id-photo/');
  await expect(page.locator('#idp-print-links a')).toHaveCount(1);
  await expect(page.locator('#idp-print-links a')).toHaveAttribute('data-out', 'photo-studio');
});

test('REV3 No-block screens: no sponsored link, no first-part line on pdf-compress, photo-compress, a size guide, the guide index, the home page and 404', async ({ page }) => {
  for (const path of ['/pdf-compress/', '/photo-compress/', '/guide/kakao-photo/', '/guide/', '/', '/does-not-exist/']) {
    await page.goto(path);
    await expect(page.locator('a[rel~="sponsored"]'), path).toHaveCount(0);
    await expect(page.locator('a[href^="https://link.coupang.com/"]'), path).toHaveCount(0);
    await expect(page.locator('.guide-aff-top'), path).toHaveCount(0);
  }
});

test('EN1: an English tool page sends no usage beacon (Korean statistics stay clean until EN2)', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/en/pdf-merge/');
  await page.setInputFiles('#merge-input', [fixturePath('kr_law_form.pdf'), fixturePath('irs_fw9.pdf')]);
  await page.getByRole('button', { name: /^Merge 2 PDFs$/ }).click();
  await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'done');
  await page.waitForTimeout(500);
  expect(beacons).toEqual([]);
  // The same flow on the Korean page does send (the guard is the page language, not the build).
  await gotoReady(page, '/pdf-merge/');
  await page.setInputFiles('#merge-input', [fixturePath('kr_law_form.pdf'), fixturePath('irs_fw9.pdf')]);
  await expect.poll(() => beacons.length).toBeGreaterThan(0);
});

test.describe('REQ1014-B: 배경 지우기 cloud failures by cause', () => {
  test.use({ allowUpload: [[{ method: 'POST', path: '/api/usage' }, { method: 'POST', path: '/api/remove-bg' }], { scope: 'test' }] });
  const DISC = readFileSync(join(process.cwd(), 'tests', 'fixtures', 'bgcloud', 'disc.webp'));
  /** A red disc on light grey, 600×400: disc.webp is its alpha (the answer must have the copy's shape). */
  const SUBJECT = ((): { name: string; mimeType: string; buffer: Buffer } => {
    const c = createCanvas(600, 400);
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(230,230,230)';
    g.fillRect(0, 0, 600, 400);
    g.fillStyle = 'rgb(220,30,30)';
    g.beginPath();
    g.arc(300, 200, 120, 0, Math.PI * 2);
    g.fill();
    return { name: 'ball.png', mimeType: 'image/png', buffer: c.toBuffer('image/png') };
  })();

  async function press(page: Page, answers: { status: number; body: Buffer | string; type: string }[]): Promise<() => number> {
    let n = 0;
    await page.route(/\/api\/remove-bg$/, (route) => {
      const a = answers[Math.min(n++, answers.length - 1)]!;
      return route.fulfill({ status: a.status, headers: { 'content-type': a.type }, body: a.body });
    });
    await gotoReady(page, '/remove-background/');
    await page.setInputFiles('#bg-input', SUBJECT);
    await expect(page.locator('#bg-ready')).toBeVisible({ timeout: 30_000 });
    await page.locator('#bg-send').click();
    return () => n;
  }
  const e502 = { status: 502, body: '{"error":"engine"}', type: 'application/json' };

  test('two 502s: exactly one fail beacon, c=cloud-server p=process', async ({ page }) => {
    const beacons = await record(page);
    const posts = await press(page, [e502]);
    await expect(page.locator('#bg-error')).toBeVisible({ timeout: 30_000 });
    expect(posts()).toBe(2);
    await expect.poll(() => beacons.filter((b) => b.ev.e === 'fail').length).toBe(1);
    await page.waitForTimeout(1000);
    const fails = beacons.filter((b) => b.ev.e === 'fail');
    expect(fails).toHaveLength(1);
    expect(fails[0]!.ev).toMatchObject({ e: 'fail', t: 'remove-background', c: 'cloud-server', p: 'process' });
    expectClean(beacons);
  });

  test('502 then 200: no fail beacon, one success', async ({ page }) => {
    const beacons = await record(page);
    const posts = await press(page, [e502, { status: 200, body: DISC, type: 'image/webp' }]);
    await expect(page.locator('#bg-result')).toBeVisible({ timeout: 30_000 });
    expect(posts()).toBe(2);
    await expect.poll(() => beacons.filter((b) => b.ev.e === 'success').length).toBe(1);
    expect(beacons.filter((b) => b.ev.e === 'fail')).toEqual([]);
    expectClean(beacons);
  });
});

// ---------- REQ1014-A: link markers (utm) -> land, and start/success attributed in the same tab ----------

/** id-photo with the preset of the address: pick, confirm, save; resolves when the result shows. */
async function makeIdPhoto(page: Page): Promise<void> {
  await page.setInputFiles('#idp-input', PORTRAIT);
  await expect(page.locator('#idp-tool')).toHaveAttribute('data-state', /^(adjust|blocked)$/, { timeout: 90_000 });
  await page.locator('#idp-confirm').check();
  await page.locator('#idp-save').click();
  await expect(page.locator('#idp-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
}

/** Waits until the page is idle and a lazy chunk had its chance to send. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
}

const MARK_ID_PHOTO = { us: 'naver_blog', uc: 'history-exam-photo' };

test('REQ1014-A utm on a tool: one land (t=id-photo), start and success carry us/uc, the address keeps only ?preset=history', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/id-photo/?preset=history&utm_source=naver_blog&utm_medium=blog&utm_campaign=history-exam-photo');
  await expect(page.locator('#idp-preset')).toHaveValue('history');
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['land']);
  expect(beacons[0]!.ev).toEqual({ e: 'land', t: 'id-photo', ...MARK_ID_PHOTO, via: 'direct', d: expect.any(String), b: expect.any(String), w: 1 });
  expect(new URL(page.url()).search).toBe('?preset=history');
  await makeIdPhoto(page);
  await expect.poll(() => beacons.map((b) => b.ev.e)).toContain('success');
  expectClean(beacons);
  expect(beacons.filter((b) => b.ev.e === 'land')).toHaveLength(1);
  for (const b of beacons) {
    if (b.ev.e === 'start' || b.ev.e === 'success' || b.ev.e === 'land') expect(b.ev, b.body).toMatchObject(MARK_ID_PHOTO);
    else expect(b.ev, b.body).not.toHaveProperty('us');
  }
  expect(beacons.find((b) => b.ev.e === 'start')!.ev).toMatchObject({ o: 'preset', v: 'history' });
});

test('REQ1014-A utm on a guide (campaign outside the rule): land t=guide with g, uc=other; the tool opened from it sends start/success with us/uc and no land', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/guide/history-exam-photo/?utm_source=tistory&utm_campaign=Bad%20Name');
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['land']);
  expect(beacons[0]!.ev).toEqual({ e: 'land', t: 'guide', g: 'history-exam-photo', us: 'tistory', uc: 'other', via: 'direct', d: expect.any(String), b: expect.any(String), w: 1 });
  await page.locator('.guide-cta a').click();
  await page.waitForURL(/\/id-photo\/\?preset=history$/);
  await makeIdPhoto(page);
  await expect.poll(() => beacons.map((b) => b.ev.e)).toContain('success');
  expectClean(beacons);
  expect(beacons.filter((b) => b.ev.e === 'land')).toHaveLength(1);
  expect(beacons.find((b) => b.ev.e === 'arrive')!.ev).toMatchObject({ t: 'id-photo', g: 'history-exam-photo' });
  expect(beacons.find((b) => b.ev.e === 'start')!.ev).toMatchObject({ t: 'id-photo', us: 'tistory', uc: 'other', via: 'guide' });
  expect(beacons.find((b) => b.ev.e === 'success')!.ev).toMatchObject({ us: 'tistory', uc: 'other' });
});

test('REQ1014-A utm on the home page: the app link gives land t=home us=play uc=none; an unknown source is other; no utm or an English page sends nothing', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/?utm_source=play&utm_medium=twa');
  await expect.poll(() => beacons.map((b) => b.ev.e)).toEqual(['land']);
  expect(beacons[0]!.ev).toEqual({ e: 'land', t: 'home', us: 'play', uc: 'none', via: 'direct', d: expect.any(String), b: expect.any(String), w: 1 });
  await gotoReady(page, '/?utm_source=evil&utm_campaign=spring-sale');
  await expect.poll(() => beacons.length).toBe(2);
  expect(beacons[1]!.ev).toMatchObject({ e: 'land', t: 'home', us: 'other', uc: 'spring-sale' });
  expectClean(beacons);
  for (const path of ['/', '/guide/history-exam-photo/', '/en/?utm_source=play&utm_medium=twa', '/en/pdf-merge/?utm_source=naver_blog', '/privacy/?utm_source=play']) {
    await gotoReady(page, path);
    await settle(page);
  }
  expect(beacons.length).toBe(2);
});

test('REQ1014-A D16 서명·도장 → PDF에 넣기: the stored hand-off sends next (t=stamp-signature, v=pdf-sign) and /pdf-sign/ opens with the picture', async ({ page }) => {
  const beacons = await record(page);
  await gotoReady(page, '/stamp-signature/');
  await page.getByRole('tab', { name: '직접 그리기' }).click();
  const pad = (await page.locator('#ss-pad').boundingBox())!;
  await page.mouse.move(pad.x + 30, pad.y + 40);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(pad.x + 30 + i * 20, pad.y + 40 + (i % 2 ? 20 : -10));
  await page.mouse.up();
  await expect(page.locator('#ss-pad-to-pdf')).toBeEnabled();
  await Promise.all([page.waitForURL('**/pdf-sign/'), page.locator('#ss-pad-to-pdf').click()]);
  await expect(page.locator('#sg-notice')).toHaveText('전자서명·도장 이미지 만들기에서 만든 그림을 가져왔습니다. 이제 PDF 파일을 고르세요.');
  await expect.poll(() => beacons.filter((b) => b.ev.e === 'next').length).toBe(1);
  expectClean(beacons);
  expect(beacons.find((b) => b.ev.e === 'next')!.ev).toEqual({ e: 'next', t: 'stamp-signature', o: 'next', v: 'pdf-sign', via: 'direct', d: expect.any(String), b: expect.any(String), w: 1 });
});
