// 글자수 세기 (TOOLS1015 C1) end to end: the six numbers for a fixed text, the goal bar (over / under, basis, the one
// announcement), copy (Chromium clipboard) and its select-all fallback, 지우기 + 되돌리기, the leave prompt only while
// there is text, no Web Storage written, and the 자소서 chain opening /id-photo/ with the preset. Every project.
import type { Page } from '@playwright/test';
import { expect, gotoReady, test } from './no-upload';

// Line 1: 14 characters (12 without spaces, 17 / 20 bytes); a blank line; line 3 with a tab: 7 (5; 12 / 17 bytes).
const TEXT = ['저는 Team 2024년!', '', '둘째 문단\t끝'].join('\n');
const NUMBERS = { space: '23', nospace: '17', byte2: '31', byte3: '39', lines: '3', paras: '2' };

/** Counts beforeunload listeners the page adds and removes (the leave prompt is on only while there is text). */
async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __bu: number };
    w.__bu = 0;
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = ((type: string, ...rest: [EventListenerOrEventListenerObject, (boolean | AddEventListenerOptions)?]) => {
      if (type === 'beforeunload') w.__bu++;
      return add(type, ...rest);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, ...rest: [EventListenerOrEventListenerObject, (boolean | EventListenerOptions)?]) => {
      if (type === 'beforeunload') w.__bu--;
      return remove(type, ...rest);
    }) as typeof window.removeEventListener;
  });
  await gotoReady(page, '/char-count/');
}

const leaveListeners = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __bu: number }).__bu);

async function expectNumbers(page: Page, n: typeof NUMBERS): Promise<void> {
  await expect(page.locator('#cc-n-space')).toHaveText(n.space);
  await expect(page.locator('#cc-n-nospace')).toHaveText(n.nospace);
  await expect(page.locator('#cc-n-byte2')).toHaveText(n.byte2);
  await expect(page.locator('#cc-n-byte3')).toHaveText(n.byte3);
  await expect(page.locator('#cc-n-lines')).toHaveText(n.lines);
  await expect(page.locator('#cc-n-paras')).toHaveText(n.paras);
}

const ZERO = { space: '0', nospace: '0', byte2: '0', byte3: '0', lines: '0', paras: '0' };

test('the six numbers for a fixed text; Intl.Segmenter counts an emoji family as one', async ({ page }) => {
  await open(page);
  await expectNumbers(page, ZERO);
  await expect(page.locator('#cc-copy')).toBeDisabled();
  await page.locator('#cc-text').fill(TEXT);
  await expectNumbers(page, NUMBERS);
  // Brief probe (a): the segmenter exists in this project (logged per project in BUILD-LOG).
  expect(await page.evaluate(() => typeof (Intl as unknown as { Segmenter?: unknown }).Segmenter)).toBe('function');
  await page.locator('#cc-text').fill('가 \u{1F468}\u200D\u{1F469}\u200D\u{1F467}');
  await expect(page.locator('#cc-n-space')).toHaveText('3');
  await expect(page.locator('#cc-n-nospace')).toHaveText('2');
  // Round 2 (Richard r1): a plain emoji above U+FFFF is one character too (it is two UTF-16 units).
  await page.locator('#cc-text').fill(`가 ${String.fromCodePoint(0x1f600)} ${String.fromCodePoint(0x1f1f0, 0x1f1f7)}`);
  await expect(page.locator('#cc-n-space')).toHaveText('5');
  await expect(page.locator('#cc-n-nospace')).toHaveText('3');
});

test('goal: over text, progress and colour state; basis switch; under again; one announcement per crossing', async ({ page }) => {
  await open(page);
  await page.locator('#cc-text').fill(TEXT);
  await expect(page.locator('#cc-goal-out')).toBeHidden();
  await page.locator('#cc-goal').fill('10');
  await expect(page.locator('#cc-goal-text')).toHaveText('13자 넘었어요');
  await expect(page.locator('#cc-goal-box')).toHaveAttribute('data-over', 'true');
  expect(await page.locator('#cc-progress').evaluate((p: HTMLProgressElement) => [p.value, p.max])).toEqual([10, 10]);
  await expect(page.locator('#cc-live')).toHaveText('목표보다 13자 넘었어요');
  await page.locator('#cc-basis').selectOption('nospace');
  await expect(page.locator('#cc-goal-text')).toHaveText('7자 넘었어요');
  await page.locator('#cc-basis').selectOption('byte2');
  await expect(page.locator('#cc-goal-text')).toHaveText('21바이트 넘었어요');
  await page.locator('#cc-basis').selectOption('byte3');
  await expect(page.locator('#cc-goal-text')).toHaveText('29바이트 넘었어요');
  // Still over: the announcement is not repeated with the new number.
  await expect(page.locator('#cc-live')).toHaveText('목표보다 13자 넘었어요');
  await page.locator('#cc-basis').selectOption('space');
  await page.getByRole('button', { name: '1,000자' }).click();
  await expect(page.locator('#cc-goal')).toHaveValue('1000');
  await expect(page.locator('#cc-goal-text')).toHaveText('977자 남았어요');
  await expect(page.locator('#cc-goal-box')).toHaveAttribute('data-over', 'false');
  expect(await page.locator('#cc-progress').evaluate((p: HTMLProgressElement) => [p.value, p.max])).toEqual([23, 1000]);
  await expect(page.locator('#cc-live')).toHaveText('목표 글자 수 안으로 들어왔어요');
  // A cleared or invalid goal hides the bar.
  await page.locator('#cc-goal').fill('');
  await expect(page.locator('#cc-goal-out')).toBeHidden();
});

