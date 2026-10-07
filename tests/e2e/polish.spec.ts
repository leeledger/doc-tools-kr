// Polish P e2e (brief ARCHITECT-BRIEF-POLISH.md "Test map"). Every test runs under the no-upload fixture.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { pageCount } from '../helpers/pdf';
import { expect, gotoReady, test } from './no-upload';
import { RUNTIME_DIR, fixturePath, photoFixture, runtimePath } from './paths';

const LAW = fixturePath('kr_law_form.pdf');
const FW9 = fixturePath('irs_fw9.pdf');
const SCAN = fixturePath('gen_scan_a6.pdf');
const SMALL = fixturePath('gen_already_small.pdf');
const NOTES = join(RUNTIME_DIR, 'notes.txt');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const LIVE = ['PDF 합치기', 'PDF 용량 줄이기', '사진 PDF 변환', 'PDF JPG 변환', 'PDF 암호 해제·설정', '사진 용량 줄이기', '여권·증명사진 규격 맞추기', '전자서명·도장 이미지 만들기', 'HWP PDF 변환', 'HWP·HWPX 파일 보기'];
const SOON: string[] = [];

const serious = async (page: Page): Promise<string[]> =>
  (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);

const mergeRows = (page: Page) => page.locator('#merge-list > li');
const inspected = (page: Page, name: string, pages: number) =>
  expect(mergeRows(page).filter({ has: page.locator('.name', { hasText: name }) }).locator('.info')).toContainText(`${pages}쪽`);

async function compressReady(page: Page, path: string, pages: number): Promise<void> {
  await gotoReady(page, '/pdf-compress/');
  await page.setInputFiles('#cmp-input', path);
  await expect(page.locator('#cmp-info')).toContainText(`${pages}쪽`);
}

// ---------- P.1 engine-load errors ----------

test.describe('engine load failure (P.1)', () => {
  test('merge: the inspect chunk does not load → engine panel, files stay 대기, no error card; 새로고침 reloads', async ({ page, context }) => {
    await gotoReady(page, '/pdf-merge/');
    await context.route(/\/_astro\/inspect[^/]*\.js/, (route) => route.abort());
    await page.setInputFiles('#merge-input', [LAW, FW9]);
    const panel = page.locator('#engine-error');
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel).toHaveAttribute('role', 'alert');
    await expect(panel.locator('.engine-title')).toHaveText('처리 도구를 불러오지 못했습니다.');
    await expect(panel).toContainText('파일에는 문제가 없습니다. 잠시 뒤 새로고침해 주세요. 새로고침하면 파일을 다시 골라야 합니다.');
    await expect(page.locator('#merge-list .file-error')).toHaveCount(0);
    await expect(page.locator('#merge-list .thumb-ph')).toHaveText(['대기', '대기']);
    await expect(page.locator('#merge-run')).toBeDisabled();
    const reload = panel.getByRole('button', { name: '새로고침' });
    await expect(reload).toBeFocused();
    expect((await reload.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await context.unroute(/\/_astro\/inspect[^/]*\.js/);
    await Promise.all([page.waitForEvent('load'), reload.click()]);
    await expect(page.locator('#merge-tool')).toHaveAttribute('data-state', 'empty');
    await expect(panel).toBeHidden();
  });

  test('merge: after a deploy (the live manifest names another build) the panel says the site changed', async ({ page, context }) => {
    await gotoReady(page, '/pdf-merge/');
    await context.route(/\/_astro\/inspect[^/]*\.js/, (route) => route.abort());
    // The live manifest now names another build (the site's own headers, CSP included).
    await context.route('**/deploy-manifest.json', async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, body: JSON.stringify({ build: 'a-newer-build', gen: 2, files: {} }) });
    });
    await page.setInputFiles('#merge-input', [LAW]);
    await expect(page.locator('#engine-error .engine-title')).toHaveText('사이트가 방금 새 버전으로 바뀌었습니다.', { timeout: 20_000 });
    await expect(page.locator('#engine-error')).toContainText('파일에는 문제가 없습니다. 바로 새로고침해 주세요.');
  });

  test('compress: the worker script does not load → engine panel, the file card stays, never the corrupt copy', async ({ page, context }) => {
    await compressReady(page, SCAN, 1);
    await context.route(/compress\.worker[^/]*\.js/, (route) => route.abort());
    await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
    await expect(page.locator('#engine-error')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#cmp-name')).toHaveText('gen_scan_a6.pdf');
    await expect(page.locator('#cmp-error')).toBeHidden();
    await expect(page.getByText('파일이 손상되었거나')).toHaveCount(0);
  });

  test('compress: qpdf.wasm does not load inside the worker → engine panel', async ({ page, context, isMobile }) => {
    test.skip(isMobile, 'The wasm abort runs on the three desktop projects (brief Test map); mobile covers the worker abort.');
    await compressReady(page, SCAN, 1);
    await context.route(/\/vendor\/qpdf\/[^/]+\/qpdf\.wasm/, (route) => route.abort());
    await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
    await expect(page.locator('#engine-error')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#cmp-error')).toBeHidden();
    await expect(page.getByText('파일이 손상되었거나')).toHaveCount(0);
  });

  test('compress: offline before the first file → the offline copy', async ({ page, context, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'Playwright WebKit (Windows) cannot read a setInputFiles file while context.setOffline(true): File.arrayBuffer() rejects with "NotReadableError: The I/O read operation failed." The offline copy is covered on chromium, firefox and mobile-chrome, and by the engineErrorCopy unit test.',
    );
    await gotoReady(page, '/pdf-compress/');
    await context.setOffline(true);
    await page.setInputFiles('#cmp-input', SCAN);
    const panel = page.locator('#engine-error');
    await expect(panel.locator('.engine-title')).toHaveText('인터넷 연결이 끊겨 처리 도구를 불러오지 못했습니다.', { timeout: 20_000 });
    await expect(panel).toContainText('파일에는 문제가 없습니다. 연결을 확인한 뒤 새로고침해 주세요.');
    await expect(page.locator('#cmp-error')).toBeHidden();
    await context.setOffline(false);
  });

  test('regression: a really damaged file still gets the damaged-file copy', async ({ page }) => {
    await gotoReady(page, '/pdf-compress/');
    await page.setInputFiles('#cmp-input', runtimePath('truncated'));
    await expect(page.locator('#cmp-error')).toHaveText('파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아 주세요.');
    await expect(page.locator('#engine-error')).toBeHidden();
  });

  test('axe: the engine panel has no serious or critical violations', async ({ page, context }) => {
    await gotoReady(page, '/pdf-merge/');
    await context.route(/\/_astro\/inspect[^/]*\.js/, (route) => route.abort());
    await page.setInputFiles('#merge-input', [LAW]);
    await expect(page.locator('#engine-error')).toBeVisible({ timeout: 20_000 });
    expect(await serious(page)).toEqual([]);
  });
});

