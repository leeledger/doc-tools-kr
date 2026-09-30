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
import { smokeAssets } from '../../scripts/smoke-assets.mjs';
import { startServer } from '../e2e/serve.mjs';
import { PRESETS } from '../../src/data/id-photo-presets';

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
  function site(): string {
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
    expect(og).toEqual(['default', 'home', 'hwp-to-pdf', 'id-photo', 'pdf-compress', 'pdf-merge', 'photo-compress'].map((n) => `brand/og-${n}.png`));
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

// ---------- P.12 UI font instances ----------

describe('UI font static instances (P.12)', () => {
  const gen = join(ROOT, 'src', 'generated');
  const tables = (b: Buffer) => {
    const n = b.readUInt16BE(4);
    const out: Record<string, number> = {};
    for (let i = 0; i < n; i++) out[b.toString('latin1', 12 + i * 16, 16 + i * 16)] = b.readUInt32BE(12 + i * 16 + 8);
    return out;
  };

  it.each([400, 600, 700, 800])('%d: no fvar, usWeightClass = %d, the name guard passes, ≤ 50 KB', async (w) => {
    const woff2 = readFileSync(join(gen, `anolim-ui-${w}.woff2`));
    expect(woff2.length).toBeLessThanOrEqual(50 * 1024);
    const sfnt = Buffer.from(await fontverter.convert(woff2, 'truetype', 'woff2'));
    const t = tables(sfnt);
    expect(t.fvar).toBeUndefined();
    expect(t.gvar).toBeUndefined();
    expect(sfnt.readUInt16BE(t['OS/2']! + 4)).toBe(w);
    expect(reservedNameProblems(new Uint8Array(sfnt), 'Pretendard')).toEqual([]);
  });

  it('the CSS has four faces, each with a single weight and format("woff2")', () => {
    const css = readFileSync(join(gen, 'anolim-ui.css'), 'utf8');
    const faces = css.match(/@font-face \{[^}]+\}/g) ?? [];
    expect(faces).toHaveLength(4);
    expect(faces.map((f) => f.match(/font-weight: ([^;]+);/)![1])).toEqual(['400', '600', '700', '800']);
    for (const f of faces) expect(f).toContain("format('woff2')");
    const total = [400, 600, 700, 800].reduce((a, w) => a + statSync(join(gen, `anolim-ui-${w}.woff2`)).size, 0);
    // 190 KB since Step 4 round 2 (Arch; check-dist has the same limit).
    expect(total).toBeLessThanOrEqual(190 * 1024);
  });
});

// ---------- dist checks (the gate runs these after `npm run build`) ----------

