// Google Analytics 4 (owner 2026-10-08), the default build (PUBLIC_GA_ID unset): nothing of it ships or runs.
// The GA-on build is covered by ga.cloud.spec.ts on dist-bgcloud.
import { expect, gotoReady, test } from './no-upload';

for (const path of ['/', '/pdf-compress/', '/privacy/']) {
  test(`GA off: ${path} has no /ga.js tag, no dataLayer and no request to Google`, async ({ page, network }) => {
    const res = await gotoReady(page, path);
    expect(res?.headers()['content-security-policy']).not.toMatch(/google/);
    await expect(page.locator('script[src="/ga.js"], script[src*="googletagmanager"]')).toHaveCount(0);
    expect(await page.evaluate(() => 'dataLayer' in window)).toBe(false);
    expect(network.requests.map((r) => r.url()).filter((u) => /\/ga\.js|google/.test(u))).toEqual([]);
    if (path === '/privacy/') {
      await expect(page.locator('#ga')).toHaveCount(0);
      await expect(page.locator('main')).not.toContainText('Google 애널리틱스');
    }
  });
}
