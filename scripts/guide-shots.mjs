// Screenshots of 문서딱's own tool screens for the guides (CONTENT1021 D9): node scripts/guide-shots.mjs
// Serves the current dist/ (build first), opens each tool in Chromium at a fixed viewport, takes a fixed clip of the tool
// section and writes it as WebP to public/img/guide/<slug>/<n>-<name>.webp. Deterministic: fixed viewport and device
// scale, animations off, caret hidden, synthetic test input only (no photo of a person, no third-party screen), the
// same WebP quality every run. The WebP is encoded by Chromium itself (canvas), so no image library is added.
// After a run, check the files (≤ 80 KB each, check-dist) and the width/height in the guide markup.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { startServer } from '../tests/e2e/serve.mjs';
import { blockAnalytics } from './lib/no-analytics.mjs';

const ROOT = join(import.meta.dirname, '..');
const PORT = 4183;
const VIEWPORT = { width: 720, height: 900 };
const CLIP = { width: 720, height: 560 };
const QUALITY = 0.8;
const MAX_BYTES = 80 * 1024;

/**
 * Each shot: the page, what to do before the shot, the element whose top starts the clip, and where it goes. Optional
 * `bottom`: the clip ends 16 px below that element instead of at CLIP.height (a taller fixed layout, e.g. a preview).
 */
const SHOTS = [
  {
    out: 'photo-kb/1-compress-screen.webp',
    path: '/photo-compress/?target=200',
    top: '#photo-tool',
    async prepare(page) {
      // A synthetic picture drawn here (seeded gradient and noise): no person, no third-party image, the same bytes every run.
      const jpg = await page.evaluate(async () => {
        const w = 1600;
        const h = 1200;
        const c = new OffscreenCanvas(w, h);
        const g = c.getContext('2d');
        const img = g.createImageData(w, h);
        let seed = 1021;
        const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const n = (rnd() - 0.5) * 40;
            img.data[i] = 60 + (x / w) * 120 + n;
            img.data[i + 1] = 140 + (y / h) * 80 + n;
            img.data[i + 2] = 170 - (x / w) * 60 + n;
            img.data[i + 3] = 255;
          }
        }
        g.putImageData(img, 0, 0);
        const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
        return [...new Uint8Array(await blob.arrayBuffer())];
      });
      await page.setInputFiles('#ph-input', { name: '사진.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpg) });
      await page.locator('#ph-list .info', { hasText: '확인 중' }).waitFor({ state: 'detached' }).catch(() => {});
      await page.getByRole('button', { name: '사진 용량 줄이기', exact: true }).click();
      await page.waitForSelector('#photo-tool[data-state="done"]', { timeout: 60_000 });
    },
  },
  {
    out: 'power-of-attorney/1-form-screen.webp',
    path: '/power-of-attorney/',
    top: '#pa-form',
    async prepare(page) {
      // Made-up example values (홍길동, the e2e sample's name), never a real person's data.
      for (const [field, value] of Object.entries({ giverName: '홍길동', giverBirth: '1960년 3월 1일', giverAddress: '서울특별시 ○○구 ○○로 1' })) {
        await page.locator(`[data-field="${field}"]`).fill(value);
      }
    },
  },
  {
    out: 'loan-note/1-form-shot.webp',
    path: '/loan-note/',
    top: '#ln-form',
    async prepare(page) {
      // Made-up example values (the e2e sample: 홍길동/김철수, an example amount), never a real person's data. Both dates
      // are fixed so the shot does not change with the day it is taken (빌린 날 defaults to today).
      const values = { amount: '10000000', loanDate: '2026-10-22', dueDate: '2027-10-21', rate: '5', interestDay: '매달 25일', repayHow: '김철수 명의 계좌로 이체', lenderName: '김철수', borrowerName: '홍길동' };
      for (const [field, value] of Object.entries(values)) {
        await page.locator(`[data-field="${field}"]`).fill(value);
      }
    },
  },
  {
    out: 'qr-code/1-wifi-tab.webp',
    path: '/qr-code/?tab=wifi',
    top: '#qr-tool',
    bottom: '#qr-png',
    async prepare(page) {
      // A made-up network name and password (never a real network); the preview QR is drawn from them.
      await page.locator('#qr-ssid').fill('우리가게 손님용');
      await page.locator('#qr-pw').fill('example-1234');
      await page.locator('#qr-preview svg').waitFor();
    },
  },
  {
    out: 'resignation-letter/1-form-shot.webp',
    path: '/resignation-letter/',
    top: '#rs-group-work',
    async prepare(page) {
      // Made-up example values (the e2e sample: 홍길동, ○○ 주식회사), never a real person's data. Every date is fixed so
      // the shot does not change with the day it is taken (내는 날 defaults to today). The 이직 chip fills the reason, as
      // a visitor would, so the shot shows the chips under a filled field.
      const values = { dept: '영업팀', position: '대리', name: '홍길동', birth: '1990년 3월 1일', phone: '010-1234-5678', joinDate: '2022-03-02', leaveDate: '2026-11-30', date: '2026-10-27', to: '○○ 주식회사 대표이사' };
      for (const [field, value] of Object.entries(values)) {
        await page.locator(`[data-field="${field}"]`).fill(value);
      }
      await page.locator('#rs-group-work .pa-preset', { hasText: '이직' }).click();
    },
  },
];

async function toWebp(context, png) {
  const page = await context.newPage();
  const b64 = await page.evaluate(
    async ({ data, quality }) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (const b of buf) s += String.fromCharCode(b);
      return btoa(s);
    },
    { data: png.toString('base64'), quality: QUALITY },
  );
  await page.close();
  return Buffer.from(b64, 'base64');
}

const { server } = await startServer({ root: join(ROOT, 'dist'), port: PORT });
const browser = await chromium.launch();
let failed = false;
try {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light', locale: 'ko-KR' });
  // An analytics build in dist/ must not count these visits (tests/unit/no-analytics.test.ts).
  await blockAnalytics(context);
  for (const shot of SHOTS) {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${PORT}${shot.path}`, { waitUntil: 'load' });
    // The sticky site header would cover the clip on a full-page shot: keep it in the flow.
    await page.addStyleTag({ content: 'header.top { position: static !important; }' });
    await page.evaluate(() => document.fonts.ready);
    await shot.prepare(page);
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    // Page coordinates (a full-page clip), whatever the scroll position is after prepare().
    const y = await page.locator(shot.top).evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));
    const height = shot.bottom ? (await page.locator(shot.bottom).evaluate((el) => Math.round(el.getBoundingClientRect().bottom + window.scrollY))) + 16 - y : CLIP.height;
    const png = await page.screenshot({ clip: { x: 0, y, width: CLIP.width, height }, fullPage: true, animations: 'disabled', caret: 'hide' });
    await page.close();
    const webp = await toWebp(context, png);
    const file = join(ROOT, 'public', 'img', 'guide', shot.out);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, webp);
    const over = webp.length > MAX_BYTES;
    if (over) failed = true;
    console.log(`guide-shots: ${shot.out} ${CLIP.width}×${height} ${(webp.length / 1024).toFixed(1)} KB${over ? ' — OVER 80 KB' : ''}`);
  }
} finally {
  await browser.close();
  server.close();
}
if (failed) process.exit(1);
