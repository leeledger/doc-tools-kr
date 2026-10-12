// Play listing images (TWA brief step 5), rendered from the built site with the repo's Playwright (no new dependency):
//   8 phone screenshots, 360x640 CSS px at device scale 3 = 1080x1920, each <= 500 KB (PNG; JPEG q85 if a PNG is over)
//   feature graphic 1024x500 from listing/feature.html (brand color, logo, one line, site font)
//   store icon 512x512: a copy of public/brand/icon-512.png
// Run from the repo root after `npm run build`:  node twa/screenshots.mjs
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../tests/e2e/serve.mjs';

const TWA = dirname(fileURLToPath(import.meta.url));
const REPO = join(TWA, '..');
const OUT = join(TWA, 'listing');
const SHOTS = join(OUT, 'screenshots');
const MAX_BYTES = 500 * 1024;
const fixture = (...p) => join(REPO, 'tests', ...p);

/**
 * Store screenshots never show a real person (review TWA r1): the test photo fixtures include a real public figure's
 * portrait and a painting, so photo tools get this synthetic picture instead (soft backdrop and shapes, no face),
 * drawn in the page and handed over as a file. tests/unit/manifest.test.ts fails if a photo fixture appears here.
 */
async function syntheticPhoto(page, scale = 1) {
  const b64 = await page.evaluate((k) => {
    const c = document.createElement('canvas');
    c.width = 1200 * k;
    c.height = 1600 * k;
    const g = c.getContext('2d');
    g.scale(k, k);
    const bg = g.createLinearGradient(0, 0, 1200, 1600);
    bg.addColorStop(0, '#dbeafe');
    bg.addColorStop(1, '#99f6e4');
    g.fillStyle = bg;
    g.fillRect(0, 0, 1200, 1600);
    g.fillStyle = '#0f766e';
    g.beginPath();
    g.arc(600, 620, 260, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f8fafc';
    g.fillRect(250, 1050, 700, 380);
    const img = g.getImageData(0, 0, c.width, c.height);
    let s = 7;
    for (let i = 0; i < img.data.length; i += 4) {
      s = (s * 1103515245 + 12345) >>> 0;
      const n = ((s >>> 16) % (8 * k + 5)) - 4 * k - 2;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.92).split(',')[1];
  }, scale);
  return { name: '사진.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

/** Each shot: open `path`, run `act`, then scroll `focus` (if any) just below the sticky header and capture the viewport. */
const SHOTS_PLAN = [
  { name: '01-home', path: '/' },
  { name: '02-id-photo-presets', path: '/id-photo/', focus: '#idp-tool' },
  {
    name: '03-id-photo-done',
    path: '/id-photo/',
    focus: '#idp-tool',
    act: async (page) => {
      await page.setInputFiles('#idp-input', await syntheticPhoto(page));
      await page.locator('#idp-tool[data-state="adjust"]').waitFor({ timeout: 90_000 });
      await page.locator('#idp-confirm').check();
      await page.locator('#idp-save').click();
      await page.locator('#idp-tool[data-state="done"]').waitFor({ timeout: 60_000 });
    },
  },
  {
    name: '04-pdf-merge',
    path: '/pdf-merge/',
    focus: '#merge-tool',
    act: async (page) => {
      await page.setInputFiles('#merge-input', [fixture('fixtures', 'irs_fw9.pdf'), fixture('fixtures', 'kr_law_form.pdf')]);
      await page.locator('#merge-list > li .info', { hasText: '쪽' }).nth(1).waitFor({ timeout: 30_000 });
      await page.locator('#merge-list > li canvas').nth(1).waitFor({ state: 'attached', timeout: 30_000 });
    },
  },
  {
    name: '05-pdf-compress',
    path: '/pdf-compress/',
    focus: '#compress-tool',
    act: async (page) => {
      await page.setInputFiles('#cmp-input', fixture('fixtures', 'gen_photo_resume.pdf'));
      await page.getByRole('button', { name: 'PDF 용량 줄이기' }).click();
      await page.locator('#compress-tool[data-state="done"]').waitFor({ timeout: 60_000 });
    },
  },
  {
    name: '06-hwp-to-pdf',
    path: '/hwp-to-pdf/',
    focus: '#hwp-tool',
    act: async (page) => {
      await page.setInputFiles('#hw-input', fixture('corpus', 'hwp', 'law05.hwp'));
      await page.locator('#hwp-tool[data-state="convert"]').waitFor({ timeout: 90_000 });
      await page.locator('#hw-preview .page').first().waitFor({ timeout: 30_000 });
    },
  },
  {
    name: '07-photo-compress',
    path: '/photo-compress/',
    focus: '#photo-tool',
    act: async (page) => {
      await page.setInputFiles('#ph-input', await syntheticPhoto(page, 2.5)); // a few MB: over the default target
      await page.getByRole('button', { name: '사진 용량 줄이기', exact: true }).click();
      await page.locator('#photo-tool[data-state="done"]').waitFor({ timeout: 110_000 });
    },
  },
  { name: '08-on-device', path: '/pdf-merge/' },
];

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

/** Captures the viewport as PNG, or JPEG q85 when the PNG is over the size cap. Returns the file written. */
async function capture(page, base) {
  const png = `${base}.png`;
  await page.screenshot({ path: png });
  if (statSync(png).size <= MAX_BYTES) return png;
  rmSync(png);
  const jpg = `${base}.jpg`;
  await page.screenshot({ path: jpg, type: 'jpeg', quality: 85 });
  if (statSync(jpg).size > MAX_BYTES) throw new Error(`${jpg} is over 500 KB`);
  return jpg;
}

const server = await startServer({ root: join(REPO, 'dist'), port: 0 });
const browser = await chromium.launch();
try {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  const phone = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ko-KR', colorScheme: 'light' };
  for (const shot of SHOTS_PLAN) {
    const ctx = await browser.newContext(phone);
    const page = await ctx.newPage();
    await page.goto(`${server.url}${shot.path}`, { waitUntil: 'load' });
    if (shot.act) await shot.act(page);
    if (shot.focus) {
      // Below the sticky header, not under it (scrollIntoView left text showing through the translucent header).
      await page.locator(shot.focus).first().evaluate((el) => {
        const header = document.querySelector('header.top');
        const offset = header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height : 0;
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset - 16, behavior: 'instant' });
      });
    }
    await settle(page);
    console.log(`screenshot ${await capture(page, join(SHOTS, shot.name))}`);
    await ctx.close();
  }

  // Feature graphic: listing/feature.html served at a same-origin path, so it can use the site's own font files.
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route(`${server.url}/__feature`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: readFileSync(join(OUT, 'feature.html'), 'utf8') }),
  );
  await page.goto(`${server.url}/__feature`, { waitUntil: 'load' });
  await settle(page);
  await page.screenshot({ path: join(OUT, 'feature-graphic.png') });
  console.log(`feature ${join(OUT, 'feature-graphic.png')}`);
  await ctx.close();

  copyFileSync(join(REPO, 'public', 'brand', 'icon-512.png'), join(OUT, 'icon-512.png'));
  console.log(`icon ${join(OUT, 'icon-512.png')}`);
} finally {
  await browser.close();
  await server.close();
}