describe('built output', () => {
  const need = () => {
    if (!readdirSync(ROOT).includes('dist')) throw new Error('Run `npm run build` first: these checks read dist/.');
  };
  const walk = (dir: string, re: RegExp): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), re) : re.test(e.name) ? [join(dir, e.name)] : []));

  /** The env of the build under test: dist/ has MediaPipe only when it was built with auto-framing on (Step 4). */
  const buildEnv = (): NodeJS.ProcessEnv => ({ ...process.env, PUBLIC_ID_PHOTO_AUTOFRAME: existsSync(join(DIST, 'vendor', 'mediapipe')) ? '1' : '0' });

  it('an invalid PUBLIC_CONTACT_EMAIL fails the build (check-dist)', () => {
    need();
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-dist.mjs')], { env: { ...buildEnv(), PUBLIC_CONTACT_EMAIL: 'not-an-email' }, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('PUBLIC_CONTACT_EMAIL "not-an-email" is not an email address');
    const ok = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-dist.mjs')], { env: { ...buildEnv(), PUBLIC_CONTACT_EMAIL: 'help@example.kr' }, encoding: 'utf8' });
    expect(ok.status).toBe(0);
  });

  it('the error beacon without PUBLIC_CONTACT_EMAIL fails the build (Arch, round 2); unset contact alone does not', () => {
    need();
    const base = buildEnv();
    delete base.PUBLIC_CONTACT_EMAIL;
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-dist.mjs')], { env: { ...base, PUBLIC_ERROR_BEACON_PATH: '/api/e' }, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('the error beacon is enabled but PUBLIC_CONTACT_EMAIL is not set');
    // "//host" is not a same-origin path, so the beacon stays off and nothing is required.
    const off = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-dist.mjs')], { env: { ...base, PUBLIC_ERROR_BEACON_PATH: '//evil.example/e' }, encoding: 'utf8' });
    expect(off.status).toBe(0);
  });

  it('service worker: /offline/ is precached as the fallback, /404.html is not; the kill switch never reloads a tab', async () => {
    need();
    const { precacheList, KILL_SWITCH } = await import('../../scripts/gen-sw.mjs');
    const { urls } = precacheList(DIST);
    expect(urls).toContain('/offline/');
    expect(urls).not.toContain('/404.html');
    // Step 4: /licenses/ (its texts alone are ~half the budget) is not precached; every tool page is.
    expect(urls).not.toContain('/licenses/');
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
  // /hwp-to-pdf/ is being reworked on the hwp-direct branch (its copy is rewritten there); /licenses/ lists
  // software as its authors name it. The HWP tool's own strings are recognised by their source files.
  const COPY_EXEMPT_PAGES = ['licenses', 'hwp-to-pdf'];
  const hwpSources = (): string =>
    [join(ROOT, 'src', 'tools', 'hwp-to-pdf'), join(ROOT, 'src', 'lib', 'hwp')]
      .flatMap((d) => walk(d, /\.ts$/))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');

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
    // (never shown) and the HWP tool's strings (rewritten on its branch) are exempt.
    const hwp = hwpSources();
    const quotes = new Set(PRESETS.map((p) => p.quote).filter(Boolean));
    for (const f of walk(join(DIST, '_astro'), /\.js$/)) {
      for (const seg of readFileSync(f, 'utf8').match(/[^"'`\n]*[가-힣][^"'`\n]*/g) ?? []) {
        if (!seg.match(JARGON) || quotes.has(seg)) continue;
        const pieces = seg.split(/\$\{[^}]*\}/).map((p) => p.trim()).filter((p) => /[가-힣]/.test(p));
        if (pieces.every((p) => hwp.includes(p))) continue;
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
    const misnamed = files.filter((f) => /독딱|docttak(?!\.com)/i.test(readFileSync(f, 'utf8').replace(/https?:\/\/docttak\.com/gi, '')));
    expect(misnamed).toEqual([]);
    const home = readFileSync(join(DIST, 'index.html'), 'utf8');
    expect(home).toContain('<meta property="og:site_name" content="문서딱">');
    expect(home).toContain('<title>PDF 합치기·용량 줄이기, 사진 용량·증명사진 규격, 한글 PDF 변환 무료 | 문서딱</title>');
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
      expect(meta('property', 'og:type')).toBe('website');
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
      expect(img, f).toMatch(/^\/brand\/og-[a-z-]+\.png$/);
      expect(png(join(DIST, img)), `${f}: ${img}`).toMatchObject({ w: 1200, h: 630, png: true });
      expect(png(join(DIST, img)).size).toBeLessThanOrEqual(300 * 1024);
      expect(html, f).not.toContain('안올림');
    }
    // Each tool page has its own image; the legal pages share the default one.
    const imageOf = (path: string) => readFileSync(join(DIST, path, 'index.html'), 'utf8').match(/<meta property="og:image" content="[^"]*\/brand\/(og-[a-z-]+)\.png"/)![1];
    for (const slug of ['pdf-merge', 'pdf-compress', 'photo-compress', 'id-photo', 'hwp-to-pdf']) expect(imageOf(slug)).toBe(`og-${slug}`);
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

  it('meta, og and JSON-LD of the home page name the live tools only (built HTML)', () => {
    need();
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    for (const name of ['PDF 합치기', 'PDF 용량 줄이기', '사진 용량 줄이기', '여권·증명사진 규격 맞추기', 'HWP PDF 변환']) expect(head).toContain(name);
    for (const name of ['한글(HWP) → PDF 변환']) expect(head).not.toContain(name);
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
