import { readFileSync } from 'node:fs';
import type { Download, Page } from '@playwright/test';
import { pageCount } from '../helpers/pdf';
import { expect, gotoReady, test } from './no-upload';
import { fixturePath, runtimePath } from './paths';

const SCAN = fixturePath('gen_scan_a6.pdf');
const LAW = fixturePath('kr_law_form.pdf');
const SMALL = fixturePath('gen_already_small.pdf');
const scanSize = readFileSync(SCAN).length;

/** Anything that belongs to the compression engine (worker, qpdf, MozJPEG, resize). */
const ENGINE = /compress\.worker|\/vendor\/qpdf\/|mozjpeg_|squoosh_resize/;

const tool = (page: Page) => page.locator('#compress-tool');

async function open(page: Page): Promise<void> {
  await gotoReady(page, '/pdf-compress/');
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
}

async function pick(page: Page, path: string, pages?: number): Promise<void> {
  await page.setInputFiles('#cmp-input', path);
  if (pages !== undefined) await expect(page.locator('#cmp-info')).toContainText(`${pages}쪽`);
}

async function chooseLevel(page: Page, label: string): Promise<void> {
  await page.getByRole('radio', { name: label, exact: true }).check();
}

async function runAndWait(page: Page, state: 'done' | 'kept' = 'done'): Promise<void> {
  await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
  await expect(tool(page)).toHaveAttribute('data-state', state, { timeout: 45_000 });
}

async function downloadBytes(page: Page): Promise<{ bytes: Uint8Array; download: Download }> {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#cmp-download').click()]);
  return { bytes: new Uint8Array(readFileSync(await download.path())), download };
}

test('lazy load: no engine request before the button is pressed', async ({ page, network }) => {
  await open(page);
  await pick(page, SCAN, 1);
  expect(network.requests.map((r) => r.url()).filter((u) => ENGINE.test(u))).toEqual([]);
  await runAndWait(page);
  const urls = network.requests.map((r) => r.url());
  for (const part of ['compress.worker', '/vendor/qpdf/12.2.0-w0.3.0/qpdf.mjs', '/vendor/qpdf/12.2.0-w0.3.0/qpdf.wasm', 'mozjpeg_enc', 'mozjpeg_dec', 'squoosh_resize']) {
    expect(urls.some((u) => u.includes(part)), part).toBe(true);
  }
});

test('happy path: 권장 on a scan shows sizes, both previews, and a download at least 70 % smaller', async ({ page }) => {
  await open(page);
  await pick(page, SCAN, 1);
  await expect(page.getByRole('radio', { name: '권장', exact: true })).toBeChecked();
  await expect(page.locator('#cmp-thumb canvas')).toBeVisible();
  await runAndWait(page);
  // Sizes under 1 MiB show in KB (Polish P.14); the percent has no space (P.17).
  await expect(page.locator('#cmp-headline')).toHaveText(/^[\d.,]+ (KB|MB) → [\d.,]+ (KB|MB)$/);
  await expect(page.locator('#cmp-summary')).toHaveText(/^\d+% 줄었습니다 · 1쪽$/);
  await expect(page.locator('#cmp-save-name')).toHaveText('저장될 이름: gen_scan_a6_압축.pdf');
  await expect(page.locator('#cmp-summary')).toContainText('1쪽');
  await expect(page.locator('#cmp-previews canvas')).toHaveCount(2);
  await expect(page.locator('#cmp-previews figcaption')).toHaveText(['원본', '결과']);
  await expect(page.locator('#cmp-signed')).toBeHidden();
  await expect(page.getByRole('link', { name: 'PDF 합치기' }).first()).toHaveAttribute('href', '/pdf-merge/');
  await expect(page.locator('#cmp-result').getByRole('link', { name: '사진 용량 줄이기' })).toHaveAttribute('href', '/photo-compress/');
  await expect(page.locator('#cmp-result')).toContainText('사진 파일이라면 사진 용량 줄이기에서 KB에 맞춰 줄일 수 있습니다.');
  const { bytes, download } = await downloadBytes(page);
  expect(download.suggestedFilename()).toBe('gen_scan_a6_압축.pdf');
  expect(await pageCount(bytes)).toBe(1);
  expect(bytes.length).toBeLessThanOrEqual(scanSize * 0.3);
});

