// Post-deploy asset smoke test (brief Polish P.3): npm run smoke:assets -- <baseUrl> [--previous <manifest.json>]
// Node 22 fetch, no dependencies. Exits 1 with a table of failures.
//
// Pages: the sitemap URLs, /privacy/, /terms/, /licenses/, /offline/ and a random missing path (must be 404).
// References: HTML script/link/og:image; JS import(), static imports, new URL(…, import.meta.url) and
// "/_astro|vendor|fonts|brand/…" string literals, recursively; CSS url(…); manifest icons; and every entry
// of /deploy-manifest.json. Every same-origin reference must return 200 with the right type. /_astro/* must
// be immutable, /sw.js no-cache, and every HTML response must carry the CSP with connect-src 'self'.
// --previous: every file of an earlier manifest with gen ≥ current gen − 2 must still return 200.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PARALLEL = 8;
/**
 * Paths the reference scan finds inside the onnxruntime-web bundle (배경 지우기) that are not files and never get
 * requested by the page (C2-cloud round 3, Arch). `module` and `worker_threads` are Node built-ins its code imports
 * only under Node. The `.asyncify.wasm` name is the file it would fetch by default, but the page loads it from our
 * .part0/.part1 split and hands ORT the bytes. Exact paths on purpose: an ORT upgrade must list its own.
 */
