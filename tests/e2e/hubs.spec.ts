// G2 A1: the hubs, the topic-grouped /guide/ index and the new guides in a real browser (no-upload fixture on
// every test via ./no-upload).
import AxeBuilder from '@axe-core/playwright';
import { expect, gotoReady, test } from './no-upload';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const NEW_PAGES = ['/guide/photo-sizes/', '/guide/upload-limits/', '/guide/admission-photo/', '/guide/univ-docs-upload/', '/guide/kosaf-docs/', '/guide/hwp-to-pdf/'];

test('the hubs and the new guides have no serious or critical axe findings', async ({ page }) => {
  for (const path of NEW_PAGES) {
    await gotoReady(page, path);
    const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), path).toEqual([]);
  }
});

test('photo hub: a row links its guide and opens the tool with that preset', async ({ page }) => {
  await gotoReady(page, '/guide/photo-sizes/');
  const row = page.locator('.hub-table tbody tr', { hasText: 'Q-Net' });
  await expect(row.locator('td').nth(1)).toHaveText('200KB 이하');
  await expect(row.getByRole('link', { name: '큐넷 사진 등록 규격과 안 될 때 확인할 점' })).toHaveAttribute('href', '/guide/qnet-photo/');
  await row.getByRole('link', { name: '규격 맞추기' }).click();
  await page.waitForURL(/\/id-photo\/\?preset=qnet$/);
  await page.waitForFunction(() => document.readyState === 'complete');
  await expect(page.locator('#idp-preset')).toHaveValue('qnet');
});

test('upload hub: a file type we cannot make has no tool link', async ({ page }) => {
  await gotoReady(page, '/guide/upload-limits/');
  const row = page.locator('.hub-table tbody tr', { hasText: '가구원 동의서' });
  await expect(row).toContainText('400kb 이하');
  await expect(row.getByRole('link')).toHaveCount(1);
  await expect(page.locator('.hub-table')).toHaveCount(2);
});

test('/guide/: hubs first, topic jump links reach their group, each guide listed once', async ({ page }) => {
  await gotoReady(page, '/guide/');
  await expect(page.locator('.guide-hubs a').first()).toHaveAttribute('href', /\/guide\/(photo-sizes|upload-limits)\/$/);
  const jump = page.locator('.guide-topics a', { hasText: '입시·장학' });
  const target = (await jump.getAttribute('href'))!;
  await jump.click();
  await expect(page).toHaveURL(new RegExp(`${target}$`));
  const group = page.locator(`section:has(h2${target})`);
  await expect(group.getByRole('link', { name: '대입 원서 사진 규격과 올리는 법' })).toBeVisible();
  const hrefs = await page.locator('section .related-list a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(new Set(hrefs).size).toBe(hrefs.length);
});

test('admission guide: the CTA opens the 반명함판 preset', async ({ page }) => {
  await gotoReady(page, '/guide/admission-photo/');
  await page.locator('.guide-cta a').click();
  await page.waitForURL(/\/id-photo\/\?preset=half_card$/);
  await page.waitForFunction(() => document.readyState === 'complete');
  await expect(page.locator('#idp-preset')).toHaveValue('half_card');
});

test('360 px: the hub table scrolls inside its box and the page never scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await gotoReady(page, '/guide/photo-sizes/');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
});