test('level switch: 강력, then 다른 단계로 다시 줄이기 with 고화질; 강력 is smaller', async ({ page }) => {
  // Two full runs; under a 5-project parallel run this can exceed the default 60 s.
  test.slow();
  await open(page);
  await pick(page, SCAN, 1);
  await chooseLevel(page, '강력');
  await runAndWait(page);
  const strong = (await downloadBytes(page)).bytes.length;
  await page.getByRole('button', { name: '다른 단계로 다시 줄이기' }).click();
  await expect(tool(page)).toHaveAttribute('data-state', 'ready');
  await expect(page.getByRole('radio', { name: '강력', exact: true })).toBeChecked();
  await chooseLevel(page, '고화질 (적게 줄이기)');
  await runAndWait(page);
  const high = (await downloadBytes(page)).bytes.length;
  expect(strong).toBeLessThan(high);
});

test('kept: an already optimized file is not offered for download', async ({ page }) => {
  await open(page);
  await pick(page, SMALL, 7);
  await runAndWait(page, 'kept');
  await expect(page.locator('#cmp-kept')).toContainText('이미 최적화된 파일입니다. 줄일 수 있는 이미지가 없어 원본을 그대로 둡니다.');
  await expect(page.locator('#cmp-download')).toBeHidden();
  await expect(page.getByRole('button', { name: '강력으로 다시 줄이기' })).toBeHidden();
});

test('password: wrong password is shown inline, the right one unlocks; the result has no password', async ({ page }) => {
  await open(page);
  await pick(page, runtimePath('encrypted_userpw_1234'));
  const field = page.getByLabel('비밀번호', { exact: true });
  await expect(field).toBeVisible();
  await expect(field).toHaveAccessibleDescription(/이 파일은 비밀번호로 보호되어 있습니다\./);
  await page.getByRole('button', { name: '비밀번호 보기' }).click();
  await expect(field).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: '비밀번호 보기' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'PDF 용량 줄이기' })).toBeDisabled();
  await field.fill('0000');
  await field.press('Enter');
  await expect(page.locator('#cmp-pw-error')).toHaveText('비밀번호가 맞지 않습니다.');
  await field.fill('1234');
  await page.getByRole('button', { name: '확인' }).click();
  await expect(page.locator('#cmp-info')).toContainText('7쪽');
  await runAndWait(page);
  await expect(page.locator('#cmp-notes')).toContainText('비밀번호가 걸려 있지 않습니다');
  expect(page.url()).not.toContain('1234');
});

test('owner-restricted file shows the notice', async ({ page }) => {
  await open(page);
  await pick(page, runtimePath('owner_restricted'), 7);
  await expect(page.locator('#cmp-owner')).toHaveText('보안 설정(편집 제한)이 해제된 사본이 만들어집니다');
});

test('bad inputs: a not-PDF is rejected before the card, a truncated file is reported; the status never keeps stale text', async ({ page }) => {
  await open(page);
  await pick(page, runtimePath('not_a_pdf'));
  await expect(page.locator('#cmp-error')).toHaveText('not_a_pdf.pdf은(는) PDF 파일이 아니어서 넣지 않았습니다. PDF 파일만 넣을 수 있습니다.');
  await expect(page.locator('#cmp-file')).toBeHidden();
  await expect(page.locator('#cmp-status')).toHaveText('');
  await pick(page, runtimePath('truncated'));
  await expect(page.locator('#cmp-error')).toHaveText('파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아 주세요.');
  await expect(tool(page)).toHaveAttribute('data-state', 'error');
  // Showing an alert cleared the "확인하는 중" status (Polish P.17).
  await expect(page.locator('#cmp-status')).toHaveText('');
  await pick(page, LAW, 7);
  await expect(page.locator('#cmp-error')).toBeHidden();
});

test('signed PDF: the result warns that the signature is no longer valid', async ({ page }) => {
  await open(page);
  await pick(page, runtimePath('signed_fake'), 7);
  await runAndWait(page);
  await expect(page.locator('#cmp-signed')).toBeVisible();
  await expect(page.locator('#cmp-signed')).toContainText('서명이 더 이상 유효하지 않습니다');
});