// ---------- P.4 operator, contact, 이용약관 ----------

for (const path of ['/', '/pdf-merge/', '/pdf-compress/', '/jpg-to-pdf/', '/pdf-to-jpg/', '/pdf-password/', '/photo-compress/', '/id-photo/', '/stamp-signature/', '/hwp-to-pdf/', '/hwp-viewer/', '/privacy/', '/terms/', '/licenses/', '/does-not-exist/']) {
  test(`footer on ${path}: no operator or contact line (owner, Polish Q), 이용약관·개인정보·라이선스 links`, async ({ page }) => {
    await gotoReady(page, path);
    const foot = page.locator('footer');
    await expect(foot.locator('.foot-op')).toHaveCount(0);
    await expect(foot).not.toContainText('준비');
    await expect(foot).not.toContainText('사이티드');
    await expect(foot.locator('.foot-copy')).toHaveText('© 2026 문서딱 · 내야 하는 문서·사진, 용량과 규격에 딱 맞춰 드려요');
    await expect(foot.getByRole('link', { name: '이용약관' })).toHaveAttribute('href', '/terms/');
    await expect(foot.getByRole('link', { name: '개인정보 처리방침' })).toHaveAttribute('href', '/privacy/');
    await expect(foot.getByRole('link', { name: '오픈소스 라이선스' })).toHaveAttribute('href', '/licenses/');
    // One left edge for every footer line (UX-AUDIT-1 §4, the 12 px mobile indent).
    const lefts = await foot.evaluate((f) => {
      const text = (el: Element | null) => {
        const r = document.createRange();
        r.selectNodeContents(el!.querySelector('a') ?? el!);
        return Math.round(r.getBoundingClientRect().left);
      };
      return [text(f.querySelector('.foot-links')), text(f.querySelector('.foot-copy'))];
    });
    expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThanOrEqual(1);
  });
}

