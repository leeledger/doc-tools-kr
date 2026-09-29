import { readFileSync } from 'node:fs';
import type { Download, Page } from '@playwright/test';
import { fixture, pageTexts } from '../helpers/pdf';
import { expect, gotoReady, test } from './no-upload';
import { fixturePath, runtimePath } from './paths';

const LAW = fixturePath('kr_law_form.pdf');
const FW9 = fixturePath('irs_fw9.pdf');

const items = (page: Page) => page.locator('#merge-list > li');
/** The run button reads "PDF {n}개 합치기" (Polish P.16). */
const runButton = (page: Page) => page.getByRole('button', { name: /^PDF \d+개 합치기$/ });
const item = (page: Page, name: string) => items(page).filter({ has: page.locator('.name', { hasText: name }) });

async function open(page: Page): Promise<void> {
  await gotoReady(page, '/pdf-merge/');
  await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'empty');
}

async function add(page: Page, paths: string[]): Promise<void> {
  await page.setInputFiles('#merge-input', paths);
}

async function expectInspected(page: Page, name: string, pages: number): Promise<void> {
  await expect(item(page, name).locator('.info')).toContainText(`${pages}쪽`);
}

async function downloadBytes(download: Download): Promise<Uint8Array> {
  const path = await download.path();
  return new Uint8Array(readFileSync(path));
}

test('happy path: add two files, move irs_fw9 up, merge and download', async ({ page }) => {
  await open(page);
  await add(page, [LAW, FW9]);
  await expectInspected(page, 'kr_law_form.pdf', 7);
  await expectInspected(page, 'irs_fw9.pdf', 6);
  // The thumbnail is rendered (hidden by design at ≤ 400 px, where the name needs the room).
  await expect(item(page, 'irs_fw9.pdf').locator('canvas')).toHaveCount(1);
  await expect(page.locator('#merge-bookmarks')).toBeChecked();
  // Only the listing UI is visible.
  await expect(page.locator('#merge-progress')).toBeHidden();
  await expect(page.locator('#merge-result')).toBeHidden();
  await expect(page.locator('#merge-error')).toBeHidden();

  await page.getByRole('button', { name: 'irs_fw9.pdf 위로 이동' }).click();
  await expect(items(page).first()).toContainText('irs_fw9.pdf');
  await expect(page.locator('#merge-status')).toContainText('1번째');

  await runButton(page).click();
  await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'done');
  await expect(page.locator('#merge-summary')).toContainText('13쪽');
  await expect(page.locator('#merge-summary')).toHaveText(/^13쪽 · [\d.,]+ (KB|MB)$/);
  await expect(page.locator('#merge-save-name')).toHaveText('저장될 이름: irs_fw9_외1건_합침.pdf');
  await expect(page.locator('#merge-drop')).toBeHidden();
  await expect(page.locator('#merge-list')).toBeHidden();
  await expect(page.locator('#merge-controls')).toBeHidden();
  await expect(page.locator('#merge-progress')).toBeHidden();
  await expect(page.locator('#merge-result').getByRole('link', { name: 'PDF 용량 줄이기' })).toHaveAttribute('href', '/pdf-compress/');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: '내려받기' }).click()]);
  expect(download.suggestedFilename()).toBe('irs_fw9_외1건_합침.pdf');
  const bytes = await downloadBytes(download);
  const out = await pageTexts(bytes);
  expect(out.length).toBe(13);
  expect(out[0]).toBe((await pageTexts(fixture('irs_fw9.pdf'), undefined, [0]))[0]);

  await page.getByRole('button', { name: '다른 파일 처리하기' }).click();
  await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'empty');
  await expect(items(page)).toHaveCount(0);
});

