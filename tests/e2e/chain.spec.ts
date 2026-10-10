// 이어서 하기 (CHAIN X1) end to end: a result opens in the next tool with one button. jpg-to-pdf → pdf-compress and
// pdf-compress → pdf-password (locked and parsed here); a store failure keeps the page with an alert; a missing or
// stale record alerts on the receiver; a marker for another tool is ignored; a plain visit loads no handoff code; axe on
// both result screens with the group showing. Every test runs under the no-upload guard; after an arrival the IndexedDB
// store is empty.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Download, Page } from '@playwright/test';
import { withPdf } from '../helpers/pdf';
import { expect, gotoReady, test } from './no-upload';
import { fixturePath, photoFixture } from './paths';

const ARRIVED = '방금 만든 파일을 가져왔습니다.';
const TAKE_FAILED = '파일을 가져오지 못했습니다. 파일을 다시 골라 주세요.';
const SCAN = fixturePath('gen_scan_a6.pdf');
const PORTRAIT = photoFixture('portrait_pd.jpg');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const HANDOFF_CHUNK = /\/_astro\/handoff\.[^/]+\.js$/;

const canDraw = (page: Page): Promise<boolean> =>
  page.evaluate(() => typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function' && new OffscreenCanvas(1, 1).getContext('2d') !== null);

/** Records in the handoff store (the database is created empty when missing). */
const stored = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const r = indexedDB.open('docttak-handoff', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'key' });
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const c = db.transaction('files').objectStore('files').count();
          c.onsuccess = () => {
            db.close();
            resolve(c.result);
          };
          c.onerror = () => reject(c.error);
        };
      }),
  );

const marker = (page: Page): Promise<string | null> => page.evaluate(() => sessionStorage.getItem('docttak:handoff'));

async function setMarker(page: Page, to: string, key = 'a'.repeat(32)): Promise<void> {
  await gotoReady(page, '/');
  await page.evaluate(([t, k]) => sessionStorage.setItem('docttak:handoff', JSON.stringify({ to: t, key: k })), [to, key] as const);
}

async function makePdfFromPhoto(page: Page): Promise<void> {
  await gotoReady(page, '/jpg-to-pdf/');
  test.skip(!(await canDraw(page)), 'This browser has no OffscreenCanvas (Playwright WebKit on Windows).');
  await page.setInputFiles('#jp-input', PORTRAIT);
  await expect(page.locator('#jp-list .thumb-ph', { hasText: '확인 중' })).toHaveCount(0);
  await page.locator('#jp-run').click();
  await expect(page.locator('#jp-tool')).toHaveAttribute('data-state', 'done', { timeout: 45_000 });
}

async function compressScan(page: Page): Promise<void> {
  await gotoReady(page, '/pdf-compress/');
  await page.setInputFiles('#cmp-input', SCAN);
  await expect(page.locator('#cmp-info')).toContainText('1쪽');
  await page.locator('#cmp-run').click();
  await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', 'done', { timeout: 45_000 });
}

