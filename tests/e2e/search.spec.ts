// SEARCH1031: the site search (header 「찾기」 panel, home hero box, /search/, 404). The no-upload fixture records every
// request; these tests also check that nothing typed ever reaches a request URL or body (D3).
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, gotoReady, test, type NetworkLog } from './no-upload';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function serious(page: Page): Promise<string[]> {
  return (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** No request URL (raw or percent-encoded) or body carries the text. */
function expectNotSent(network: NetworkLog, text: string): void {
  const forms = [text, encodeURIComponent(text), encodeURI(text)];
  for (const r of network.requests) {
    const url = r.url();
    const body = r.postDataBuffer()?.toString('utf8') ?? '';
    for (const f of forms) {
      expect(url.includes(f), `request URL ${url} carries the query`).toBe(false);
      expect(body.includes(f), `request body to ${url} carries the query`).toBe(false);
    }
  }
}

const options = (page: Page, input: string) => page.locator(`#${input.replace(/-input$/, '-list')} [role="option"]`);

async function openHeader(page: Page): Promise<void> {
  await page.locator('button.ssh-toggle').click();
  await expect(page.locator('#search-panel')).toBeVisible();
  await expect(page.locator('#hs-input')).toBeFocused();
}

test('nothing loads until a box is used: no search module or index request on page load', async ({ page, network }) => {
  await gotoReady(page, '/');
  await page.waitForTimeout(300);
  const urls = network.requests.map((r) => r.url());
  expect(urls.filter((u) => /\/_astro\/ui-[\w-]+\.js$|search-index\.json/.test(u))).toEqual([]);
  await page.locator('#home-input').focus();
  await expect(options(page, 'home-input').first()).toBeVisible();
  const after = network.requests.map((r) => new URL(r.url()).pathname);
  expect(after.filter((p) => p === '/search-index.json')).toHaveLength(1);
  // A fixed GET: no query, no body.
  const ix = network.requests.find((r) => r.url().endsWith('/search-index.json'))!;
  expect(ix.method()).toBe('GET');
  expect(new URL(ix.url()).search).toBe('');
});

test('home box: 「사진 작게」 puts 사진 용량 줄이기 first, Enter opens it; nothing typed is sent', async ({ page, network }) => {
  await gotoReady(page, '/');
  const input = page.locator('#home-input');
  await input.click();
  await expect(page.locator('#home-list')).toContainText('많이 찾는 도구');
  await input.fill('사진 작게');
  await expect(options(page, 'home-input').first()).toContainText('사진 용량 줄이기');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.site-search-page [role="status"]').first()).toContainText(/도구 \d+개, 안내 \d+개를 찾았어요/);
  await input.press('Enter');
  await page.waitForURL('**/photo-compress/');
  expectNotSent(network, '사진 작게');
  expectNotSent(network, '작게');
});

test('header 찾기 on /pdf-merge/: opens, Down Down Up moves the active option, Esc closes the list then the panel', async ({ page }) => {
  await gotoReady(page, '/pdf-merge/');
  const toggle = page.locator('button.ssh-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-controls', 'search-panel');
  await openHeader(page);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const input = page.locator('#hs-input');
  await input.fill('pdf');
  const opts = options(page, 'hs-input');
  await expect(opts.first()).toBeVisible();
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', (await opts.nth(0).getAttribute('id'))!);
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', (await opts.nth(1).getAttribute('id'))!);
  await expect(opts.nth(1)).toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowUp');
  await expect(input).toHaveAttribute('aria-activedescendant', (await opts.nth(0).getAttribute('id'))!);
  await input.press('Escape');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#search-panel')).toBeVisible();
  await input.press('Escape');
  await expect(page.locator('#search-panel')).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('header: the 도구 menu and the 찾기 panel close each other; an outside click closes the panel', async ({ page }) => {
  await gotoReady(page, '/pdf-merge/');
  const menu = page.locator('button.menu-toggle');
  await menu.click();
  await expect(page.locator('#tools-menu')).toBeVisible();
  await openHeader(page);
  await expect(page.locator('#tools-menu')).toBeHidden();
  await menu.click();
  await expect(page.locator('#tools-menu')).toBeVisible();
  await expect(page.locator('#search-panel')).toBeHidden();
  await menu.click();
  await openHeader(page);
  // Outside the panel (it overlays the page under the header).
  await page.mouse.click(4, (page.viewportSize()?.height ?? 700) - 4);
  await expect(page.locator('#search-panel')).toBeHidden();
});

test('header: a tap on a result opens it', async ({ page }) => {
  await gotoReady(page, '/pdf-merge/');
  await openHeader(page);
  await page.locator('#hs-input').fill('도장');
  await options(page, 'hs-input').filter({ hasText: '도장 만들기' }).first().click();
  await page.waitForURL('**/stamp-maker/');
});

test('/search/#q=pdf합치기 shows PDF 합치기 first; typing updates the fragment, never a query string', async ({ page, network }) => {
  await gotoReady(page, `/search/#q=${encodeURIComponent('pdf합치기')}`);
  const input = page.locator('#sp-input');
  await expect(input).toHaveValue('pdf합치기');
  await expect(options(page, 'sp-input').first()).toContainText('PDF 합치기');
  await input.fill('한글 파일 열기');
  await expect(options(page, 'sp-input').first()).toContainText('HWP·HWPX 파일 보기');
  await expect.poll(() => page.evaluate(() => decodeURIComponent(location.hash))).toBe('#q=한글 파일 열기');
  expect(await page.evaluate(() => location.search)).toBe('');
  await input.fill('');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
  await expect(page.locator('#sp-list')).toContainText('많이 찾는 도구');
  expectNotSent(network, '한글 파일 열기');
  expectNotSent(network, 'pdf합치기');
});

test('no result: the 찾지 못했어요 line and the 많이 찾는 도구 list', async ({ page }) => {
  await gotoReady(page, '/search/');
  const input = page.locator('#sp-input');
  await input.fill('asdfgh');
  await expect(page.locator('.site-search [data-ss-none]').last()).toContainText('「asdfgh」에 맞는 도구를 찾지 못했어요');
  await expect(page.locator('#sp-list')).toContainText('많이 찾는 도구');
  await expect(options(page, 'sp-input')).toHaveCount(6);
});

test('Enter on a miss or an empty box opens nothing (the 많이 찾는 도구 list stays)', async ({ page }) => {
  await gotoReady(page, '/search/');
  const input = page.locator('#sp-input');
  await input.click();
  await expect(page.locator('#sp-list')).toContainText('많이 찾는 도구');
  await input.press('Enter');
  await input.fill('asdfgh');
  await expect(page.locator('.site-search [data-ss-none]').last()).toBeVisible();
  await input.press('Enter');
  await page.waitForTimeout(300);
  expect(new URL(page.url()).pathname).toBe('/search/');
  await expect(page.locator('#sp-list')).toContainText('많이 찾는 도구');
});

// Review fix: a Korean keyboard passes through 샂 and 사지 on the way to 사진. Real composition events (CDP
// Input.imeSetComposition in Chromium, dispatched CompositionEvents elsewhere) never show 「찾지 못했어요」.
test('typing 사진 with a Korean keyboard: no 찾지 못했어요 at any composing step', async ({ page, browserName }) => {
  await gotoReady(page, '/');
  const input = page.locator('#home-input');
  await input.click();
  await expect(options(page, 'home-input').first()).toBeVisible();
  const none = page.locator('.site-search-page [data-ss-none]').first();
  const status = page.locator('.site-search-page [role="status"]').first();
  const steps = ['ㅅ', '사', '샂', '사지', '사진'];
  const check = async (): Promise<void> => {
    await expect(none).toBeHidden();
    await expect(status).not.toContainText('찾지 못했어요');
  };
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    for (const s of steps) {
      await cdp.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length });
      await page.waitForTimeout(80);
      await check();
    }
    await cdp.send('Input.insertText', { text: '사진' });
  } else {
    await input.evaluate((el: HTMLInputElement, list) => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
      for (const s of list) {
        el.value = s;
        el.dispatchEvent(new CompositionEvent('compositionupdate', { data: s }));
        el.dispatchEvent(new InputEvent('input', { data: s, inputType: 'insertCompositionText', isComposing: true }));
      }
    }, steps.slice(0, 4));
    await check();
    await input.evaluate((el: HTMLInputElement) => {
      el.value = '사진';
      el.dispatchEvent(new InputEvent('input', { data: '사진', inputType: 'insertCompositionText', isComposing: true }));
      el.dispatchEvent(new CompositionEvent('compositionend', { data: '사진' }));
    });
  }
  await expect(input).toHaveValue('사진');
  await expect(options(page, 'home-input').first()).toContainText('사진 용량 줄이기');
  await check();
});

