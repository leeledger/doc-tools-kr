// Static guard (brief §3.3): shipped source must not contain network APIs that could carry file data.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', 'src');
const FORBIDDEN = ['XMLHttpRequest', 'WebSocket', 'EventSource'];
/**
 * Files allowed to call fetch( — only same-origin GETs of our own static files, never file data.
 * - lib/codecs/wasm-browser.ts: the jSquash codec loads (MozJPEG, resize, WebP) shared by both workers.
 * - lib/pdf/compress/wasm-browser.ts: the compress worker's qpdf load (a same-origin module import).
 * - lib/ui/engine-load.ts: GET /deploy-manifest.json for the engine-panel copy (Polish P.1).
 * - sw/sw.ts: the service worker's allowlisted same-origin GETs (Polish P.11; it never reads a body).
 * - lib/hwp/wasm-browser.ts: rhwp wasm, own origin (Step 5).
 * (The preload, Polish P.7, calls no network API itself: its warm workers load through the wasm loaders.)
 */
const FETCH_ALLOWLIST: string[] = ['lib/codecs/wasm-browser.ts', 'lib/pdf/compress/wasm-browser.ts', 'lib/ui/engine-load.ts', 'sw/sw.ts', 'lib/hwp/wasm-browser.ts'];
/** sendBeacon only in the error-beacon stub, which is off (and dropped from the bundle) unless configured. */
const BEACON_ALLOWLIST: string[] = ['lib/ui/beacon.ts'];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return d.name === 'generated' ? [] : files(p);
    return /\.(ts|mjs|js|astro)$/.test(d.name) ? [p] : [];
  });
}

describe('no network APIs in src/', () => {
  const all = files(SRC);

  it('scans a non-trivial number of files', () => {
    expect(all.length).toBeGreaterThan(10);
  });

  it.each(FORBIDDEN)('does not use %s', (api) => {
    const hits = all.filter((f) => readFileSync(f, 'utf8').includes(api)).map((f) => relative(SRC, f));
    expect(hits).toEqual([]);
  });

  it('uses fetch( only in allowlisted files', () => {
    const hits = all
      .filter((f) => /\bfetch\s*\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).split('\\').join('/'));
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(FETCH_ALLOWLIST, h).toContain(h);
  });

  it('in the HWP module only wasm-browser.ts calls fetch( (rhwp wasm, own origin)', () => {
    const hits = all
      .filter((f) => /\bfetch\s*\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).split('\\').join('/'));
    expect(hits.filter((h) => h.startsWith('lib/hwp/'))).toEqual(['lib/hwp/wasm-browser.ts']);
  });

  it('uses sendBeacon only in the beacon stub', () => {
    const hits = all.filter((f) => readFileSync(f, 'utf8').includes('sendBeacon')).map((f) => relative(SRC, f).split('\\').join('/'));
    expect(hits).toEqual(BEACON_ALLOWLIST);
  });

  it('never imports the original pdf-lib', () => {
    const hits = all.filter((f) => /from\s+['"]pdf-lib['"]/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