test('terms: 200, canonical, the full text with 10 sections and no contact clause (owner, Polish Q)', async ({ page }) => {
  const res = await gotoReady(page, '/terms/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('이용약관');
  expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href'))!).pathname).toBe('/terms/');
  await expect(page.locator('.prose h2')).toHaveCount(10);
  await expect(page.locator('main')).toContainText('다만 운영자의 고의 또는 중대한 과실로 생긴 손해는 예외입니다.');
  await expect(page.locator('main')).toContainText('이 약관은 문서딱(이하 "서비스")의 이용 조건');
  for (const gone of ['문의', '준비 중', '사이티드']) await expect(page.locator('main')).not.toContainText(gone);
});

test('privacy: a short plain statement (owner, Polish Q): no sign-up, no personal data, files stay on the device; the access-log note; no officer or contact', async ({ page }) => {
  await gotoReady(page, '/privacy/');
  const main = page.locator('main');
  await expect(page.locator('.prose h2')).toHaveText(['1. 받는 개인정보가 없어요', '2. 고른 파일은 내 폰·컴퓨터 안에서 처리해요', '3. 사이트를 여는 기록', '4. 광고', '5. 변경 이력']);
  await expect(main).toContainText('문서딱은 회원가입이 없고, 이름·연락처 같은 개인정보를 받지 않아요.');
  await expect(main).toContainText('고른 파일과 그 내용은 내 폰·컴퓨터 안에서만 처리돼요.');
  await expect(main).toContainText('사이트를 여는 기록(접속 기록: IP 주소, 쓰는 기기와 앱의 종류 등)은 Cloudflare가 보안과 운영을 위해 잠시 보관할 수 있어요.');
  await expect(main).toContainText('시행일:');
  for (const gone of ['보호책임자', '문의', '준비 중', '사이티드', '운영자:']) await expect(main).not.toContainText(gone);
  // Usage statistics are off (brief USAGE; they replaced the error beacon): no 익명 사용 통계 section, the plain cookie line.
  await expect(main).not.toContainText('익명 사용 통계');
  await expect(main).not.toContainText('익명 오류 통계');
});

// ---------- P.5 compress done on phones ----------

test.describe('compress done order on a small screen (P.5)', () => {
  test('headline and the whole 내려받기 box are in the viewport; focus is on the headline; kept panel too', async ({ page, isMobile, browserName }) => {
    if (!isMobile) {
      test.skip(browserName !== 'chromium', 'The 360 × 740 desktop check runs on chromium (brief Test map); both mobile projects run it natively.');
      await page.setViewportSize({ width: 360, height: 740 });
    }
    await compressReady(page, SCAN, 1);
    await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
    await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', 'done', { timeout: 45_000 });
    const headline = page.locator('#cmp-headline');
    await expect(headline).toBeFocused();
    await expect(headline).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#cmp-download')).toBeInViewport({ ratio: 1 });
    // DOM order: headline, summary, (chip), actions, save name, notes, previews, cross-links.
    const order = await page.locator('#cmp-result').evaluate((r) => [...r.children].map((c) => c.id || c.className));
    expect(order.indexOf('cmp-headline')).toBeLessThan(order.indexOf('row'));
    expect(order.indexOf('row')).toBeLessThan(order.indexOf('cmp-save-name'));
    expect(order.indexOf('cmp-save-name')).toBeLessThan(order.indexOf('pv-details'));
    // Both previews side by side.
    const boxes = await page.locator('#cmp-previews .pv').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(Math.abs(boxes[0]! - boxes[1]!)).toBeLessThan(2);

    await page.getByRole('button', { name: '다른 파일 처리하기' }).click();
    await page.setInputFiles('#cmp-input', SMALL);
    await expect(page.locator('#cmp-info')).toContainText('7쪽');
    await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
    await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', 'kept', { timeout: 45_000 });
    await expect(page.locator('#cmp-kept-text')).toBeFocused();
    await expect(page.locator('#cmp-kept-text')).toBeInViewport();
  });

  test('desktop: both previews still show without a 미리보기 toggle', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop layout check.');
    await compressReady(page, SCAN, 1);
    await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
    await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', 'done', { timeout: 45_000 });
    await expect(page.locator('#cmp-previews canvas')).toHaveCount(2);
    await expect(page.locator('.pv-details > summary')).toBeHidden();
  });
});

// ---------- P.6 live-only copy ----------

test('home, meta and JSON-LD name every live tool and no soon tool (og: no soon tool); the soon list has no links', async ({ page }) => {
  await gotoReady(page, '/');
  const lead = (await page.locator('.hero .lead').textContent()) ?? '';
  const desc = (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
  const og = (await page.locator('meta[property="og:description"]').getAttribute('content')) ?? '';
  const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).join('');
  for (const text of [lead, desc, og, ld]) {
    // Sprint C: the share preview no longer lists the tools (seven names alone pass its 80 characters).
    // TOOLS4 T4: ten tools no longer fit the 120-character description, which names the first ones and the count
    // (E-T2-a; the order and the cut are unit-tested in polish.test.ts).
    if (text === desc && desc.includes('가지 도구')) expect(desc).toMatch(new RegExp(` 등 ${LIVE.length}가지 도구\\. 가입 없이 무료\\.$`));
    else if (text !== og) for (const name of LIVE) expect(text).toContain(name);
    for (const name of SOON) expect(text).not.toContain(name);
    expect(text).not.toMatch(/한글 파일/);
  }
  expect(lead.startsWith('지금 쓸 수 있는 도구: ')).toBe(true);
  expect([...desc].length).toBeGreaterThanOrEqual(80);
  expect([...desc].length).toBeLessThanOrEqual(120);
  await expect(page.locator('.soon-list li')).toHaveText(SOON);
  await expect(page.locator('.soon a')).toHaveCount(0);
  const logo = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!).find((d: { '@type': string }) => d['@type'] === 'Organization').logo;
  expect(logo).toMatch(/\/brand\/icon-512\.png$/);
  await expect(page.getByText('작업한 파일은 저장하지 않고, 창을 닫으면 사라집니다.')).toBeAttached();
  await expect(page.locator('#faq')).not.toContainText(/광고|품질 검증|언제 사용/);
});

