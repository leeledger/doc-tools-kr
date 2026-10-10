// Polish P build and deploy tooling (brief "Test map"): carry-forward, the asset smoke test, generated
// headers, brand assets, UI font instances, check-dist and the built output (copy and custom domain).
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import fontverter from 'fontverter';
import { afterAll, describe, expect, it } from 'vitest';
import { carryAssets, safePath } from '../../scripts/carry-assets.mjs';
import { reservedNameProblems } from '../../scripts/font-rename.mjs';
import { buildIco, ogDomain, renderBrand } from '../../scripts/gen-brand.mjs';
import { domainHeaders } from '../../scripts/gen-headers.mjs';
import { NOT_FILES, smokeAssets } from '../../scripts/smoke-assets.mjs';
import { BEACON_CONNECT } from '../../scripts/lib/analytics.mjs';
import { GA_CONNECT_SRC } from '../../scripts/lib/ga.mjs';
import { startServer } from '../e2e/serve.mjs';
import { PRESETS, getPreset } from '../../src/data/id-photo-presets';
import { parse as parseYaml } from 'yaml';
import { MAX_SOURCE_AGE_DAYS, publishedGuideSchema } from '../../src/data/guide-schema';
import { resolveSources, unsourcedFacts } from '../../src/data/guide-facts';
import { BG_REMOVE_TOOL, LIVE_TOOLS } from '../../src/data/tools';
import { parseHref } from '../../src/lib/ui/deeplink';
import { HUB_KIND, HUB_SLUGS } from '../../src/data/hubs';
import { DUP_LIMIT, articleText, duplicatePairs, jaccard, shingles } from '../../scripts/lib/shingles.mjs';
import { CLAIM_FILE_RE, LOCAL_SCOPE_RE, QUALIFIER_RE, claimText, unqualifiedClaims } from '../../scripts/lib/bgcloud.mjs';
import { rangeSet, systemFontSelectors, uncovered, visibleText } from '../../scripts/lib/fontcover.mjs';
import { CORE_PATHS, uiCharSets } from '../../scripts/lib/ui-font-chars.mjs';

const ROOT = join(__dirname, '..', '..');
const DIST = join(ROOT, 'dist');
const tmp = mkdtempSync(join(tmpdir(), 'anolim-postbuild-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
let n = 0;
/** A minimal build folder: index.html with a build id plus the given files. */
function fakeDist(build: string, files: Record<string, string>): string {
  const dir = join(tmp, `d${n++}`);
  const all: Record<string, string> = { 'index.html': `<!doctype html><meta name="build-id" content="${build}">`, ...files };
  for (const [p, body] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), body);
  }
  return dir;
}
const manifestOf = (dir: string) => JSON.parse(readFileSync(join(dir, 'deploy-manifest.json'), 'utf8'));
/** A fake live site: `/deploy-manifest.json` plus files. */
function liveFetch(manifest: unknown, files: Record<string, string> = {}): typeof fetch {
  return (async (url: string) => {
    const path = new URL(url).pathname.slice(1);
    if (path === 'deploy-manifest.json') return new Response(JSON.stringify(manifest));
    return path in files ? new Response(files[path]) : new Response('missing', { status: 404 });
  }) as unknown as typeof fetch;
}
const quiet = () => undefined;

// ---------- P.2 carry-forward ----------

