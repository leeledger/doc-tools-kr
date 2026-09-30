// Dist gate: Cloudflare Pages limits with headroom, no source maps, and the bundle budgets
// (brief Step 2 §6, Step 3 §4 and Polish P "Budgets"; gzip -9 sizes). Prints the budget table.
// Runs first in postbuild, before carry-assets, so the budgets judge the fresh build only.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import { autoframeOn } from './lib/autoframe.mjs';
import { beaconPath } from './lib/beacon-path.mjs';
import { distDir, moduleEntries, publicEnv, staticClosure, walkFiles } from './lib/dist.mjs';
import { CF_MAX_FILES, MAX_FILE, MAX_FILES, WARN_FILES } from './lib/capacity.mjs';

const dist = distDir();
const KB = 1024;
/** The UI font weights (Polish P.12): one static instance each; no other weight may appear in the CSS. */
const UI_WEIGHTS = new Set(['400', '600', '700', '800']);
/** Copy that describes auto-framing; none of it may ship when PUBLIC_ID_PHOTO_AUTOFRAME is off. */
const AUTOFRAME_PHRASES = ['자동으로 잡아', '자동으로 맞춘', '자동 맞춤', '건너뛰고 직접 맞추기', '6 MB의 프로그램'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const files = walkFiles(dist);
const errors = [];
const warnings = [];
for (const f of files) {
  if (f.size >= MAX_FILE) errors.push(`${f.path} is ${(f.size / 1048576).toFixed(1)} MiB (limit < 24 MiB)`);
  if (f.path.endsWith('.map')) errors.push(`${f.path}: source maps must not ship`);
}
if (files.length > MAX_FILES) errors.push(`${files.length} files (limit ${MAX_FILES})`);
else if (files.length > WARN_FILES) warnings.push(`${files.length} files: above ${WARN_FILES.toLocaleString('en-US')}, the guard fails at ${MAX_FILES.toLocaleString('en-US')} (Cloudflare ${CF_MAX_FILES.toLocaleString('en-US')})`);

// Operator contact (Polish P.4): an invalid PUBLIC_CONTACT_EMAIL never ships.
const env = publicEnv();
const email = env.PUBLIC_CONTACT_EMAIL?.trim();
if (email && !EMAIL_RE.test(email)) errors.push(`PUBLIC_CONTACT_EMAIL "${email}" is not an email address`);
// Arch (Polish P round 2), kept by the owner in Polish Q: while the site processes no personal data it
// publishes no contact at all, but the error beacon or ads (both collect data) need a published contact
// first (and a full privacy policy with a privacy officer: BUILD-LOG Known Gaps).
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

const pageHtml = new Map(files.filter((f) => f.path.endsWith('.html') && !/^(naver|google)[0-9a-f]+.html$/.test(f.path)).map((f) => [f.path, read(f.path).toString('utf8')]));
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

// 여권·증명사진 (brief Step 4 §4). With PUBLIC_ID_PHOTO_AUTOFRAME off (or --no-mediapipe) not one MediaPipe
// byte may ship; otherwise the lazy face assets have their budgets and the model its SHA-256 pin.
const autoframe = autoframeOn(env.PUBLIC_ID_PHOTO_AUTOFRAME) && !process.argv.includes('--no-mediapipe');
budget('encode.worker*.js (id-photo)', match(/^_astro\/encode\.worker[^/]*\.js$/), 25 * KB);
if (!autoframe) {
  for (const f of files) if (/mediapipe|vision_bundle|vision_wasm|face_landmarker/i.test(f.path)) errors.push(`${f.path}: MediaPipe file in a build without auto-framing`);
  for (const js of match(/\.m?js$/)) if (/FaceLandmarker|odml\.pa\.googleapis/.test(read(js).toString('latin1'))) errors.push(`${js} contains MediaPipe code in a build without auto-framing`);
  // Step 4 round 2: a manual-only page never promises auto-framing (the lead, 사용 방법, FAQ, buttons).
  const idp = pageHtml.get('id-photo/index.html') ?? '';
  for (const phrase of AUTOFRAME_PHRASES) if (idp.includes(phrase)) errors.push(`id-photo/index.html says "${phrase}" in a build without auto-framing`);
} else {
  const MP = 'vendor/mediapipe/1.0.1/';
  const bundle = match(/^_astro\/vision_bundle[^/]*\.js$/);
  budget('MediaPipe chunk (vision_bundle*.js)', bundle, 50 * KB);
  budget('vision_wasm_internal.js', match(/^vendor\/mediapipe\/1\.0\.1\/vision_wasm_internal\.js$/), 90 * KB);
  budget('vision_wasm_nosimd_internal.js', match(/^vendor\/mediapipe\/1\.0\.1\/vision_wasm_nosimd_internal\.js$/), 90 * KB);
  budget('vision_wasm_internal.wasm (raw)', match(/^vendor\/mediapipe\/1\.0\.1\/vision_wasm_internal\.wasm$/), 12.2 * 1024 * KB, raw, 'raw');
  budget('vision_wasm_internal.wasm', match(/^vendor\/mediapipe\/1\.0\.1\/vision_wasm_internal\.wasm$/), 3.6 * 1024 * KB);
  budget('vision_wasm_nosimd_internal.wasm (raw)', match(/^vendor\/mediapipe\/1\.0\.1\/vision_wasm_nosimd_internal\.wasm$/), 11.4 * 1024 * KB, raw, 'raw');
  const models = match(/^vendor\/mediapipe\/models\/face_landmarker-[0-9a-f]{8}\.task$/);
  const pin = readFileSync(join(import.meta.dirname, '..', 'vendor-assets', 'mediapipe', 'SHA256SUMS'), 'utf8').match(/^([0-9a-f]{64})/m)?.[1];
  if (models.length !== 1) errors.push(`face_landmarker-*.task: ${models.length} file(s), expected exactly 1`);
  for (const m of models) {
    const sha = createHash('sha256').update(read(m)).digest('hex');
    if (sha !== pin) errors.push(`${m}: SHA-256 ${sha} does not match the pin ${pin}`);
    else rows.push({ label: 'face_landmarker-*.task (SHA-256 = pin)', size: raw(m), limit: Math.ceil(raw(m) / KB) * KB, unit: 'raw' });
  }
  // The lazy SIMD path a first auto-framing downloads: chunk + loader + wasm + model.
  budget('lazy total, SIMD path (chunk+loader+wasm+model)', [...bundle, `${MP}vision_wasm_internal.js`, `${MP}vision_wasm_internal.wasm`, ...models], 7.2 * 1024 * KB);
  if (files.some((f) => f.path.includes('vision_wasm_module_internal'))) errors.push('vision_wasm_module_internal.* must not ship');
}
// Test inputs never ship: no tests/ path and no file named like a committed corpus photo.
const corpusDir = join(import.meta.dirname, '..', 'tests', 'corpus', 'id-photo');
let corpusNames = [];
try {
  corpusNames = readdirSync(corpusDir).filter((f) => /\.(jpe?g|png)$/i.test(f));
} catch {
  // No corpus checked out.
}
for (const f of files) {
  if (/(^|\/)tests\//.test(f.path) || corpusNames.includes(f.path.split('/').pop())) errors.push(`${f.path}: test input in dist/`);
}
// Preset sources (brief Step 4 "Failure modes"): a warning, not a failure, when the check date is > 180 days old.
const retrieved = readFileSync(join(import.meta.dirname, '..', 'src', 'data', 'id-photo-presets.ts'), 'utf8').match(/export const RETRIEVED = '(\d{4}-\d{2}-\d{2})'/)?.[1];
if (!retrieved) errors.push('src/data/id-photo-presets.ts: RETRIEVED not found');
else {
  const age = Math.floor((Date.now() - Date.parse(`${retrieved}T00:00:00Z`)) / 86_400_000);
  if (age > 180) warnings.push(`id-photo presets were last checked ${retrieved} (${age} days ago): re-verify every source`);
}

// UI fonts (Polish P.12): four static instances, ≤ 50 KB each and ≤ 190 KB together; exactly two preloads.
const uiFonts = match(/^_astro\/anolim-ui-\d+[^/]*\.woff2$/);
if (uiFonts.length !== 4) errors.push(`UI fonts: ${uiFonts.length} file(s), expected 4 (400, 600, 700, 800)`);
for (const f of uiFonts) budget(`UI font ${f.slice(7)}`, [f], 50 * KB, raw, 'raw');
// 190 KB (Arch, Step 4 round 2; was 180, and 170 before Polish round 2): with the /id-photo/ copy the four
// faces are 179.1 KB, ~1 KB under 180, so the next tool's copy would have failed the build.
budget('UI fonts total', uiFonts, 190 * KB, raw, 'raw');
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
// Share images (Polish Q): one per og.json image, each ≤ 300 KB (Kakao, Facebook, X and Slack all accept that).
const ogImages = match(/^brand\/og-[a-z-]+\.png$/);
if (ogImages.length < 7) errors.push(`brand/og-*.png: ${ogImages.length} share images, expected one per og.json image (7)`);
for (const img of ogImages) budget(img, [img], 300 * KB, raw, 'raw');
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

// Guides (Growth G.3): little JS, small pages, share images ≤ 80 KB.
for (const [path, html] of pageHtml) {
  if (!/^guide\/[^/]+\/index\.html$/.test(path)) continue;
  budget(`guide HTML /${path.replace(/index\.html$/, '')}`, [path], 30 * KB);
  budget(`guide initial JS /${path.replace(/index\.html$/, '')}`, initialJs(html), 4 * KB);
}
if (![...pageHtml.keys()].some((p) => /^guide\/[^/]+\/index\.html$/.test(p))) errors.push('no guide page in dist/guide/');
for (const img of match(/^og\/guide\/[^/]+\.png$/)) budget(img, [img], 80 * KB, raw, 'raw');
{
  // The 404 suggestion script: the 404 page's JS minus the shared site script, ≤ 1 KB gzip.
  const site = new Set(initialJs(pageHtml.get('index.html') ?? ''));
  budget('404 suggestion script', initialJs(pageHtml.get('404.html') ?? '').filter((f) => !site.has(f)), 1 * KB);
}

// HWP PDF 변환 (brief Step 5 §4).
budget('hwp.worker*.js', match(/^_astro\/hwp\.worker[^/]*\.js$/), 90 * KB);
{
  // The viewer / post-processing chunk: lazy*.js plus the chunks it imports that the page does not.
  const initial = new Set(initialJs(pageHtml.get('hwp-to-pdf/index.html') ?? ''));
  const lazy = match(/^_astro\/lazy[.-][^/]*\.js$/);
  budget('hwp viewer chunk (lazy*.js)', [...new Set(lazy.flatMap((f) => staticClosure(dist, f)))].filter((f) => !initial.has(f)), 25 * KB);
  // HWP direct (SPIKE-HWP-DIRECT §6.10): the PDF export chunk (pdf-lib + fontkit + the writer), loaded on idle
  // after a document is shown or on the first click; everything it pulls in that the page does not.
  const exportChunk = match(/^_astro\/export-chunk[.-][^/]*\.js$/);
  budget('hwp PDF export chunk (export-chunk*.js)', [...new Set(exportChunk.flatMap((f) => staticClosure(dist, f)))].filter((f) => !initial.has(f)), 360 * KB);
  for (const js of exportChunk.flatMap((f) => staticClosure(dist, f))) if (read(js).includes('[ReadHuffmanCodeLengths]')) errors.push(`${js}: a Brotli decoder ships in the HWP export chunk (alias brotli/decompress.js)`);
}
count(/(^|\/)rhwp_bg[^/]*\.wasm$/, 1, 'rhwp_bg*.wasm');
budget('vendor/rhwp/*/rhwp_bg.wasm', match(/^vendor\/rhwp\/[^/]+\/rhwp_bg\.wasm$/), 10.5 * 1024 * KB, raw, 'raw');
// Quality 5 (about what a CDN uses on the fly; q11 takes a minute on 10 MB). q9 is 2.9 MiB, q4 3.3 MiB.
for (const w of match(/^vendor\/rhwp\/[^/]+\/rhwp_bg\.wasm$/)) rows.push({ label: '  (rhwp_bg.wasm brotli q5, reported)', size: brotliCompressSync(read(w), { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } }).length, limit: Infinity, unit: 'br' });
// 31 KB (Arch, Step 5 F4; the brief said 30): 865 unicode-range faces, and the unique range lists of the slices
// alone are 22.4 KB gzip; sorted by range the CSS is 30.3 KB.
budget('HWP font CSS (fonts/hwp/hwp-fonts.*.css)', match(/^fonts\/hwp\/hwp-fonts\.[^/]+\.css$/), 31 * KB);
{
  const slices = match(/^fonts\/hwp\/[^/]+@[^/]+\/[^/]+\.woff2$/).filter((f) => !/\/fallback[^/]*@/.test(f));
  const largestSlice = slices.reduce((a, f) => (raw(f) > raw(a) ? f : a), slices[0] ?? '');
  budget(`HWP font slice, largest (${slices.length} files)`, largestSlice ? [largestSlice] : [], 250 * KB, raw, 'raw');
}
// Every fallback face file (the base face and the HWP direct extended faces; .woff2 preview, .woff PDF).
for (const f of match(/^fonts\/hwp\/fallback[^/]*@[^/]+\/[^/]+\.woff2?$/)) budget(`HWP fallback face ${f.split('/').slice(-2).join('/')}`, [f], 60 * KB, raw, 'raw');
budget('HWP PDF face list (fonts/hwp/hwp-pdf-faces.*.json)', match(/^fonts\/hwp\/hwp-pdf-faces\.[^/]+\.json$/), 48 * KB);

rows.push({ label: `files (guard ${MAX_FILES.toLocaleString('en-US')} / CF ${CF_MAX_FILES.toLocaleString('en-US')})`, size: files.length * KB, limit: MAX_FILES * KB, unit: 'files', count: true });
console.log('check-dist: budgets');
for (const r of rows) {
  if (r.count) console.log(`  ${r.label.padEnd(44)} ${String(r.size / KB).padStart(7)}     / ${r.limit / KB}`);
  else console.log(`  ${r.label.padEnd(44)} ${(r.size / KB).toFixed(1).padStart(7)} KB  / ${Number.isFinite(r.limit) ? `${r.limit / KB} KB` : '-'} ${r.unit}`);
}

for (const w of warnings) console.warn(`check-dist: WARNING ${w}`);
const largest = files.reduce((a, f) => (f.size > a.size ? f : a), { path: '-', size: 0 });
if (errors.length) {
  console.error(`check-dist: FAIL\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-dist: OK — ${files.length} files, largest ${largest.path} ${(largest.size / 1048576).toFixed(2)} MiB`);
