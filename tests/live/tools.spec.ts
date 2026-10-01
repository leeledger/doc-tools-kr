// A-1 live smoke (docs/OPS-RUNBOOK.md): every tool on the deployed site processes a committed fixture end to
// end, with the e2e no-upload fixture (no off-site request, no request body, CSP connect-src 'self' on every
// response) plus zero console errors, page errors and CSP violations. Run by .github/workflows/ops-post-deploy.yml
// after the live build id matches the commit: `npx playwright test -c playwright.live.config.ts`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Download, Page } from '@playwright/test';
import { sniffImage } from '../../src/lib/image/sniff';
import { openPdf, pageText } from '../../scripts/regress/lib.mjs';
import { pageCount, pageTexts } from '../helpers/pdf';
import { expect, gotoReady, test as base } from '../e2e/no-upload';
import { fixturePath, photoFixture } from '../e2e/paths';

const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
      });
      await use(errors);
      expect(errors, 'console errors, page errors and CSP violations').toEqual([]);
    },
    { auto: true },
  ],
});

const bytesOf = async (d: Download): Promise<Uint8Array> => new Uint8Array(readFileSync((await d.path())!));
const download = async (page: Page, click: () => Promise<unknown>, timeout = 120_000): Promise<Download> => {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout }), click()]);
  return d;
};

test('PDF 합치기: two committed PDFs → one 13-page PDF', async ({ page }) => {
  await gotoReady(page, '/pdf-merge/');
  await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'empty');
  await page.setInputFiles('#merge-input', [fixturePath('kr_law_form.pdf'), fixturePath('irs_fw9.pdf')]);
  const run = page.getByRole('button', { name: /^PDF \d+개 합치기$/ });
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await expect(page.locator('#merge-summary')).toContainText('13쪽');
  const d = await download(page, () => page.getByRole('link', { name: '내려받기' }).click());
  const out = await pageTexts(await bytesOf(d));
  expect(out.length).toBe(13);
});

test('PDF 용량 줄이기: the scan fixture comes out a valid, smaller 1-page PDF', async ({ page }) => {
  const scan = fixturePath('gen_scan_a6.pdf');
  await gotoReady(page, '/pdf-compress/');
  await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', 'empty');
  await page.setInputFiles('#cmp-input', scan);
  await expect(page.locator('#cmp-info')).toContainText('1쪽');
  await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
  await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', 'done', { timeout: 90_000 });
  const bytes = await bytesOf(await download(page, () => page.locator('#cmp-download').click()));
  expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
  expect(await pageCount(bytes)).toBe(1);
  expect(bytes.length).toBeLessThan(readFileSync(scan).length);
});

test('사진 용량 줄이기: the 200 KB deep link turns the portrait into a JPEG ≤ 200,000 bytes', async ({ page }) => {
  const portrait = photoFixture('portrait_pd.jpg');
  await gotoReady(page, '/photo-compress/?target=200');
  await expect(page.locator('#photo-tool')).toHaveAttribute('data-state', 'empty');
  await page.setInputFiles('#ph-input', portrait);
  await expect(page.locator('#ph-list > li')).toHaveCount(1);
  await expect(page.locator('#ph-list .info', { hasText: '확인 중' })).toHaveCount(0);
  await page.getByRole('button', { name: '사진 용량 줄이기', exact: true }).click();
  await expect(page.locator('#photo-tool')).toHaveAttribute('data-state', 'done', { timeout: 110_000 });
  const row = page.locator('#ph-list > li').first();
  const bytes = await bytesOf(await download(page, () => row.getByRole('link', { name: /내려받기$/ }).click()));
  expect(sniffImage(bytes).format).toBe('jpeg');
  expect(bytes.length).toBeLessThanOrEqual(200_000);
});

test('여권·증명사진: the portrait becomes a 413×531 passport JPEG ≤ 500 KB', async ({ page }) => {
  await gotoReady(page, '/id-photo/');
  await expect(page.locator('#idp-tool')).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#idp-preset')).toHaveValue('passport_online');
  await page.setInputFiles('#idp-input', photoFixture('portrait_pd.jpg'));
  await expect(page.locator('#idp-tool')).toHaveAttribute('data-state', 'adjust', { timeout: 90_000 });
  await page.locator('#idp-confirm').check();
  await expect(page.locator('#idp-save')).toBeEnabled();
  await page.locator('#idp-save').click();
  await expect(page.locator('#idp-tool')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  const link = page.locator('#idp-download');
  await link.scrollIntoViewIfNeeded();
  const d = await download(page, () => link.click());
  expect(d.suggestedFilename()).toBe('passport_413x531.jpg');
  const bytes = await bytesOf(d);
  const s = sniffImage(bytes);
  expect([s.format, s.width, s.height]).toEqual(['jpeg', 413, 531]);
  expect(bytes.length).toBeLessThanOrEqual(500_000);
});

test('HWP→PDF: law05.hwp converts to a 1-page PDF with its text', async ({ page }) => {
  test.setTimeout(240_000);
  await gotoReady(page, '/hwp-to-pdf/');
  await page.setInputFiles('#hw-input', join(process.cwd(), 'tests', 'corpus', 'hwp', 'law05.hwp'));
  await expect(page.locator('#hwp-tool')).toHaveAttribute('data-state', 'convert', { timeout: 150_000 });
  await expect(page.locator('#hw-save')).toBeEnabled();
  const d = await download(page, () => page.locator('#hw-save').click());
  expect(d.suggestedFilename()).toBe('law05.pdf');
  const bytes = await bytesOf(d);
  expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
  const doc = await openPdf(bytes);
  expect(doc.numPages).toBe(1);
  const text = (await pageText(doc, 0)).replace(/\s+/g, '');
  await (doc as unknown as { close(): Promise<void> }).close();
  expect(text.length).toBeGreaterThan(50);
  expect(/[가-힣]/.test(text)).toBe(true);
});
