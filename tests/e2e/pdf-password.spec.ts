// PDF 암호 해제·설정 (TOOLS4 T4) end to end: lock with a Korean password (the output refuses pdf.js without it and
// opens with it at the same page count), unlock that output (opens without a password), a wrong password keeps the
// field, a plain PDF in 암호 풀기 stops, a protected PDF in 암호 걸기 offers 암호 풀기, an owner-limited PDF is never
// rewritten, a signed PDF gets the signature warning, and nothing heavy loads with the page. Downloads are parsed here.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Download, Page } from '@playwright/test';
import { KEEP_NOTE, SIGNATURE_NOTE, STOP_MESSAGES } from '../../src/tools/pdf-password/flow';
import { withPdf } from '../helpers/pdf';
import { expect, gotoReady, test } from './no-upload';
import { RUNTIME_DIR, fixturePath, runtimePath } from './paths';

const KOREAN = '문서딱암호12';
const PLAIN = fixturePath('gen_links_outline.pdf');

async function pdfOpen(bytes: Uint8Array, password?: string): Promise<number | string> {
  try {
    return await withPdf(bytes, async (doc) => doc.numPages, password);
  } catch (err) {
    const e = err as { name?: string; code?: number };
    return `${e.name}:${e.code}`;
  }
}

async function open(page: Page, action: '암호 풀기' | '암호 걸기', path: string): Promise<void> {
  await gotoReady(page, '/pdf-password/');
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'empty');
  if (action === '암호 걸기') await page.locator('label.chip', { hasText: '암호 걸기' }).click();
  await page.setInputFiles('#pp-input', path);
}

async function save(page: Page): Promise<{ name: string; bytes: Uint8Array }> {
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'done', { timeout: 45_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: '내려받기' }).click()]);
  const d = download as Download;
  return { name: d.suggestedFilename(), bytes: new Uint8Array(readFileSync(await d.path())) };
}

async function lock(page: Page, path: string, password = KOREAN): Promise<{ name: string; bytes: Uint8Array }> {
  await open(page, '암호 걸기', path);
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'ask');
  await expect(page.locator('#pp-new')).toBeFocused();
  await page.locator('#pp-new').fill(password);
  await page.locator('#pp-again').fill(password);
  await page.getByRole('button', { name: '암호 걸기', exact: true }).click();
  return save(page);
}

test('lock with a Korean password, then unlock that file: AES-256 output checked with pdf.js both ways; wrong password keeps the field', async ({ page }) => {
  const pages = await pdfOpen(new Uint8Array(readFileSync(PLAIN)));
  expect(typeof pages).toBe('number');
  const locked = await lock(page, PLAIN);
  expect(locked.name).toBe('gen_links_outline_암호.pdf');
  await expect(page.locator('#pp-headline')).toHaveText('암호를 건 PDF가 준비되었습니다');
  await expect(page.locator('#pp-summary')).toHaveText(/ · 열 때 비밀번호 필요$/);
  await expect(page.locator('#pp-notes')).toContainText(KEEP_NOTE);
  await expect(page.locator('#pp-notes')).not.toContainText('전자서명');
  // The password fields are emptied once the file is ready.
  await expect(page.locator('#pp-new')).toHaveValue('');
  expect(await pdfOpen(locked.bytes)).toBe('PasswordException:1');
  expect(await pdfOpen(locked.bytes, KOREAN)).toBe(pages);
  expect(Buffer.from(locked.bytes).toString('latin1')).toMatch(/AESV3/);

  // One copy per worker process, so two projects never write the same path at once.
  const lockedPath = join(RUNTIME_DIR, `pp-${process.pid}`, 'pdf_password_locked.pdf');
  mkdirSync(dirname(lockedPath), { recursive: true });
  writeFileSync(lockedPath, locked.bytes);

  await open(page, '암호 풀기', lockedPath);
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'ask');
  await expect(page.locator('#pp-pw')).toBeFocused();
  await page.locator('#pp-pw').fill('0000');
  await page.locator('#pp-pw').press('Enter');
  await expect(page.locator('#pp-unlock-error')).toHaveText('비밀번호가 맞지 않습니다. 다시 입력해 주세요.');
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'ask');
  await expect(page.locator('#pp-pw')).toHaveValue('0000');
  await page.locator('#pp-pw').fill(KOREAN);
  await page.getByRole('button', { name: '암호 풀기', exact: true }).click();
  const unlocked = await save(page);
  expect(unlocked.name).toBe('pdf_password_locked_암호해제.pdf');
  await expect(page.locator('#pp-headline')).toHaveText('암호를 푼 PDF가 준비되었습니다');
  expect(await pdfOpen(unlocked.bytes)).toBe(pages);
  await withPdf(unlocked.bytes, async (doc) => expect(await doc.getPermissions()).toBeNull());
});

