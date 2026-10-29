// 제휴 링크 (briefs handoff/ARCHITECT-BRIEF-LP1028.md Build Order 8 and handoff/ARCHITECT-BRIEF-AFF1029.md Build Order 7;
// Coupang on result screens only, owner 2026-10-28): in the default build (LinkPrice and Coupang on, as production) each
// result screen shows one disclosed group only once there is a result: LinkPrice on /pdf-sign/, /stamp-maker/,
// /char-count/, /resignation-letter/, /loan-note/, /english-name/ and the /id-photo/ presets of ID_PHOTO_LP; Coupang on the
// other /id-photo/ presets, /power-of-attorney/, /id-copy/ and /pdf-edit/. Attributes only: no link is followed, and the
// no-upload fixture sees no new request on load or reveal.
import type { Locator, Page } from '@playwright/test';
import { expect, gotoReady, test } from './no-upload';
import { fixturePath, photoFixture } from './paths';
import { AFF_COPY, AFF_DISCLOSURE, AFF_LINKS, LP_COPY, LP_LINKS } from '../../src/data/affiliate';

const PORTRAIT = photoFixture('portrait_pd.jpg');
const href = (dest: string) => LP_LINKS.find((l) => l.dest === dest)!.href;
const cpHref = (dest: string) => AFF_LINKS.find((l) => l.dest === dest)!.href;

/** The LinkPrice group: disclosure first, the lead line, then exactly `dests` as sponsored new-tab links named 광고. */
async function expectLp(group: Locator, lead: string, dests: string[]): Promise<void> {
  await expect(group).toBeVisible();
  const block = group.locator('.out-links');
  await expect(block.locator('> p').first()).toHaveText(LP_COPY.ad);
  await expect(block.locator('> p').nth(1)).toHaveText(lead);
  const links = block.locator('a');
  expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute('data-out')))).toEqual(dests);
  for (const [i, d] of dests.entries()) {
    const a = links.nth(i);
    await expect(a).toHaveAttribute('href', href(d));
    await expect(a).toHaveAttribute('rel', 'sponsored noopener');
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toContainText('(광고, 새 창)');
  }
  expect(await block.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^-apple-system/);
}

/** AFF1029: the Coupang group: the full disclosure first, the lead line, then exactly `dests` as sponsored new-tab links. */
async function expectCp(group: Locator, lead: string, dests: string[]): Promise<void> {
  const block = group.locator('.out-links');
  await expect(block).toBeVisible();
  await expect(block.locator('> p').first()).toHaveText(AFF_DISCLOSURE);
  await expect(block.locator('> p').nth(1)).toHaveText(lead);
  const links = block.locator('a');
  expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute('data-out')))).toEqual(dests);
  for (const [i, d] of dests.entries()) {
    const a = links.nth(i);
    await expect(a).toHaveAttribute('href', cpHref(d));
    await expect(a).toHaveAttribute('rel', 'sponsored noopener');
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toContainText('(쿠팡, 광고, 새 창)');
  }
}

/** The one visible preset group of #idp-lp (AFF1029 A1). */
const idpGroup = (page: Page) => page.locator('#idp-lp > div[data-presets]:visible');

