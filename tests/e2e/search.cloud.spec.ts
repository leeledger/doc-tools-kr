// SEARCH1031 D3 on the GA-, usage- and AdSense-on build (dist-bgcloud): a query in the /search/ fragment and one typed in
// the header box reach no request, stubbed GA collect hits and the usage beacon included. The Cloudflare Web Analytics
// beacon is not in this build; its own code drops the fragment and the query string from every URL it reports (read from
// beacon.min.js 2026.10.1, BUILD-LOG SEARCH1031), so the fragment design holds there too.
import { expect, gotoReady, test, type NetworkLog } from './no-upload';

test.use({ allowUpload: [{ method: 'POST', path: '/api/usage' }] });

function sent(network: NetworkLog, text: string): string[] {
  const forms = [text, encodeURIComponent(text), encodeURI(text)];
  return network.requests
    .filter((r) => {
      const body = r.postDataBuffer()?.toString('utf8') ?? '';
      return forms.some((f) => r.url().includes(f) || body.includes(f));
    })
    .map((r) => `${r.method()} ${r.url()}`);
}

test('the /search/ fragment and typed queries reach no GA, usage or other request', async ({ page, network }) => {
  const first = '비밀검색어사진';
  await gotoReady(page, `/search/#q=${encodeURIComponent(first)}`);
  await expect(page.locator('#sp-input')).toHaveValue(first);
  const typed = '여권사진 규격';
  await page.locator('#sp-input').fill(typed);
  await expect(page.locator('#sp-list [role="option"]').first()).toBeVisible();
  await page.locator('#sp-input').press('Enter');
  await page.waitForURL((u) => u.pathname !== '/search/');
  await gotoReady(page, '/pdf-merge/');
  await page.locator('button.ssh-toggle').click();
  const header = '헤더비밀검색';
  await page.locator('#hs-input').fill(header);
  await page.waitForTimeout(500);
  // The GA stub sent its page_view hits (so the check below saw real collect URLs).
  expect(network.requests.some((r) => r.url().includes('/g/collect'))).toBe(true);
  for (const q of [first, typed, header]) expect(sent(network, q), q).toEqual([]);
});
