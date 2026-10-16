// Dist gate: Cloudflare Pages limits with headroom, no source maps, and the bundle budgets
// (brief Step 2 §6, Step 3 §4 and Polish P "Budgets"; gzip -9 sizes). Prints the budget table.
// Runs first in postbuild, before carry-assets, so the budgets judge the fresh build only.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import { autoframeOn } from './lib/autoframe.mjs';
import { BEACON_SRC, analyticsToken } from './lib/analytics.mjs';
import { GA_LOADER, gaId, loaderSource } from './lib/ga.mjs';
import { API_PATH as CLOUD_API, CLAIM_FILE_RE, EXCEPTION_PAGES, EXCEPTION_RE, LOCAL_SCOPE_RE, QUALIFIER_RE, bgCloudOn, claimText, privacyGate, unqualifiedClaims } from './lib/bgcloud.mjs';
import { bgRemoveOn } from './lib/bgremove.mjs';
import { ADDR_EN_PATH, API_PATH as ADDR_API, addrEnOn, privacyGate as addrEnGate } from './lib/addren.mjs';
import { GUIDE_OUT, TOOL_OUT, USAGE_PATH, usageOn, usageSample } from './lib/usage.mjs';
import { distDir, moduleEntries, publicEnv, staticClosure, walkFiles } from './lib/dist.mjs';
import { CF_MAX_FILES, MAX_FILE, MAX_FILES, WARN_FILES } from './lib/capacity.mjs';
import { headMeta, metaLen, metaProblems } from './lib/meta-length.mjs';
import { DUP_LIMIT, articleText, duplicatePairs } from './lib/shingles.mjs';
import { rangeSet, systemFontSelectors, uncovered, visibleText } from './lib/fontcover.mjs';
import { coupangProblems, disclosureStrings, sponsoredProblems } from './lib/out-links-check.mjs';
import { EMBED_PAGE_RE, embedHeaderProblems, embedPageProblems } from './lib/embed-check.mjs';
import { EN_PAGE_RE, enProblems } from './lib/en-check.mjs';
import { buildServiceWorker, precacheList } from './gen-sw.mjs';