test('password: wrong password shows the message, the right one unlocks, merge succeeds', async ({ page }) => {
  await open(page);
  await add(page, [runtimePath('encrypted_userpw_1234'), LAW]);
  const locked = item(page, 'encrypted_userpw_1234.pdf');
  await expect(locked.getByText('이 파일은 비밀번호로 보호되어 있습니다')).toBeVisible();
  await expectInspected(page, 'kr_law_form.pdf', 7);
  await expect(runButton(page)).toBeDisabled();

  const field = locked.getByLabel('비밀번호', { exact: true });
  // The state sentence describes the field (Polish P.17); the toggle shows the typed password.
  await expect(field).toHaveAccessibleDescription(/이 파일은 비밀번호로 보호되어 있습니다\./);
  const toggle = locked.getByRole('button', { name: '비밀번호 보기' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(field).toHaveAttribute('type', 'text');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(field).toHaveAttribute('type', 'password');
  await field.fill('0000');
  await locked.getByRole('button', { name: /비밀번호 확인/ }).click();
  await expect(locked.locator('.pw-error')).toHaveText('비밀번호가 맞지 않습니다.');
  await expect(runButton(page)).toBeDisabled();

  await field.fill('1234');
  await field.press('Enter');
  await expectInspected(page, 'encrypted_userpw_1234.pdf', 7);
  await expect(runButton(page)).toBeEnabled();

  await runButton(page).click();
  await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'done');
  await expect(page.locator('#merge-summary')).toContainText('14쪽');
  await expect(page.locator('#merge-notes')).toContainText('합친 파일에는 비밀번호가 걸려 있지 않습니다.');
  // The password never reaches the URL.
  expect(page.url()).not.toContain('1234');
});

test('bad inputs: a not-PDF never enters the list (one alert), a corrupt file is reported, other files are kept', async ({ page }) => {
  await open(page);
  await add(page, [runtimePath('not_a_pdf'), LAW, runtimePath('truncated'), FW9]);
  await expect(page.locator('#merge-error')).toHaveText('not_a_pdf.pdf은(는) PDF 파일이 아니어서 넣지 않았습니다. PDF 파일만 넣을 수 있습니다.');
  await expect(item(page, 'not_a_pdf.pdf')).toHaveCount(0);
  await expect(item(page, 'truncated.pdf').locator('.file-error')).toHaveText(
    '파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아 주세요.',
  );
  await expectInspected(page, 'kr_law_form.pdf', 7);
  await expectInspected(page, 'irs_fw9.pdf', 6);
  await expect(items(page)).toHaveCount(3);
  await expect(runButton(page)).toBeDisabled();
  await expect(page.locator('#merge-hint')).toContainText('문제가 있는 파일을 목록에서 삭제하면');
  // One error card only: no "문제 파일 모두 빼기".
  await expect(page.getByRole('button', { name: '문제 파일 모두 빼기' })).toBeHidden();

  await page.getByRole('button', { name: 'truncated.pdf 삭제' }).click();
  await expect(items(page)).toHaveCount(2);
  await runButton(page).click();
  await expect(page.locator('#merge-summary')).toContainText('13쪽');
});

test('cancel during a merge returns to the list with the files intact', async ({ page, context }) => {
  await open(page);
  await add(page, [LAW, FW9]);
  await expectInspected(page, 'irs_fw9.pdf', 6);

  // Hold the merge worker script so the merge is reliably still running when 취소 is pressed.
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => (release = r));
  await context.route(/merge\.worker.*\.js/, async (route) => {
    await held;
    await route.continue().catch(() => undefined);
  });

  await runButton(page).click();
  await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'merging');
  await expect(page.locator('#merge-progress-text')).toContainText('합치는 중…');
  await page.getByRole('button', { name: '취소' }).click();
  release();

  await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'listing');
  await expect(page.locator('#merge-progress')).toBeHidden();
  await expect(items(page)).toHaveCount(2);
  await expect(page.locator('#merge-status')).toContainText('취소');
  await expect(runButton(page)).toBeEnabled();

  // The list still merges afterwards.
  await context.unroute(/merge\.worker.*\.js/);
  await runButton(page).click();
  await expect(page.locator('#merge-summary')).toContainText('13쪽');
});

test('keyboard only: pick, reorder, merge and download', async ({ page, browserName, isMobile }) => {
  test.skip(isMobile, 'Keyboard-only flow is a desktop scenario; mobile projects cover touch.');
  await open(page);

  const tabTo = async (predicate: string, max = 40): Promise<void> => {
    for (let i = 0; i < max; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(predicate)) return;
    }
    throw new Error(`focus never reached: ${predicate}`);
  };

  await tabTo(`document.activeElement?.id === 'merge-input'`);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press(browserName === 'webkit' ? 'Space' : 'Enter')]);
  await chooser.setFiles([LAW, FW9]);
  await expectInspected(page, 'irs_fw9.pdf', 6);
  await expectInspected(page, 'kr_law_form.pdf', 7);

  await tabTo(`document.activeElement?.getAttribute('aria-label') === 'irs_fw9.pdf 위로 이동'`);
  await page.keyboard.press('Enter');
  await expect(items(page).first()).toContainText('irs_fw9.pdf');
  // Focus followed the moved item (its 위로 button is now disabled, so 아래로 has focus).
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', 'irs_fw9.pdf 아래로 이동');

  await tabTo(`document.activeElement?.id === 'merge-run'`);
  await page.keyboard.press('Enter');
  await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'done');
  // Focus lands on the headline (Polish P.5 rule); the download is the next stop.
  await expect(page.locator(':focus')).toHaveId('merge-headline');
  // The download link has tabindex="0": Safari leaves plain links out of the Tab order by default.
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveId('merge-download');
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  const out = await pageTexts(await downloadBytes(download));
  expect(out.length).toBe(13);
});

test('drop area accepts dropped PDF files', async ({ page }) => {
  await open(page);
  const data = readFileSync(LAW).toString('base64');
  const dt = await page.evaluateHandle((b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const t = new DataTransfer();
    t.items.add(new File([bin], 'dropped.pdf', { type: 'application/pdf' }));
    return t;
  }, data);
  await page.dispatchEvent('#merge-drop', 'dragover', { dataTransfer: dt });
  await page.dispatchEvent('#merge-drop', 'drop', { dataTransfer: dt });
  await expectInspected(page, 'dropped.pdf', 7);
  await expect(page.locator('#merge-hint')).toContainText('하나 더');
});

test('mobile soft limit: over 50 MB asks for confirmation before merging', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The 50 MB soft limit applies to mobile devices; desktop limits are covered by unit tests.');
  test.setTimeout(120_000);
  await open(page);
  await add(page, [runtimePath('big_51mb'), LAW]);
  await expectInspected(page, 'big_51mb.pdf', 1);
  await expectInspected(page, 'kr_law_form.pdf', 7);
  await runButton(page).click();
  const confirm = page.locator('#merge-confirm');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('50 MB');
  await confirm.getByRole('button', { name: '취소' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'listing');

  await runButton(page).click();
  await page.getByRole('button', { name: '계속 합치기' }).click();
  await expect(page.locator('#merge-summary')).toContainText('8쪽');
});
