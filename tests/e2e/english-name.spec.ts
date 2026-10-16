// 영문 이름 변환기 (ROMANIZE1016) end to end, every project, no-upload guard on every test: the three rows, the 외교부
// list choices (surname, syllables, 직접 쓰기), the case toggle, warnings, the invalid-input error, a full name pasted
// into 성, copy and its refused fallback, arrow keys in the radio groups, and that the name never reaches the URL,
// storage or any request.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, gotoReady, test } from './no-upload';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function name(page: Page, sur: string, given: string): Promise<void> {
  await page.locator('#en-sur').fill(sur);
  await page.locator('#en-given').fill(given);
}

async function rows(page: Page, joined: string, hyphen: string, space: string): Promise<void> {
  await expect(page.locator('#en-joined')).toHaveText(joined);
  await expect(page.locator('#en-hyphen')).toHaveText(hyphen);
  await expect(page.locator('#en-space')).toHaveText(space);
}

const surnameChoice = (page: Page, text: string) => page.locator('#en-sur-choices label.chip').filter({ hasText: text });

test('홍 + 길동: three rows, title case toggle, placeholders, result hidden until both are valid', async ({ page }) => {
  await gotoReady(page, '/english-name/');
  await expect(page.locator('#en-sur')).toHaveAttribute('placeholder', '예: 이');
  await expect(page.locator('#en-given')).toHaveAttribute('placeholder', '예: 서연');
  await expect(page.locator('#en-result')).toBeHidden();
  await page.locator('#en-sur').fill('홍');
  await expect(page.locator('#en-result')).toBeHidden();
  await page.locator('#en-given').fill('길동');
  await rows(page, 'HONG GILDONG', 'HONG GIL-DONG', 'HONG GIL DONG');
  await expect(page.locator('#en-sur-caption')).toHaveText('이 성은 외교부 통계 예시에 없어요.');
  await page.getByLabel('첫 글자만 대문자').check();
  await rows(page, 'Hong Gildong', 'Hong Gil-dong', 'Hong Gil Dong');
  await page.getByLabel('여권처럼 모두 대문자').check();
  await expect(page.locator('#en-joined')).toHaveText('HONG GILDONG');
  // The owner's note and the three 외교부 links, new tab.
  await expect(page.locator('#en-note')).toContainText('최종 확인은 외교부 안내를 따르세요');
  const links = page.locator('#en-note a');
  await expect(links).toHaveCount(3);
  for (const pos of [37, 39, 38]) await expect(page.locator(`#en-note a[href$="menuPos=${pos}"]`)).toHaveAttribute('target', '_blank');
  await expect(links.first()).toHaveAttribute('rel', 'noopener');
});

test('김 + 복남: KIM by default with GIM 0.42% listed; picking GIM updates every row', async ({ page }) => {
  await gotoReady(page, '/english-name/');
  await name(page, '김', '복남');
  await rows(page, 'KIM BOKNAM', 'KIM BOK-NAM', 'KIM BOK NAM');
  await expect(surnameChoice(page, 'KIM 99.55%').locator('input')).toBeChecked();
  await expect(surnameChoice(page, 'GIM 0.42%')).toBeVisible();
  await surnameChoice(page, 'GIM 0.42%').click();
  await rows(page, 'GIM BOKNAM', 'GIM BOK-NAM', 'GIM BOK NAM');
  await expect(page.locator('#en-sur-caption')).toContainText('2024년 10월 31일 기준');
});

test('정: JUNG by default, JEONG, CHUNG, JOUNG and CHEONG listed; 남궁 + 민수 is one joined surname', async ({ page }) => {
  await gotoReady(page, '/english-name/');
  await name(page, '정', '연');
  await expect(page.locator('#en-joined')).toHaveText('JUNG YEON');
  await expect(page.locator('#en-sur-choices label.chip span')).toHaveText(['JUNG 46.13%', 'JEONG 42.48% 표기법대로', 'CHUNG 7.13%', 'JOUNG 1.78%', 'CHEONG 0.56%', '직접 쓰기']);
  await name(page, '남궁', '민수');
  await rows(page, 'NAMGUNG MINSU', 'NAMGUNG MIN-SU', 'NAMGUNG MIN SU');
  await expect(page.locator('#en-sur-choices label.chip span')).toHaveText(['NAMGUNG 표기법대로', '직접 쓰기']);
});

test('강 + 하늘: KANG by default; the 표기법 spelling GANG shows the 외교부 warning', async ({ page }) => {
  await gotoReady(page, '/english-name/');
  await name(page, '강', '하늘');
  await expect(page.locator('#en-joined')).toHaveText('KANG HANEUL');
  await expect(page.locator('#en-warn')).toBeEmpty();
  await surnameChoice(page, 'GANG').click();
  await expect(page.locator('#en-joined')).toHaveText('GANG HANEUL');
  await expect(page.locator('#en-warn')).toContainText('좋지 않은 뜻이 될 수 있는 철자예요(외교부 예시)');
  await surnameChoice(page, 'KANG').click();
  await expect(page.locator('#en-warn')).toBeEmpty();
});