const dist = distDir();
const KB = 1024;
const STAMP_CONTROLLER_KB = 13.6;
/** /english-name/ initial JS gzip (ROMANIZE1016 D7: measured + 20 %, < 30 KB; BUILD-LOG R2). */
const ENGLISH_NAME_INITIAL_KB = 22.2;
/** The UI font weights (Polish P.12; 700 retired in LCP round 2): one static instance each; no other weight may appear in the CSS. */
const UI_WEIGHTS = new Set(['400', '800']);
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
// Visitor counts (owner 2026-10-05): a token that is not one never ships; with one, every page carries the beacon.
let analytics = '';
try {
  analytics = analyticsToken(env.PUBLIC_CF_ANALYTICS_TOKEN);
} catch (e) {
  errors.push(e.message);
}
// Google Analytics 4 (owner 2026-10-08): an ID that is not one never ships.
let ga = '';
try {
  ga = gaId(env.PUBLIC_GA_ID);
} catch (e) {
  errors.push(e.message);
}
// Arch (Polish P round 2), kept by the owner in Polish Q: while the site processes no personal data it
// publishes no contact at all, but usage statistics or ads (both collect data) need a published contact
// first (and a full privacy policy with a privacy officer: BUILD-LOG Known Gaps).
// Usage statistics (brief USAGE) replaced the error beacon: a stale PUBLIC_ERROR_BEACON_PATH would silently do nothing.
if (env.PUBLIC_ERROR_BEACON_PATH?.trim()) errors.push('PUBLIC_ERROR_BEACON_PATH is retired; use PUBLIC_USAGE_STATS=1');
const usageStats = usageOn(env.PUBLIC_USAGE_STATS);
try {
  usageSample(env.PUBLIC_USAGE_SAMPLE);
} catch (e) {
  errors.push(e.message);
}
const adsOn = /export const ADS_ENABLED\s*=\s*true/.test(readFileSync(join(import.meta.dirname, '..', 'src', 'data', 'site.ts'), 'utf8'));
if ((usageStats || adsOn) && !email) errors.push(`${usageStats ? 'usage statistics are' : 'ads are'} enabled but PUBLIC_CONTACT_EMAIL is not set (the privacy policy must name a contact first)`);

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
for (const [p, html] of pageHtml) {
  // The embed widget (REV5) never carries it: embedPageProblems below.
  if (EMBED_PAGE_RE.test(p)) continue;
  const has = html.includes(BEACON_SRC);
  if (analytics && !has) errors.push(`${p}: no Cloudflare Web Analytics beacon although PUBLIC_CF_ANALYTICS_TOKEN is set`);
  if (!analytics && has) errors.push(`${p}: Cloudflare Web Analytics beacon although PUBLIC_CF_ANALYTICS_TOKEN is not set`);
}
// SEO-LENGTH: every page (noindex 404/offline included) has a title of at most 40 code points and a description of
// 40–80, og/twitter consistent with them (scripts/lib/meta-length.mjs).
// EN1: English pages have their own limits (meta-length.mjs EN_LIMITS) and their own report line.
const metaMax = { ko: { title: { n: 0, p: '' }, description: { n: 0, p: '' } }, en: { title: { n: 0, p: '' }, description: { n: 0, p: '' } } };
for (const [p, html] of pageHtml) {
  errors.push(...metaProblems(p, html));
  const m = headMeta(html);
  const max = metaMax[EN_PAGE_RE.test(p) ? 'en' : 'ko'];
  for (const k of ['title', 'description']) if (m[k] && metaLen(m[k]) > max[k].n) max[k] = { n: metaLen(m[k]), p };
}
for (const [lang, max] of Object.entries(metaMax)) console.log(`check-dist: meta${lang === 'en' ? ' (en)' : ''}, longest title ${max.title.n} (${max.title.p}), longest description ${max.description.n} (${max.description.p})`);
// Google Analytics 4: on, every page has exactly one marked /ga.js tag, before its module scripts (so it reads the URL
// first), and dist/ga.js is the loader for this ID; on or off, no page loads gtag.js itself or calls gtag inline.
// Off, nothing of it ships at all.
const GA_TAG = /<script\b[^>]*\bsrc="\/ga\.js"[^>]*>/g;
for (const [p, html] of pageHtml) {
  const tags = html.match(GA_TAG) ?? [];
  // EN1: English pages never carry the tag (scripts/lib/en-check.mjs rule a), GA on or off; the two every-page rules
  // below still apply to them.
  if (EN_PAGE_RE.test(p)) {
    if (tags.length) errors.push(`${p}: Google Analytics tag on an English page`);
  } else if (ga && !EMBED_PAGE_RE.test(p)) {
    if (tags.length !== 1 || !tags[0].includes(' data-site-ga')) errors.push(`${p}: ${tags.length} Google Analytics tags (expected exactly one ${GA_LOADER} tag with data-site-ga)`);
    else {
      const firstModule = html.indexOf('type="module"');
      if (firstModule >= 0 && html.indexOf(tags[0]) > firstModule) errors.push(`${p}: the ${GA_LOADER} tag comes after a module script`);
    }
  } else if (tags.length) errors.push(`${p}: Google Analytics tag although PUBLIC_GA_ID is not set`);
  if (html.includes('googletagmanager')) errors.push(`${p}: names googletagmanager (Google Analytics loads only through ${GA_LOADER})`);
  if (html.includes('gtag(')) errors.push(`${p}: inline gtag( call (Google Analytics loads only through ${GA_LOADER})`);
}
const gaFile = files.some((f) => f.path === 'ga.js');
if (ga) {
  const src = gaFile ? read('ga.js').toString('utf8') : '';
  if (!gaFile) errors.push('PUBLIC_GA_ID is set but dist/ga.js is missing (postbuild gen-ga)');
  else if (src !== loaderSource(ga) || !src.includes('allow_google_signals:false') || !src.includes('allow_ad_personalization_signals:false')) errors.push(`dist/ga.js is not the loader for ${ga}`);
} else if (!env.PUBLIC_GA_ID?.trim()) {
  if (gaFile) errors.push('dist/ga.js ships although PUBLIC_GA_ID is not set');
  const TEXT = /\.(html|m?js|css|txt|xml|json|webmanifest|svg)$|^_headers$|^_redirects$/;
  for (const f of files) if (TEXT.test(f.path) && read(f.path).includes('googletagmanager')) errors.push(`${f.path}: names googletagmanager although PUBLIC_GA_ID is not set`);
}
const initialJs = (html) => [...new Set(moduleEntries(html).flatMap((e) => staticClosure(dist, e)))];
/** The chunks a module imports with a relative import(`./x.js`) (lazy controllers; Vite writes a template literal). */
const dynamicImports = (path) => [...read(path).toString('utf8').matchAll(/import\(\s*["'`](\.{1,2}\/[^"'`]+\.js)["'`]\s*\)/g)].map((m) => posix.join(posix.dirname(path), m[1]));
/** Every chunk a page can load: its initial JS and, transitively, every chunk imported dynamically and their imports. */
const pageGraph = (html) => {
  const seen = new Set();
  const visit = (f) => {
    if (seen.has(f)) return;
    for (const c of staticClosure(dist, f)) {
      seen.add(c);
      for (const d of dynamicImports(c)) visit(d);
    }
  };
  for (const f of initialJs(html)) visit(f);
  return [...seen];
};

// 무료 임베드 위젯 (REV5 R5.7): every widget page is noindex with the tool page as canonical, has no link block, share,
// 이어서 하기, ad, GA or Web Analytics tag, never registers the service worker and is not in the sitemap; only its
// _headers block allows framing, after detaching the site-wide policy (gen-headers runs after this: dist/_headers is
// still the copy of public/_headers here).
{
  const sitemap = files.some((f) => f.path === 'sitemap.xml') ? read('sitemap.xml').toString('utf8') : '';
  const widgets = [...pageHtml].filter(([p]) => EMBED_PAGE_RE.test(p));
  if (!widgets.length) errors.push('no embed widget page in dist/embed/');
  for (const [p, html] of widgets) errors.push(...embedPageProblems(p, html, { initialJs: initialJs(html).map((f) => read(f).toString('utf8')).join(' '), sitemap }));
  if (files.some((f) => f.path === '_headers')) errors.push(...embedHeaderProblems(read('_headers').toString('utf8')));
  else errors.push('dist/_headers is missing');
}

// English pages (EN1, brief EN decision 12): every rule in scripts/lib/en-check.mjs.
{
  const sitemap = files.some((f) => f.path === 'sitemap.xml') ? read('sitemap.xml').toString('utf8') : '';
  const graphText = (html) => pageGraph(html).map((f) => read(f).toString('utf8')).join('\n');
  errors.push(...enProblems(pageHtml, { graphText, sitemap, precache: precacheList(dist).urls }));
}

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
// 사진 PDF 변환 (TOOLS4 T2): the worker carries pdf-lib (243.9 KB gzip measured, budget + 20 %, brief decision 11); the controller
// (the controller*.js chunk that owns #jp-remove-bad, and what only it imports) loads on the first interaction, never with the page,
// and no initial script of the page names the worker or pdf-lib (controller 10.9 KB gzip measured, budget + 20 %).
budget('images.worker*.js (jpg-to-pdf)', match(/^_astro\/images\.worker[^/]*\.js$/), 293 * KB);
{
  const html = pageHtml.get('jpg-to-pdf/index.html');
  if (!html) errors.push('jpg-to-pdf/index.html: no file found');
  else {
    const initial = new Set(initialJs(html));
    const controller = match(/^_astro\/controller\.[\w-]{8}\.js$/).filter((f) => read(f).includes('jp-remove-bad'));
    if (controller.length !== 1) errors.push(`jpg-to-pdf controller: ${controller.length} chunk(s) name #jp-remove-bad, expected 1`);
    if (controller.some((f) => initial.has(f))) errors.push('the /jpg-to-pdf/ controller loads with the page');
    for (const f of initial) if (/images\.worker|PDFDocument/.test(read(f).toString('utf8'))) errors.push(`${f}: pdf-lib or the images worker in the /jpg-to-pdf/ initial JS`);
    budget('jpg-to-pdf controller (lazy)', [...new Set(controller.flatMap((f) => staticClosure(dist, f)))].filter((f) => !initial.has(f)), 13.1 * KB);
  }
}
// PDF JPG 변환 (TOOLS4 T3): no worker of its own (pdf.js renders through its vendored worker). The controller (the
// controller*.js chunk that owns #pj-range-error, and what only it imports, fflate's Zip included) loads on the first
// interaction, never with the page, and no initial script of the page names pdf.js (controller 12.1 KB gzip measured, budget + 20 %).
{
  const html = pageHtml.get('pdf-to-jpg/index.html');
  if (!html) errors.push('pdf-to-jpg/index.html: no file found');
  else {
    const initial = new Set(initialJs(html));
    const controller = match(/^_astro\/controller\.[\w-]{8}\.js$/).filter((f) => read(f).includes('pj-range-error'));
    if (controller.length !== 1) errors.push(`pdf-to-jpg controller: ${controller.length} chunk(s) name #pj-range-error, expected 1`);
    if (controller.some((f) => initial.has(f))) errors.push('the /pdf-to-jpg/ controller loads with the page');
    for (const f of initial) if (/pdfjs|pdf\.worker|getDocument|ZipPassThrough/.test(read(f).toString('utf8'))) errors.push(`${f}: pdf.js or the ZIP code in the /pdf-to-jpg/ initial JS`);
    budget('pdf-to-jpg controller (lazy)', [...new Set(controller.flatMap((f) => staticClosure(dist, f)))].filter((f) => !initial.has(f)), 14.5 * KB);
  }
}
// PDF 암호 해제·설정 (TOOLS4 T4): the worker carries qpdf's loader and pdf-lib (signature check); qpdf.wasm itself is a
// vendored asset (240.7 KB gzip measured, budget + 20 %). The controller (the controller*.js chunk that owns #pp-lock-error, and what only it imports) loads on the
// first interaction, never with the page, and no initial script of the page names pdf.js, qpdf or the worker
// (controller 5.0 KB gzip measured, budget + 20 %).
budget('password.worker*.js (pdf-password)', match(/^_astro\/password\.worker[^/]*\.js$/), 289 * KB);
{
  const html = pageHtml.get('pdf-password/index.html');
  if (!html) errors.push('pdf-password/index.html: no file found');
  else {
    const initial = new Set(initialJs(html));
    const controller = match(/^_astro\/controller\.[\w-]{8}\.js$/).filter((f) => read(f).includes('pp-lock-error'));
    if (controller.length !== 1) errors.push(`pdf-password controller: ${controller.length} chunk(s) name #pp-lock-error, expected 1`);
    if (controller.some((f) => initial.has(f))) errors.push('the /pdf-password/ controller loads with the page');
    for (const f of initial) if (/pdfjs|pdf\.worker|getDocument|password\.worker|qpdf|PDFDocument/.test(read(f).toString('utf8'))) errors.push(`${f}: pdf.js, qpdf or the password worker in the /pdf-password/ initial JS`);
    budget('pdf-password controller (lazy)', [...new Set(controller.flatMap((f) => staticClosure(dist, f)))].filter((f) => !initial.has(f)), 6 * KB);
  }
}
// PDF 나누기·쪽 편집 (TOOLS5 U2): no worker of its own (the PDF 합치기 merge.worker saves). The controller (the controller*.js
// chunk that owns #ps-ranges-error, and what only it imports, fflate's Zip included) loads on the first interaction, never
// with the page, and no initial script of the page names pdf.js, pdf-lib, the merge worker or the ZIP code
// (controller 17.3 KB gzip measured with reorder and fflate's Zip, budget + 20 %).
{
  const html = pageHtml.get('pdf-split/index.html');
  if (!html) errors.push('pdf-split/index.html: no file found');
  else {
    const initial = new Set(initialJs(html));
    const controller = match(/^_astro\/controller\.[\w-]{8}\.js$/).filter((f) => read(f).includes('ps-ranges-error'));
    if (controller.length !== 1) errors.push(`pdf-split controller: ${controller.length} chunk(s) name #ps-ranges-error, expected 1`);
    if (controller.some((f) => initial.has(f))) errors.push('the /pdf-split/ controller loads with the page');
    for (const f of initial) if (/pdfjs|pdf\.worker|getDocument|merge\.worker|PDFDocument|ZipPassThrough/.test(read(f).toString('utf8'))) errors.push(`${f}: pdf.js, pdf-lib, the merge worker or the ZIP code in the /pdf-split/ initial JS`);
    budget('pdf-split controller (lazy)', [...new Set(controller.flatMap((f) => staticClosure(dist, f)))].filter((f) => !initial.has(f)), 20.8 * KB);
  }
}
// PDF 서명·도장 넣기 (TOOLS5 U3): no worker of its own (the PDF 합치기 merge.worker draws the picture, its `sign` message).
// The controller (the controller*.js chunk that owns #sg-range-error, and what only it imports) loads on the first
// interaction or with a picture handed over from /stamp-signature/, never with the page; no initial script of the page
// names pdf.js, pdf-lib or the merge worker (controller 15.3 KB gzip measured with the shared decode/sniff, budget + 20 %).
{
  const html = pageHtml.get('pdf-sign/index.html');
  if (!html) errors.push('pdf-sign/index.html: no file found');
  else {
    const initial = new Set(initialJs(html));
    const controller = match(/^_astro\/controller\.[\w-]{8}\.js$/).filter((f) => read(f).includes('sg-range-error'));
    if (controller.length !== 1) errors.push(`pdf-sign controller: ${controller.length} chunk(s) name #sg-range-error, expected 1`);
    if (controller.some((f) => initial.has(f))) errors.push('the /pdf-sign/ controller loads with the page');
    for (const f of initial) if (/pdfjs|pdf\.worker|getDocument|merge\.worker|PDFDocument/.test(read(f).toString('utf8'))) errors.push(`${f}: pdf.js, pdf-lib or the merge worker in the /pdf-sign/ initial JS`);
    budget('pdf-sign controller (lazy)', [...new Set(controller.flatMap((f) => staticClosure(dist, f)))].filter((f) => !initial.has(f)), 18.4 * KB);
  }
}
// 도장 만들기 (STAMP1015 S2): the controller (the controller*.js chunk that owns #sm-panel-note, and what only it imports)
// loads after load + idle or on the first interaction, never with the page; the HWP font CSS is injected by it, so the
// page HTML has no hwp-fonts link and no /fonts/hwp/ preload, and no initial script names them. The page never says what
// the tool does not do (D9 / Trust row: no 「법적 효력이 있습니다 / 있어요 / 있는」, 「인감 대신」, 「인감 등록」, 「인감으로 쓸 수」;
// FAQ 2's question 「…있나요?」 passes). Budget: controller
// STAMP_CONTROLLER_KB gzip (measured + 20 %, BUILD-LOG STAMP1015 S2).
{
  const html = pageHtml.get('stamp-maker/index.html');
  if (!html) errors.push('stamp-maker/index.html: no file found');
  else {
    const initial = new Set(initialJs(html));
    const controller = match(/^_astro\/controller\.[\w-]{8}\.js$/).filter((f) => read(f).includes('sm-panel-note'));
    if (controller.length !== 1) errors.push(`stamp-maker controller: ${controller.length} chunk(s) name #sm-panel-note, expected 1`);
    if (controller.some((f) => initial.has(f))) errors.push('the /stamp-maker/ controller loads with the page');
    if (/hwp-fonts|\/fonts\/hwp\//.test(html)) errors.push('stamp-maker/index.html: links or preloads the HWP fonts (the controller injects them)');
    for (const f of initial) if (/\/fonts\/hwp\/|Anolim HWP/.test(read(f).toString('utf8'))) errors.push(`${f}: the HWP fonts in the /stamp-maker/ initial JS`);
    const text = html.replace(/<[^>]+>/g, '');
    for (const bad of ['법적 효력이 있습니다', '법적 효력이 있어요', '법적 효력이 있는', '인감 대신', '인감 등록', '인감으로 쓸 수']) if (text.includes(bad)) errors.push(`stamp-maker/index.html: says 「${bad}」 (brief D9)`);
    budget('stamp-maker controller (lazy)', [...new Set(controller.flatMap((f) => staticClosure(dist, f)))].filter((f) => !initial.has(f)), STAMP_CONTROLLER_KB * KB);
    // Round 2 (review Must Fix 1): every tile shows a build-time sample picture until the controller paints it; 12 files,
    // 30 KB at most, each referenced by its tile and by no other page (so none can enter the precache through a precached
    // page; /stamp-maker/ itself is not precached).
    const samples = match(/^stamp-samples\/[a-z-]+\.[0-9a-f]{8}\.png$/);
    if (samples.length !== 12) errors.push(`stamp-samples: ${samples.length} file(s), expected 12`);
    const tiles = [...html.matchAll(/<button[^>]*class="sm-tile"[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]);
    if (tiles.length !== 12) errors.push(`stamp-maker/index.html: ${tiles.length} tile(s), expected 12`);
    for (const t of tiles) {
      const src = /<img data-src="\/(stamp-samples\/[^"]+)"[^>]*>/.exec(t);
      if (!src || !samples.includes(src[1])) errors.push(`stamp-maker/index.html: a tile without its sample picture (${/data-style="([^"]+)"/.exec(t)?.[1]})`);
      else if (!/width="88"/.test(src[0]) || !/height="88"/.test(src[0]) || !/alt=""/.test(src[0]) || !/loading="lazy"/.test(src[0])) errors.push(`stamp-maker/index.html: ${src[1]} needs width/height 88, alt="" and loading="lazy"`);
    }
    for (const [p, h] of pageHtml) if (p !== 'stamp-maker/index.html' && h.includes('/stamp-samples/')) errors.push(`${p}: references the stamp-maker sample pictures`);
    budget('stamp-samples/*.png (12 tile pictures)', samples, 30 * KB, raw, 'raw');
  }
}
// PDF 글자 넣기·편집 (TOOLS1015 E1): the controller (the controller*.js chunk that owns #ed-text-error, and what only it
// imports, the shared page stage included) loads on the first interaction, never with the page; no initial script of the
// page names pdf.js, pdf-lib, fontkit or the edit worker. edit.worker carries pdf-lib, fontkit and the face table, never
// merge.worker's other jobs and never a Brotli decoder (alias brotli/decompress.js); merge.worker never carries fontkit
// (marker: fontkit's GSUB table name). Budgets: controller 15.4 KB gzip measured + 20 %; the worker 335.1 KB gzip measured,
// + 20 % would pass the HWP export chunk's 360 KB, so 360 KB (brief: never above it).
{
  const html = pageHtml.get('pdf-edit/index.html');
  if (!html) errors.push('pdf-edit/index.html: no file found');
  else {
    const initial = new Set(initialJs(html));
    const controller = match(/^_astro\/controller\.[\w-]{8}\.js$/).filter((f) => read(f).includes('ed-text-error'));
    if (controller.length !== 1) errors.push(`pdf-edit controller: ${controller.length} chunk(s) name #ed-text-error, expected 1`);
    if (controller.some((f) => initial.has(f))) errors.push('the /pdf-edit/ controller loads with the page');
    for (const f of initial) if (/pdfjs|pdf\.worker|getDocument|edit\.worker|merge\.worker|PDFDocument|GSUB/.test(read(f).toString('utf8'))) errors.push(`${f}: pdf.js, pdf-lib, fontkit or a PDF worker in the /pdf-edit/ initial JS`);
    budget('pdf-edit controller (lazy)', [...new Set(controller.flatMap((f) => staticClosure(dist, f)))].filter((f) => !initial.has(f)), 18.5 * KB);
  }
  const editWorker = match(/^_astro\/edit\.worker[^/]*\.js$/);
  if (editWorker.length !== 1) errors.push(`edit.worker: ${editWorker.length} file(s), expected 1`);
  budget('edit.worker*.js (pdf-edit)', [...new Set(editWorker.flatMap((f) => staticClosure(dist, f)))], 360 * KB);
  for (const js of editWorker.flatMap((f) => staticClosure(dist, f))) if (read(js).includes('[ReadHuffmanCodeLengths]')) errors.push(`${js}: a Brotli decoder ships in edit.worker (alias brotli/decompress.js)`);
  for (const js of match(/^_astro\/merge\.worker[^/]*\.js$/)) if (read(js).includes('GSUB')) errors.push(`${js}: fontkit in merge.worker (it belongs to edit.worker)`);
}
// 사진 JPG 변환 (TOOLS5 U1): no worker (canvas on the main thread). The controller (the controller*.js chunk that owns
// #ij-quality-group, and what only it imports, fflate's Zip included) loads on the first interaction, never with the page;
// no initial script of the page names the ZIP code or @jsquash/webp, and the WebP fallback (@jsquash/webp and its wasm)
// is not in the controller's static imports either: webp.worker loads only when the browser cannot save WebP itself
// (controller 18.3 KB gzip measured with the shared decode/sniff/strip/raster and fflate's Zip, budget + 20 %; webp.worker
// 9.3 KB gzip measured, budget + 20 %).
budget('webp.worker*.js (image-to-jpg WebP fallback)', match(/^_astro\/webp\.worker[^/]*\.js$/), 11.2 * KB);
// EN1: the Korean and the English page each load their own lazy chunk (ko/controller.ts, en/controller.ts: the shared
// controller bound to a catalog), found by the page's dynamic import; the budget covers that chunk and what it imports
// that the page does not, so the catalog counts on both pages.
for (const page of ['image-to-jpg/index.html', 'en/image-to-jpg/index.html']) {
  const html = pageHtml.get(page);
  if (!html) {
    errors.push(`${page}: no file found`);
    continue;
  }
  const initial = new Set(initialJs(html));
  const lazy = [...new Set([...initial].flatMap(dynamicImports))].filter((f) => staticClosure(dist, f).some((c) => read(c).includes('ij-quality-group')));
  if (lazy.length !== 1) errors.push(`${page}: ${lazy.length} lazy chunk(s) lead to the controller that names #ij-quality-group, expected 1`);
  if (lazy.some((f) => initial.has(f)) || [...initial].some((f) => read(f).includes('ij-quality-group'))) errors.push(`the /${page.replace(/index\.html$/, '')} controller loads with the page`);
  for (const f of initial) if (/ZipPassThrough|webp_enc|wasm-feature-detect/.test(read(f).toString('utf8'))) errors.push(`${f}: the ZIP code or the WebP encoder in the /${page.replace(/index\.html$/, '')} initial JS`);
  const closure = [...new Set(lazy.flatMap((f) => staticClosure(dist, f)))].filter((f) => !initial.has(f));
  for (const f of closure) if (/webp_enc|mozjpeg_enc/.test(read(f).toString('utf8'))) errors.push(`${f}: an image codec in the /${page.replace(/index\.html$/, '')} controller's static imports (the WebP fallback is its own worker)`);
  budget(`${page.startsWith('en/') ? 'en/' : ''}image-to-jpg controller (lazy)`, closure, 22 * KB);
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
  // Workers (measured at C2 + 20 %) and the lazy controller (bg*.js and what only it imports; 11.4 KB gzip at C2, 14.1 KB after TOOLS4 T2).
  // 14.5 KB (TOOLS4 T2, flagged for Arch): the controller measured 14.0 / 14 before T2; the /jpg-to-pdf/ controller
  // shares sniff.ts and decode.ts with it, so they became their own chunks and the import overhead made it 14.1 KB.
  budget('infer.worker*.js (remove-background)', match(/^_astro\/infer\.worker[^/]*\.js$/), 1.3 * KB);
  budget('fusion.worker*.js (remove-background)', match(/^_astro\/fusion\.worker[^/]*\.js$/), 1 * KB);
  const html = pageHtml.get('remove-background/index.html');
  if (!html) errors.push('remove-background/index.html: no file found');
  else {
    const initial = new Set(initialJs(html));
    const controller = match(/^_astro\/bg\.[\w-]{8}\.js$/);
    if (controller.some((f) => initial.has(f))) errors.push('the /remove-background/ controller (bg*.js) loads with the page');
    budget('remove-background controller (bg*.js, lazy)', [...new Set(controller.flatMap((f) => staticClosure(dist, f)))].filter((f) => !initial.has(f)), 14.5 * KB);
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
// 영문주소 변환기 (ADDREN1016 decisions 2, 3, 6): the privacy gate; the secret JUSO_EN_KEY (a Pages secret read only by
// functions/api/addr-en.ts) and the upstream address never reach a shipped file, its name included; off, nothing of
// the tool ships: no page, no call to /api/addr-en, no tool name.
for (const e of addrEnGate(env)) errors.push(e);
const addrEn = addrEnOn(env);
{
  const secret = process.env.JUSO_EN_KEY?.trim();
  for (const f of files) {
    const buf = read(f.path);
    if (buf.includes('JUSO_EN_KEY')) errors.push(`${f.path}: names JUSO_EN_KEY (the key is a Pages secret for the Function only)`);
    if (secret && secret.length >= 8 && buf.includes(secret)) errors.push(`${f.path}: contains the JUSO_EN_KEY value`);
    if (buf.includes('juso.go.kr/addrlink')) errors.push(`${f.path}: names the 영문주소 API address (only the Function calls it)`);
  }
}
// A2: the outbound wording 「행정안전부 주소 검색으로 보내」 (decisions 13-15) only on /privacy/, /terms/ and the tool page,
// each of which must carry it when on; the CSP's connect-src never names juso (the page posts to its own origin).
const ADDR_SEND = '행정안전부 주소 검색으로 보내';
const ADDR_SEND_PAGES = ['privacy/index.html', 'terms/index.html', 'english-address/index.html'];
// Acting-Arch Q1: the service worker gen-sw will write (same code, same env) names /english-address/ only when on.
{
  let sw = '';
  try {
    sw = buildServiceWorker(dist, env).code;
  } catch (e) {
    errors.push(`sw.js could not be built for the check: ${e.message}`);
  }
  if (sw && sw.includes(ADDR_EN_PATH) !== addrEn) errors.push(`sw.js ${addrEn ? 'does not name' : 'names'} ${ADDR_EN_PATH} in a build with PUBLIC_ADDR_EN ${addrEn ? 'on' : 'off'}`);
}
if (files.some((f) => f.path === '_headers') && /connect-src[^;\n]*juso/i.test(read('_headers').toString('utf8'))) errors.push('_headers: connect-src names juso (the page only talks to /api/addr-en)');
if (!addrEn) {
  for (const f of files) if (f.path.startsWith(ADDR_EN_PATH.slice(1))) errors.push(`${f.path}: the 영문주소 변환기 page in a build with PUBLIC_ADDR_EN off`);
  for (const f of match(/\.(html|xml|txt|json|webmanifest|m?js|css|svg)$|^_headers$|^_redirects$/)) {
    const text = read(f).toString('utf8');
    if (text.includes(ADDR_API)) errors.push(`${f}: names ${ADDR_API} in a build with PUBLIC_ADDR_EN off`);
    if (text.includes('영문주소 변환기')) errors.push(`${f}: names 영문주소 변환기 in a build with PUBLIC_ADDR_EN off`);
    if (text.includes(ADDR_SEND)) errors.push(`${f}: says 「${ADDR_SEND}」 in a build with PUBLIC_ADDR_EN off`);
  }
} else {
  const html = pageHtml.get('english-address/index.html');
  if (!html) errors.push('english-address/index.html: no file found');
  for (const [p, h] of pageHtml) {
    const says = h.replace(/<[^>]+>/g, '').includes(ADDR_SEND);
    if (says && !ADDR_SEND_PAGES.includes(p)) errors.push(`${p}: says 「${ADDR_SEND}」 outside ${ADDR_SEND_PAGES.join(', ')}`);
    if (!says && ADDR_SEND_PAGES.includes(p)) errors.push(`${p}: does not say 「${ADDR_SEND}」 in a build with PUBLIC_ADDR_EN on`);
  }
  for (const f of match(/\.(xml|txt|json|webmanifest)$/)) if (read(f).toString('utf8').includes(ADDR_SEND)) errors.push(`${f}: says 「${ADDR_SEND}」 (only the three pages may)`);
  const privacy = pageHtml.get('privacy/index.html') ?? '';
  if (!/<h2 id="addr">[^<]*영문주소 변환기/.test(privacy) || !privacy.includes('행정안전부 주소정보누리집')) errors.push('privacy/index.html: no 영문주소 변환기 section (id="addr", naming 행정안전부 주소정보누리집)');
  if (!privacy.includes(env.PUBLIC_PRIVACY_OFFICER?.trim() || '\u0000')) errors.push('privacy/index.html: the 개인정보 보호책임자 is not named (PUBLIC_ADDR_EN on)');
  if (!/<p id="addr">영문주소 변환기가 보여 주는 영문 주소는 행정안전부 자료를/.test(pageHtml.get('terms/index.html') ?? '')) errors.push('terms/index.html: no 영문주소 변환기 paragraph (id="addr")');
  // /api/addr-en only in the controller's lazy chunk (search.ts is bundled into it), never in a page or the initial JS.
  const callers = match(/\.(html|xml|txt|json|webmanifest|m?js|css)$/).filter((f) => read(f).includes(ADDR_API));
  const chunks = callers.filter((f) => /^_astro\/controller\.[\w-]{8}\.js$/.test(f));
  if (callers.length !== 1 || chunks.length !== 1) errors.push(`${ADDR_API} is named in ${callers.join(', ') || 'no file'} (expected one controller chunk)`);
  if (html) {
    if (/\bname="/.test(/<input[^>]*id="ea-q"[^>]*>/.exec(html)?.[0] ?? 'name="missing"')) errors.push('english-address/index.html: the search input has a name (or is missing): a submit would put the address in the URL');
    const initial = initialJs(html);
    for (const f of callers) if (initial.includes(f)) errors.push(`${f}: the 영문주소 변환기 controller loads with the page`);
    const lazy = [...new Set(chunks.flatMap((f) => staticClosure(dist, f)))].filter((f) => !initial.includes(f));
    for (const f of lazy) if (/localStorage|sessionStorage|indexedDB|history\.(push|replace)State/.test(read(f).toString('utf8'))) errors.push(`${f}: the 영문주소 변환기 controller uses Web Storage, IndexedDB or history`);
    // Measured at A2: see BUILD-LOG ADDREN1016 A2 (initial JS budget 30 KB per the brief; controller = measured + 20 %).
    budget('english-address initial JS', initial, 30 * KB);
    budget('english-address controller (lazy)', lazy, 4.5 * KB);
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
// Link blocks (REV2, REV3 R3.6): sponsored links only on the screens of the placement map, inside .out-links after their
// disclosure, new tab, labelled 광고; a guide with one shows AFF_COPY.top first; none at all while PUBLIC_AFF_COUPANG is off.
const disclosures = disclosureStrings(readFileSync(join(import.meta.dirname, '..', 'src', 'data', 'affiliate.ts'), 'utf8'));
if (!disclosures) errors.push('src/data/affiliate.ts: AFF_COPY.ad, AFF_COPY.top or COUPANG_DISCLOSURE not found');
else errors.push(...sponsoredProblems(pageHtml, disclosures, { TOOL_OUT, GUIDE_OUT }));
errors.push(...coupangProblems(pageHtml, env.PUBLIC_AFF_COUPANG?.trim() === '1'));

// UI fonts (Polish P.12; 600 dropped in G2 ci-green; core + late split in the LCP fix after TOOLS4; 700 retired in
// LCP round 2): two static core instances (400, 800), ≤ 50 KB each; up to two late instances (controller-only
// characters), ≤ 8 KB each; ≤ 190 KB together; exactly two preloads, both core.
const uiFonts = match(/^_astro\/anolim-ui-\d+[^/]*\.woff2$/);
const lateFonts = match(/^_astro\/anolim-ui-late-\d+[^/]*\.woff2$/);
if (uiFonts.length !== 2) errors.push(`UI fonts: ${uiFonts.length} core file(s), expected 2 (400, 800)`);
if (lateFonts.length > 2) errors.push(`UI fonts: ${lateFonts.length} late file(s), expected at most 2 (400, 800)`);
for (const f of uiFonts) budget(`UI font ${f.slice(7)}`, [f], 50 * KB, raw, 'raw');
for (const f of lateFonts) budget(`UI font ${f.slice(7)}`, [f], 8 * KB, raw, 'raw');
// 190 KB (Arch, Step 4 round 2; was 180, and 170 before Polish round 2): with the /id-photo/ copy the four
// faces are 179.1 KB, ~1 KB under 180, so the next tool's copy would have failed the build.
budget('UI fonts total', [...uiFonts, ...lateFonts], 190 * KB, raw, 'raw');
// Preloaded-bytes tripwire (LCP fix after TOOLS4, Arch round 2): core 400 + core 800 never exceed what the last
// green build shipped: 2909fe3 (the last commit before TOOLS4), its src/ run through gen-ui-font with the same
// prebuild JSON (package.json, lock and the gen-* scripts unchanged since): 45,744 + 49,140 = 94,884 bytes, the
// bytes every page fetches before LCP. One number for every build variant. Over it, move controller-only text out
// of the core set; never raise this number.
const PRELOAD_TRIPWIRE = 94_884;
const preloadable = uiFonts.filter((f) => /^_astro\/anolim-ui-(400|800)\./.test(f));
budget('UI fonts preloaded (core 400 + 800)', preloadable, PRELOAD_TRIPWIRE, raw, 'raw');
for (const [path, html] of pageHtml) {
  // EN1: English pages have none (system font; scripts/lib/en-check.mjs rule a).
  if (EN_PAGE_RE.test(path)) continue;
  const preloads = [...html.matchAll(/<link rel="preload"[^>]*as="font"[^>]*>/g)].map((m) => m[0]);
  if (preloads.length !== 2) errors.push(`${path}: ${preloads.length} font preload(s), expected exactly 2 (400 and 800)`);
  for (const l of preloads) if (!/href="\/_astro\/anolim-ui-(400|800)\.[^"/]*\.woff2"/.test(l)) errors.push(`${path}: preload ${l} is not a core UI face (400 or 800)`);
}
// Coverage: every character a built page shows must be in the core range, or LCP text would wait on a face that
// is not preloaded. Exempt: elements the shipped CSS renders in the system font (guide prose, docs/COPY.md), but
// only by rules in the stylesheet that declares the UI font. A system-font rule in a page-only stylesheet leaves a
// moment (that sheet still loading, style already computed) in which its text resolves to the UI font and fetches
// the late face (LCP CI follow-up: CI chromium fetched it on /guide/passport-photo/), so such a rule fails here.
{
  const sheets = match(/^_astro\/[^/]*\.css$/).map((c) => [c, read(c).toString('utf8')]);
  const cssText = sheets.map(([, t]) => t).join('\n');
  const uiSheets = sheets.filter(([, t]) => /@font-face\s*\{[^}]*anolim-ui-\d+\./.test(t));
  for (const [c, t] of sheets) {
    if (uiSheets.some(([u]) => u === c)) continue;
    let rules = [];
    try {
      rules = systemFontSelectors(t);
    } catch (e) {
      errors.push(`${c}: ${e.message}`);
    }
    if (rules.length) errors.push(`${c}: ${rules.length} system-font rule(s) outside the UI font stylesheet; move them to src/styles/app.css`);
  }
  const core = new Set();
  for (const face of cssText.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    if (!/anolim-ui-\d+\.[^)'"]*\.woff2/.test(face)) continue;
    for (const cp of rangeSet(/unicode-range\s*:\s*([^;}]+)/.exec(face)?.[1] ?? '')) core.add(cp);
  }
  if (!core.size) errors.push('UI fonts: no core @font-face with a unicode-range in the built CSS');
  else {
    let exempt = [];
    try {
      exempt = uiSheets.flatMap(([, t]) => systemFontSelectors(t));
    } catch (e) {
      errors.push(e.message);
    }
    for (const [path, html] of pageHtml) {
      // EN1: English pages render in the system font (html[lang="en"] rule in app.css), so the core range does not apply.
      if (EN_PAGE_RE.test(path)) continue;
      const missing = uncovered(visibleText(html, exempt), core);
      if (missing.length) errors.push(`${path}: ${missing.length} character(s) outside the core UI font: ${missing.join('')} (add the rendering src/lib or src/tools file to CORE_PATHS in scripts/lib/ui-font-chars.mjs)`);
    }
  }
}
for (const css of match(/^_astro\/[^/]*\.css$/)) {
  for (const m of read(css).toString('utf8').matchAll(/font-weight\s*:\s*([^;}]+)/g)) {
    const v = m[1].trim().replace(/\s*!important$/, '');
    const n = v === 'normal' ? '400' : v === 'bold' ? '700' : v;
    if (n === '700') errors.push(`${css}: font-weight ${v}: the 700 face is retired (LCP round 2: it was a non-preloaded request before LCP on every tool page); use 800`);
    else if (!['inherit', 'initial', 'unset'].includes(n) && !UI_WEIGHTS.has(n)) errors.push(`${css}: font-weight ${v} is not a UI font instance (400, 800)`);
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

// Usage statistics (brief USAGE): off, no script names sendBeacon or the endpoint; on, the tracker ships.
const scripts = match(/\.m?js$/);
if (!usageStats) {
  for (const js of scripts) {
    const text = read(js).toString('utf8');
    if (text.includes('sendBeacon')) errors.push(`${js} contains sendBeacon while PUBLIC_USAGE_STATS is off`);
    if (text.includes(USAGE_PATH)) errors.push(`${js} names ${USAGE_PATH} while PUBLIC_USAGE_STATS is off`);
  }
} else if (!scripts.some((js) => read(js).includes('sendBeacon')) || !scripts.some((js) => read(js).includes(USAGE_PATH))) {
  errors.push(`no script carries sendBeacon and ${USAGE_PATH} although PUBLIC_USAGE_STATS is on`);
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
// REQ1015 D-H10: HEIC opens only where the device decodes it, so no page or llms.txt promises it unconditionally.
for (const p of ['guide/heic-to-jpg/index.html', 'llms.txt']) {
  if (!files.some((f) => f.path === p)) errors.push(`${p}: missing`);
  else if (read(p).toString('utf8').includes('HEIC 사진을 고르고 변환하기를 누르면 JPG로 저장되고')) errors.push(`${p}: the unconditional HEIC promise is back (REQ1015 D-H10)`);
}
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
// HWPX HWP 변환 (HWPX2HWP decision 16): the controller (the controller*.js chunk that owns #hx-loss-list, and what
// only it imports) loads after the first paint or on the first interaction, never with the page; no initial script
// names the HWP worker, the rhwp glue, the viewer chunk or the PDF export chunk (no preview, no fonts, no render)
// (controller 5.4 KB gzip measured, budget + 20 %).
{
  const html = pageHtml.get('hwpx-to-hwp/index.html');
  if (!html) errors.push('hwpx-to-hwp/index.html: no file found');
  else {
    const initial = new Set(initialJs(html));
    const controller = match(/^_astro\/controller\.[\w-]{8}\.js$/).filter((f) => read(f).includes('hx-loss-list'));
    if (controller.length !== 1) errors.push(`hwpx-to-hwp controller: ${controller.length} chunk(s) name #hx-loss-list, expected 1`);
    if (controller.some((f) => initial.has(f))) errors.push('the /hwpx-to-hwp/ controller loads with the page');
    for (const f of initial) if (/hwp\.worker|rhwp_bg|HwpDocument|__wbindgen|createViewer|exportPdf/.test(read(f).toString('utf8'))) errors.push(`${f}: the HWP worker, the rhwp glue, the viewer or the PDF export in the /hwpx-to-hwp/ initial JS`);
    const closure = [...new Set(controller.flatMap((f) => staticClosure(dist, f)))];
    if (closure.some((f) => /^_astro\/(lazy|export-chunk)[.-]/.test(f))) errors.push('the /hwpx-to-hwp/ controller imports the HWP viewer or PDF export chunk');
    budget('hwpx-to-hwp controller (lazy)', closure.filter((f) => !initial.has(f)), 6.5 * KB);
  }
}
// 신분증 사본 만들기 (TOOLS1015 I1): no worker of its own (the 사진 PDF 변환 images.worker makes the PDF). The controller
// (the controller*.js chunk that owns #ic-mark-note, and what only it imports) loads on the first interaction, never with
// the page; no initial script of the page names pdf-lib or the images worker (controller 13.2 KB gzip measured with the shared
// decode/sniff, budget + 20 %).
{
  const html = pageHtml.get('id-copy/index.html');
  if (!html) errors.push('id-copy/index.html: no file found');
  else {
    const initial = new Set(initialJs(html));
    const controller = match(/^_astro\/controller\.[\w-]{8}\.js$/).filter((f) => read(f).includes('ic-mark-note'));
    if (controller.length !== 1) errors.push(`id-copy controller: ${controller.length} chunk(s) name #ic-mark-note, expected 1`);
    if (controller.some((f) => initial.has(f))) errors.push('the /id-copy/ controller loads with the page');
    for (const f of initial) if (/images\.worker|PDFDocument/.test(read(f).toString('utf8'))) errors.push(`${f}: pdf-lib or the images worker in the /id-copy/ initial JS`);
    budget('id-copy controller (lazy)', [...new Set(controller.flatMap((f) => staticClosure(dist, f)))].filter((f) => !initial.has(f)), 15.9 * KB);
  }
}
// 글자수 세기 (TOOLS1015 C1): no engine and no lazy split; the page script (the chunk that owns #cc-text) loads with the
// page (1.9 KB gzip measured, budget + 20 %; the whole initial JS 10.2 KB measured, 11.6 KB in the cloud build with the
// usage tracker, budget + 20 % of the larger). It stores nothing:
// no Web Storage or IndexedDB call in the page script.
{
  const html = pageHtml.get('char-count/index.html');
  if (!html) errors.push('char-count/index.html: no file found');
  else {
    const initial = initialJs(html);
    const own = initial.filter((f) => read(f).includes('cc-text'));
    if (own.length !== 1) errors.push(`char-count page script: ${own.length} initial chunk(s) name #cc-text, expected 1`);
    for (const f of own) if (/localStorage|sessionStorage|indexedDB/.test(read(f).toString('utf8'))) errors.push(`${f}: the /char-count/ page script uses Web Storage or IndexedDB`);
    budget('char-count page script', own, 2.3 * KB);
    budget('char-count initial JS', initial, 13.9 * KB);
  }
}
// 영문 이름 변환기 (ROMANIZE1016 D7, D9, Failure modes): the controller and the 외교부 list ship with the page (no lazy
// split; the chunk that owns #en-sur-choices). It stores nothing and puts the name in no URL (no Web Storage, IndexedDB
// or history call; the form has no action and the inputs no name). The page never calls our output 「공식」 or an
// 「영어 이름」 (외교부 menuPos=36), and every 「N%」 it shows is a 비율 of src/tools/english-name/mofa.ts.
{
  const html = pageHtml.get('english-name/index.html');
  if (!html) errors.push('english-name/index.html: no file found');
  else {
    const initial = initialJs(html);
    const own = initial.filter((f) => read(f).includes('en-sur-choices'));
    if (own.length !== 1) errors.push(`english-name page script: ${own.length} initial chunk(s) name #en-sur-choices, expected 1`);
    for (const f of own) if (/localStorage|sessionStorage|indexedDB|history\.(push|replace)State/.test(read(f).toString('utf8'))) errors.push(`${f}: the /english-name/ page script uses storage or the URL`);
    const form = /<form\b[^>]*id="en-form"[^>]*>([\s\S]*?)<\/form>/.exec(html);
    if (!form) errors.push('english-name/index.html: no #en-form');
    else {
      if (/\baction=/.test(form[0].slice(0, form[0].indexOf('>')))) errors.push('english-name/index.html: #en-form has an action');
      if (/<input\b[^>]*\bname=/.test(form[1])) errors.push('english-name/index.html: an input in #en-form has a name');
    }
    const text = html.replace(/<(style|script)\b[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, '');
    for (const bad of ['공식', '영어 이름', '외교부 인증', '정확한 여권 이름', '띄어 쓰기']) if (text.includes(bad)) errors.push(`english-name/index.html: says 「${bad}」`);
    const pcts = new Set([...readFileSync(join(import.meta.dirname, '..', 'src', 'tools', 'english-name', 'mofa.ts'), 'utf8').matchAll(/pct: (\d+\.\d\d)/g)].map((m) => m[1]));
    for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) if (!pcts.has(Number(m[1]).toFixed(2))) errors.push(`english-name/index.html: 「${m[0]}」 is not a 비율 of the 외교부 list (mofa.ts)`);
    budget('english-name initial JS', initial, ENGLISH_NAME_INITIAL_KB * KB);
  }
}
// 여권 영문 이름 정하는 법 (ROMANIZE1016 R4, brief Failure modes): every 「N%」 in the guide's visible text is a 비율 of
// mofa.ts or stands in one of the guide's own source quotes (the 50% rule of 외교부 고시).
{
  const html = pageHtml.get('guide/passport-english-name/index.html');
  if (!html) errors.push('guide/passport-english-name/index.html: no file found');
  else {
    const md = readFileSync(join(import.meta.dirname, '..', 'src', 'content', 'guides', 'passport-english-name.md'), 'utf8');
    const quoted = new Set([...md.matchAll(/^\s+quote: .*$/gm)].flatMap((q) => [...q[0].matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]).toFixed(2))));
    const pcts = new Set([...readFileSync(join(import.meta.dirname, '..', 'src', 'tools', 'english-name', 'mofa.ts'), 'utf8').matchAll(/pct: (\d+\.\d\d)/g)].map((m) => m[1]));
    const text = html.replace(/<(style|script)\b[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, '');
    for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
      const v = Number(m[1]).toFixed(2);
      if (!pcts.has(v) && !quoted.has(v)) errors.push(`guide/passport-english-name/index.html: 「${m[0]}」 is neither a 비율 of mofa.ts nor in a source quote`);
    }
    for (const bad of ['정확한 여권 이름', '외교부 인증']) if (text.includes(bad)) errors.push(`guide/passport-english-name/index.html: says 「${bad}」`);
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