test('unlock the pdf-lib encrypted fixture (password 1234); a double Enter is one attempt', async ({ page }) => {
  await open(page, '암호 풀기', runtimePath('encrypted_userpw_1234'));
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'ask');
  await page.locator('#pp-pw').fill('1234');
  await page.locator('#pp-unlock').evaluate((f: HTMLFormElement) => {
    f.requestSubmit();
    f.requestSubmit();
  });
  const out = await save(page);
  expect(out.name).toBe('encrypted_userpw_1234_암호해제.pdf');
  expect(await pdfOpen(out.bytes)).toBe(7);
});

test('a plain PDF in 암호 풀기 stops with the not-encrypted message; so does an owner-limited one (never rewritten)', async ({ page }) => {
  for (const path of [PLAIN, runtimePath('owner_no_copy')]) {
    await open(page, '암호 풀기', path);
    await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'stop');
    await expect(page.locator('#pp-stop-text')).toHaveText(STOP_MESSAGES['not-encrypted']);
    await expect(page.locator('#pp-unlock')).toBeHidden();
    await expect(page.locator('#pp-switch')).toBeHidden();
  }
});

test('a protected PDF in 암호 걸기: already-encrypted message and 암호 풀기로 바꾸기, which opens the password field', async ({ page }) => {
  await open(page, '암호 걸기', runtimePath('encrypted_userpw_1234'));
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'stop');
  await expect(page.locator('#pp-stop-text')).toHaveText('이미 암호가 걸린 파일입니다. 먼저 암호를 풀어 주세요.');
  await page.getByRole('button', { name: '암호 풀기로 바꾸기' }).click();
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'ask');
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-action', 'unlock');
  await expect(page.locator('input[name="pp-action"][value="unlock"]')).toBeChecked();
  await expect(page.locator('#pp-pw')).toBeFocused();
});

test('an owner-limited PDF in 암호 걸기 stops: no new password over its limits, no switch offered', async ({ page }) => {
  await open(page, '암호 걸기', runtimePath('owner_no_copy'));
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'stop');
  await expect(page.locator('#pp-stop-text')).toHaveText(STOP_MESSAGES.restricted);
  await expect(page.locator('#pp-switch')).toBeHidden();
});

test('a signed PDF: the signature warning is shown before the download', async ({ page }) => {
  await lock(page, runtimePath('signed_fake'), 'abcd1234');
  await expect(page.locator('#pp-notes')).toContainText(SIGNATURE_NOTE);
});

test('lock password rules: too short and a mismatch get messages and start nothing', async ({ page }) => {
  await open(page, '암호 걸기', PLAIN);
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'ask');
  await page.locator('#pp-new').fill('abc');
  await page.locator('#pp-again').fill('abc');
  await page.locator('#pp-again').press('Enter');
  await expect(page.locator('#pp-lock-error')).toHaveText('비밀번호는 4자 이상 64자 이하로 입력해 주세요.');
  await page.locator('#pp-new').fill('abcd');
  await page.locator('#pp-again').fill('abce');
  await page.getByRole('button', { name: '암호 걸기', exact: true }).click();
  await expect(page.locator('#pp-lock-error')).toHaveText('두 비밀번호가 같지 않습니다. 같은 비밀번호를 한 번 더 입력해 주세요.');
  await expect(page.locator('#pp-again')).toBeFocused();
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'ask');
});

test('a file that is not a PDF: message, back to the picker', async ({ page }) => {
  await open(page, '암호 풀기', runtimePath('not_a_pdf'));
  await expect(page.locator('#pp-error')).toHaveText('PDF 파일이 아닙니다. PDF 파일을 골라 주세요.');
  await expect(page.locator('#pp-tool')).toHaveAttribute('data-state', 'empty');
});

test('the controller, pdf.js and qpdf load only after the first interaction; the password never appears in a request URL', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await gotoReady(page, '/pdf-password/');
  await page.waitForTimeout(500);
  expect(urls.map((u) => new URL(u).pathname).filter((s) => /inspect|pdfjs|pdf\.worker|controller|password\.worker|qpdf/.test(s))).toEqual([]);
  await expect(page.locator('#pp-rule')).toHaveText('열 때 쓰는 비밀번호를 아는 파일만 풀 수 있습니다.');
  await lock(page, PLAIN);
  expect(urls.some((u) => /qpdf\.wasm/.test(u))).toBe(true);
  for (const u of urls) expect(decodeURIComponent(u)).not.toContain(KOREAN);
  expect(page.url()).not.toContain('?');
});