describe('carry-assets (P.2)', () => {
  it('off outside CF: no network, the manifest still lists every immutable file at gen 1', async () => {
    const dist = fakeDist('b1', { '_astro/a.js': 'a', 'vendor/v.js': 'v', 'fonts/f.woff2': 'f', 'about/index.html': 'x' });
    let called = false;
    const r = await carryAssets({ dist, enabled: false, source: 'https://x', fetchImpl: (async () => ((called = true), new Response(''))) as never, log: quiet });
    expect(called).toBe(false);
    const m = manifestOf(dist);
    expect(m.build).toBe('b1');
    expect(m.gen).toBe(1);
    expect(typeof m.generatedAt).toBe('string');
    expect(Object.keys(m.files).sort()).toEqual(['_astro/a.js', 'fonts/f.woff2', 'vendor/v.js']);
    expect(m.files['_astro/a.js']).toEqual({ sha256: sha('a'), bytes: 1, gen: 1 });
    expect(r.reason).toMatch(/disabled/);
  });

  it('gen math, the two-generation window, and a fresh file is never overwritten', async () => {
    const dist = fakeDist('b5', { '_astro/new.js': 'fresh', '_astro/same.js': 'fresh copy' });
    const live = {
      build: 'b4',
      gen: 4,
      files: {
        '_astro/g4.js': { sha256: sha('four'), bytes: 4, gen: 4 },
        '_astro/g3.js': { sha256: sha('three'), bytes: 5, gen: 3 },
        '_astro/g2.js': { sha256: sha('two'), bytes: 3, gen: 2 },
        '_astro/same.js': { sha256: sha('old'), bytes: 3, gen: 4 },
      },
    };
    const r = await carryAssets({ dist, enabled: true, source: 'https://live', fetchImpl: liveFetch(live, { '_astro/g4.js': 'four', '_astro/g3.js': 'three', '_astro/g2.js': 'two', '_astro/same.js': 'old' }), log: quiet });
    const m = manifestOf(dist);
    expect(m.gen).toBe(5);
    // 5 − 4 = 1 and 5 − 3 = 2 are kept; 5 − 2 = 3 is dropped.
    expect(r.carried.sort()).toEqual(['_astro/g3.js', '_astro/g4.js']);
    expect(m.files['_astro/g4.js'].gen).toBe(4);
    expect(m.files['_astro/g3.js'].gen).toBe(3);
    expect(m.files['_astro/g2.js']).toBeUndefined();
    expect(m.files['_astro/new.js'].gen).toBe(5);
    expect(readFileSync(join(dist, '_astro/same.js'), 'utf8')).toBe('fresh copy');
    expect(m.files['_astro/same.js']).toEqual({ sha256: sha('fresh copy'), bytes: 10, gen: 5 });
  });

  it('a SHA-256 mismatch skips that file with a warning', async () => {
    const dist = fakeDist('b2', {});
    const logs: string[] = [];
    const live = { build: 'b1', gen: 1, files: { '_astro/t.js': { sha256: sha('original'), bytes: 8, gen: 1 } } };
    const r = await carryAssets({ dist, enabled: true, source: 'https://live', fetchImpl: liveFetch(live, { '_astro/t.js': 'tampered' }), log: (s: string) => logs.push(s) });
    expect(r.carried).toEqual([]);
    expect(() => statSync(join(dist, '_astro/t.js'))).toThrow();
    expect(logs.some((l) => /warning: skipped _astro\/t\.js: SHA-256 mismatch/.test(l))).toBe(true);
  });

  it('paths outside _astro/, vendor/, fonts/ or with .. are never written', async () => {
    for (const p of ['../evil.js', '/etc/passwd', '_astro/../x.js', 'other/x.js', '_astro//x.js', '_astro/a b.js', 'fonts/./x']) expect(safePath(p), p).toBe(false);
    for (const p of ['_astro/a-B_1.js', 'vendor/qpdf/12.2.0-w0.3.0/qpdf.wasm', 'fonts/pretendard/1.3.9/x@2.woff2']) expect(safePath(p), p).toBe(true);
    const dist = fakeDist('b2', {});
    const live = { build: 'b1', gen: 1, files: { '_astro/../../evil.js': { sha256: sha('x'), bytes: 1, gen: 1 } } };
    const r = await carryAssets({ dist, enabled: true, source: 'https://live', fetchImpl: liveFetch(live, { 'evil.js': 'x' }), log: quiet });
    expect(r.carried).toEqual([]);
    expect(r.skipped[0]).toMatch(/path not allowed/);
  });

  it('the download must have the length and SHA the manifest names; a lying manifest cannot slip past the caps (round 2)', async () => {
    const logs: string[] = [];
    // The manifest says 3 bytes; the server sends 9 whose SHA the manifest also claims.
    const big = 'ninebytes';
    const live = { build: 'b1', gen: 1, files: { '_astro/liar.js': { sha256: sha(big), bytes: 3, gen: 1 } } };
    const r = await carryAssets({ dist: fakeDist('b2', {}), enabled: true, source: 'https://live', fetchImpl: liveFetch(live, { '_astro/liar.js': big }), log: (s: string) => logs.push(s) });
    expect(r.carried).toEqual([]);
    expect(r.skipped[0]).toMatch(/length 9 is not the manifest's 3/);
  });

  it('the bytes actually downloaded count against the size cap', async () => {
    const files: Record<string, { sha256: string; bytes: number; gen: number }> = {};
    const bodies: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      files[`_astro/d${i}.js`] = { sha256: sha(`12345${i}`), bytes: 6, gen: 1 };
      bodies[`_astro/d${i}.js`] = `12345${i}`;
    }
    const r = await carryAssets({ dist: fakeDist('b2', {}), enabled: true, source: 'https://live', fetchImpl: liveFetch({ build: 'b1', gen: 1, files }, bodies), maxBytes: 18, log: quiet });
    expect(r.carried).toHaveLength(3);
    const tight = await carryAssets({ dist: fakeDist('b2', {}), enabled: true, source: 'https://live', fetchImpl: liveFetch({ build: 'b1', gen: 1, files }, bodies), maxBytes: 17, log: quiet });
    expect(tight.carried.length).toBeLessThan(3);
  });

  it('a live manifest over 1 MB is refused before parsing (fail open)', async () => {
    const huge = { build: 'b1', gen: 1, files: {}, pad: 'x'.repeat(1024 * 1024) };
    const dist = fakeDist('b2', { '_astro/a.js': 'a' });
    const r = await carryAssets({ dist, enabled: true, source: 'https://live', fetchImpl: liveFetch(huge), log: quiet });
    expect(r.reason).toMatch(/over 1048576 bytes/);
    expect(manifestOf(dist).gen).toBe(1);
  });

  it('caps: at most N files and M bytes per build', async () => {
    const files: Record<string, { sha256: string; bytes: number; gen: number }> = {};
    const bodies: Record<string, string> = {};
    for (let i = 0; i < 5; i++) {
      files[`_astro/c${i}.js`] = { sha256: sha(`body${i}`), bytes: 5, gen: 1 };
      bodies[`_astro/c${i}.js`] = `body${i}`;
    }
    const byCount = await carryAssets({ dist: fakeDist('b2', {}), enabled: true, source: 'https://live', fetchImpl: liveFetch({ build: 'b1', gen: 1, files }, bodies), maxFiles: 2, log: quiet });
    expect(byCount.carried).toHaveLength(2);
    expect(byCount.skipped.filter((s: string) => /cap/.test(s))).toHaveLength(3);
    const byBytes = await carryAssets({ dist: fakeDist('b2', {}), enabled: true, source: 'https://live', fetchImpl: liveFetch({ build: 'b1', gen: 1, files }, bodies), maxBytes: 12, log: quiet });
    expect(byBytes.carried).toHaveLength(2);
  });

  it('fails open: an unreachable site, a 404 manifest or the timeout log carry: skipped and still write the manifest', async () => {
    for (const [fetchImpl, want] of [
      [(async () => Promise.reject(new TypeError('fetch failed'))) as never, /manifest unreachable/],
      [(async () => new Response('', { status: 404 })) as never, /no live manifest \(HTTP 404\)/],
      [((_: string, init: { signal: AbortSignal }) => new Promise((_r, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))) as never, /timeout/],
    ] as const) {
      const dist = fakeDist('b9', { '_astro/a.js': 'a' });
      const logs: string[] = [];
      const r = await carryAssets({ dist, enabled: true, source: 'https://live', fetchImpl, timeoutMs: 50, log: (s: string) => logs.push(s) });
      expect(r.reason).toMatch(want);
      expect(logs.some((l) => l.startsWith('carry: skipped ('))).toBe(true);
      expect(manifestOf(dist).gen).toBe(1);
    }
  });

  it('end to end with a real local server: the second build contains the first build\'s files', async () => {
    const first = fakeDist('b1', { '_astro/old.js': 'old chunk', '404.html': 'nf' });
    await carryAssets({ dist: first, enabled: false, source: '', log: quiet });
    const server = await startServer({ root: first, port: 0 });
    try {
      const second = fakeDist('b2', { '_astro/new.js': 'new chunk' });
      const r = await carryAssets({ dist: second, enabled: true, source: server.url, log: quiet });
      expect(r.carried).toEqual(['_astro/old.js']);
      expect(readFileSync(join(second, '_astro/old.js'), 'utf8')).toBe('old chunk');
    } finally {
      await server.close();
    }
  });

  it('postbuild order: check-dist, then gen-headers, then carry-assets, then gen-sw', () => {
    const post: string = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts.postbuild;
    const order = ['check-dist', 'gen-headers', 'carry-assets', 'gen-sw'].map((s) => post.indexOf(`scripts/${s}.mjs`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

// ---------- P.3 asset smoke ----------

describe('smoke-assets (P.3)', () => {
  const page = (extra = '') =>
    `<!doctype html><html><head><meta name="build-id" content="s1"><link rel="stylesheet" href="/_astro/s.css"><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="data:image/svg+xml,x"><meta property="og:image" content="https://doc-tools-kr.pages.dev/brand/og.png"><script type="module" src="/_astro/a.js"></script>${extra}</head></html>`;
  function site(extra: Record<string, string> = {}): string {
    const dir = fakeDist('s1', {
      'index.html': page(),
      'privacy/index.html': page(),
      'terms/index.html': page(),
      'licenses/index.html': page(),
      'offline/index.html': page(),
      'tool/index.html': page(),
      '404.html': page(),
      'sitemap.xml': '<urlset><url><loc>https://doc-tools-kr.pages.dev/</loc></url><url><loc>https://doc-tools-kr.pages.dev/tool/</loc></url></urlset>',
      '_astro/a.js': 'import{x}from"./b.js";const w=new URL("/_astro/w.wasm",import.meta.url);import("./lazy.js");const v="/vendor/pkg/1/x.mjs";const t=`import("${w}")`;',
      '_astro/b.js': 'export const x=1;',
      '_astro/lazy.js': 'export default 1;',
      '_astro/w.wasm': 'wasm',
      '_astro/s.css': 'body{background:url(/fonts/f.woff2)}',
      'fonts/f.woff2': 'f',
      'vendor/pkg/1/x.mjs': 'export{}',
      'brand/og.png': 'png',
      'brand/i.png': 'png',
      'manifest.webmanifest': JSON.stringify({ icons: [{ src: '/brand/i.png' }] }),
      'sw.js': '// sw',
      ...extra,
    });
    writeFileSync(join(dir, '_headers'), readFileSync(join(ROOT, 'public', '_headers')));
    return dir;
  }

  it('collects HTML, JS (recursive), CSS and manifest references and passes a complete site', async () => {
    const dir = site();
    await carryAssets({ dist: dir, enabled: false, source: '', log: quiet });
    const server = await startServer({ root: dir, port: 0 });
    const seen: string[] = [];
    const spy = (async (url: string, init?: RequestInit) => ((seen.push(new URL(url).pathname), fetch(url, init)))) as typeof fetch;
    try {
      const r = await smokeAssets(server.url, { fetchImpl: spy });
      expect(r.failures).toEqual([]);
      for (const p of ['/_astro/b.js', '/_astro/lazy.js', '/_astro/w.wasm', '/vendor/pkg/1/x.mjs', '/fonts/f.woff2', '/brand/i.png', '/brand/og.png', '/terms/', '/tool/', '/sw.js']) expect(seen, p).toContain(p);
      expect(seen.some((p) => p.startsWith('/__missing-'))).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('fails on a 404 reference, a wrong MIME type and a missing carried file (--previous)', async () => {
    const dir = site();
    await carryAssets({ dist: dir, enabled: false, source: '', log: quiet });
    rmSync(join(dir, '_astro/lazy.js'));
    const server = await startServer({ root: dir, port: 0 });
    const wrongType = (async (url: string, init?: RequestInit) => {
      const res = await fetch(url, init);
      if (!url.endsWith('/_astro/w.wasm')) return res;
      const h = new Headers(res.headers);
      h.set('content-type', 'application/octet-stream');
      return new Response(await res.arrayBuffer(), { status: res.status, headers: h });
    }) as typeof fetch;
    try {
      const previous = { gen: 1, files: { '_astro/gone.js': { gen: 1 }, '_astro/ancient.js': { gen: -5 } } };
      const r = await smokeAssets(server.url, { fetchImpl: wrongType, previous: previous as never });
      const problems = r.failures.map((f: { url: string; problem: string }) => `${new URL(f.url).pathname} ${f.problem}`);
      expect(problems).toContain('/_astro/lazy.js HTTP 404');
      expect(problems).toContain('/_astro/w.wasm content-type "application/octet-stream", expected application/wasm');
      expect(problems).toContain('/_astro/gone.js HTTP 404');
      expect(problems.some((p: string) => p.includes('ancient'))).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('INTERNAL-TRAFFIC r2: off-site references are not fetched; og:image is checked on the deploy; only a designed CSP passes', async () => {
    const beacon = '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-site-analytics></script>';
    const dir = site({ 'index.html': page(beacon), 'tool/index.html': page(beacon) });
    await carryAssets({ dist: dir, enabled: false, source: '', log: quiet });
    const server = await startServer({ root: dir, port: 0 });
    const seen: string[] = [];
    // The deploy sends the CSP production sends with both analytics on; /tool/ gets one extra host.
    const csp = (extra: string) =>
      (async (url: string, init?: RequestInit) => {
        seen.push(url);
        const res = await fetch(url, init);
        if (!/text\/html/.test(res.headers.get('content-type') ?? '')) return res;
        const h = new Headers(res.headers);
        const tail = new URL(url).pathname === '/tool/' ? extra : '';
        h.set('content-security-policy', (h.get('content-security-policy') ?? '').replace("connect-src 'self'", `connect-src 'self' ${GA_CONNECT_SRC} ${BEACON_CONNECT}${tail}`));
        return new Response(await res.arrayBuffer(), { status: res.status, headers: h });
      }) as typeof fetch;
    try {
      const ok = await smokeAssets(server.url, { fetchImpl: csp('') });
      expect(ok.failures).toEqual([]);
      expect(seen.some((u) => /beacon\.min\.js/.test(u))).toBe(false);
      expect(seen.every((u) => u.startsWith(server.url))).toBe(true);
      expect(seen.map((u) => new URL(u).pathname)).toContain('/brand/og.png');
      const bad = await smokeAssets(server.url, { fetchImpl: csp(' https://evil.example') });
      expect(bad.failures.map((f: { url: string; problem: string }) => new URL(f.url).pathname)).toEqual(['/tool/']);
    } finally {
      await server.close();
    }
  });

  it('C2-cloud r3: skips exactly the three non-file names in the onnxruntime-web bundle; a fourth missing name still fails', async () => {
    const ort = '/vendor/onnxruntime-web/1.30.0/';
    const dir = site({
      '_astro/a.js': `const o="${ort}ort.wasm.min.mjs";`,
      'vendor/onnxruntime-web/1.30.0/ort.wasm.min.mjs':
        'import("module");import("worker_threads");const a=new URL("ort-wasm-simd-threaded.asyncify.wasm",import.meta.url);const b=new URL("ort-other.wasm",import.meta.url);',
    });
    await carryAssets({ dist: dir, enabled: false, source: '', log: quiet });
    const server = await startServer({ root: dir, port: 0 });
    const seen: string[] = [];
    const spy = (async (url: string, init?: RequestInit) => ((seen.push(new URL(url).pathname), fetch(url, init)))) as typeof fetch;
    try {
      const r = await smokeAssets(server.url, { fetchImpl: spy });
      const problems = r.failures.map((f: { url: string; problem: string }) => `${new URL(f.url).pathname} ${f.problem}`);
      expect(problems).toEqual([`${ort}ort-other.wasm HTTP 404`]);
      expect(seen).toContain(`${ort}ort.wasm.min.mjs`);
      for (const n of ['module', 'worker_threads', 'ort-wasm-simd-threaded.asyncify.wasm']) expect(seen).not.toContain(ort + n);
      expect([...NOT_FILES]).toEqual(['module', 'worker_threads', 'ort-wasm-simd-threaded.asyncify.wasm'].map((n) => ort + n));
    } finally {
      await server.close();
    }
  });
});

// ---------- P.19 generated headers ----------

describe('gen-headers (P.19)', () => {
  it('pages.dev (or unset): nothing is added', () => {
    expect(domainHeaders(undefined)).toBe('');
    expect(domainHeaders('https://doc-tools-kr.pages.dev')).toBe('');
    expect(domainHeaders('https://preview.doc-tools-kr.pages.dev/')).toBe('');
  });
  it('a custom domain: one-year HSTS on it (no includeSubDomains, no preload) and noindex on pages.dev', () => {
    const block = domainHeaders('https://anolim.kr');
    expect(block).toBe('https://anolim.kr/*\n  Strict-Transport-Security: max-age=31536000\nhttps://doc-tools-kr.pages.dev/*\n  X-Robots-Tag: noindex\n');
    expect(block).not.toMatch(/includeSubDomains|preload/);
  });
});

// ---------- P.10 brand ----------

describe('gen-brand (P.10)', () => {
  const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20), png: b.subarray(1, 4).toString() === 'PNG' });

  it('is deterministic: two runs give the same bytes', () => {
    const a = renderBrand() as Record<string, Buffer>;
    const b = renderBrand() as Record<string, Buffer>;
    for (const k of Object.keys(a)) expect(sha(a[k]), k).toBe(sha(b[k]));
  });

  it('favicon.ico holds 16, 32 and 48 px PNG entries; the icons and the OG image have their sizes', () => {
    const out = renderBrand() as Record<string, Buffer>;
    const ico = out['favicon.ico'];
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    const sizes = [0, 1, 2].map((i) => {
      const e = 6 + 16 * i;
      const len = ico.readUInt32LE(e + 8);
      const off = ico.readUInt32LE(e + 12);
      const png = pngSize(ico.subarray(off, off + len));
      expect(png.png).toBe(true);
      expect(png.w).toBe(ico.readUInt8(e));
      return png.w;
    });
    expect(sizes).toEqual([16, 32, 48]);
    expect(ico.length).toBeLessThanOrEqual(20 * 1024);
    expect(pngSize(out['brand/apple-touch-icon.png'])).toMatchObject({ w: 180, h: 180 });
    expect(pngSize(out['brand/icon-192.png'])).toMatchObject({ w: 192, h: 192 });
    expect(pngSize(out['brand/icon-512.png'])).toMatchObject({ w: 512, h: 512 });
    expect(pngSize(out['brand/icon-maskable-512.png'])).toMatchObject({ w: 512, h: 512 });
    // One share image per og.json image (Polish Q), 1200×630, ≤ 300 KB; no single og.png any more.
    const og = Object.keys(out).filter((k) => /^brand\/og-[a-z-]+\.png$/.test(k)).sort();
    expect(og).toEqual(['default', 'home', 'hwp-to-pdf', 'hwp-viewer', 'hwpx-to-hwp', 'id-photo', 'image-to-jpg', 'jpg-to-pdf', 'pdf-compress', 'pdf-merge', 'pdf-password', 'pdf-sign', 'pdf-split', 'pdf-to-jpg', 'photo-compress', 'stamp-signature'].map((n) => `brand/og-${n}.png`));
    expect(out).not.toHaveProperty(['brand/og.png']);
    for (const k of og) {
      expect(pngSize(out[k]), k).toMatchObject({ w: 1200, h: 630, png: true });
      expect(out[k].length, k).toBeLessThanOrEqual(300 * 1024);
    }
    // The printed domain: the production host, never a preview host.
    expect(ogDomain('https://docttak.com')).toBe('docttak.com');
    expect(ogDomain('https://doc-tools-kr.pages.dev')).toBe('docttak.com');
    expect(ogDomain(undefined)).toBe('docttak.com');
    // A 256 px entry is written as 0 (the ICO convention).
    expect(buildIco([{ size: 256, data: Buffer.from('x') }]).readUInt8(6)).toBe(0);
  });
});

// ---------- P.12 UI font instances (core + late since the LCP fix after TOOLS4) ----------

describe('UI font static instances (P.12)', () => {
  const gen = join(ROOT, 'src', 'generated');
  const tables = (b: Buffer) => {
    const n = b.readUInt16BE(4);
    const out: Record<string, number> = {};
    for (let i = 0; i < n; i++) out[b.toString('latin1', 12 + i * 16, 16 + i * 16)] = b.readUInt32BE(12 + i * 16 + 8);
    return out;
  };
  const lateFiles = readdirSync(gen).filter((f) => /^anolim-ui-late-\d+\.woff2$/.test(f));
  const faceFiles = [...[400, 800].map((w) => [`anolim-ui-${w}.woff2`, w, 50] as const), ...lateFiles.map((f) => [f, Number(f.match(/(\d+)\.woff2$/)![1]), 8] as const)];

  it.each(faceFiles)('%s: no fvar, usWeightClass = %d, the name guard passes, ≤ %d KB', async (file, w, kb) => {
    const woff2 = readFileSync(join(gen, file));
    expect(woff2.length).toBeLessThanOrEqual(kb * 1024);
    const sfnt = Buffer.from(await fontverter.convert(woff2, 'truetype', 'woff2'));
    const t = tables(sfnt);
    expect(t.fvar).toBeUndefined();
    expect(t.gvar).toBeUndefined();
    expect(sfnt.readUInt16BE(t['OS/2']! + 4)).toBe(w);
    expect(reservedNameProblems(new Uint8Array(sfnt), 'Pretendard')).toEqual([]);
  });

  const css = () => readFileSync(join(gen, 'anolim-ui.css'), 'utf8');
  const faces = () => (css().match(/@font-face \{[^}]+\}/g) ?? []).map((f) => ({
    file: f.match(/url\('\.\/([^']+)'\)/)![1],
    weight: f.match(/font-weight: ([^;]+);/)![1],
    range: rangeSet(f.match(/unicode-range: ([^;]+);/)![1]),
    woff2: f.includes("format('woff2')"),
  }));

  it('two core faces (no 600, G2 ci-green; no 700, LCP round 2) and at most two late faces, one weight each, format("woff2")', () => {
    const all = faces();
    const core = all.filter((f) => /^anolim-ui-\d+\.woff2$/.test(f.file));
    const late = all.filter((f) => /^anolim-ui-late-\d+\.woff2$/.test(f.file));
    expect(core.length + late.length).toBe(all.length);
    expect(core.map((f) => f.weight)).toEqual(['400', '800']);
    expect(late.length).toBeLessThanOrEqual(2);
    expect(late.map((f) => f.file).sort()).toEqual([...lateFiles].sort());
    for (const f of late) expect(['400', '800']).toContain(f.weight);
    expect(readdirSync(gen).filter((f) => /^anolim-ui(-late)?-700\.woff2$/.test(f))).toEqual([]);
    for (const f of all) expect(f.woff2).toBe(true);
    const total = faceFiles.reduce((a, [file]) => a + statSync(join(gen, file)).size, 0);
    // 190 KB since Step 4 round 2 (Arch; check-dist has the same limit), core and late together.
    expect(total).toBeLessThanOrEqual(190 * 1024);
  });

  it('core and late ranges are disjoint, and their union is the single pre-split set (every source character)', () => {
    const all = faces();
    const core = all.find((f) => f.file === 'anolim-ui-400.woff2')!.range;
    const late = all.find((f) => f.file === 'anolim-ui-late-400.woff2')?.range ?? new Set<number>();
    for (const f of all) expect([...f.range]).toEqual([...(f.file.startsWith('anolim-ui-late-') ? late : core)]);
    expect([...late].filter((cp) => core.has(cp))).toEqual([]);
    const sets = uiCharSets(join(ROOT, 'src'));
    expect([...core].sort((a, b) => a - b)).toEqual(sets.core);
    expect([...new Set([...core, ...late])].sort((a, b) => a - b)).toEqual(sets.all);
  });

  it('core scope: tools and libs are late unless listed in CORE_PATHS; every CORE_PATHS entry exists', () => {
    for (const p of CORE_PATHS) {
      expect(p).toMatch(/^(tools|lib)\//);
      expect(existsSync(join(ROOT, 'src', p))).toBe(true);
    }
  });
});

describe('UI font coverage helpers (scripts/lib/fontcover.mjs)', () => {
  it('rangeSet reads single code points and runs', () => {
    expect([...rangeSet('U+41-43, U+ac00')]).toEqual([0x41, 0x42, 0x43, 0xac00]);
  });

  it('systemFontSelectors reads class chains and Astro-scoped compounds, and rejects other shapes', () => {
    const css = '.a,.b .c{font-family:-apple-system,sans-serif}.d{font-family:x}section[data-astro-cid-q] h2[data-astro-cid-q]{font-family:-apple-system}';
    expect(systemFontSelectors(css)).toEqual([
      [{ tag: undefined, classes: ['a'], attr: undefined }],
      [{ tag: undefined, classes: ['b'], attr: undefined }, { tag: undefined, classes: ['c'], attr: undefined }],
      [{ tag: 'section', classes: [], attr: 'data-astro-cid-q' }, { tag: 'h2', classes: [], attr: 'data-astro-cid-q' }],
    ]);
    expect(() => systemFontSelectors('#x>p{font-family:-apple-system}')).toThrow(/unsupported/);
  });

  it('visibleText drops scripts, styles, comments and exempt elements (nested, balanced), keeps attributes', () => {
    const html = '<html><head><title>머리</title></head><body><p>가<!--숨김--></p><script>"스크립트"</script><style>p{}</style>'
      + '<div class="sys"><div><p>제외</p></div></div><p>나</p><img alt="대체" src="x"><input placeholder="안내" value="값">'
      + '<ul class="list"><li>밖목록</li></ul><div class="idx"><ul class="list"><li>안목록</li></ul></div><p>&#xB2E4;&amp;</p></body></html>';
    const exempt = systemFontSelectors('.sys,.idx .list{font-family:-apple-system}');
    const text = visibleText(html, exempt);
    for (const s of ['가', '나', '대체', '안내', '값', '밖목록', '다&']) expect(text).toContain(s);
    for (const s of ['머리', '숨김', '스크립트', '제외', '안목록']) expect(text).not.toContain(s);
  });

  it('system-font exemptions come only from the UI font stylesheet; the /guide/ h2 one applies on /guide/ only', () => {
    if (!readdirSync(ROOT).includes('dist')) throw new Error('Run `npm run build` first: this check reads dist/.');
    const astroDir = join(DIST, '_astro');
    const sheets = readdirSync(astroDir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(astroDir, f), 'utf8'));
    // LCP CI follow-up: a system-font rule in a page-only stylesheet lets guide text resolve to the UI font while that
    // sheet loads (the late face is fetched); every such rule sits with the UI @font-face.
    const ui = sheets.filter((t) => /@font-face\s*\{[^}]*anolim-ui-\d+\./.test(t));
    expect(ui).toHaveLength(1);
    for (const t of sheets) if (!ui.includes(t)) expect(systemFontSelectors(t)).toEqual([]);
    const exempt = systemFontSelectors(ui[0]!);
    const h2 = exempt.filter((chain) => chain.at(-1)?.tag === 'h2');
    expect(h2.length).toBeGreaterThan(0);
    for (const chain of h2) expect(chain[0]!.classes).toContain('guide-index');
    const h2Texts = (html: string) => [...html.matchAll(/<h2\b[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1].trim());
    const guide = readFileSync(join(DIST, 'guide', 'index.html'), 'utf8');
    const topic = h2Texts(guide).find((t) => /[가-힣]/.test(t))!;
    expect(visibleText(guide, exempt)).not.toContain(topic);
    const tool = readFileSync(join(DIST, 'pdf-compress', 'index.html'), 'utf8');
    for (const t of h2Texts(tool)) expect(visibleText(tool, exempt)).toContain(t);
  });

  it('uncovered lists each missing character once and ignores whitespace', () => {
    expect(uncovered('가 나\n가다', new Set([0xac00]))).toEqual(['나', '다']);
  });
});

// ---------- dist checks (the gate runs these after `npm run build`) ----------

describe('built output', () => {
  const need = () => {
    if (!readdirSync(ROOT).includes('dist')) throw new Error('Run `npm run build` first: these checks read dist/.');
  };
  const walk = (dir: string, re: RegExp): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), re) : re.test(e.name) ? [join(dir, e.name)] : []));

  /**
   * The live tools of the build under test: a PUBLIC_BG_REMOVE=1 build (Sprint C, C2; the CI checks job) also has
   * /remove-background/, after /stamp-signature/ as in tools.ts. Unit tests themselves run with the flag off.
   */
  const builtLive = () => (existsSync(join(DIST, 'remove-background')) ? LIVE_TOOLS.flatMap((t) => (t.slug === 'stamp-signature' ? [t, BG_REMOVE_TOOL] : [t])) : LIVE_TOOLS);

  /** The env of the build under test: dist/ has MediaPipe only when it was built with auto-framing on (Step 4). */
  const buildEnv = (): NodeJS.ProcessEnv => ({
    ...process.env,
    PUBLIC_ID_PHOTO_AUTOFRAME: existsSync(join(DIST, 'vendor', 'mediapipe')) ? '1' : '0',
    // Sprint C, C2: and /remove-background/ only when it was built with PUBLIC_BG_REMOVE on.
    PUBLIC_BG_REMOVE: existsSync(join(DIST, 'remove-background')) ? '1' : '0',
    // C2-cloud: and the cloud path (with the privacy officer and contact it needs) when /privacy/ has its section.
    ...(cloudBuilt()
      ? { PUBLIC_BG_CLOUD: '1', PUBLIC_PRIVACY_OFFICER: process.env.PUBLIC_PRIVACY_OFFICER || '이종림', PUBLIC_CONTACT_EMAIL: process.env.PUBLIC_CONTACT_EMAIL || 'robotncoding@kakao.com' }
      : { PUBLIC_BG_CLOUD: '0' }),
    // Usage statistics (brief USAGE): on when /privacy/ has its section; on needs the contact address.
    ...(usageBuilt() ? { PUBLIC_USAGE_STATS: '1', PUBLIC_CONTACT_EMAIL: process.env.PUBLIC_CONTACT_EMAIL || 'robotncoding@kakao.com' } : { PUBLIC_USAGE_STATS: '0' }),
    PUBLIC_ERROR_BEACON_PATH: '',
    PUBLIC_USAGE_SAMPLE: '',
    // Google Analytics (owner 2026-10-08): on when the build has /ga.js (the test ID of the CI cloud build).
    PUBLIC_GA_ID: existsSync(join(DIST, 'ga.js')) ? (/gtag\('config','(G-[A-Z0-9]+)'/.exec(readFileSync(join(DIST, 'ga.js'), 'utf8'))?.[1] ?? '') : '',
  });
  /** The build under test has the anonymous usage statistics (PUBLIC_USAGE_STATS=1): /privacy/ has id="usage". */
  function usageBuilt(): boolean {
    return existsSync(join(DIST, 'privacy', 'index.html')) && readFileSync(join(DIST, 'privacy', 'index.html'), 'utf8').includes('id="usage"');
  }
  /** The build under test has the 배경 지우기 cloud path (PUBLIC_BG_CLOUD=1): its privacy page has section id="bg". */
  function cloudBuilt(): boolean {
    return existsSync(join(DIST, 'privacy', 'index.html')) && readFileSync(join(DIST, 'privacy', 'index.html'), 'utf8').includes('id="bg"');
  }

  it('C2-cloud: the cloud path and its exception wording only with PUBLIC_BG_CLOUD on; check-dist refuses the other state; no /spike/', () => {
    need();
    const on = cloudBuilt();
    expect(existsSync(join(DIST, 'spike'))).toBe(false);
    const callers = walk(join(DIST, '_astro'), /\.js$/).filter((f) => readFileSync(f, 'utf8').includes('/api/remove-bg'));
    expect(callers.length > 0).toBe(on);
    // Owner 2026-10-05: the home page names no exception in either build (it makes no "files never leave" claim).
    expect(readFileSync(join(DIST, 'index.html'), 'utf8').includes('예외')).toBe(false);
    expect(readFileSync(join(DIST, 'terms', 'index.html'), 'utf8').includes('배경 지우기는 예외로')).toBe(on);
    const other = on
      ? { ...buildEnv(), PUBLIC_BG_CLOUD: '0' }
      : { ...buildEnv(), PUBLIC_BG_REMOVE: '1', PUBLIC_BG_CLOUD: '1', PUBLIC_PRIVACY_OFFICER: '', PUBLIC_CONTACT_EMAIL: '' };
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-dist.mjs')], { env: other, encoding: 'utf8' });
    expect(r.status).toBe(1);
    if (on) {
      expect(r.stderr).toMatch(/calls \/api\/remove-bg in a build with PUBLIC_BG_CLOUD off/);
      expect(r.stderr).toContain('privacy/index.html: 배경 지우기 exception wording in a build with PUBLIC_BG_CLOUD off');
    } else {
      expect(r.stderr).toContain('PUBLIC_BG_CLOUD is on but PUBLIC_PRIVACY_OFFICER is not set');
      expect(r.stderr).toContain('PUBLIC_BG_CLOUD is on but PUBLIC_CONTACT_EMAIL is not a valid address');
      expect(r.stderr).toContain('privacy/index.html: no 배경 지우기 exception wording in a build with PUBLIC_BG_CLOUD on');
      for (const f of ['privacy/index.html', 'terms/index.html']) expect(r.stderr).toContain(`${f}: "files never leave" without the 배경 지우기 exception`);
      // Site-wide pages make no claim at all, so they need no exception in the cloud build.
      for (const f of ['index.html', '404.html', 'offline/index.html', 'llms.txt']) expect(r.stderr).not.toContain(`
  ${f}: "files never leave"`);
    }
  });

  it('C2-cloud round 2: cloud on, no site-wide "files never leave" claim without the exception (html and txt/xml/json); off, none of the cloud wording anywhere', () => {
    need();
    const on = cloudBuilt();
    const texts = walk(DIST, CLAIM_FILE_RE).map((f) => {
      const rel = f.slice(DIST.length + 1).replaceAll('\\', '/');
      return [rel, claimText(rel, readFileSync(f, 'utf8'))] as const;
    });
    expect(texts.map(([f]) => f)).toEqual(expect.arrayContaining(['index.html', '404.html', 'offline/index.html', 'llms.txt', 'sitemap.xml']));
    if (on) {
      const bad = texts.filter(([f]) => !LOCAL_SCOPE_RE.test(f)).flatMap(([f, t]) => unqualifiedClaims(t).map((c) => `${f}: ${c}`));
      expect(bad).toEqual([]);
      for (const f of ['index.html', 'llms.txt']) expect(QUALIFIER_RE.test(texts.find(([g]) => g === f)![1]), f).toBe(false);
    } else {
      expect(texts.filter(([, t]) => QUALIFIER_RE.test(t)).map(([f]) => f)).toEqual([]);
    }
  });

  it('an invalid PUBLIC_CONTACT_EMAIL fails the build (check-dist)', () => {
    need();
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-dist.mjs')], { env: { ...buildEnv(), PUBLIC_CONTACT_EMAIL: 'not-an-email' }, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('PUBLIC_CONTACT_EMAIL "not-an-email" is not an email address');
    const ok = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-dist.mjs')], { env: { ...buildEnv(), PUBLIC_CONTACT_EMAIL: 'help@example.kr' }, encoding: 'utf8' });
    expect(ok.status).toBe(0);
    // SEO-LENGTH: check-dist measured every page's meta and found none over the limits.
    const meta = /check-dist: meta, longest title (\d+) \(.+?\), longest description (\d+) /.exec(ok.stdout);
    expect(meta, ok.stdout).not.toBeNull();
    expect(Number(meta![1])).toBeLessThanOrEqual(40);
    expect(Number(meta![2])).toBeLessThanOrEqual(80);
  });

  it('usage statistics (brief USAGE): a stale PUBLIC_ERROR_BEACON_PATH, usage on without a contact, or a bad sample fail check-dist', () => {
    need();
    const check = (env: NodeJS.ProcessEnv) => spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-dist.mjs')], { env, encoding: 'utf8' });
    const stale = check({ ...buildEnv(), PUBLIC_ERROR_BEACON_PATH: '/api/e' });
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('PUBLIC_ERROR_BEACON_PATH is retired; use PUBLIC_USAGE_STATS=1');
    const noMail = buildEnv();
    delete noMail.PUBLIC_CONTACT_EMAIL;
    const r = check({ ...noMail, PUBLIC_USAGE_STATS: '1' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('usage statistics are enabled but PUBLIC_CONTACT_EMAIL is not set');
    for (const bad of ['0', '2', 'abc', '0.001', '-0.5']) {
      const b = check({ ...buildEnv(), PUBLIC_USAGE_SAMPLE: bad });
      expect(b.status, bad).toBe(1);
      expect(b.stderr).toContain(`PUBLIC_USAGE_SAMPLE "${bad}" is not a number between 0.01 and 1`);
    }
    // A valid sample alone changes nothing.
    expect(check({ ...buildEnv(), PUBLIC_USAGE_SAMPLE: '0.5' }).status).toBe(0);
  }, 120_000); // check-dist runs 8 times (about 5 s each on the auto-frame dist; Review T2)

  it('usage statistics: off, no script names sendBeacon or /api/usage; on, the tracker ships; check-dist refuses the other state', () => {
    need();
    const on = usageBuilt();
    const js = walk(DIST, /\.m?js$/).map((f) => readFileSync(f, 'utf8'));
    expect(js.some((t) => t.includes('sendBeacon'))).toBe(on);
    expect(js.some((t) => t.includes('/api/usage'))).toBe(on);
    const flipped = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-dist.mjs')], {
      env: { ...buildEnv(), PUBLIC_USAGE_STATS: on ? '0' : '1', PUBLIC_CONTACT_EMAIL: 'help@example.kr' },
      encoding: 'utf8',
    });
    expect(flipped.status).toBe(1);
    expect(flipped.stderr).toContain(on ? 'contains sendBeacon while PUBLIC_USAGE_STATS is off' : 'no script carries sendBeacon and /api/usage although PUBLIC_USAGE_STATS is on');
  });

  it('/admin and /api/ are never pages: not in the sitemap, llms.txt or the precache; _routes.json sends them to Functions', async () => {
    need();
    const { precacheList } = await import('../../scripts/gen-sw.mjs');
    const { urls } = precacheList(DIST);
    for (const u of urls as string[]) expect(/^\/(admin|api)(\/|$)/.test(u), u).toBe(false);
    for (const f of ['sitemap.xml', 'llms.txt']) {
      const text = readFileSync(join(DIST, f), 'utf8');
      expect(text, f).not.toMatch(/\/admin|\/api\//);
    }
    expect(existsSync(join(DIST, 'admin'))).toBe(false);
    expect(JSON.parse(readFileSync(join(DIST, '_routes.json'), 'utf8'))).toEqual({ version: 1, include: ['/api/*', '/admin', '/admin/*'], exclude: [] });
  });

  it('service worker: /offline/ is precached as the fallback, /404.html is not; the kill switch never reloads a tab', async () => {
    need();
    const { precacheList, KILL_SWITCH } = await import('../../scripts/gen-sw.mjs');
    const { urls } = precacheList(DIST);
    expect(urls).toContain('/offline/');
    expect(urls).not.toContain('/404.html');
    // Step 4: /licenses/ (its texts alone are ~half the budget) is not precached; every tool page is.
    expect(urls).not.toContain('/licenses/');
    // C2 round 2: /terms/ and /privacy/ are useless offline (stored when visited, sw.ts RUNTIME_PAGES).
    expect(urls).not.toContain('/terms/');
    expect(urls).not.toContain('/privacy/');
    // TOOLS4 T4 (450 KB never raised): /pdf-password/ from the start, and /hwp-viewer/ to make room (gen-sw.mjs).
    expect(urls).not.toContain('/pdf-password/');
    expect(urls).not.toContain('/hwp-viewer/');
    // TOOLS5 (brief decision 4): every new tool page from the start.
    expect(urls).not.toContain('/image-to-jpg/');
    expect(urls).not.toContain('/pdf-split/');
    expect(urls).not.toContain('/pdf-sign/');
    // HWPX2HWP (decision 16): the new page from the start.
    expect(urls).not.toContain('/hwpx-to-hwp/');
    for (const tool of ['/', '/pdf-merge/', '/pdf-compress/', '/photo-compress/', '/id-photo/']) expect(urls).toContain(tool);
    // Round 2: the lazily imported /id-photo/ controller is precached too (offline first use).
    expect(urls.some((u: string) => /^\/_astro\/controller\.[\w-]+\.js$/.test(u))).toBe(true);
    expect(KILL_SWITCH).toContain('registration.unregister()');
    expect(KILL_SWITCH).not.toMatch(/navigate|matchAll/);
    const offline = readFileSync(join(DIST, 'offline', 'index.html'), 'utf8');
    expect(offline).toContain('<meta name="robots" content="noindex">');
    expect(readFileSync(join(DIST, 'sitemap.xml'), 'utf8')).not.toContain('/offline/');
  });

  it('copy: no dpi, 구조 정리, 처음부터, 받아주세요 or "n %" in the shipped HTML and JS; the new strings are there', () => {
    need();
    const files = [...walk(DIST, /\.html$/), ...walk(join(DIST, '_astro'), /\.js$/)];
    const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    // "300 dpi" is the photo density on /id-photo/ only (Step 4 brief; docs/COPY.md): every other page keeps ppi.
    const visible = files
      .filter((f) => f.endsWith('.html') && !f.split(/[\\/]/).includes('id-photo'))
      .map((f) => readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' '))
      .join('\n');
    for (const bad of ['구조 정리', '처음부터', '받아주세요', '결과 확인 중']) expect(text, bad).not.toContain(bad);
    expect(visible).not.toMatch(/\bdpi\b/);
    expect(visible).not.toMatch(/\d %/);
    const ours = walk(join(DIST, '_astro'), /^index\.astro.*\.js$|^preload-helper.*\.js$/).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(ours).not.toMatch(/\d %|} % /);
    for (const good of ['다른 파일 처리하기', '파일 분석 중…', '마무리하는 중…', '% 줄었습니다', '인쇄용 선명도 (약 200 ppi)', '저장될 이름: ']) expect(text, good).toContain(good);
  });

  // Polish Q (owner): ordinary users do not know these words. Where a number must be read or typed, "픽셀(px)"
  // may appear once per page; everything else says 픽셀, 해상도, "이 기기", "밖으로 보내지 않음".
  const JARGON = /업로드|서버|브라우저|네트워크|메모리|개발자 도구|(?<![A-Za-z])(?:px|dpi|exif)(?![A-Za-z])/gi;
  // /licenses/ lists software as its authors name it. (/hwp-to-pdf/ has no exemption since HWP direct.)
  const COPY_EXEMPT_PAGES = ['licenses'];

  /** What a user reads on a page: the title, the meta/og texts, alt/aria-label/placeholder/title attributes and the body text. */
  const userText = (html: string): string =>
    [
      html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '',
      ...[...html.matchAll(/\s(?:content|alt|aria-label|placeholder|title)="([^"]*)"/g)].map((m) => m[1]!),
      html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' '),
    ].join('\n');

  it('plain language (Polish Q): no 업로드·서버·브라우저·네트워크·메모리·EXIF·px·dpi in the pages or in our UI strings', () => {
    need();
    const pages = walk(DIST, /\.html$/).filter((f) => !f.split(/[\\/]/).some((part) => COPY_EXEMPT_PAGES.includes(part)));
    expect(pages.length).toBeGreaterThanOrEqual(8);
    const hits: string[] = [];
    for (const f of pages) {
      const text = userText(readFileSync(f, 'utf8'));
      expect((text.match(/픽셀\(px\)/g) ?? []).length, `${f}: "픽셀(px)" more than once`).toBeLessThanOrEqual(1);
      for (const m of text.replace(/픽셀\(px\)/g, '').matchAll(JARGON)) hits.push(`${f}: …${text.slice(Math.max(0, m.index! - 30), m.index! + 20).replace(/\s+/g, ' ')}…`);
    }
    // UI strings in our JS: every quoted run that holds Hangul. Official quotes kept for the preset audit trail
    // (never shown) are exempt.
    const quotes = new Set(PRESETS.map((p) => p.quote).filter(Boolean));
    for (const f of walk(join(DIST, '_astro'), /\.js$/)) {
      for (const seg of readFileSync(f, 'utf8').match(/[^"'`\n]*[가-힣][^"'`\n]*/g) ?? []) {
        if (!seg.match(JARGON) || quotes.has(seg)) continue;
        for (const m of seg.matchAll(JARGON)) hits.push(`${f.split(/[\\/]/).pop()}: …${seg.slice(Math.max(0, m.index! - 30), m.index! + 20)}…`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('brand (Polish Q): "안올림" appears nowhere users can see it; the new name is in the pages, the manifest and the OG image text', () => {
    need();
    const files = [...walk(DIST, /\.(html|js|css|webmanifest|json|xml|txt)$/)].filter((f) => !f.split(/[\\/]/).includes('licenses'));
    const found = files.filter((f) => readFileSync(f, 'utf8').includes('안올림'));
    expect(found).toEqual([]);
    // Owner's brand rule: the name is always 문서딱. "docttak" appears only as the domain (docttak.com), never
    // as a name ("Docttak", "DOCTTAK", "독딱").
    // Sprint C, C2: the brief's Cache Storage name `docttak-model-birefnet-<exportId>` is an internal key, never shown;
    // so is C2-cloud's localStorage key `docttak-bg-mode`, and TOOLS5 U3's sessionStorage key `docttak:sign-png`.
    const misnamed = files.filter((f) => /독딱|docttak(?!\.com|-model-birefnet-|-bg-mode|:sign-png)/i.test(readFileSync(f, 'utf8').replace(/https?:\/\/docttak\.com/gi, '')));
    expect(misnamed).toEqual([]);
    const home = readFileSync(join(DIST, 'index.html'), 'utf8');
    expect(home).toContain('<meta property="og:site_name" content="문서딱">');
    expect(home).toContain('<title>PDF 합치기·용량 줄이기, 사진 용량·증명사진 규격 무료 | 문서딱</title>');
    const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8')) as { name: string; short_name: string };
    expect(manifest.short_name).toBe('문서딱');
    expect(manifest.name.startsWith('문서딱')).toBe(true);
  });

  it('share previews (Polish Q): every page has the full og/twitter set, absolute https URLs on the site host, a 1200×630 PNG that exists', () => {
    need();
    // The host every absolute URL must use: PUBLIC_SITE_URL of the build (read back from the home canonical).
    const home = readFileSync(join(DIST, 'index.html'), 'utf8');
    const site = new URL(home.match(/<link rel="canonical" href="([^"]+)"/)![1]!);
    if (process.env.PUBLIC_SITE_URL) expect(site.origin).toBe(new URL(process.env.PUBLIC_SITE_URL).origin);
    const pages = walk(DIST, /\.html$/).filter((f) => !/(^|[\\/])(naver|google)[0-9a-f]+\.html$/.test(f));
    expect(pages.length).toBeGreaterThanOrEqual(10);
    const png = (p: string) => {
      const b = readFileSync(p);
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), png: b.subarray(1, 4).toString() === 'PNG', size: b.length };
    };
    for (const f of pages) {
      const html = readFileSync(f, 'utf8');
      const meta = (attr: 'property' | 'name', key: string): string => {
        const m = html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`));
        expect(m, `${f}: ${key}`).not.toBeNull();
        return m![1]!;
      };
      // Growth G: a guide is an article with its own share image (/og/guide/<slug>.png).
      const guide = /[\\/]guide[\\/]([a-z0-9-]+)[\\/]index\.html$/.exec(f)?.[1];
      expect(meta('property', 'og:type')).toBe(guide ? 'article' : 'website');
      expect(meta('property', 'og:site_name')).toBe('문서딱');
      expect(meta('property', 'og:locale')).toBe('ko_KR');
      expect(meta('property', 'og:title')).toBe(html.match(/<title>([^<]*)<\/title>/)![1]);
      const desc = meta('property', 'og:description');
      expect([...desc].length, `${f}: og:description length`).toBeLessThanOrEqual(80);
      expect(desc.length).toBeGreaterThan(20);
      for (const key of ['og:url', 'og:image']) {
        const u = new URL(meta('property', key));
        expect(u.protocol, `${f}: ${key}`).toBe('https:');
        expect(u.host, `${f}: ${key}`).toBe(site.host);
      }
      expect(meta('property', 'og:image:type')).toBe('image/png');
      expect(meta('property', 'og:image:width')).toBe('1200');
      expect(meta('property', 'og:image:height')).toBe('630');
      expect(meta('property', 'og:image:alt')).toMatch(/^문서딱: /);
      expect(meta('name', 'twitter:card')).toBe('summary_large_image');
      expect(meta('name', 'twitter:title')).toBe(meta('property', 'og:title'));
      expect(meta('name', 'twitter:description')).toBe(desc);
      expect(meta('name', 'twitter:image')).toBe(meta('property', 'og:image'));
      const img = new URL(meta('property', 'og:image')).pathname;
      if (guide) expect(img, f).toBe(`/og/guide/${guide}.png`);
      else expect(img, f).toMatch(/^\/brand\/og-[a-z-]+\.png$/);
      expect(png(join(DIST, img)), `${f}: ${img}`).toMatchObject({ w: 1200, h: 630, png: true });
      expect(png(join(DIST, img)).size).toBeLessThanOrEqual(300 * 1024);
      expect(html, f).not.toContain('안올림');
    }
    // Each tool page has its own image; the legal pages share the default one.
    const imageOf = (path: string) => readFileSync(join(DIST, path, 'index.html'), 'utf8').match(/<meta property="og:image" content="[^"]*\/brand\/(og-[a-z-]+)\.png"/)![1];
    for (const slug of ['pdf-merge', 'pdf-compress', 'jpg-to-pdf', 'pdf-to-jpg', 'pdf-password', 'pdf-split', 'pdf-sign', 'image-to-jpg', 'photo-compress', 'id-photo', 'stamp-signature', 'hwp-to-pdf', 'hwp-viewer', 'hwpx-to-hwp']) expect(imageOf(slug)).toBe(`og-${slug}`);
    expect(imageOf('')).toBe('og-home');
    for (const p of ['privacy', 'terms', 'licenses']) expect(imageOf(p)).toBe('og-default');
  });

  it('/id-photo/ mentions auto-framing only in a build that has it (Step 4 round 2)', () => {
    need();
    const html = readFileSync(join(DIST, 'id-photo', 'index.html'), 'utf8');
    const on = existsSync(join(DIST, 'vendor', 'mediapipe'));
    for (const phrase of ['자동으로 잡아', '자동으로 맞춘', '자동 맞춤', '건너뛰고 직접 맞추기', '6 MB의 프로그램']) expect(html.includes(phrase), phrase).toBe(on);
    expect(html).toContain(on ? '얼굴 위치를 자동으로 잡아 드리고' : '안내선을 보며 사진 위치를 직접 맞춘 뒤');
  });

  it('/remove-background/ (Sprint C, C2): all of it with PUBLIC_BG_REMOVE on, no trace with it off; check-dist enforces both', () => {
    need();
    const on = existsSync(join(DIST, 'remove-background', 'index.html'));
    const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
    const llms = readFileSync(join(DIST, 'llms.txt'), 'utf8');
    const home = readFileSync(join(DIST, 'index.html'), 'utf8');
    const headers = readFileSync(join(DIST, '_headers'), 'utf8');
    expect(sitemap.includes('/remove-background/')).toBe(on);
    expect(llms.includes('/remove-background/')).toBe(on);
    expect(home.includes('href="/remove-background/"')).toBe(on);
    expect(existsSync(join(DIST, 'brand', 'og-remove-background.png'))).toBe(on);
    expect(existsSync(join(DIST, 'vendor', 'onnxruntime-web'))).toBe(on);
    expect(existsSync(join(DIST, 'vendor', 'birefnet-lite-512'))).toBe(on);
    expect(headers.includes('Cross-Origin-Embedder-Policy')).toBe(on);
    if (on) {
      expect(headers).toContain('/remove-background/*\n  Cross-Origin-Embedder-Policy: require-corp');
      // COEP never in the site-wide block (the worker scripts it also covers are this page's only).
      const siteWide = headers.split(/\r?\n(?=\S)/).find((b) => b.startsWith('/*'))!;
      expect(siteWide).toContain('Content-Security-Policy');
      expect(siteWide).not.toContain('Cross-Origin-Embedder-Policy');
      const page = readFileSync(join(DIST, 'remove-background', 'index.html'), 'utf8');
      expect(page).not.toMatch(/onnxruntime|birefnet|modulepreload[^>]*bg\./);
      expect(page).toContain('유리나 투명한 물건, 여러 사람이 함께 나온 사진, 복잡한 배경은 잘 안 될 수 있어요.');
      expect(page).not.toMatch(/remove\.bg/i);
    }
    // The other state is refused by check-dist on this build.
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-dist.mjs')], { env: { ...buildEnv(), PUBLIC_BG_REMOVE: on ? '0' : '1' }, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(on ? /names \/remove-background\/ in a build with PUBLIC_BG_REMOVE off/ : /remove-background\/index\.html: no file found/);
  });

  it('precache (Arch C2 ruling 3): no /remove-background/ page, controller, worker, engine or model file', async () => {
    need();
    const { precacheList } = await import('../../scripts/gen-sw.mjs');
    const { urls } = precacheList(DIST);
    expect(urls.filter((u: string) => /remove-background|\/_astro\/(bg\.|infer\.worker|fusion\.worker)|onnxruntime|birefnet/.test(u))).toEqual([]);
  });

  it('meta, og and JSON-LD of the home page name the live tools only (built HTML)', () => {
    need();
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    for (const name of ['PDF 합치기', 'PDF 용량 줄이기', '사진 용량 줄이기', '여권·증명사진 규격 맞추기', 'HWP PDF 변환']) expect(head).toContain(name);
    for (const name of ['한글(HWP) → PDF 변환']) expect(head).not.toContain(name);
  });

  // ---------- Growth G (T6–T12): guides, deep links, SEO files, on the built output ----------

  const decode = (s: string): string =>
    s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
      .replace(/&amp;/g, '&');
  const text = (html: string): string => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const GUIDES_DIR = join(ROOT, 'src', 'content', 'guides');
  const guideSources = () =>
    readdirSync(GUIDES_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const raw = readFileSync(join(GUIDES_DIR, f), 'utf8').replace(/\r\n/g, '\n');
        const fm = /^---\n([\s\S]*?)\n---/.exec(raw)![1]!;
        return { slug: f.replace(/\.md$/, ''), data: parseYaml(fm) as Record<string, unknown> };
      });
  const publishedGuides = () => guideSources().filter((g) => g.data.draft !== true).map((g) => ({ slug: g.slug, data: publishedGuideSchema.parse(g.data) }));
  const draftSlugs = () => guideSources().filter((g) => g.data.draft === true).map((g) => g.slug);
  const pageOf = (path: string) => readFileSync(join(DIST, ...path.split('/').filter(Boolean), 'index.html'), 'utf8');
  const jsonLdOf = (html: string): Record<string, unknown>[] =>
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
      const v = JSON.parse(m[1]!) as Record<string, unknown> | Record<string, unknown>[];
      return Array.isArray(v) ? v : [v];
    });
  const siteOf = () => new URL(readFileSync(join(DIST, 'index.html'), 'utf8').match(/<link rel="canonical" href="([^"]+)"/)![1]!);
  const indexable = () =>
    walk(DIST, /\.html$/).filter((f) => {
      if (/(^|[\\/])(naver|google)[0-9a-f]+\.html$/.test(f)) return false;
      return !readFileSync(f, 'utf8').includes('<meta name="robots" content="noindex">');
    });
  const distPathOf = (url: string): string => {
    const p = decodeURIComponent(url.split(/[?#]/)[0]!);
    return join(DIST, ...p.split('/').filter(Boolean), ...(p.endsWith('/') ? ['index.html'] : []));
  };

  it('Growth T6: every _redirects target exists; robots.txt names each bot and both sitemaps', () => {
    need();
    const rules = readFileSync(join(DIST, '_redirects'), 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'))
      .map((l) => l.trim().split(/\s+/));
    expect(rules.length).toBeGreaterThanOrEqual(4);
    for (const [from, to, code] of rules) {
      expect(code, from).toBe('301');
      expect(existsSync(distPathOf(to!)), `${from} → ${to}`).toBe(true);
    }
    for (const from of ['/hwp/', '/hwp-pdf/', '/guides/', '/passport/']) expect(rules.some((r) => r[0] === from), from).toBe(true);
    const robots = readFileSync(join(DIST, 'robots.txt'), 'utf8');
    expect(robots).toMatch(/^User-agent: \*\nAllow: \//);
    for (const bot of ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Claude-SearchBot', 'Google-Extended', 'Bingbot', 'Yeti', 'Daumoa']) {
      expect(robots, bot).toContain(`User-agent: ${bot}\nAllow: /`);
    }
    expect(robots).not.toMatch(/Disallow/);
    const site = siteOf();
    expect(robots).toContain(`Sitemap: ${new URL('/sitemap.xml', site).href}`);
    expect(robots).toContain(`Sitemap: ${new URL('/guide/rss.xml', site).href}`);
  });

  it('Growth T7: guides, /guide/, the RSS title, the share-image alt texts and the JSON-LD names say 문서딱', () => {
    need();
    const guides = publishedGuides();
    expect(guides.length).toBeGreaterThanOrEqual(11);
    for (const path of ['/guide/', ...guides.map((g) => `/guide/${g.slug}/`)]) {
      const html = pageOf(path);
      expect(html.match(/<title>([^<]*)<\/title>/)![1], path).toMatch(/ \| 문서딱$/);
      expect(html.match(/<meta property="og:image:alt" content="([^"]*)"/)![1], path).toMatch(/^문서딱: /);
      for (const ld of jsonLdOf(html)) {
        for (const who of [ld.author, ld.publisher] as ({ name?: string } | undefined)[]) if (who) expect(who.name, path).toBe('문서딱');
        const crumbs = ld.itemListElement as { name: string }[] | undefined;
        if (ld['@type'] === 'BreadcrumbList') expect(crumbs![0]!.name).toBe('문서딱');
      }
    }
    const rss = readFileSync(join(DIST, 'guide', 'rss.xml'), 'utf8');
    expect(rss).toContain('<title>문서딱 안내</title>');
    expect(readFileSync(join(DIST, 'llms.txt'), 'utf8')).toMatch(/^# 문서딱\n/);
  });

  it('Growth T8: every JSON-LD block parses; a guide has one Article, one BreadcrumbList and a FAQPage equal to its visible FAQ', () => {
    need();
    for (const f of walk(DIST, /\.html$/)) expect(() => jsonLdOf(readFileSync(f, 'utf8')), f).not.toThrow();
    const site = siteOf();
    // Home (GEO audit): WebSite, Organization and an ItemList of the live tools, generated from tools.ts.
    const homeLd = jsonLdOf(readFileSync(join(DIST, 'index.html'), 'utf8'));
    const website = homeLd.filter((x) => x['@type'] === 'WebSite');
    expect(website.length).toBe(1);
    expect(website[0]).toMatchObject({ name: '문서딱', url: new URL('/', site).href });
    expect(homeLd.filter((x) => x['@type'] === 'Organization').length).toBe(1);
    const lists = homeLd.filter((x) => x['@type'] === 'ItemList');
    expect(lists.length).toBe(1);
    const entries = lists[0]!.itemListElement as { position: number; item: Record<string, unknown> }[];
    expect(entries.map((e) => e.position)).toEqual(builtLive().map((_, i) => i + 1));
    builtLive().forEach((t, i) => {
      const it = entries[i]!.item;
      expect(['WebApplication', 'SoftwareApplication']).toContain(it['@type']);
      expect(it).toMatchObject({ name: t.name, url: new URL(`/${t.slug}/`, site).href, isAccessibleForFree: true });
      expect(typeof it.applicationCategory).toBe('string');
      expect((it.offers as { price: number }).price).toBe(0);
    });
    for (const g of publishedGuides()) {
      const html = pageOf(`/guide/${g.slug}/`);
      const ld = jsonLdOf(html);
      const articles = ld.filter((x) => x['@type'] === 'Article');
      expect(articles.length, g.slug).toBe(1);
      const a = articles[0]!;
      for (const k of ['headline', 'description', 'datePublished', 'dateModified', 'author', 'publisher', 'image', 'mainEntityOfPage', 'inLanguage', 'citation']) expect(a[k], `${g.slug}: ${k}`).toBeDefined();
      expect(a.headline).toBe(g.data.title);
      expect(a.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.dateModified).toBe(g.data.updated);
      expect(a.inLanguage).toBe('ko-KR');
      const img = new URL(String(a.image));
      expect(img.origin).toBe(site.origin);
      expect(existsSync(join(DIST, img.pathname)), String(a.image)).toBe(true);
      expect((a.citation as string[]).every((u) => /^https:\/\//.test(u))).toBe(true);
      expect(ld.some((x) => x['@type'] === 'HowTo')).toBe(false);
      const crumbs = ld.filter((x) => x['@type'] === 'BreadcrumbList');
      expect(crumbs.length).toBe(1);
      const items = crumbs[0]!.itemListElement as { position: number; item: string; name: string }[];
      expect(items.map((i) => i.position)).toEqual(items.map((_, i) => i + 1));
      for (const i of items) expect(new URL(i.item).origin).toBe(site.origin);
      expect(items.map((i) => i.name)).toEqual(['문서딱', '안내', g.data.title]);
      const faq = ld.filter((x) => x['@type'] === 'FAQPage');
      expect(faq.length).toBe(1);
      const visible = [...html.matchAll(/<div class="guide-qa"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => ({ q: decode(m[1]!), a: decode(m[2]!) }));
      const data = (faq[0]!.mainEntity as { name: string; acceptedAnswer: { text: string } }[]).map((e) => ({ q: e.name, a: e.acceptedAnswer.text }));
      expect(visible.length, g.slug).toBeGreaterThanOrEqual(3);
      expect(data).toEqual(visible);
    }
  });

  it('Growth T9: answer, source link and date on every guide; every number with a unit is sourced; no quote is rendered', () => {
    need();
    const site = siteOf();
    for (const g of publishedGuides()) {
      const html = pageOf(`/guide/${g.slug}/`);
      expect(html, g.slug).toMatch(/<p class="guide-answer"[^>]*>/);
      expect(html).toMatch(/<time datetime="\d{4}-\d{2}-\d{2}"/);
      const external = [...html.matchAll(/<a href="(https:\/\/[^"]+)"/g)].map((m) => new URL(decode(m[1]!))).filter((u) => u.host !== site.host);
      expect(external.length, g.slug).toBeGreaterThan(0);
      const article = html.match(/<article[\s\S]*?<\/article>/)![0];
      expect(unsourcedFacts(g.data, text(article)), g.slug).toEqual([]);
      for (const s of resolveSources(g.data.sources)) {
        expect((Date.now() - Date.parse(`${s.retrieved}T00:00:00Z`)) / 86_400_000, `${g.slug}: ${s.url}`).toBeLessThanOrEqual(MAX_SOURCE_AGE_DAYS);
      }
      const page = text(html);
      // Statute text is the one exception (Sprint C brief, C1-G2 e-signature-law: "the page quotes and links"):
      // a law article from law.go.kr is shown verbatim; every other quote stays the audit trail only.
      const statute = (url: string): boolean => new URL(url).host === 'www.law.go.kr';
      const quotes = [
        ...g.data.sources.flatMap((s) => ('quote' in s && !statute(s.url) ? [s.quote] : [])),
        ...g.data.sources.flatMap((s) => ('preset' in s ? [getPreset(s.preset)?.quote ?? ''] : [])),
      ].filter(Boolean);
      for (const q of quotes) expect(page.includes(q.replace(/\s+/g, ' ')), `${g.slug}: quote rendered`).toBe(false);
    }
  });

  it('Growth T10: unique titles and descriptions; path-only canonicals; sitemap, RSS and precache match the published guides', async () => {
    need();
    const titles = new Map<string, string>();
    const descs = new Map<string, string>();
    for (const f of indexable()) {
      const html = readFileSync(f, 'utf8');
      const t = html.match(/<title>([^<]*)<\/title>/)![1]!;
      const d = html.match(/<meta name="description" content="([^"]*)"/)![1]!;
      expect(titles.get(t), `${f} and ${titles.get(t)} share the title`).toBeUndefined();
      expect(descs.get(d), `${f} and ${descs.get(d)} share the description`).toBeUndefined();
      titles.set(t, f);
      descs.set(d, f);
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      expect(canonical, f).toBeDefined();
      expect(canonical, f).not.toContain('?');
    }
    const guides = publishedGuides();
    for (const g of guides) {
      const html = pageOf(`/guide/${g.slug}/`);
      const t = decode(html.match(/<title>([^<]*)<\/title>/)![1]!).replace(/ \| 문서딱$/, '');
      expect([...t].length).toBeLessThanOrEqual(40);
      const d = [...decode(html.match(/<meta name="description" content="([^"]*)"/)![1]!)].length;
      expect(d).toBeGreaterThanOrEqual(50);
      expect(d).toBeLessThanOrEqual(110);
    }
    const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
    const locs = [...sitemap.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod><\/url>/g)].map((m) => new URL(m[1]!).pathname);
    expect(locs.length).toBe([...sitemap.matchAll(/<url>/g)].length);
    for (const g of guides) expect(locs, g.slug).toContain(`/guide/${g.slug}/`);
    for (const d of draftSlugs()) expect(locs).not.toContain(`/guide/${d}/`);
    expect(sitemap).not.toMatch(/<loc>[^<]*[?]/);
    const rss = readFileSync(join(DIST, 'guide', 'rss.xml'), 'utf8');
    // Well-formed XML: one declaration, balanced elements, no raw "<" or bare "&" in text.
    const body = rss.replace(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n/, '');
    const stack: string[] = [];
    for (const m of body.matchAll(/<(\/?)([A-Za-z][\w:-]*)(?:\s[^<>]*)?>|([^<]+)/g)) {
      if (m[3] !== undefined) {
        expect(m[3], 'bare & in the feed').not.toMatch(/&(?!(?:amp|lt|gt|quot|apos);)/);
        continue;
      }
      if (m[1]) expect(stack.pop(), `closing ${m[2]}`).toBe(m[2]);
      else stack.push(m[2]!);
    }
    expect(stack).toEqual([]);
    const items = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]!);
    const links = items.map((i) => new URL(decode(i.match(/<link>([^<]+)<\/link>/)![1]!)).pathname).sort();
    expect(links).toEqual([...guides.map((g) => `/guide/${g.slug}/`), ...HUB_SLUGS.map((h) => `/guide/${h}/`)].sort());
    for (const h of HUB_SLUGS) expect(locs, h).toContain(`/guide/${h}/`);
    for (const i of items) expect(i.match(/<pubDate>([^<]+)<\/pubDate>/)![1]).toMatch(/^\w{3}, \d{2} \w{3} \d{4} 09:00:00 \+0900$/);
    const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
    const precache = JSON.parse(sw.match(/const __PRECACHE__ = (\[[^\n]*\]);/)![1]!) as string[];
    expect(precache.filter((p) => p.startsWith('/guide/') || p.startsWith('/og/'))).toEqual([]);
    for (const g of guides) {
      const html = pageOf(`/guide/${g.slug}/`);
      expect(html).toContain(`<meta property="og:image" content="${new URL(`/og/guide/${g.slug}.png`, siteOf()).href}">`);
    }
  });

  it('Growth T11: internal links resolve; queries only as valid tool deep links; guides link out and are listed', () => {
    need();
    const live = builtLive().map((t) => t.slug);
    const broken: string[] = [];
    for (const f of walk(DIST, /\.html$/)) {
      const html = readFileSync(f, 'utf8');
      for (const m of html.matchAll(/\s(?:href|src)="(\/(?!\/)[^"]*)"/g)) {
        const url = decode(m[1]!);
        if (!existsSync(distPathOf(url))) broken.push(`${f}: ${url}`);
        const q = url.split('#')[0]!.split('?')[1];
        if (q !== undefined && !parseHref(url.split('#')[0]!, live)) broken.push(`${f}: query on a non-tool or invalid link ${url}`);
      }
    }
    expect(broken).toEqual([]);
    const index = pageOf('/guide/');
    for (const g of publishedGuides()) {
      const html = pageOf(`/guide/${g.slug}/`);
      const more = html.match(/<aside[\s\S]*?<\/aside>/)![0];
      const guideLinks = new Set([...more.matchAll(/href="\/guide\/([a-z0-9-]+)\/"/g)].map((m) => m[1]));
      const toolLinks = new Set([...html.matchAll(/href="\/([a-z0-9-]+)\/(?:\?[^"]*)?"/g)].map((m) => m[1]).filter((s) => live.includes(s!)));
      expect(guideLinks.size, `${g.slug}: guide links`).toBeGreaterThanOrEqual(2);
      expect(toolLinks.size, `${g.slug}: tool links`).toBeGreaterThanOrEqual(1);
      expect(index, g.slug).toContain(`href="/guide/${g.slug}/"`);
    }
    for (const d of draftSlugs()) expect(existsSync(join(DIST, 'guide', d)), d).toBe(false);
  });

  it('Growth T12: plain language also in the RSS text, llms.txt and the share-image alt texts; the check catches 업로드', () => {
    need();
    const hits = (s: string) => [...s.replace(/픽셀\(px\)/g, '').matchAll(JARGON)].map((m) => m[0]);
    const rss = decode(readFileSync(join(DIST, 'guide', 'rss.xml'), 'utf8').replace(/<[^>]+>/g, ' '));
    expect(hits(rss)).toEqual([]);
    expect(hits(readFileSync(join(DIST, 'llms.txt'), 'utf8'))).toEqual([]);
    for (const g of publishedGuides()) {
      const text = userText(pageOf(`/guide/${g.slug}/`));
      expect(hits(text), g.slug).toEqual([]);
      expect((text.match(/픽셀\(px\)/g) ?? []).length).toBeLessThanOrEqual(1);
    }
    // Negative fixture: a guide that says 업로드 fails the same check.
    const fixture = '<title>사진 올리기 | 문서딱</title><article class="guide"><p class="guide-answer">사진을 업로드하면 돼요.</p></article>';
    expect(hits(userText(fixture))).toEqual(['업로드']);
  });

  it('G2 A1: hubs are articles with a FAQPage equal to the visible FAQ, in sitemap, RSS and llms.txt, plain language, linked from /guide/', () => {
    need();
    const index = pageOf('/guide/');
    const llms = readFileSync(join(DIST, 'llms.txt'), 'utf8');
    const hits = (s: string) => [...s.replace(/픽셀\(px\)/g, '').matchAll(JARGON)].map((m) => m[0]);
    for (const h of HUB_SLUGS) {
      const html = pageOf(`/guide/${h}/`);
      const ld = jsonLdOf(html);
      expect(ld.filter((x) => x['@type'] === 'Article').length, h).toBe(1);
      const faq = ld.find((x) => x['@type'] === 'FAQPage')!;
      const visible = [...html.matchAll(/<div class="guide-qa"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => ({ q: decode(m[1]!), a: decode(m[2]!) }));
      expect((faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[]).map((e) => ({ q: e.name, a: e.acceptedAnswer.text }))).toEqual(visible);
      expect(visible.length).toBeGreaterThanOrEqual(3);
      expect(index, h).toContain(`href="/guide/${h}/"`);
      expect(llms, h).toContain(`/guide/${h}/`);
      expect(hits(userText(html)), h).toEqual([]);
      expect(html).toContain('<table>');
    }
  });

  it('G2 A1 link graph: a hub links every guide with a spec row of its kind; no guide is an orphan (index + another guide or hub)', () => {
    need();
    const guides = publishedGuides();
    const inLinks = new Map<string, Set<string>>();
    const linksOf = (html: string) => new Set([...html.matchAll(/href="\/guide\/([a-z0-9-]+)\/"/g)].map((m) => m[1]!));
    for (const from of [...guides.map((g) => g.slug), ...HUB_SLUGS]) {
      for (const to of linksOf(pageOf(`/guide/${from}/`))) if (to !== from) (inLinks.get(to) ?? inLinks.set(to, new Set()).get(to)!).add(from);
    }
    for (const h of HUB_SLUGS) {
      const links = linksOf(pageOf(`/guide/${h}/`));
      for (const g of guides.filter((x) => x.data.spec.some((r) => r.kind === HUB_KIND[h]))) expect(links.has(g.slug), `${h} → ${g.slug}`).toBe(true);
    }
    for (const g of guides) expect(inLinks.get(g.slug)?.size ?? 0, `${g.slug}: links from other guides or hubs`).toBeGreaterThanOrEqual(1);
  });

  it('G2 A1: no ad slot is rendered on a guide or hub while ads are off; no two articles are near-duplicates (max pair reported)', () => {
    need();
    const pages = [...publishedGuides().map((g) => g.slug), ...HUB_SLUGS].map((s) => [s, pageOf(`/guide/${s}/`)] as const);
    for (const [s, html] of pages) expect(html.includes('ad-slot'), s).toBe(false);
    const { max, over } = duplicatePairs(pages.map(([s, html]) => [s, articleText(html)]));
    console.log(`guide similarity max pair: ${max.a} ~ ${max.b} ${max.j.toFixed(3)}`);
    expect(over).toEqual([]);
    expect(max.j).toBeLessThan(DUP_LIMIT);
    // The measure itself: identical text is 1, unrelated text 0.
    expect(jaccard(shingles('여권사진 규격과 사이즈'), shingles('여권사진 규격과 사이즈'))).toBe(1);
    expect(jaccard(shingles('여권사진 규격'), shingles('PDF 합치기 방법'))).toBe(0);
    expect(articleText('<p>밖</p><article><h1>제목 &amp; 본문</h1><script>x</script></article>')).toBe('제목&본문');
  });

  it('fix-forward: the 404 map is JSON with "<" escaped; guide source labels have no nested parentheses', () => {
    need();
    const nf = readFileSync(join(DIST, '404.html'), 'utf8').match(/<script type="application\/json" id="nf-map">([\s\S]*?)<\/script>/)![1]!;
    expect(nf).not.toContain('<');
    expect(() => JSON.parse(nf)).not.toThrow();
    for (const g of publishedGuides()) {
      const html = pageOf(`/guide/${g.slug}/`);
      for (const m of html.matchAll(/<p class="guide-source"[^>]*>[\s\S]*?<\/p>|<section class="guide-sources"[\s\S]*?<\/section>/g)) expect(text(m[0]), g.slug).not.toMatch(/\([^()]*\(/);
    }
  });
});

describe('custom domain build (P.19)', { timeout: 240_000 }, () => {
  it('PUBLIC_SITE_URL=https://example.kr: no pages.dev anywhere in the pages, sitemap, robots or manifest; HSTS for it; the contact line becomes a mailto link', () => {
    const out = join(tmp, 'domain-build');
    const env = { ...process.env, PUBLIC_SITE_URL: 'https://example.kr', PUBLIC_CONTACT_EMAIL: 'help@example.kr', PUBLIC_BIZ_REG_NO: '123-45-67890' };
    execFileSync(process.execPath, [join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs'), 'build', '--outDir', out], { cwd: ROOT, env, stdio: 'pipe' });
    execFileSync(process.execPath, [join(ROOT, 'scripts', 'gen-headers.mjs'), '--dist', out], { cwd: ROOT, env, stdio: 'pipe' });
    const files = [...readdirSync(out, { recursive: true, withFileTypes: false } as never)]
      .map(String)
      .filter((f) => /\.html$|^sitemap\.xml$|^robots\.txt$|^manifest\.webmanifest$/.test(f.split(/[\\/]/).pop()!));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) expect(readFileSync(join(out, f), 'utf8'), f).not.toContain('pages.dev');
    const home = readFileSync(join(out, 'index.html'), 'utf8');
    expect(home).toContain('<link rel="canonical" href="https://example.kr/">');
    expect(home).toContain('문의: <a href="mailto:help@example.kr">help@example.kr</a>');
    expect(home).toContain('사업자등록번호 123-45-67890');
    const headers = readFileSync(join(out, '_headers'), 'utf8');
    expect(headers).toContain('https://example.kr/*\n  Strict-Transport-Security: max-age=31536000');
    expect(headers).toContain('https://doc-tools-kr.pages.dev/*\n  X-Robots-Tag: noindex');
  });
});