test('직접 쓰기: a typed spelling is upper-cased into every row; an invalid one hides the rows', async ({ page }) => {
  await gotoReady(page, '/english-name/');
  await name(page, '이', '하늘');
  await surnameChoice(page, '직접 쓰기').click();
  const custom = page.getByLabel('직접 쓴 성 영문 표기');
  await expect(custom).toBeFocused();
  await expect(page.locator('#en-rows')).toBeHidden();
  await custom.fill('rhee');
  await rows(page, 'RHEE HANEUL', 'RHEE HA-NEUL', 'RHEE HA NEUL');
  await custom.fill('rhee1');
  await expect(page.locator('#en-rows')).toBeHidden();
  await surnameChoice(page, 'LEE').click();
  await expect(page.locator('#en-joined')).toHaveText('LEE HANEUL');
});

test('이 + 영희: syllable rows for 영 and 희 with their 비율; picking YOUNG gives LEE YOUNGHUI', async ({ page }) => {
  await gotoReady(page, '/english-name/');
  await name(page, '이', '영희');
  await expect(page.locator('#en-joined')).toHaveText('LEE YEONGHUI');
  const young = page.getByRole('group', { name: '이름 1번째 글자 「영」 표기' });
  const hee = page.getByRole('group', { name: '이름 2번째 글자 「희」 표기' });
  await expect(young.locator('label.chip span')).toHaveText(['YEONG 18.65% 표기법', 'YOUNG 79.67%', 'YUNG 1.02%']);
  await expect(hee.locator('label.chip span').nth(1)).toHaveText('HEE 84.24%');
  await young.locator('label.chip').filter({ hasText: 'YOUNG' }).click();
  await rows(page, 'LEE YOUNGHUI', 'LEE YOUNG-HUI', 'LEE YOUNG HUI');
  await hee.locator('label.chip').filter({ hasText: 'HEE' }).click();
  await expect(page.locator('#en-joined')).toHaveText('LEE YOUNGHEE');
});

test('not a whole Hangul syllable: the error, rows hidden; a fix brings them back', async ({ page }) => {
  await gotoReady(page, '/english-name/');
  await name(page, '홍', 'ㄱㄴ');
  await expect(page.locator('#en-error')).toHaveText('한글 이름만 바꿀 수 있어요. 받침까지 다 쓴 글자로 넣어 주세요.');
  await expect(page.locator('#en-given')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#en-result')).toBeHidden();
  await page.locator('#en-given').fill('Gildong');
  await expect(page.locator('#en-result')).toBeHidden();
  await page.locator('#en-given').fill('길동');
  await expect(page.locator('#en-error')).toBeEmpty();
  await expect(page.locator('#en-joined')).toHaveText('HONG GILDONG');
  // 영문 이름 보기 moves focus to the result.
  await page.getByRole('button', { name: '영문 이름 보기' }).click();
  await expect(page.locator('#en-result')).toBeFocused();
});

test('a full name pasted into 성 is split into 성 and 이름 with a hint', async ({ page }) => {
  await gotoReady(page, '/english-name/');
  const sur = page.locator('#en-sur');
  await sur.focus();
  // A synthetic paste event (no clipboard permission needed). Firefox hands a synthetic paste an empty clipboardData
  // (probed 2026-10-16), so there the text goes through a real copy and paste with the keyboard.
  await sur.evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, '홍길동');
  if ((await sur.inputValue()) === '') {
    await page.evaluate(() => {
      const t = document.createElement('textarea');
      t.id = 'paste-src';
      t.value = '홍길동';
      document.body.append(t);
    });
    await page.locator('#paste-src').focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+C');
    await sur.focus();
    await page.keyboard.press('ControlOrMeta+V');
  }
  await expect(sur).toHaveValue('홍');
  await expect(page.locator('#en-given')).toHaveValue('길동');
  await expect(page.locator('#en-hint')).toHaveText('성과 이름을 나눠 넣었어요. 성이 두 글자면 고쳐 주세요.');
  await expect(page.locator('#en-joined')).toHaveText('HONG GILDONG');
});

test('copy: the clipboard gets the row (Chromium)', async ({ page, browserName, context }) => {
  test.skip(browserName !== 'chromium', 'Clipboard read permission is a Chromium-only Playwright feature.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await gotoReady(page, '/english-name/');
  await name(page, '홍', '길동');
  await page.getByRole('button', { name: '붙임표 넣기 복사' }).click();
  await expect(page.locator('#en-status')).toHaveText('복사했어요');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('HONG GIL-DONG');
});

test('copy refused: the row text is selected and the status says to long-press', async ({ page }) => {
  await page.addInitScript(() => {
    if (navigator.clipboard) Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('denied')) });
  });
  await gotoReady(page, '/english-name/');
  await name(page, '홍', '길동');
  await page.getByRole('button', { name: '빈칸 넣기 복사' }).click();
  await expect(page.locator('#en-status')).toHaveText('길게 눌러 복사해 주세요');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('HONG GIL DONG');
});

