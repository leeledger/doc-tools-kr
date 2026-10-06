// Anonymous usage statistics e2e (brief handoff/ARCHITECT-BRIEF-USAGE.md, "Test map"). Runs only in the cloud-*
// projects, against dist-bgcloud/ (built with PUBLIC_USAGE_STATS=1). Every POST /api/usage is recorded from the
// browser context and answered 204 by page.route: nothing reaches a Function. The no-upload fixture stays on with
// exactly one allowed request, POST /api/usage (no query); the default (flag-off) projects keep the strict rule, which
// is the "off sends nothing" regression test.
import { readFileSync } from 'node:fs';
import type { Page, Request } from '@playwright/test';
import { validate } from '../../scripts/lib/usage.mjs';
import { expect, gotoReady, test } from './no-upload';
import { photoFixture, runtimePath } from './paths';

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
  await expect(main).toContainText('쿠키도 쓰지 않아요.');
  await expect(main).toContainText(`시행일: ${PRIVACY_USAGE}`);
  await expect(main).toContainText(`${PRIVACY_USAGE}: 익명 사용 통계를 더함`);
});