async function idPhotoResult(page: Page, preset: string): Promise<void> {
  await page.selectOption('#idp-preset', preset);
  await page.locator('#idp-confirm').check();
  await expect(page.locator('#idp-save')).toBeEnabled();
  await page.locator('#idp-save').click();
  await expect(page.locator('#idp-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
}

test('id-photo: passport_online result shows the eSIM group (2 links) and hides Coupang; gosi 교보문고, saramin 숨고; id_card shows Coupang and hides LinkPrice; empty screen shows neither', async ({ page }) => {
  await gotoReady(page, '/id-photo/');
  const lp = page.locator('#idp-lp');
  const cp = page.locator('#idp-cp');
  await expect(lp).toBeHidden();
  await expect(cp).toBeHidden();
  await page.setInputFiles('#idp-input', PORTRAIT);
  await expect(page.locator('#idp-tool')).toHaveAttribute('data-state', /^(adjust|blocked)$/, { timeout: 90_000 });
  await expect(lp).toBeHidden();
  await idPhotoResult(page, 'passport_online');
  await expect(idpGroup(page)).toHaveCount(1);
  await expectLp(idpGroup(page), LP_COPY.esim, ['lp-dosirak', 'lp-usimsa']);
  await expect(cp).toBeHidden();
  await expect(page.locator('a[rel~="sponsored"]:visible')).toHaveCount(2);
  await page.locator('#idp-again').click();
  await expect(lp).toBeHidden();
  // AFF1029 A1: an exam preset shows its own 교보문고 search only, a job preset 숨고 only; Coupang stays hidden.
  await idPhotoResult(page, 'gosi');
  await expect(idpGroup(page)).toHaveCount(1);
  await expectLp(idpGroup(page), LP_COPY.exam, ['lp-kb-gosi']);
  await expect(cp).toBeHidden();
  await expect(page.locator('a[rel~="sponsored"]:visible')).toHaveCount(1);
  await page.locator('#idp-again').click();
  await expect(lp).toBeHidden();
  await idPhotoResult(page, 'saramin');
  await expect(idpGroup(page)).toHaveCount(1);
  await expectLp(idpGroup(page), LP_COPY.careerIdp, ['lp-soomgo']);
  await expect(cp).toBeHidden();
  await expect(page.locator('a[rel~="sponsored"]:visible')).toHaveCount(1);
  await page.locator('#idp-again').click();
  await expect(lp).toBeHidden();
  await idPhotoResult(page, 'id_card');
  await expect(lp).toBeHidden();
  await expect(cp).toBeVisible();
  await expect(cp.locator('.out-links > p').first()).toHaveText(AFF_DISCLOSURE);
  expect(await cp.locator('a').evaluateAll((as) => as.map((a) => [a.getAttribute('data-out'), a.getAttribute('rel'), a.getAttribute('target')]))).toEqual([
    ['cp-printer', 'sponsored noopener', '_blank'],
    ['cp-paper', 'sponsored noopener', '_blank'],
    ['cp-backdrop', 'sponsored noopener', '_blank'],
  ]);
  await expect(page.locator('a[rel~="sponsored"]:visible')).toHaveCount(3);
  await page.locator('#idp-new').click();
  await expect(lp).toBeHidden();
  await expect(cp).toBeHidden();
});

test('char-count: the 숨고 group is hidden until there is text, shown while typing, hidden after 지우기, back with 되돌리기', async ({ page }) => {
  await gotoReady(page, '/char-count/');
  const lp = page.locator('#cc-lp');
  await expect(lp).toBeHidden();
  await page.locator('#cc-text').fill('   ');
  await expect(lp).toBeHidden();
  await page.locator('#cc-text').fill('저는 문서딱에서 자기소개서를 씁니다.');
  await expectLp(lp, LP_COPY.careerCc, ['lp-soomgo']);
  // After the note, before 자소서를 다 쓴 다음에는.
  expect(await page.evaluate(() => {
    const g = document.getElementById('cc-lp')!;
    return Boolean(document.getElementById('cc-note')!.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(g.compareDocumentPosition(document.getElementById('cc-chain')!) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await page.locator('#cc-clear').click();
  await expect(lp).toBeHidden();
  await page.locator('#cc-undo').click();
  await expect(lp).toBeVisible();
});

test('resignation-letter: the 숨고 group is the last part of the result, hidden before it', async ({ page }) => {
  await gotoReady(page, '/resignation-letter/');
  const block = page.locator('#rs-result .out-links');
  await expect(block).toHaveCount(1);
  await expect(block).toBeHidden();
  await page.locator('#rs-blank').click();
  await expect(page.locator('#rs-tool')).toHaveAttribute('data-state', /^(ready|error)$/, { timeout: 180_000 });
  await expect(page.locator('#rs-tool')).toHaveAttribute('data-state', 'ready');
  await expectLp(page.locator('#rs-result'), LP_COPY.careerRs, ['lp-soomgo']);
  expect(await page.evaluate(() => document.getElementById('rs-result')!.lastElementChild!.classList.contains('out-links'))).toBe(true);
});

test('stamp-maker: the 공동인증서 group shows once a style is picked, not before', async ({ page }) => {
  await gotoReady(page, '/stamp-maker/');
  const group = page.locator('#sm-aff');
  await page.locator('#sm-text').focus();
  await expect(page.locator('#sm-tool')).toHaveAttribute('data-painted', /\d+/);
  await expect(group).toBeHidden();
  await page.locator('#sm-text').fill('홍길동');
  await page.locator('.sm-tile[data-style="round"]').click();
  await expectLp(group, LP_COPY.signgate, ['lp-signgate']);
  await expect(page.locator('a[href^="https://link.coupang.com/"]')).toHaveCount(0);
});

test('loan-note (AFF1029 A2): the 신용정보 group is the last part of the result, hidden before it; no Coupang link', async ({ page }) => {
  await gotoReady(page, '/loan-note/');
  const block = page.locator('#ln-result .out-links');
  await expect(block).toHaveCount(1);
  await expect(block).toBeHidden();
  await page.locator('#ln-blank').click();
  await expect(page.locator('#ln-tool')).toHaveAttribute('data-state', /^(ready|error)$/, { timeout: 180_000 });
  await expect(page.locator('#ln-tool')).toHaveAttribute('data-state', 'ready');
  await expectLp(page.locator('#ln-result'), LP_COPY.credit, ['lp-nice', 'lp-allcredit']);
  expect(await page.evaluate(() => document.getElementById('ln-result')!.lastElementChild!.classList.contains('out-links'))).toBe(true);
  await expect(page.locator('a[href^="https://link.coupang.com/"]')).toHaveCount(0);
});

test('power-of-attorney (AFF1029 A3): the Coupang 도장 group is the last part of the result, hidden before it; 인감 only in the caution', async ({ page }) => {
  await gotoReady(page, '/power-of-attorney/');
  const block = page.locator('#pa-result .out-links');
  await expect(block).toHaveCount(1);
  await expect(block).toBeHidden();
  await page.locator('#pa-blank').click();
  await expect(page.locator('#pa-tool')).toHaveAttribute('data-state', /^(ready|error)$/, { timeout: 180_000 });
  await expect(page.locator('#pa-tool')).toHaveAttribute('data-state', 'ready');
  await expectCp(page.locator('#pa-result'), AFF_COPY['stamp-signature'], ['cp-stamp']);
  await expect(block).not.toContainText('인감');
  await expect(page.locator('a[href^="https://click.linkprice.com/"]')).toHaveCount(0);
});

test('english-name (AFF1029 A4): the 아고다·클룩 group is the last part of the result, hidden before a name', async ({ page }) => {
  await gotoReady(page, '/english-name/');
  const block = page.locator('#en-result .out-links');
  await expect(block).toHaveCount(1);
  await expect(block).toBeHidden();
  await page.locator('#en-sur').fill('홍');
  await expect(block).toBeHidden();
  await page.locator('#en-given').fill('길동');
  await expect(page.locator('#en-joined')).toHaveText('HONG GILDONG');
  await expectLp(page.locator('#en-result'), LP_COPY.travel, ['lp-agoda', 'lp-klook']);
  expect(await page.evaluate(() => document.getElementById('en-result')!.lastElementChild!.classList.contains('out-links'))).toBe(true);
  await expect(page.locator('a[href^="https://link.coupang.com/"]')).toHaveCount(0);
});

test('id-copy (AFF1029 A6): the Coupang 복합기 group is in the result after the downloads, hidden before it', async ({ page }) => {
  await gotoReady(page, '/id-copy/');
  const result = page.locator('#ic-result');
  await expect(result.locator('.out-links')).toHaveCount(1);
  await expect(result).toBeHidden();
  await page.setInputFiles('#ic-input', PORTRAIT);
  await expect(page.locator('#ic-tool')).toHaveAttribute('data-state', 'editing', { timeout: 30_000 });
  await expect(result.locator('.out-links')).toBeHidden();
  await page.locator('#ic-run').click();
  await expect(page.locator('#ic-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await expectCp(result, AFF_COPY.pdf, ['cp-mfp']);
  expect(await page.evaluate(() => Boolean(document.getElementById('ic-pdf')!.compareDocumentPosition(document.querySelector('#ic-result .out-links')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(page.locator('a[href^="https://click.linkprice.com/"]')).toHaveCount(0);
});

test('pdf-edit (AFF1029 A6): the Coupang 복합기 group is in the result after the downloads, hidden before it', async ({ page }) => {
  await gotoReady(page, '/pdf-edit/');
  const result = page.locator('#ed-result');
  await expect(result.locator('.out-links')).toHaveCount(1);
  await expect(result).toBeHidden();
  await page.setInputFiles('#ed-input', fixturePath('gen_links_outline.pdf'));
  await expect(page.locator('#ed-tool')).toHaveAttribute('data-state', 'ready');
  await page.locator('#ed-add-text').click();
  await expect(page.locator('#ed-text')).toBeFocused();
  await page.locator('#ed-text').fill('ABC 123');
  await page.locator('#ed-run').click();
  await expect(page.locator('#ed-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await expectCp(result, AFF_COPY.pdf, ['cp-mfp']);
  expect(await page.evaluate(() => Boolean(document.getElementById('ed-download')!.compareDocumentPosition(document.querySelector('#ed-result .out-links')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(page.locator('a[href^="https://click.linkprice.com/"]')).toHaveCount(0);
});

test('pdf-sign: the 공동인증서 group is in the result only, with no Coupang link', async ({ page }) => {
  await gotoReady(page, '/pdf-sign/');
  const result = page.locator('#sg-result');
  await expect(result.locator('.out-links')).toHaveCount(1);
  await expect(result).toBeHidden();
  await page.setInputFiles('#sg-input', fixturePath('gen_links_outline.pdf'));
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'ready');
  await page.setInputFiles('#sg-image-input', PORTRAIT);
  await expect(page.locator('.sign-box')).toHaveCount(1);
  await page.locator('#sg-run').click();
  await expect(page.locator('#sg-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await expectLp(result, LP_COPY.signgate, ['lp-signgate']);
  await expect(page.locator('a[href^="https://link.coupang.com/"]')).toHaveCount(0);
});
