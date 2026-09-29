// One-off generator for public/og.png (1200×630). Run manually: node scripts/gen-og.mjs
// Renders with the self-hosted Pretendard (run copy-vendor first) and screenshots it with Chromium.
import { chromium } from '@playwright/test';
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontCss = pathToFileURL(join(root, 'public/fonts/pretendard/pretendardvariable-dynamic-subset.css')).href;
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="${fontCss}">
<style>
html,body{margin:0}
body{width:1200px;height:630px;background:#0f766e;color:#fff;font-family:"Pretendard Variable",sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 96px;box-sizing:border-box}
.logo{display:flex;align-items:center;gap:28px}
h1{font-size:132px;font-weight:800;letter-spacing:-0.04em;margin:0;line-height:1}
p{font-size:52px;font-weight:600;margin:40px 0 0;letter-spacing:-0.02em;opacity:.95}
</style></head><body>
<div class="logo"><svg width="120" height="120" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#fff"/><path d="M10 9h8l4 4v10H10z" fill="none" stroke="#0f766e" stroke-width="2" stroke-linejoin="round"/><path d="M13 18l2.5 2.5L20 16" fill="none" stroke="#0f766e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><h1>안올림</h1></div>
<p>파일을 올리지 않는 서류 도구</p>
</body></html>`;
const out = join(root, 'public', 'og.png');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, type: 'png' });
await browser.close();
console.log(`og.png ${statSync(out).size} bytes`);