test('a miss held back while composing shows once the composition ends', async ({ page }) => {
  await gotoReady(page, '/');
  const input = page.locator('#home-input');
  await input.click();
  await expect(options(page, 'home-input').first()).toBeVisible();
  const none = page.locator('.site-search-page [data-ss-none]').first();
  await input.evaluate((el: HTMLInputElement) => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }));
    el.value = '퓨퓨';
    el.dispatchEvent(new InputEvent('input', { data: '퓨퓨', inputType: 'insertCompositionText', isComposing: true }));
  });
  await page.waitForTimeout(150);
  await expect(none).toBeHidden();
  await input.evaluate((el: HTMLInputElement) => el.dispatchEvent(new CompositionEvent('compositionend', { data: '퓨퓨' })));
  await expect(none).toContainText('「퓨퓨」에 맞는 도구를 찾지 못했어요');
});

test('404: the box finds a tool', async ({ page }) => {
  await page.goto('/does-not-exist/');
  const input = page.locator('#nf-input');
  await input.fill('큐알');
  await expect(options(page, 'nf-input').first()).toContainText('QR코드 만들기');
});

test('the index cannot load: the load-failure line, never silent; a later focus tries again', async ({ page }) => {
  let block = true;
  await page.route('**/search-index.json', (route) => (block ? route.abort() : route.continue()));
  await gotoReady(page, '/');
  const input = page.locator('#home-input');
  await input.click();
  const fail = page.locator('.site-search-page [data-ss-fail]').first();
  await expect(fail).toBeVisible();
  await expect(fail).toContainText('지금은 찾기를 쓸 수 없어요');
  await expect(fail.locator('a')).toHaveAttribute('href', '/#tools');
  block = false;
  await page.locator('h1').click();
  await input.click();
  await expect(fail).toBeHidden();
  await expect(options(page, 'home-input').first()).toBeVisible();
});

