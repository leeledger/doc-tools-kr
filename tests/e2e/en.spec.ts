// EN1 (brief handoff/ARCHITECT-BRIEF-EN.md, acceptance): the English pages at /en/. Each page loads in English with the
// system font (no woff2 request), no Google Analytics request, no serious or critical axe finding and no Hangul outside
// [lang="ko"]; the three tools work end to end under the no-upload fixture with English messages; the language switch
// round-trips; an unknown /en/ path gets the English not-found page.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { pageTexts } from '../helpers/pdf';
import { expect, gotoReady, test } from './no-upload';
import { fixturePath, photoFixture, photoRuntime, runtimePath } from './paths';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const PAGES = ['/en/', '/en/pdf-merge/', '/en/pdf-compress/', '/en/image-to-jpg/', '/en/privacy/', '/en/terms/'];
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;

/** The page's visible text without the elements marked lang="ko" (the 한국어 switch). */
const englishText = (page: Page) =>
  page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    for (const el of body.querySelectorAll('[lang="ko"]')) el.remove();
    document.body.append(body);
    body.style.position = 'absolute';
    const text = body.innerText;
    body.remove();
    return text;
  });

async function expectEnglish(page: Page): Promise<void> {
  const text = await englishText(page);
  const hit = HANGUL.exec(text);
  expect(hit ? text.slice(Math.max(0, hit.index - 40), hit.index + 40) : null, 'Hangul outside [lang="ko"]').toBeNull();
}

test.describe('English pages', () => {
  for (const path of PAGES) {
    test(`${path}: lang=en, system font (no woff2), no Google Analytics, English only, no serious axe finding`, async ({ page, network }) => {
      test.setTimeout(90_000);
      await gotoReady(page, path);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(0);
      await expect(page.locator('h1')).toBeVisible();
      const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
      expect(font).not.toContain('Anolim');
      const urls = network.requests.map((r) => r.url());
      expect(urls.filter((u) => u.endsWith('.woff2')), 'font requests').toEqual([]);
      expect(urls.filter((u) => /\/ga\.js|googletagmanager|google-analytics/.test(u)), 'Google Analytics requests').toEqual([]);
      await expectEnglish(page);
      const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }

  test('language switch round-trips: /pdf-merge/ -> English -> 한국어', async ({ page }) => {
    await gotoReady(page, '/pdf-merge/');
    await page.getByRole('link', { name: 'English', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/pdf-merge\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.locator('a[hreflang="ko"]').click();
    await expect(page).toHaveURL(/\/pdf-merge\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
    await gotoReady(page, '/');
    await page.getByRole('link', { name: 'English', exact: true }).click();
    await expect(page).toHaveURL(/\/en\/$/);
    await page.locator('a[hreflang="ko"]').click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  });

  test('an unknown /en/ path shows the English not-found page (status 404)', async ({ page }) => {
    const res = await gotoReady(page, '/en/no-such-page/');
    expect(res?.status()).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    await expectEnglish(page);
  });
});

test.describe('English tools under the no-upload fixture', () => {
  test('Merge PDF: two files, English list, result and download name; a non-PDF gets the English message', async ({ page, network }) => {
    test.setTimeout(90_000);
    await gotoReady(page, '/en/pdf-merge/');
    await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'empty');
    await page.setInputFiles('#merge-input', [runtimePath('not_a_pdf'), fixturePath('kr_law_form.pdf'), fixturePath('irs_fw9.pdf')]);
    await expect(page.locator('#merge-error')).toHaveText('not_a_pdf.pdf is not a PDF file, so it was not added. You can only add PDF files.');
    await expect(page.locator('#merge-list > li')).toHaveCount(2);
    await expect(page.locator('#merge-list > li').first().locator('.info')).toContainText('7 pages');
    await page.getByRole('button', { name: 'Move irs_fw9.pdf up' }).click();
    await page.getByRole('button', { name: /^Merge 2 PDFs$/ }).click();
    await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'done');
    await expect(page.locator('#merge-summary')).toHaveText(/^13 pages · [\d.,]+ (KB|MB)$/);
    await expect(page.locator('#merge-save-name')).toHaveText('File name: irs_fw9_merged.pdf');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download' }).click()]);
    expect(download.suggestedFilename()).toBe('irs_fw9_merged.pdf');
    expect((await pageTexts(new Uint8Array(readFileSync(await download.path())))).length).toBe(13);
    await expect(page.locator('#merge-next')).toHaveCount(0);
    await expectEnglish(page);
    // File names on the list load no font either (the system font has every glyph).
    expect(network.requests.map((r) => r.url()).filter((u) => u.endsWith('.woff2')), 'font requests').toEqual([]);
  });

  test('Compress PDF: to a 0.5 MB target, English chip and result', async ({ page }) => {
    test.setTimeout(120_000);
    await gotoReady(page, '/en/pdf-compress/');
    await page.setInputFiles('#cmp-input', fixturePath('gen_scan_a6.pdf'));
    await expect(page.locator('#cmp-info')).toContainText('1 page');
    await page.getByRole('radio', { name: 'Compress to a target size' }).check();
    await page.locator('label.chip', { hasText: 'Other size' }).click();
    await page.getByLabel('Target size (MB)').fill('0.5');
    await page.getByRole('button', { name: 'Compress PDF' }).click();
    await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', 'done', { timeout: 90_000 });
    await expect(page.locator('#cmp-chip')).toHaveText('✓ 0.5 MB or less');
    await expect(page.locator('#cmp-summary')).toHaveText(/^\d+% smaller · 1 page$/);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#cmp-download').click()]);
    expect(download.suggestedFilename()).toBe('gen_scan_a6_compressed.pdf');
    expect(readFileSync(await download.path()).length).toBeLessThanOrEqual(500_000);
    await expect(page.locator('#cmp-next')).toHaveCount(0);
    await expectEnglish(page);
  });

  test('HEIC to JPG: PNG to JPG with an English result; a HEIC this browser cannot open gets the English guidance', async ({ page, browserName }) => {
    test.setTimeout(90_000);
    await gotoReady(page, '/en/image-to-jpg/');
    const files = browserName === 'webkit' ? [photoFixture('alpha.png')] : [photoRuntime('fake.heic'), photoFixture('alpha.png')];
    await page.setInputFiles('#ij-input', files);
    await expect(page.locator('#ij-list > li')).toHaveCount(files.length);
    await expect(page.locator('#ij-list .thumb-ph', { hasText: 'Checking' })).toHaveCount(0);
    if (browserName !== 'webkit') {
      await expect(page.locator('#ij-list > li').filter({ hasText: 'fake.heic' }).locator('.file-error')).toContainText('Settings > Camera > Formats');
    }
    await page.locator('#ij-run').click();
    await expect(page.locator('#ij-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
    await expect(page.locator('#ij-headline')).toHaveText('Your JPG photo is ready');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#ij-download').click()]);
    expect(download.suggestedFilename()).toBe('alpha.jpg');
    const bytes = readFileSync(await download.path());
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
    await expect(page.locator('#ij-next')).toHaveCount(0);
    await expectEnglish(page);
  });
});