const axeSerious = async (page: Page): Promise<string[]> =>
  (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length}`);

test('jpg-to-pdf → pdf-compress: the PDF arrives as if picked, with the notice; the store is empty afterwards', async ({ page }) => {
  await makePdfFromPhoto(page);
  const group = page.getByRole('group', { name: '이 파일로 이어서 하기' });
  await expect(group).toBeVisible();
  await expect(group.getByRole('button')).toHaveText(['PDF 용량 줄이기', 'PDF 암호 걸기', 'PDF 서명·도장 넣기']);
  expect(await axeSerious(page)).toEqual([]);

  await group.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
  await expect(page).toHaveURL(/\/pdf-compress\/$/);
  await expect(page.locator('#cmp-notice')).toHaveText(ARRIVED);
  await expect(page.locator('#cmp-status')).toHaveText(ARRIVED);
  await expect(page.locator('#cmp-name')).toHaveText('portrait_pd.pdf');
  await expect(page.locator('#cmp-info')).toContainText('1쪽');
  await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', 'ready');
  expect(await marker(page)).toBeNull();
  expect(await stored(page)).toBe(0);

  // The arrived file compresses like a picked one.
  await page.locator('#cmp-run').click();
  await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', /^(done|kept)$/, { timeout: 45_000 });
});

test('pdf-compress → pdf-password: opens in 암호 걸기 and locks the compressed file', async ({ page }) => {
  await compressScan(page);
  const group = page.getByRole('group', { name: '이 파일로 이어서 하기' });
  await expect(group.getByRole('button')).toHaveText(['PDF 암호 걸기', 'PDF 서명·도장 넣기']);
  expect(await axeSerious(page)).toEqual([]);
  const compressedName = await page.locator('#cmp-download').getAttribute('download');

  await group.getByRole('button', { name: 'PDF 암호 걸기' }).click();
  await expect(page).toHaveURL(/\/pdf-password\/$/);
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'ask');
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-action', 'lock');
  await expect(page.locator('#pp-notice')).toHaveText(ARRIVED);
  expect(await stored(page)).toBe(0);

  await page.locator('#pp-new').fill('문서딱암호12');
  await page.locator('#pp-again').fill('문서딱암호12');
  await page.getByRole('button', { name: '암호 걸기', exact: true }).click();
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'done', { timeout: 45_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: '내려받기' }).click()]);
  const d = download as Download;
  expect(d.suggestedFilename()).toBe(compressedName!.replace(/\.pdf$/, '_암호.pdf'));
  const bytes = new Uint8Array(readFileSync(await d.path()));
  expect(await withPdf(bytes, async (doc) => doc.numPages, '문서딱암호12')).toBe(1);
});

test('store failure: alert, the page stays, the button works again', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
  });
  await compressScan(page);
  const button = page.getByRole('button', { name: 'PDF 서명·도장 넣기' });
  await button.click();
  await expect(page.locator('#cmp-error')).toHaveText('파일을 넘기지 못했습니다. 내려받은 뒤 PDF 서명·도장 넣기에서 골라 주세요.');
  await expect(button).toBeEnabled();
  await expect(button).not.toHaveAttribute('aria-busy', 'true');
  await expect(page).toHaveURL(/\/pdf-compress\/$/);
  expect(await marker(page)).toBeNull();
});

test('missing record: the receiver alerts and stays empty (pdf-sign alert, photo-compress notice)', async ({ page }) => {
  await setMarker(page, 'pdf-sign');
  await gotoReady(page, '/pdf-sign/');
  await expect(page.locator('#sg-error')).toHaveText(TAKE_FAILED);
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'empty');
  expect(await marker(page)).toBeNull();

  await setMarker(page, 'photo-compress');
  await gotoReady(page, '/photo-compress/');
  // Playwright WebKit on Windows has no OffscreenCanvas: the tool is off there and takes nothing.
  if (await page.locator('#ph-unsupported').isVisible()) return;
  await expect(page.locator('#ph-notice')).toHaveText(TAKE_FAILED);
  await expect(page.locator('#photo-tool')).toHaveAttribute('data-state', 'empty');
});

test('stale record (over 10 minutes): alert on pdf-split and the record is deleted', async ({ page }) => {
  const key = 'c'.repeat(32);
  await setMarker(page, 'pdf-split', key);
  await page.evaluate(
    (k) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('docttak-handoff', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'key' });
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').put({ key: k, to: 'pdf-split', from: 'pdf-compress', name: 'old.pdf', type: 'application/pdf', blob: new TextEncoder().encode('%PDF-1.4').buffer, at: Date.now() - 11 * 60 * 1000 });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    key,
  );
  await gotoReady(page, '/pdf-split/');
  await expect(page.locator('#ps-error')).toHaveText(TAKE_FAILED);
  await expect(page.locator('#ps-tool')).toHaveAttribute('data-state', 'empty');
  expect(await stored(page)).toBe(0);
});

test('a marker for another tool is removed and ignored; a plain visit loads no handoff code', async ({ page, network }) => {
  await setMarker(page, 'pdf-sign');
  await gotoReady(page, '/pdf-compress/');
  expect(await marker(page)).toBeNull();
  await expect(page.locator('#cmp-error')).toBeHidden();
  await expect(page.locator('#cmp-notice')).toBeHidden();
  await gotoReady(page, '/pdf-password/');
  await page.waitForTimeout(500);
  expect(network.requests.map((r) => r.url()).filter((u) => HANDOFF_CHUNK.test(u))).toEqual([]);
});

/** Puts one record straight into the handoff store (bytes, as the F3 fallback stores them). */
const putRecord = (page: Page, rec: { key: string; to: string; ageMs: number }): Promise<void> =>
  page.evaluate(
    ({ key, to, ageMs }) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('docttak-handoff', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'key' });
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction('files', 'readwrite');
          tx.objectStore('files').put({ key, to, from: 'pdf-compress', name: 'left.pdf', type: 'application/pdf', blob: new TextEncoder().encode('%PDF-1.4').buffer, at: Date.now() - ageMs });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    rec,
  );

test('a file nobody took (tab closed): the next receiver visit sweeps it once old, then clears the flag', async ({ page }) => {
  await gotoReady(page, '/');
  await putRecord(page, { key: 'e'.repeat(32), to: 'pdf-sign', ageMs: 11 * 60 * 1000 });
  await putRecord(page, { key: 'f'.repeat(32), to: 'pdf-sign', ageMs: 0 });
  await page.evaluate(() => localStorage.setItem('docttak:handoff-sweep', '1'));
  // The fresh one stays (another tab may still be on its way), and so does the flag.
  await gotoReady(page, '/pdf-password/');
  await expect.poll(() => stored(page)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('docttak:handoff-sweep'))).toBe('1');
  await expect(page.locator('#pp-error')).toBeHidden();
  // Once nothing is left, the flag goes and later visits load no handoff code.
  await page.evaluate(() => indexedDB.deleteDatabase('docttak-handoff'));
  await gotoReady(page, '/pdf-compress/');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('docttak:handoff-sweep'))).toBeNull();
});

test('photo-compress in a browser that cannot use it: a handed-over photo is taken and dropped', async ({ page }) => {
  await setMarker(page, 'photo-compress', 'b'.repeat(32));
  await putRecord(page, { key: 'b'.repeat(32), to: 'photo-compress', ageMs: 0 });
  await gotoReady(page, '/photo-compress/');
  test.skip(!(await page.locator('#ph-unsupported').isVisible()), 'Only where the tool is unsupported (Playwright WebKit on Windows).');
  await expect.poll(() => stored(page)).toBe(0);
  expect(await marker(page)).toBeNull();
});