test('radio groups move with the arrow keys and update the rows', async ({ page }) => {
  await gotoReady(page, '/english-name/');
  await name(page, '최', '민수');
  await expect(page.locator('#en-joined')).toHaveText('CHOI MINSU');
  await surnameChoice(page, 'CHOI').locator('input').focus();
  await page.keyboard.press('ArrowRight');
  await expect(surnameChoice(page, 'CHOE').locator('input')).toBeChecked();
  await expect(page.locator('#en-joined')).toHaveText('CHOE MINSU');
  await page.getByLabel('여권처럼 모두 대문자').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('첫 글자만 대문자')).toBeChecked();
  await expect(page.locator('#en-joined')).toHaveText('Choe Minsu');
});

test('the name never reaches the URL, storage or a request; axe clean with the result, choices and error', async ({ page, network }) => {
  await gotoReady(page, '/english-name/');
  const url = page.url();
  const before = await page.evaluate(() => [localStorage.length, sessionStorage.length]);
  await name(page, '홍', '길동');
  await expect(page.locator('#en-joined')).toHaveText('HONG GILDONG');
  await page.getByRole('button', { name: '영문 이름 보기' }).click();
  await page.locator('#en-given').press('Enter');
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual(before);
  for (const r of network.requests) {
    const body = r.postData() ?? '';
    for (const s of ['홍', '길동', 'GILDONG', encodeURIComponent('길동')]) {
      expect(r.url(), r.url()).not.toContain(s);
      expect(body).not.toContain(s);
    }
  }
  await name(page, '이', '영희');
  await surnameChoice(page, '직접 쓰기').click();
  const serious = async (): Promise<string[]> =>
    (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(await serious()).toEqual([]);
  await page.locator('#en-given').fill('ㄱ');
  await expect(page.locator('#en-error')).not.toBeEmpty();
  expect(await serious()).toEqual([]);
});

test('여권 사진 button opens /id-photo/ with the passport preset; the chain lists the passport guides', async ({ page }) => {
  await gotoReady(page, '/english-name/');
  const chain = page.locator('#en-chain');
  for (const slug of ['passport-photo', 'passport-reissue-photo', 'baby-passport-photo', 'intl-driving-license']) await expect(chain.locator(`a[href="/guide/${slug}/"]`)).toHaveCount(1);
  await chain.getByRole('link', { name: '여권 사진 규격 맞추기' }).click();
  // The URL is the contract; the preset select proves the page read it. Waiting for the full load event of /id-photo/
  // timed out under parallel load (its late assets), which says nothing about this link.
  await page.waitForURL(/\/id-photo\/\?preset=passport_online$/, { waitUntil: 'commit' });
  await expect(page.locator('#idp-preset')).toHaveValue('passport_online');
});

test('the four passport guides link to /english-name/ in their body (D5)', async ({ page }) => {
  for (const slug of ['intl-driving-license', 'passport-photo', 'passport-reissue-photo', 'baby-passport-photo']) {
    await gotoReady(page, `/guide/${slug}/`);
    await expect(page.locator('main article a[href="/english-name/"], main a[href="/english-name/"]').first(), slug).toBeVisible();
  }
});

test('repeated syllables (영영) get distinct group names, and each picks on its own', async ({ page }) => {
  await gotoReady(page, '/english-name/');
  await name(page, '이', '영영');
  await expect(page.locator('#en-joined')).toHaveText('LEE YEONGYEONG');
  const first = page.getByRole('group', { name: '이름 1번째 글자 「영」 표기', exact: true });
  const second = page.getByRole('group', { name: '이름 2번째 글자 「영」 표기', exact: true });
  await expect(first).toHaveCount(1);
  await expect(second).toHaveCount(1);
  await second.locator('label.chip').filter({ hasText: 'YOUNG' }).click();
  await expect(page.locator('#en-joined')).toHaveText('LEE YEONGYOUNG');
});

test('R4 guide 여권 영문 이름 정하는 법 and the tool link both ways; the 성 table has the 20 surnames', async ({ page }) => {
  await gotoReady(page, '/guide/passport-english-name/');
  await expect(page.locator('h1')).toHaveText('여권 영문 이름 정하는 법');
  await expect(page.locator('main a[href="/english-name/"]').first()).toBeVisible();
  await expect(page.locator('main table tbody tr')).toHaveCount(20);
  await expect(page.locator('main table')).toContainText('KIM 8,342,772명(99.55%)');
  await gotoReady(page, '/english-name/');
  await expect(page.locator('#en-chain a[href="/guide/passport-english-name/"]')).toHaveCount(1);
  await expect(page.locator('.faq a[href="/guide/passport-english-name/"]')).toHaveCount(1);
});
