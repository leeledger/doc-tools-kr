// Dist gate: Cloudflare Pages limits with headroom, no source maps, and the bundle budgets
// (brief Step 2 §6, Step 3 §4 and Polish P "Budgets"; gzip -9 sizes). Prints the budget table.
// Runs first in postbuild, before carry-assets, so the budgets judge the fresh build only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { beaconPath } from './lib/beacon-path.mjs';
import { distDir, moduleEntries, publicEnv, staticClosure, walkFiles } from './lib/dist.mjs';

const dist = distDir();
const MAX_FILE = 24 * 1024 * 1024;
const MAX_FILES = 15000;
const KB = 1024;
/** The UI font weights (Polish P.12): one static instance each; no other weight may appear in the CSS. */
const UI_WEIGHTS = new Set(['400', '600', '700', '800']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const files = walkFiles(dist);
const errors = [];
for (const f of files) {
  if (f.size >= MAX_FILE) errors.push(`${f.path} is ${(f.size / 1048576).toFixed(1)} MiB (limit < 24 MiB)`);
  if (f.path.endsWith('.map')) errors.push(`${f.path}: source maps must not ship`);
}
if (files.length > MAX_FILES) errors.push(`${files.length} files (limit ${MAX_FILES})`);

// Operator contact (Polish P.4): an invalid PUBLIC_CONTACT_EMAIL never ships.
const env = publicEnv();
const email = env.PUBLIC_CONTACT_EMAIL?.trim();
if (email && !EMAIL_RE.test(email)) errors.push(`PUBLIC_CONTACT_EMAIL "${email}" is not an email address`);
// Arch (Polish P round 2): the site may ship with "문의: 준비 중" while it processes no personal data, but
// the error beacon or ads (both collect data) need a published contact first.
const beaconOn = beaconPath(env.PUBLIC_ERROR_BEACON_PATH) !== '';
const adsOn = /export const ADS_ENABLED\s*=\s*true/.test(readFileSync(join(import.meta.dirname, '..', 'src', 'data', 'site.ts'), 'utf8'));
if ((beaconOn || adsOn) && !email) errors.push(`${beaconOn ? 'the error beacon' : 'ads'} is enabled but PUBLIC_CONTACT_EMAIL is not set (the privacy policy must name a contact first)`);

const read = (path) => readFileSync(join(dist, path));
const gz = (path) => gzipSync(read(path), { level: 9 }).length;
const raw = (path) => read(path).length;
const match = (re) => files.filter((f) => re.test(f.path)).map((f) => f.path);

const rows = [];
const budget = (label, paths, limit, measure = gz, unit = 'gzip') => {
  if (!paths.length) {
    errors.push(`${label}: no file found`);
    return;
  }
  const size = paths.reduce((a, p) => a + measure(p), 0);
  rows.push({ label, size, limit, unit });
  if (size > limit) errors.push(`${label} (${paths.join(' + ')}) is ${(size / KB).toFixed(1)} KB ${unit}, budget ${limit / KB} KB`);
};

const pageHtml = new Map(files.filter((f) => f.path.endsWith('.html')).map((f) => [f.path, read(f.path).toString('utf8')]));
const initialJs = (html) => [...new Set(moduleEntries(html).flatMap((e) => staticClosure(dist, e)))];

// Initial JS of each page: its module scripts plus their static imports (dynamic import() is lazy).
for (const [path, html] of pageHtml) {
  const js = initialJs(html);
  if (js.length) budget(`initial JS /${path.replace(/index\.html$/, '')}`, js, 30 * KB);
}
// The shared site script (menu, service-worker registration): the home page carries nothing else.
budget('shared site script (home initial JS)', initialJs(pageHtml.get('index.html') ?? ''), 4 * KB);

budget('compress.worker*.js', match(/^_astro\/compress\.worker[^/]*\.js$/), 330 * KB);
budget('vendor/qpdf/*/qpdf.wasm', match(/^vendor\/qpdf\/[^/]+\/qpdf\.wasm$/), 480 * KB);
budget('MozJPEG enc + dec wasm', match(/^_astro\/mozjpeg_(enc|dec)[^/]*\.wasm$/), 140 * KB);
budget('resize wasm', match(/^_astro\/squoosh_resize[^/]*\.wasm$/), 30 * KB);
budget('photo.worker*.js', match(/^_astro\/photo\.worker[^/]*\.js$/), 60 * KB);
for (const glue of match(/^_astro\/webp_enc[^/]*\.js$/)) budget(`WebP glue ${glue.slice(7)}`, [glue], 20 * KB);
for (const wasm of match(/^_astro\/webp_enc[^/]*\.wasm$/)) budget(`WebP wasm ${wasm.slice(7)}`, [wasm], 130 * KB);
budget('fflate chunk (zip*.js)', match(/^_astro\/zip[.-][^/]*\.js$/), 12 * KB);

// UI fonts (Polish P.12): four static instances, ≤ 50 KB each and ≤ 180 KB together; exactly two preloads.
const uiFonts = match(/^_astro\/anolim-ui-\d+[^/]*\.woff2$/);
if (uiFonts.length !== 4) errors.push(`UI fonts: ${uiFonts.length} file(s), expected 4 (400, 600, 700, 800)`);
for (const f of uiFonts) budget(`UI font ${f.slice(7)}`, [f], 50 * KB, raw, 'raw');
// 180 KB (Arch, round 2; was 170): the four faces were 169.4 KB, so the next copy change with new Hangul
// syllables would have failed the build.
budget('UI fonts total', uiFonts, 180 * KB, raw, 'raw');
for (const [path, html] of pageHtml) {
  const preloads = [...html.matchAll(/<link rel="preload"[^>]*as="font"[^>]*>/g)].length;
  if (preloads !== 2) errors.push(`${path}: ${preloads} font preload(s), expected exactly 2 (400 and 800)`);
}
for (const css of match(/^_astro\/[^/]*\.css$/)) {
  for (const m of read(css).toString('utf8').matchAll(/font-weight\s*:\s*([^;}]+)/g)) {
    const v = m[1].trim().replace(/\s*!important$/, '');
    const n = v === 'normal' ? '400' : v === 'bold' ? '700' : v;
    if (!['inherit', 'initial', 'unset'].includes(n) && !UI_WEIGHTS.has(n)) errors.push(`${css}: font-weight ${v} is not a UI font instance (400, 600, 700, 800)`);
  }
}