test('이미지로 변환: warning, a scan completes, a text PDF keeps the original', async ({ page }) => {
  await open(page);
  await pick(page, SCAN, 1);
  await page.getByText('더 줄여야 하나요?').click();
  await chooseLevel(page, '이미지로 변환');
  await expect(page.locator('#cmp-desc-raster')).toBeVisible();
  await expect(page.locator('#cmp-desc-raster')).toContainText('글자를 선택하거나 검색할 수 없게 되고');
  await runAndWait(page);
  const { bytes, download } = await downloadBytes(page);
  expect(download.suggestedFilename()).toBe('gen_scan_a6_이미지변환.pdf');
  expect(await pageCount(bytes)).toBe(1);

  await page.getByRole('button', { name: '다른 파일 처리하기' }).click();
  await expect(tool(page)).toHaveAttribute('data-state', 'empty');
  await pick(page, LAW, 7);
  await page.getByText('더 줄여야 하나요?').click();
  await chooseLevel(page, '이미지로 변환');
  await runAndWait(page, 'kept');
  await expect(page.locator('#cmp-kept')).toContainText('이미지로 바꾸면 오히려 커져서 원본을 그대로 둡니다.');
  await expect(page.locator('#cmp-download')).toBeHidden();
});

test('cancel returns to ready with the file and level kept, and it still runs afterwards', async ({ page, context }) => {
  await open(page);
  await pick(page, SCAN, 1);
  await chooseLevel(page, '강력');
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => (release = r));
  await context.route(/compress\.worker.*\.js/, async (route) => {
    await held;
    await route.continue().catch(() => undefined);
  });
  await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
  await expect(tool(page)).toHaveAttribute('data-state', 'working');
  await expect(page.locator('#cmp-progress-text')).toContainText('파일 분석 중…');
  await page.getByRole('button', { name: '취소' }).click();
  release();
  await expect(tool(page)).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#cmp-name')).toHaveText('gen_scan_a6.pdf');
  await expect(page.getByRole('radio', { name: '강력', exact: true })).toBeChecked();
  await expect(page.locator('#cmp-status')).toContainText('취소');
  await context.unroute(/compress\.worker.*\.js/);
  await runAndWait(page);
  await expect(page.locator('#cmp-summary')).toContainText('% 줄었습니다');
});

test('mobile soft limit: over 20 MB asks first; 취소 keeps the file, 계속 줄이기 starts', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The 20 MB soft limit applies to mobile devices; desktop limits are covered by unit tests.');
  test.setTimeout(120_000);
  await open(page);
  await pick(page, runtimePath('big_21mb'), 1);
  await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
  const confirm = page.locator('#cmp-confirm');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('20 MB');
  await confirm.getByRole('button', { name: '취소' }).click();
  await expect(confirm).toBeHidden();
  await expect(tool(page)).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#cmp-name')).toHaveText('big_21mb.pdf');
  await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
  await page.getByRole('button', { name: '계속 줄이기' }).click();
  await expect(tool(page)).toHaveAttribute('data-state', 'working');
  await page.locator('#cmp-cancel').click();
  await expect(tool(page)).toHaveAttribute('data-state', 'ready');
});

test('keyboard only: pick, compress and download', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile, 'Keyboard-only flow is a desktop scenario; mobile projects cover touch.');
  await open(page);
  const tabTo = async (predicate: string, max = 40): Promise<void> => {
    for (let i = 0; i < max; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(predicate)) return;
    }
    throw new Error(`focus never reached: ${predicate}`);
  };
  await tabTo(`document.activeElement?.id === 'cmp-input'`);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press(browserName === 'webkit' ? 'Space' : 'Enter')]);
  await chooser.setFiles(SCAN);
  await expect(page.locator('#cmp-info')).toContainText('1쪽');
  await tabTo(`document.activeElement?.id === 'cmp-run'`);
  await page.keyboard.press('Enter');
  await expect(tool(page)).toHaveAttribute('data-state', 'done', { timeout: 45_000 });
  // Focus lands on the headline (Polish P.5); the download is the next stop.
  await expect(page.locator(':focus')).toHaveId('cmp-headline');
  // The download link has tabindex="0": Safari leaves plain links out of the Tab order by default.
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveId('cmp-download');
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(await pageCount(new Uint8Array(readFileSync(await download.path())))).toBe(1);
});