export const NOT_FILES = new Set([
  '/vendor/onnxruntime-web/1.30.0/module',
  '/vendor/onnxruntime-web/1.30.0/worker_threads',
  '/vendor/onnxruntime-web/1.30.0/ort-wasm-simd-threaded.asyncify.wasm',
]);
const ASSET_LITERAL = /["'`](\/(?:_astro|vendor|fonts|brand)\/[^"'`$\s]+)["'`]/g;

const TYPE_RULES = [
  [/\.(m?js)$/, (t) => /javascript/.test(t), 'JavaScript'],
  [/\.wasm$/, (t) => /^application\/wasm/.test(t), 'application/wasm'],
  [/\.css$/, (t) => /^text\/css/.test(t), 'text/css'],
  [/\.webmanifest$/, (t) => /^application\/(manifest\+)?json/.test(t), 'application/manifest+json or JSON'],
  [/\.ico$/, (t) => /^image\//.test(t), 'an image/* type'],
];

/** References in an HTML page (attribute values as written). */
export function htmlRefs(html) {
  const refs = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) refs.push(m[1]);
  for (const tag of html.matchAll(/<link\b[^>]*>/g)) {
    const rel = tag[0].match(/\brel="([^"]+)"/)?.[1] ?? '';
    const href = tag[0].match(/\bhref="([^"]+)"/)?.[1];
    if (href && /(^|\s)(stylesheet|modulepreload|preload|icon|manifest|apple-touch-icon)(\s|$)/.test(rel)) refs.push(href);
  }
  for (const m of html.matchAll(/<meta\b[^>]*property="og:image"[^>]*content="([^"]+)"/g)) refs.push(m[1]);
  return refs;
}

/** References in a JS module. */
export function jsRefs(code) {
  const refs = new Set();
  for (const m of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) refs.add(m[1]);
  for (const m of code.matchAll(/(?:^|[;\s}])import\s*(?:[\w${},\s*]+from\s*)?["']([^"']+)["']/g)) refs.add(m[1]);
  for (const m of code.matchAll(/\bnew URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g)) refs.add(m[1]);
  for (const m of code.matchAll(ASSET_LITERAL)) if (!m[1].endsWith('/')) refs.add(m[1]);
  // A specifier built inside a template string (pdf.js writes `import("${url}")` into a blob) is not a file.
  return [...refs].filter((r) => !r.includes('${'));
}

export function cssRefs(css) {
  return [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:'));
}

export async function smokeAssets(baseUrl, { previous = null, fetchImpl = fetch, random = Math.random } = {}) {
  const base = new URL(baseUrl);
  const origin = base.origin;
  const failures = [];
  const fail = (url, problem) => failures.push({ url, problem });
  const seen = new Map();
  const toUrl = (ref, from) => {
    const u = new URL(ref, from);
    // Absolute links to the canonical host (og:image) are checked on the deploy under test.
    return u.origin === origin || /^https?:$/.test(u.protocol) ? new URL(u.pathname + u.search, origin).href : null;
  };

  async function get(url) {
    if (seen.has(url)) return seen.get(url);
    const p = (async () => {
      try {
        const res = await fetchImpl(url, { redirect: 'follow' });
        const body = Buffer.from(await res.arrayBuffer());
        return { status: res.status, type: res.headers.get('content-type') ?? '', cache: res.headers.get('cache-control') ?? '', csp: res.headers.get('content-security-policy') ?? '', body };
      } catch (err) {
        return { status: 0, error: err instanceof Error ? err.message : String(err) };
      }
    })();
    seen.set(url, p);
    return p;
  }

  function checkHeaders(url, r) {
    const path = new URL(url).pathname;
    for (const [re, ok, want] of TYPE_RULES) if (re.test(path) && !ok(r.type)) fail(url, `content-type "${r.type}", expected ${want}`);
    if (path.startsWith('/_astro/') && !/immutable/.test(r.cache)) fail(url, `cache-control "${r.cache}" is not immutable`);
    if (path === '/sw.js' && !/no-cache/.test(r.cache)) fail(url, `cache-control "${r.cache}" is not no-cache`);
    if (/^text\/html/.test(r.type) && !/(^|;)\s*connect-src 'self'\s*(;|$)/.test(r.csp)) fail(url, "HTML without the CSP connect-src 'self'");
  }

  const queue = [];
  const queued = new Set();
  const enqueue = (url, kind) => {
    if (!url || queued.has(url) || NOT_FILES.has(new URL(url).pathname)) return;
    queued.add(url);
    queue.push([url, kind]);
  };

  async function visit(url, kind) {
    const r = await get(url);
    if (r.status !== 200) {
      fail(url, r.status ? `HTTP ${r.status}` : `request failed: ${r.error}`);
      return;
    }
    checkHeaders(url, r);
    const path = new URL(url).pathname;
    if (kind === 'html') for (const ref of htmlRefs(r.body.toString('utf8'))) enqueue(toUrl(ref, url), 'asset');
    else if (/\.m?js$/.test(path)) for (const ref of jsRefs(r.body.toString('utf8'))) enqueue(toUrl(ref, url), 'asset');
    else if (/\.css$/.test(path)) for (const ref of cssRefs(r.body.toString('utf8'))) enqueue(toUrl(ref, url), 'asset');
    else if (/\.webmanifest$/.test(path)) {
      try {
        for (const icon of JSON.parse(r.body.toString('utf8')).icons ?? []) enqueue(toUrl(icon.src, url), 'asset');
      } catch {
        fail(url, 'manifest is not JSON');
      }
    }
  }

  // Pages.
  const sitemap = await get(new URL('/sitemap.xml', origin).href);
  const pages = new Set(['/', '/privacy/', '/terms/', '/licenses/', '/offline/']);
  if (sitemap.status !== 200) fail(new URL('/sitemap.xml', origin).href, `HTTP ${sitemap.status}`);
  else for (const m of sitemap.body.toString('utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) pages.add(new URL(m[1]).pathname);
  for (const p of pages) enqueue(new URL(p, origin).href, 'html');
  const missing = new URL(`/__missing-${Math.floor(random() * 1e9).toString(36)}/`, origin).href;
  const nf = await get(missing);
  if (nf.status !== 404) fail(missing, `HTTP ${nf.status}, expected 404`);
  else checkHeaders(missing, nf);
  enqueue(new URL('/sw.js', origin).href, 'asset');

  // Every file the deploy manifest lists.
  const manifestUrl = new URL('/deploy-manifest.json', origin).href;
  const mr = await get(manifestUrl);
  let manifest = null;
  if (mr.status !== 200) fail(manifestUrl, `HTTP ${mr.status}`);
  else {
    try {
      manifest = JSON.parse(mr.body.toString('utf8'));
      for (const p of Object.keys(manifest.files ?? {})) enqueue(new URL(`/${p}`, origin).href, 'asset');
    } catch {
      fail(manifestUrl, 'not JSON');
    }
  }
  if (previous) {
    const cur = manifest?.gen;
    if (!Number.isInteger(cur)) fail(manifestUrl, 'no current gen to compare --previous with');
    else for (const [p, e] of Object.entries(previous.files ?? {})) if (e.gen >= cur - 2) enqueue(new URL(`/${p}`, origin).href, 'asset');
  }

  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) await visit(...item);
  };
  // The queue grows while it is worked; run until it is empty.
  while (queue.length) await Promise.all(Array.from({ length: PARALLEL }, worker));

  return { failures, checked: queued.size + 2, gen: manifest?.gen ?? null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const base = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--previous');
  if (!base) {
    console.error('usage: npm run smoke:assets -- <baseUrl> [--previous <manifest.json>]');
    process.exit(2);
  }
  const pi = args.indexOf('--previous');
  const previous = pi >= 0 ? JSON.parse(readFileSync(args[pi + 1], 'utf8')) : null;
  const { failures, checked, gen } = await smokeAssets(base, { previous });
  if (failures.length) {
    console.error(`smoke:assets: FAIL — ${failures.length} problem(s) in ${checked} URLs`);
    console.error(`  ${'URL'.padEnd(90)} PROBLEM`);
    for (const f of failures) console.error(`  ${f.url.padEnd(90)} ${f.problem}`);
    process.exit(1);
  }
  console.log(`smoke:assets: OK — ${checked} URLs on ${base} (manifest gen ${gen}${previous ? `, previous manifest gen ${previous.gen} carried` : ''})`);
}
