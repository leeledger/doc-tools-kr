// Dist gate: Cloudflare Pages limits with headroom, no source maps, and the bundle budgets
// (brief Step 2 §6, Step 3 §4 and Polish P "Budgets"; gzip -9 sizes). Prints the budget table.
// Runs first in postbuild, before carry-assets, so the budgets judge the fresh build only.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import { autoframeOn } from './lib/autoframe.mjs';
import { API_PATH as CLOUD_API, CLAIM_FILE_RE, EXCEPTION_PAGES, EXCEPTION_RE, LOCAL_SCOPE_RE, QUALIFIER_RE, bgCloudOn, claimText, privacyGate, unqualifiedClaims } from './lib/bgcloud.mjs';
import { bgRemoveOn } from './lib/bgremove.mjs';
import { beaconPath } from './lib/beacon-path.mjs';
import { distDir, moduleEntries, publicEnv, staticClosure, walkFiles } from './lib/dist.mjs';
import { CF_MAX_FILES, MAX_FILE, MAX_FILES, WARN_FILES } from './lib/capacity.mjs';
import { DUP_LIMIT, articleText, duplicatePairs } from './lib/shingles.mjs';

const dist = distDir();
const KB = 1024;
/** The UI font weights (Polish P.12): one static instance each; no other weight may appear in the CSS. */
const UI_WEIGHTS = new Set(['400', '700', '800']);
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
// 전자서명·도장 이미지 (Sprint C, C1): the ink worker (5.05 KB gzip measured at C1 integration, after C1-core round 2
// added the ink colour; budget = measured + 20 %), and the page's controls (photo*.js, pad*.js and what only they
// import; 11.3 KB gzip measured, budget + 20 %), which load on first use only, never with the page.
budget('ink.worker*.js (stamp-signature)', match(/^_astro\/ink\.worker[^/]*\.js$/), 6.1 * KB);
{
  const html = pageHtml.get('stamp-signature/index.html');
  if (!html) errors.push('stamp-signature/index.html: no file found');
  else {
    const initial = new Set(initialJs(html));
    const controls = match(/^_astro\/(photo|pad)\.[\w-]{8}\.js$/);
    if (controls.some((f) => initial.has(f))) errors.push('the /stamp-signature/ controls (photo*.js, pad*.js) load with the page');
    budget('stamp-signature controls (photo*.js + pad*.js, lazy)', [...new Set(controls.flatMap((f) => staticClosure(dist, f)))].filter((f) => !initial.has(f)), 13.5 * KB);
  }
}
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
// 사진 배경 지우기 (Sprint C, C2; brief build order 2). Flag off (PUBLIC_BG_REMOVE): not one file, link or line about
// it ships. Flag on: the engine and model files have their own rows, the manifest's SHA-256s match the files, no other
// onnxruntime build (ort.all*, JSEP, JSPI, WebGL) ships, and the controller loads on first use only.
const bgOn = bgRemoveOn(env.PUBLIC_BG_REMOVE);
if (!bgOn) {
  for (const f of files) if (/onnxruntime|birefnet|remove-background/i.test(f.path)) errors.push(`${f.path}: 배경 지우기 file in a build with PUBLIC_BG_REMOVE off`);
  for (const f of match(/\.(html|xml|txt|json|webmanifest|m?js)$/)) if (read(f).includes('remove-background')) errors.push(`${f} names /remove-background/ in a build with PUBLIC_BG_REMOVE off`);
} else {
  const MiB = 1024 * KB;
  const ORT = 'vendor/onnxruntime-web/1.30.0/';
  const ortFiles = match(/^vendor\/onnxruntime-web\//);
  const expected = ['ort.webgpu.min.mjs', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm.part0', 'ort-wasm-simd-threaded.asyncify.wasm.part1', 'ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'].map((f) => ORT + f);
  if (ortFiles.slice().sort().join() !== expected.slice().sort().join()) errors.push(`vendor/onnxruntime-web/: ${ortFiles.join(', ')}; expected exactly ${expected.join(', ')}`);
  for (const f of files) if (/(^|\/)ort\.(all|min|jspi|webgl|bundle|node)|\.(jsep|jspi)\./.test(f.path)) errors.push(`${f.path}: only the native WebGPU and plain WASM onnxruntime builds may ship (no ort.all*, JSEP, JSPI, WebGL)`);
  // Engine scripts: the 1.30.0 sizes measured at C2 + 10 %.
  budget('ort.webgpu.min.mjs (raw)', [`${ORT}ort.webgpu.min.mjs`].filter((f) => ortFiles.includes(f)), 73 * KB, raw, 'raw');
  budget('ort-wasm-simd-threaded.asyncify.mjs (raw)', [`${ORT}ort-wasm-simd-threaded.asyncify.mjs`].filter((f) => ortFiles.includes(f)), 58.4 * KB, raw, 'raw');
  budget('ort.wasm.min.mjs (raw)', [`${ORT}ort.wasm.min.mjs`].filter((f) => ortFiles.includes(f)), 55.1 * KB, raw, 'raw');
  budget('ort-wasm-simd-threaded.mjs (raw)', [`${ORT}ort-wasm-simd-threaded.mjs`].filter((f) => ortFiles.includes(f)), 26.8 * KB, raw, 'raw');
  for (const part of match(/^vendor\/onnxruntime-web\/[^/]+\/ort-wasm-simd-threaded\.asyncify\.wasm\.part\d$/)) budget(`ORT asyncify wasm ${part.split('/').pop()} (raw)`, [part], 24 * MiB, raw, 'raw');
  budget('ORT plain wasm (raw)', match(/^vendor\/onnxruntime-web\/[^/]+\/ort-wasm-simd-threaded\.wasm$/), 15 * MiB, raw, 'raw');
  const modelDirs = [...new Set(match(/^vendor\/birefnet-lite-512\//).map((f) => f.split('/').slice(0, 3).join('/')))];
  if (modelDirs.length !== 1) errors.push(`vendor/birefnet-lite-512/: ${modelDirs.length} model version(s), expected exactly 1`);
  for (const dir of modelDirs) {
    let manifest = null;
    try {
      manifest = JSON.parse(read(`${dir}/manifest.json`).toString('utf8'));
    } catch {
      errors.push(`${dir}/manifest.json is missing or not JSON`);
    }
    if (manifest) {
      const parts = files.filter((f) => f.path.startsWith(`${dir}/`) && /^model\.part\d+$/.test(f.path.slice(dir.length + 1))).map((f) => f.path);
      if (parts.length !== manifest.parts.length) errors.push(`${dir}: ${parts.length} part file(s), the manifest lists ${manifest.parts.length}`);
      for (const p of manifest.parts) {
        const f = `${dir}/${p.name}`;
        if (!parts.includes(f)) continue;
        budget(`model ${p.name} (raw)`, [f], 24 * MiB, raw, 'raw');
        const sha = createHash('sha256').update(read(f)).digest('hex');
        if (sha !== p.sha256 || raw(f) !== p.bytes) errors.push(`${f}: SHA-256/bytes do not match manifest.json`);
      }
      budget('model total (raw)', parts, 101 * MiB, raw, 'raw');
      if (`${dir.split('/').pop()}` !== manifest.exportId) errors.push(`${dir}: directory is not the manifest exportId ${manifest.exportId}`);
    }
  }
  // Workers (measured at C2 + 20 %) and the lazy controller (bg*.js and what only it imports; 11.4 KB gzip measured).
  budget('infer.worker*.js (remove-background)', match(/^_astro\/infer\.worker[^/]*\.js$/), 1.3 * KB);
  budget('fusion.worker*.js (remove-background)', match(/^_astro\/fusion\.worker[^/]*\.js$/), 1 * KB);
  const html = pageHtml.get('remove-background/index.html');
  if (!html) errors.push('remove-background/index.html: no file found');
  else {
    const initial = new Set(initialJs(html));
    const controller = match(/^_astro\/bg\.[\w-]{8}\.js$/);
    if (controller.some((f) => initial.has(f))) errors.push('the /remove-background/ controller (bg*.js) loads with the page');
    budget('remove-background controller (bg*.js, lazy)', [...new Set(controller.flatMap((f) => staticClosure(dist, f)))].filter((f) => !initial.has(f)), 14 * KB);
    if (/rel="(preload|modulepreload|prefetch)"[^>]*(onnxruntime|birefnet)/.test(html)) errors.push('remove-background/index.html preloads the engine or the model');
  }
}
// C2-cloud (brief §7, §10, §11): the cloud path of 배경 지우기. Off: no call to /api/remove-bg in any file and no
// exception wording on any page. On: the privacy gate (officer + contact), the exception wording on exactly the four
// allowed pages, the 3항 section and officer line on /privacy/, and the cloud client never in the page's initial JS.
// Always: the spike's test photos (public/spike/) never ship.
for (const f of files) if (f.path.startsWith('spike/')) errors.push(`${f.path}: spike test photo in dist/`);
for (const e of privacyGate(env)) errors.push(e);
const cloudOn = bgCloudOn(env);
const exceptionPages = [...pageHtml].filter(([, html]) => EXCEPTION_RE.test(html.replace(/<[^>]+>/g, ''))).map(([p]) => p);
// C2-cloud round 2 (owner 2026-10-05): off, no exception or cloud-variant wording in any text file (the flag-off
// copy stays as it was); on, no site-wide "files never leave" claim without the exception next to it.
const claimFiles = match(CLAIM_FILE_RE).map((f) => [f, claimText(f, read(f).toString('utf8'))]);
if (!cloudOn) {
  for (const f of match(/\.(html|xml|txt|json|webmanifest|m?js)$/)) if (read(f).includes(CLOUD_API)) errors.push(`${f} calls ${CLOUD_API} in a build with PUBLIC_BG_CLOUD off`);
  for (const p of exceptionPages) errors.push(`${p}: 배경 지우기 exception wording in a build with PUBLIC_BG_CLOUD off`);
  for (const [f, text] of claimFiles) if (!exceptionPages.includes(f) && QUALIFIER_RE.test(text)) errors.push(`${f}: 배경 지우기 cloud wording in a build with PUBLIC_BG_CLOUD off`);
} else {
  for (const [f, text] of claimFiles) {
    if (LOCAL_SCOPE_RE.test(f)) continue;
    for (const c of unqualifiedClaims(text)) errors.push(`${f}: "files never leave" without the 배경 지우기 exception (PUBLIC_BG_CLOUD on): …${c}…`);
  }
  for (const p of exceptionPages) if (!EXCEPTION_PAGES.includes(p)) errors.push(`${p}: 배경 지우기 exception wording outside ${EXCEPTION_PAGES.join(', ')}`);
  for (const p of EXCEPTION_PAGES) if (!exceptionPages.includes(p)) errors.push(`${p}: no 배경 지우기 exception wording in a build with PUBLIC_BG_CLOUD on`);
  const privacy = pageHtml.get('privacy/index.html') ?? '';
  if (!privacy.includes('id="bg"')) errors.push('privacy/index.html: no 배경 지우기 section (id="bg")');
  if (!privacy.includes(env.PUBLIC_PRIVACY_OFFICER?.trim() || '\u0000')) errors.push('privacy/index.html: the 개인정보 보호책임자 is not named');
  const bgHtml = pageHtml.get('remove-background/index.html');
  const clients = match(/\.m?js$/).filter((f) => read(f).includes(CLOUD_API));
  if (!clients.length) errors.push(`no script calls ${CLOUD_API} in a build with PUBLIC_BG_CLOUD on`);
  // Brief §4: the cloud client is about 3 KB (1.3 KB gzip measured at C2-cloud).
  budget('cloud client (cloud*.js, lazy)', clients.filter((f) => /^_astro\/cloud\.[\w-]{8}\.js$/.test(f)), 3 * KB);
  if (bgHtml) {
    const initial = new Set(initialJs(bgHtml));
    for (const f of clients) if (initial.has(f)) errors.push(`${f}: the cloud client loads with /remove-background/ (it loads after the pick)`);
  }
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

// UI fonts (Polish P.12; 600 dropped in G2 ci-green): three static instances, ≤ 50 KB each and ≤ 190 KB together; exactly two preloads.
const uiFonts = match(/^_astro\/anolim-ui-\d+[^/]*\.woff2$/);
if (uiFonts.length !== 3) errors.push(`UI fonts: ${uiFonts.length} file(s), expected 3 (400, 700, 800)`);
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
    if (!['inherit', 'initial', 'unset'].includes(n) && !UI_WEIGHTS.has(n)) errors.push(`${css}: font-weight ${v} is not a UI font instance (400, 700, 800)`);
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
  // G2 A1: no two guide or hub articles are near-duplicates (5-char shingles, Jaccard < DUP_LIMIT; rewrite, never raise).
  const pages = [...pageHtml].filter(([p]) => /^guide\/[^/]+\/index\.html$/.test(p)).map(([p, html]) => [p.split('/')[1], articleText(html)]);
  const { max, over } = duplicatePairs(pages);
  console.log(`  guide similarity, max pair: ${max.a} ~ ${max.b} ${max.j.toFixed(3)} / ${DUP_LIMIT}`);
  for (const o of over) errors.push(`near-duplicate guides: ${o.a} ~ ${o.b} Jaccard ${o.j.toFixed(3)} ≥ ${DUP_LIMIT}`);
  // Phase-0 §2: the guide ad placeholders render nothing while ads are off.
  for (const [p, html] of pageHtml) if (/^guide\//.test(p) && html.includes('ad-slot')) errors.push(`${p}: an ad slot is rendered while ads are off`);
}
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
  // Nothing else may import the export chunk statically (it would be loaded, and precached, with that code).
  for (const js of match(/^_astro\/[^/]+\.js$/)) if (!exportChunk.includes(js) && exportChunk.some((e) => staticClosure(dist, js).includes(e))) errors.push(`${js} imports the HWP export chunk statically`);
  for (const js of exportChunk.flatMap((f) => staticClosure(dist, f))) if (read(js).includes('[ReadHuffmanCodeLengths]')) errors.push(`${js}: a Brotli decoder ships in the HWP export chunk (alias brotli/decompress.js)`);
}
// /hwp-viewer/ (G2 A0 "Budgets"): its first load is at most 4 KB gzip over /hwp-to-pdf/'s, and the viewer
// controls (page list, search, zoom: ui*.js and what it pulls in that the page does not) load with the first
// file, never with the page.
{
  const viewerHtml = pageHtml.get('hwp-viewer/index.html');
  const viewer = initialJs(viewerHtml ?? '');
  const converter = initialJs(pageHtml.get('hwp-to-pdf/index.html') ?? '');
  if (!viewerHtml) errors.push('hwp-viewer/index.html: no file found');
  else {
    const sum = (list) => list.reduce((a, p) => a + gz(p), 0);
    const extra = sum(viewer) - sum(converter);
    rows.push({ label: 'initial JS /hwp-viewer/ over /hwp-to-pdf/', size: Math.max(0, extra), limit: 4 * KB, unit: 'gzip' });
    if (extra > 4 * KB) errors.push(`/hwp-viewer/ initial JS is ${(extra / KB).toFixed(1)} KB gzip over /hwp-to-pdf/ (budget 4 KB)`);
    const ui = match(/^_astro\/ui\.[^/]*\.js$/);
    if (ui.some((u) => viewer.includes(u))) errors.push('the /hwp-viewer/ controls (ui*.js) load with the page');
    budget('hwp-viewer controls (ui*.js)', [...new Set(ui.flatMap((f) => staticClosure(dist, f)))].filter((f) => !viewer.includes(f)), 20 * KB);
  }
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