test('back/forward: restored text and goal are counted without an announcement (round 2)', async ({ page }) => {
  await gotoReady(page, '/char-count/');
  await page.locator('#cc-text').fill(TEXT);
  await page.locator('#cc-goal').fill('10');
  await expect(page.locator('#cc-live')).toHaveText('목표보다 13자 넘었어요');
  await gotoReady(page, '/privacy/');
  await page.goBack({ waitUntil: 'load' });
  const restored = await page.locator('#cc-text').inputValue();
  test.skip(restored !== TEXT || (await page.locator('#cc-goal').inputValue()) !== '10', 'This browser did not restore the form.');
  await expect(page.locator('#cc-goal-text')).toHaveText('13자 넘었어요');
  await expect(page.locator('#cc-live')).toHaveText('');
});

test('copy: the clipboard gets the text (Chromium)', async ({ page, browserName, context }) => {
  test.skip(browserName !== 'chromium', 'Clipboard read permission is a Chromium-only Playwright feature.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.locator('#cc-text').fill(TEXT);
  await page.getByRole('button', { name: '복사하기' }).click();
  await expect(page.locator('#cc-note')).toContainText('복사했어요');
  // The Windows clipboard stores line breaks as CRLF; the text itself must be the same.
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(TEXT);
});

test('copy refused: the whole text is selected and the note says Ctrl+C', async ({ page }) => {
  await page.addInitScript(() => {
    if (navigator.clipboard) Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('denied')) });
  });
  await open(page);
  await page.locator('#cc-text').fill(TEXT);
  await page.getByRole('button', { name: '복사하기' }).click();
  await expect(page.locator('#cc-note')).toContainText('Ctrl+C로 복사하세요');
  expect(await page.locator('#cc-text').evaluate((t: HTMLTextAreaElement) => [t.selectionStart, t.selectionEnd, document.activeElement === t])).toEqual([0, TEXT.length, true]);
});

test('지우기 keeps one undo until the next input; the leave prompt is on only while there is text; no storage written', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => [localStorage.length, sessionStorage.length]);
  expect(await leaveListeners(page)).toBe(0);
  await page.locator('#cc-text').fill(TEXT);
  await expectNumbers(page, NUMBERS);
  expect(await leaveListeners(page)).toBe(1);
  await page.getByRole('button', { name: '지우기' }).click();
  await expect(page.locator('#cc-text')).toHaveValue('');
  await expectNumbers(page, ZERO);
  expect(await leaveListeners(page)).toBe(0);
  await page.getByRole('button', { name: '되돌리기' }).click();
  await expect(page.locator('#cc-text')).toHaveValue(TEXT);
  await expectNumbers(page, NUMBERS);
  await expect(page.getByRole('button', { name: '되돌리기' })).toBeHidden();
  expect(await leaveListeners(page)).toBe(1);
  // A new input after 지우기 drops the undo.
  await page.getByRole('button', { name: '지우기' }).click();
  await page.locator('#cc-text').pressSequentially('가');
  await expect(page.getByRole('button', { name: '되돌리기' })).toBeHidden();
  await expect(page.locator('#cc-n-space')).toHaveText('1');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual(before);
});

for (const [name, preset] of [['사람인 규격으로 맞추기', 'saramin'], ['잡코리아 규격으로 맞추기', 'jobkorea']] as const) {
  test(`the 자소서 chain opens /id-photo/ with the ${preset} preset`, async ({ page }) => {
    await gotoReady(page, '/char-count/');
    await page.locator('#cc-chain').getByRole('link', { name }).click();
    await page.waitForURL(new RegExp(`/id-photo/\\?preset=${preset}$`));
    await page.waitForFunction(() => document.readyState === 'complete');
    await expect(page.locator('#idp-preset')).toHaveValue(preset);
  });
}

test('SEO: one H1 equal to the name, canonical, FAQPage JSON-LD with 5 questions, the chain links the resume-photo guide', async ({ page }) => {
  await gotoReady(page, '/char-count/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('글자수 세기');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/char-count\/$/);
  const data = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((j) => JSON.parse(j));
  expect(data.find((d: { '@type': string }) => d['@type'] === 'FAQPage').mainEntity).toHaveLength(5);
  await expect(page.locator('#cc-chain a[href="/guide/resume-photo/"]')).toHaveCount(1);
  // A draft guide is never linked.
  await expect(page.locator('a[href="/guide/work24-resume-upload/"]')).toHaveCount(0);
});