test('404 lists the live tools', async ({ page }) => {
  await gotoReady(page, '/no-such-page/');
  const tools = page.locator('.nf-tools:not(.nf-guides)');
  for (const name of LIVE) await expect(tools.getByRole('link', { name })).toBeVisible();
  await expect(tools.locator('a')).toHaveCount(LIVE.length);
  // Growth G: five guides under 많이 찾는 안내.
  await expect(page.locator('.nf-guides a')).toHaveCount(5);
});

// ---------- P.10 brand ----------

test('icons, manifest and OG image are served; the head links them', async ({ page, request }) => {
  const ico = await request.get('/favicon.ico');
  expect(ico.status()).toBe(200);
  expect(ico.headers()['content-type']).toMatch(/^image\//);
  // Polish Q: one share image per tool, home and a default, all served as PNG.
  for (const name of ['home', 'default', 'pdf-merge', 'pdf-compress', 'jpg-to-pdf', 'pdf-to-jpg', 'pdf-password', 'photo-compress', 'id-photo', 'stamp-signature', 'hwp-to-pdf', 'hwp-viewer']) {
    const og = await request.get(`/brand/og-${name}.png`);
    expect(og.status(), name).toBe(200);
    expect(og.headers()['content-type'], name).toBe('image/png');
  }
  expect((await request.get('/brand/og.png')).status()).toBe(404);
  const man = await request.get('/manifest.webmanifest');
  expect(man.status()).toBe(200);
  const m = await man.json();
  expect(m).toMatchObject({ name: '문서딱 — 내야 하는 문서·사진, 용량과 규격에 딱 맞춰 드려요', short_name: '문서딱', start_url: '/', scope: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#0f766e', lang: 'ko' });
  for (const icon of m.icons) expect((await request.get(icon.src)).status()).toBe(200);
  await gotoReady(page, '/pdf-merge/');
  const icons = await page.locator('link[rel="icon"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')!.slice(0, 18)));
  expect(icons).toEqual(['data:image/svg+xml', '/favicon.ico']);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/brand/apple-touch-icon.png');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /^https:\/\/.+\/brand\/og-pdf-merge\.png$/);
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', '문서딱: PDF 합치기. 여러 PDF를 한 파일로 — 무료, 가입 없이');
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', /^https:\/\/.+\/brand\/og-pdf-merge\.png$/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
});

// ---------- P.12 WebKit weights ----------

test('UI font weights: 800 renders bolder than 400 (static instances; the audit WebKit symptom)', async ({ page }) => {
  await gotoReady(page, '/');
  const r = await page.evaluate(async () => {
    await document.fonts.load('400 32px "Anolim UI Sans"', '서류 파일 문서딱');
    await document.fonts.load('800 32px "Anolim UI Sans"', '서류 파일 문서딱');
    const probe = (weight: number) => {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 60;
      const ctx = c.getContext('2d')!;
      ctx.font = `${weight} 32px "Anolim UI Sans"`;
      ctx.fillStyle = '#000';
      ctx.fillText('서류 파일 문서딱', 4, 44);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      let ink = 0;
      for (let i = 3; i < px.length; i += 4) ink += px[i]!;
      return { width: ctx.measureText('서류 파일 문서딱').width, ink };
    };
    return { bold: probe(800), regular: probe(400), check: document.fonts.check('800 16px "Anolim UI Sans"') };
  });
  expect(r.check).toBe(true);
  // Pretendard keeps Hangul advances nearly equal across weights (≈ 1 %), so the probe compares ink: a face
  // that ignores the weight renders both the same (ratio 1.0).
  expect(r.bold.width).not.toBe(r.regular.width);
  expect(r.bold.ink / r.regular.ink).toBeGreaterThanOrEqual(1.3);
});

// ---------- LCP fix after TOOLS4: late UI faces never load with a page ----------

// The build check proves the static HTML needs only the core faces; this catches first-screen text that scripts
// render (an entry or controller writing a late character on load would fetch a face before LCP).
const LATE_FACE = /\/_astro\/anolim-ui-late-\d+\.[^/]*\.woff2$/;
test('UI font: home, every live tool page and a guide load no late face (networkidle + 1 s each)', async ({ page, network }) => {
  test.setTimeout(180_000);
  const settle = async (path: string) => {
    const from = network.requests.length;
    await gotoReady(page, path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    expect.soft(network.requests.slice(from).map((r) => r.url()).filter((u) => LATE_FACE.test(u)), path).toEqual([]);
  };
  await settle('/');
  // The live tools are the home page's live cards (src/data/tools.ts needs the build's defines to import).
  const tools = await page.locator('.card.live .card-link').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
  expect(tools.length).toBeGreaterThanOrEqual(10);
  for (const path of [...tools, '/guide/passport-photo/']) await settle(path);
});

// LCP round 2: the 700 face is retired; CSS 700 became 800, and UA bold (strong, h2, summary: 700) matches the
// preloaded 800 face. No 700 file is requested, and 700 text is the real 800 face (same ink), not a synthesized
// bold or a fallback family.
for (const path of ['/', '/photo-compress/']) {
  test(`UI font: ${path} requests no 700 face; the primary button is 800; UA bold renders with the 800 face`, async ({ page, network }) => {
    await gotoReady(page, path);
    await page.waitForLoadState('networkidle');
    expect(network.requests.map((r) => r.url()).filter((u) => /anolim-ui(-late)?-700\./.test(u))).toEqual([]);
    await expect(page.locator('.btn.primary').first()).toHaveCSS('font-weight', '800');
    const r = await page.evaluate(async () => {
      const loaded = [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Anolim UI Sans' && f.status === 'loaded').map((f) => f.weight);
      const strong = document.querySelector('main strong, main h2');
      const text = strong!.textContent!.trim();
      const probe = (weight: number) => {
        const c = document.createElement('canvas');
        c.width = 600;
        c.height = 60;
        const ctx = c.getContext('2d')!;
        ctx.font = `${weight} 32px "Anolim UI Sans"`;
        ctx.fillText(text, 4, 44);
        const px = ctx.getImageData(0, 0, c.width, c.height).data;
        let ink = 0;
        for (let i = 3; i < px.length; i += 4) ink += px[i]!;
        return ink;
      };
      return { loaded, weight: getComputedStyle(strong!).fontWeight, check: document.fonts.check('700 16px "Anolim UI Sans"', text), ink700: probe(700), ink800: probe(800), ink400: probe(400) };
    });
    expect(r.loaded).not.toContain('700');
    expect(Number(r.weight)).toBeGreaterThanOrEqual(700);
    expect(r.check).toBe(true);
    expect(Math.abs(r.ink700 / r.ink800 - 1)).toBeLessThan(0.02);
    expect(r.ink700 / r.ink400).toBeGreaterThanOrEqual(1.3);
    expect(network.requests.map((u) => u.url()).filter((u) => /anolim-ui(-late)?-700\./.test(u))).toEqual([]);
  });
}

// ---------- P.13 목표 용량 ----------

test.describe('목표 용량 (P.13)', () => {
  test.describe.configure({ timeout: 240_000 });

  async function targetMode(page: Page, mb: string): Promise<void> {
    await page.getByRole('radio', { name: '목표 용량으로 줄이기' }).check();
    await expect(page.locator('#cmp-levels')).toBeHidden();
    if (['3', '5', '10', '20'].includes(mb)) await page.locator('#cmp-target-box').getByText(`${mb} MB`, { exact: true }).click();
    else {
      await page.locator('#cmp-target-box').getByText('직접 입력', { exact: true }).click();
      await page.getByLabel('목표 용량 (MB)').fill(mb);
    }
  }

  async function runTarget(page: Page, state: 'done' | 'kept' = 'done'): Promise<void> {
    await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
    const confirm = page.getByRole('button', { name: '계속 줄이기' });
    // Mobile asks first above 20 MB.
    await Promise.race([confirm.waitFor({ timeout: 2000 }).then(() => confirm.click()), page.waitForTimeout(2000)]).catch(() => undefined);
    await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', state, { timeout: 200_000 });
  }

  test.beforeEach(({ isMobile, browserName }) => {
    test.skip(isMobile && browserName === 'webkit', 'The target runs are on the three desktop projects and mobile-chrome (brief Test map).');
  });

  test('hit: 24 scan pages at 1 MB need a lower rung; the chip shows and the download is ≤ 1,000,000 bytes', async ({ page }) => {
    await compressReady(page, runtimePath('scan_multi_24'), 24);
    await targetMode(page, '1');
    await runTarget(page);
    await expect(page.locator('#cmp-chip')).toHaveText('✓ 1 MB 이하');
    await expect(page.locator('#cmp-miss')).toBeHidden();
    const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#cmp-download').click()]);
    const bytes = new Uint8Array(readFileSync(await d.path()));
    expect(bytes.length).toBeLessThanOrEqual(1_000_000);
    // 고화질 alone leaves ~5.9 MB: the search went past rung 1.
    expect(bytes.length).toBeLessThan(2_000_000);
    expect(await pageCount(bytes)).toBe(24);
  });

  test('miss: 40 scan pages cannot reach 0.5 MB; the smallest result is offered with the warning', async ({ page }) => {
    const input = readFileSync(runtimePath('scan_multi_40')).length;
    await compressReady(page, runtimePath('scan_multi_40'), 40);
    await targetMode(page, '0.5');
    await runTarget(page);
    await expect(page.locator('#cmp-chip')).toBeHidden();
    await expect(page.locator('#cmp-miss')).toHaveText(/^0\.5 MB 이하로는 줄이지 못했습니다\. 가장 작게 줄인 결과는 [\d.,]+ KB입니다\. 이미지로 변환을 켜거나 파일을 나눠 제출해 보세요\.$/);
    const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#cmp-download').click()]);
    const bytes = new Uint8Array(readFileSync(await d.path()));
    expect(bytes.length).toBeGreaterThan(500_000);
    expect(bytes.length).toBeLessThan(input * 0.99);
  });

  test('cancel during the search returns to ready with target mode kept', async ({ page }) => {
    await compressReady(page, runtimePath('scan_multi_24'), 24);
    await targetMode(page, '1');
    await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
    await expect(page.locator('#cmp-progress-text')).toContainText('목표 용량에 맞추는 중…', { timeout: 30_000 });
    await page.getByRole('button', { name: '취소' }).click();
    await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', 'ready');
    await expect(page.getByRole('radio', { name: '목표 용량으로 줄이기' })).toBeChecked();
  });

  test('already under the target: no run, the kept-style note, no download', async ({ page }) => {
    await compressReady(page, SCAN, 1);
    await targetMode(page, '10');
    await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
    await expect(page.locator('#compress-tool')).toHaveAttribute('data-state', 'kept');
    await expect(page.locator('#cmp-kept-text')).toHaveText(/^이미 10 MB 이하입니다\([\d.,]+ KB\)\. 원본을 그대로 제출하면 됩니다\.$/);
    await expect(page.locator('#cmp-download')).toBeHidden();
    await expect(page.locator('#cmp-progress')).toBeHidden();
  });

  test('free input is validated inline (0.5–100 MB) and blocks the button; axe is clean in target mode', async ({ page }) => {
    await compressReady(page, SCAN, 1);
    await targetMode(page, '0.4');
    await expect(page.locator('#cmp-target-error')).toHaveText('0.5~100 MB 사이로 입력해 주세요.');
    await expect(page.getByRole('button', { name: 'PDF 용량 줄이기' })).toBeDisabled();
    await page.getByLabel('목표 용량 (MB)').fill('2.5');
    await expect(page.locator('#cmp-target-error')).toHaveText('');
    await expect(page.getByRole('button', { name: 'PDF 용량 줄이기' })).toBeEnabled();
    expect(await serious(page)).toEqual([]);
  });
});

// ---------- P.15 non-PDF files ----------

test('merge: a txt and a jpg never enter the list; one alert names both; only the PDF is listed', async ({ page }) => {
  await gotoReady(page, '/pdf-merge/');
  await page.setInputFiles('#merge-input', [NOTES, photoFixture('portrait_pd.jpg'), LAW]);
  await expect(page.locator('#merge-error')).toHaveText('파일 2개는 PDF가 아니어서 넣지 않았습니다: notes.txt, portrait_pd.jpg');
  await expect(page.locator('#merge-error')).toHaveAttribute('role', 'alert');
  await inspected(page, 'kr_law_form.pdf', 7);
  await expect(mergeRows(page)).toHaveCount(1);
  // A new file clears the alert.
  await page.setInputFiles('#merge-input', [FW9]);
  await expect(page.locator('#merge-error')).toBeHidden();
});

test('compress: a txt is rejected with its name and never becomes the card', async ({ page }) => {
  await gotoReady(page, '/pdf-compress/');
  await page.setInputFiles('#cmp-input', NOTES);
  await expect(page.locator('#cmp-error')).toHaveText('notes.txt는 PDF 파일이 아니어서 넣지 않았습니다. PDF 파일만 넣을 수 있습니다.');
  await expect(page.locator('#cmp-file')).toBeHidden();
});

test('merge: "문제 파일 모두 빼기" appears at two error cards and removes both', async ({ page, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || isMobile, 'Chromium-only check (brief Test map).');
  const second = join(RUNTIME_DIR, 'truncated_copy.pdf');
  writeFileSync(second, readFileSync(runtimePath('truncated')));
  await gotoReady(page, '/pdf-merge/');
  await page.setInputFiles('#merge-input', [runtimePath('truncated'), LAW, second]);
  await expect(page.locator('#merge-list .file-error')).toHaveCount(2);
  const btn = page.getByRole('button', { name: '문제 파일 모두 빼기' });
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(mergeRows(page)).toHaveCount(1);
  await expect(page.locator('#merge-status')).toHaveText('문제 파일 2개를 목록에서 뺐습니다. 1개 남았습니다.');
  await expect(btn).toBeHidden();
});

// ---------- P.16 merge list ----------

test.describe('merge list (P.16)', () => {
  async function five(page: Page): Promise<void> {
    await gotoReady(page, '/pdf-merge/');
    await page.setInputFiles('#merge-input', [LAW, FW9, SCAN, fixturePath('gen_links_outline.pdf'), fixturePath('gen_landscape_rotated.pdf')]);
    await inspected(page, 'gen_landscape_rotated.pdf', 2);
    await inspected(page, 'kr_law_form.pdf', 7);
  }

  test('compact rows: ≤ 76 px tall; ↑ ↓ 삭제 are 44 × 44 with file-name labels', async ({ page }) => {
    await five(page);
    const heights = await mergeRows(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    for (const h of heights) expect(h).toBeLessThanOrEqual(76);
    const small = await page.locator('#merge-list button').evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length,
    );
    expect(small).toBe(0);
    await expect(page.getByRole('button', { name: 'irs_fw9.pdf 아래로 이동' })).toBeVisible();
    await expect(page.locator('#merge-list .name').first()).toHaveAttribute('title', 'kr_law_form.pdf');
  });

  const handle = (page: Page, i: number) => mergeRows(page).nth(i).locator('.drag-handle');

  test('pointer drag reorders through the same path as the buttons and announces it; Escape cancels', async ({ page, browserName, isMobile }) => {
    test.skip(browserName === 'webkit' && isMobile, 'mobile-safari: Playwright has no touch-drag input for WebKit; webkit desktop covers the pointer path.');
    await five(page);
    const names = () => page.locator('#merge-list .name').allTextContents();
    const center = async (i: number) => {
      const b = (await handle(page, i).boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const lastRow = (await mergeRows(page).nth(2).boundingBox())!;
    const from = await center(0);
    const toY = lastRow.y + lastRow.height * 0.75;

    if (isMobile) {
      // A real touch drag (touch events → pointer events with pointerType "touch").
      const cdp = await page.context().newCDPSession(page);
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      await touch('touchStart', from.x, from.y);
      for (let k = 1; k <= 8; k++) await touch('touchMove', from.x, from.y + ((toY - from.y) * k) / 8);
      await touch('touchEnd', from.x, toY);
    } else {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (let k = 1; k <= 8; k++) await page.mouse.move(from.x, from.y + ((toY - from.y) * k) / 8);
      await page.mouse.up();
    }
    await expect.poll(names).toEqual(['irs_fw9.pdf', 'gen_scan_a6.pdf', 'kr_law_form.pdf', 'gen_links_outline.pdf', 'gen_landscape_rotated.pdf']);
    await expect(page.locator('#merge-status')).toHaveText('kr_law_form.pdf: 5개 중 3번째로 옮겼습니다.');
    await expect(page.locator('.drag-placeholder')).toHaveCount(0);

    if (!isMobile) {
      const before = await names();
      const f = await center(0);
      await page.mouse.move(f.x, f.y);
      await page.mouse.down();
      await page.mouse.move(f.x, toY, { steps: 6 });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      expect(await names()).toEqual(before);
      await expect(page.locator('.drag-placeholder')).toHaveCount(0);
    }
  });

  test('a drag held near the bottom edge while inspections finish ends cleanly on release (round 2 Must Fix)', async ({ page, context, isMobile }) => {
    test.skip(isMobile, 'Mouse drag with a held button; the touch path is covered by the pointer-drag test on mobile-chrome.');
    // Count the drag's capture-phase keydown and visibilitychange listeners on document.
    await page.addInitScript(() => {
      const live = new Set<unknown>();
      const add = document.addEventListener.bind(document);
      const remove = document.removeEventListener.bind(document);
      document.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
        if (type === 'visibilitychange' || (type === 'keydown' && (opts === true || (typeof opts === 'object' && opts.capture)))) live.add(fn);
        add(type, fn, opts);
      }) as typeof document.addEventListener;
      document.removeEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | EventListenerOptions) => {
        live.delete(fn);
        remove(type, fn, opts);
      }) as typeof document.removeEventListener;
      (window as unknown as { __dragListeners: () => number }).__dragListeners = () => live.size;
    });
    // Inspection finishes about 3 s after the pick, while the drag is held.
    await context.route(/\/vendor\/pdfjs\/.+\/pdf\.worker\.min\.mjs/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue().catch(() => undefined);
    });
    await gotoReady(page, '/pdf-merge/');
    await page.setInputFiles('#merge-input', [LAW, FW9, SCAN, fixturePath('gen_links_outline.pdf'), fixturePath('gen_landscape_rotated.pdf')]);
    await expect(mergeRows(page)).toHaveCount(5);
    const b = (await handle(page, 0).boundingBox())!;
    const vh = page.viewportSize()!.height;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, vh - 6, { steps: 10 });
    expect(await page.evaluate(() => (window as unknown as { __dragListeners: () => number }).__dragListeners())).toBe(2);
    // Held at the edge (auto-scroll) until every inspection has finished behind the drag.
    await page.waitForTimeout(6000);
    await page.mouse.up();

    await expect(page.locator('.drag-placeholder')).toHaveCount(0);
    await expect(page.locator('.file-item.dragging')).toHaveCount(0);
    await expect(mergeRows(page)).toHaveCount(5);
    // The held re-render ran once the drag ended.
    await expect(page.locator('#merge-list .info', { hasText: '쪽' })).toHaveCount(5, { timeout: 15_000 });
    // No scroll loop left running: the position is stable (after any last frame settles).
    await page.waitForTimeout(300);
    const y1 = await page.evaluate(() => scrollY);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => scrollY)).toBe(y1);
    expect(await page.evaluate(() => (window as unknown as { __dragListeners: () => number }).__dragListeners())).toBe(0);
  });

  test('phone: the actions bar stays at the bottom while the list scrolls; a focused row is not covered', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The sticky bar is the ≤ 640 px layout (both mobile projects).');
    await five(page);
    await page.setInputFiles('#merge-input', [LAW, FW9, SCAN]);
    await expect(mergeRows(page)).toHaveCount(8);
    await expect(page.locator('#merge-list .info', { hasText: '쪽' })).toHaveCount(8);
    const bar = page.locator('#merge-actions');
    // Polish Q (UX-AUDIT-2 P2-7): at the top of the page, with the list running past the fold, the bar is
    // already pinned to the bottom edge (a full-page screenshot cannot show this).
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    expect(await page.evaluate(() => document.querySelector('#merge-list')!.getBoundingClientRect().bottom > innerHeight)).toBe(true);
    await expect(bar).toBeInViewport({ ratio: 1 });
    await page.evaluate(() => document.querySelector('#merge-list')!.scrollIntoView({ block: 'start' }));
    await expect(bar).toBeInViewport({ ratio: 1 });
    await expect(bar.getByRole('button', { name: 'PDF 8개 합치기' })).toBeVisible();
    const vh = page.viewportSize()!.height;
    expect((await bar.boundingBox())!.y + (await bar.boundingBox())!.height).toBeLessThanOrEqual(vh + 1);
    // Keyboard-style focus on a row further down: the browser scrolls it clear of the bar (scroll-padding).
    const target = mergeRows(page).nth(6).getByRole('button', { name: /삭제$/ });
    await target.focus();
    const t = (await target.boundingBox())!;
    const b = (await bar.boundingBox())!;
    expect(t.y + t.height).toBeLessThanOrEqual(b.y + 1);
  });
});