// Brand (Polish P.10).
budget('brand/og.png', match(/^brand\/og\.png$/), 150 * KB, raw, 'raw');
budget('favicon.ico', match(/^favicon\.ico$/), 20 * KB, raw, 'raw');
for (const icon of ['brand/apple-touch-icon.png', 'brand/icon-192.png', 'brand/icon-512.png', 'brand/icon-maskable-512.png', 'manifest.webmanifest']) {
  if (!files.some((f) => f.path === icon)) errors.push(`${icon} is missing`);
}

// The error beacon is off unless PUBLIC_ERROR_BEACON_PATH is a same-origin path (Polish P.18): no sendBeacon ships.
if (!beaconOn) {
  for (const js of match(/\.m?js$/)) if (read(js).includes('sendBeacon')) errors.push(`${js} contains sendBeacon while the error beacon is off`);
}

// Both workers share one MozJPEG encoder; each WebP build ships once.
const count = (re, want, label) => {
  const n = match(re).length;
  if (n !== want) errors.push(`${label}: ${n} file(s), expected exactly ${want}`);
};
count(/^_astro\/mozjpeg_enc[^/]*\.wasm$/, 1, 'mozjpeg_enc*.wasm');
count(/^_astro\/webp_enc-[^/]*\.wasm$/, 1, 'webp_enc*.wasm');
count(/^_astro\/webp_enc_simd-[^/]*\.wasm$/, 1, 'webp_enc_simd*.wasm');

console.log('check-dist: budgets');
for (const r of rows) console.log(`  ${r.label.padEnd(44)} ${(r.size / KB).toFixed(1).padStart(7)} KB  / ${r.limit / KB} KB ${r.unit}`);

const largest = files.reduce((a, f) => (f.size > a.size ? f : a), { path: '-', size: 0 });
if (errors.length) {
  console.error(`check-dist: FAIL\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-dist: OK — ${files.length} files, largest ${largest.path} ${(largest.size / 1048576).toFixed(2)} MiB`);