test('the search module cannot load: the load-failure line', async ({ page }) => {
  await page.route(/\/_astro\/ui-[\w-]+\.js$/, (route) => route.abort());
  await gotoReady(page, '/');
  await page.locator('#home-input').click();
  await expect(page.locator('.site-search-page [data-ss-fail]').first()).toBeVisible();
});

for (const width of [320, 360]) {
  test(`${width} px: no horizontal scroll, the header fits, the panel stays in the viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await gotoReady(page, '/pdf-merge/');
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBe(0);
    for (const sel of ['.brand', 'button.menu-toggle', '.nav-guide', 'button.ssh-toggle']) {
      const box = (await page.locator(sel).boundingBox())!;
      expect(box.x, sel).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, sel).toBeLessThanOrEqual(width);
    }
    const t = (await page.locator('button.ssh-toggle').boundingBox())!;
    expect(t.height).toBeGreaterThanOrEqual(44);
    await openHeader(page);
    await page.locator('#hs-input').fill('사진');
    await expect(options(page, 'hs-input').first()).toBeVisible();
    const p = (await page.locator('#search-panel').boundingBox())!;
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x + p.width).toBeLessThanOrEqual(width);
    expect(await overflow()).toBe(0);
    const o = (await options(page, 'hs-input').first().boundingBox())!;
    expect(o.height).toBeGreaterThanOrEqual(44);
    // 16 px or more: iOS does not zoom into the field.
    expect(await page.locator('#hs-input').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await gotoReady(page, '/');
    expect(await overflow()).toBe(0);
    const home = (await page.locator('#home-input').boundingBox())!;
    // D1(b) review fix: the box sits right under the h1, on the first screen of a 640 px tall phone.
    expect(home.y + home.height).toBeLessThanOrEqual(640 - 200);
    expect(home.x).toBeGreaterThanOrEqual(16);
    expect(home.x + home.width).toBeLessThanOrEqual(width - 16);
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`axe (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    test(`home with results, an option active`, async ({ page }) => {
      await gotoReady(page, '/');
      await page.locator('#home-input').fill('사진');
      await expect(options(page, 'home-input').first()).toBeVisible();
      await page.locator('#home-input').press('ArrowDown');
      expect(await serious(page)).toEqual([]);
    });
    test(`/pdf-merge/ with the header panel open and results`, async ({ page }) => {
      await gotoReady(page, '/pdf-merge/');
      await openHeader(page);
      await page.locator('#hs-input').fill('pdf');
      await expect(options(page, 'hs-input').first()).toBeVisible();
      expect(await serious(page)).toEqual([]);
    });
    test(`/search/ results, then the empty state`, async ({ page }) => {
      await gotoReady(page, `/search/#q=${encodeURIComponent('증명사진')}`);
      await expect(options(page, 'sp-input').first()).toBeVisible();
      expect(await serious(page)).toEqual([]);
      await page.locator('#sp-input').fill('');
      await expect(page.locator('#sp-list')).toContainText('많이 찾는 도구');
      expect(await serious(page)).toEqual([]);
    });
  });
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the header 찾기 is a link to /search/, which lists every tool; the form has no named field', async ({ page }) => {
    await gotoReady(page, '/pdf-merge/');
    await expect(page.locator('a.ssh-toggle')).toHaveAttribute('href', '/search/');
    await expect(page.locator('#search-panel')).toBeHidden();
    await page.locator('a.ssh-toggle').click();
    await page.waitForURL('**/search/');
    await expect(page.locator('h1')).toHaveText('도구·안내 찾기');
    expect(await page.locator('.search-all li').count()).toBeGreaterThan(20);
    await expect(page.locator('.search-all a', { hasText: 'PDF 합치기' })).toHaveAttribute('href', '/pdf-merge/');
    // A submit (Enter) can carry nothing: a GET to /search/ and no named field.
    const form = page.locator('form[role="search"]');
    await expect(form).toHaveAttribute('action', '/search/');
    await expect(form).toHaveAttribute('method', 'get');
    expect(await page.locator('.site-search [name]').count()).toBe(0);
  });
});