// ---------- P.9 header menu ----------

test.describe('header tools menu (P.9)', () => {
  test('toggle, aria-current, Escape returns focus, outside click and Tab-out close it; axe clean when open', async ({ page }) => {
    await gotoReady(page, '/pdf-compress/');
    const btn = page.getByRole('button', { name: '도구' });
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await btn.click();
    const panel = page.locator('#tools-menu');
    await expect(panel).toBeVisible();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(btn).toHaveAttribute('aria-controls', 'tools-menu');
    for (const name of LIVE) await expect(panel.getByRole('link', { name })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'PDF 용량 줄이기' })).toHaveAttribute('aria-current', 'page');
    await expect(panel.getByRole('link', { name: 'PDF 합치기' })).not.toHaveAttribute('aria-current', 'page');
    await expect(panel.getByRole('link', { name: '자주 묻는 질문' })).toHaveAttribute('href', '/#faq');
    expect(await serious(page)).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(btn).toBeFocused();

    await btn.click();
    // Outside the panel: below it (with five tools the mobile sheet reaches past y = 400).
    const sheet = (await panel.boundingBox())!;
    await page.mouse.click(5, Math.max(400, sheet.y + sheet.height + 20));
    await expect(panel).toBeHidden();

    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    // One Tab per menu item, then one more leaves the menu (Step 4 added a tool, so count them).
    const items = await panel.locator('a').count();
    for (let i = 0; i <= items; i++) await page.keyboard.press('Tab');
    await expect(panel).toBeHidden();
  });

  test('at 360 px the menu is a full-width sheet with items ≥ 48 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await gotoReady(page, '/');
    await page.getByRole('button', { name: '도구' }).click();
    const panel = page.locator('#tools-menu');
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeLessThanOrEqual(1);
    expect(box.width).toBeGreaterThanOrEqual(358);
    const small = await panel.locator('a').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 48).length);
    expect(small).toBe(0);
  });

  test('without JS the control is a plain link to /#tools', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.goto('/pdf-merge/');
    await expect(p.locator('.menu-toggle')).toHaveAttribute('href', '/#tools');
    await expect(p.locator('#tools-menu')).toBeHidden();
    await ctx.close();
  });
});

// ---------- P.17 copy ----------

test('copy: the compress page reads ppi (never dpi) and the drop hint changes on touch', async ({ page, isMobile }) => {
  await gotoReady(page, '/pdf-compress/');
  await expect(page.locator('#cmp-desc-high')).toContainText('인쇄용 선명도 (약 200 ppi)');
  await expect(page.locator('#cmp-desc-recommended')).toContainText('제출용 선명도 (약 150 ppi)');
  await expect(page.locator('#cmp-desc-strong')).toContainText('화면용 선명도 (약 110 ppi)');
  expect(await page.locator('main').textContent()).not.toMatch(/dpi/);
  const drop = page.locator('#cmp-drop .drop-hint');
  const touch = page.locator('#cmp-drop .drop-hint-touch');
  if (isMobile) {
    await expect(drop).toBeHidden();
    await expect(touch).toHaveText('휴대폰의 「파일」 앱이나 다운로드 폴더에서 고를 수 있습니다.');
  } else {
    await expect(drop).toBeVisible();
    await expect(touch).toBeHidden();
  }
});
