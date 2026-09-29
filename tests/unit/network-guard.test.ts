// Static guard (brief §3.3): shipped source must not contain network APIs that could carry file data.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', 'src');
const FORBIDDEN = ['sendBeacon', 'XMLHttpRequest', 'WebSocket', 'EventSource'];
/**
 * Files allowed to call fetch( — only for our own static assets (versioned same-origin GETs, no file data).
 * - lib/codecs/wasm-browser.ts: the jSquash codec loads (MozJPEG, resize, WebP) shared by both workers.
 * - lib/pdf/compress/wasm-browser.ts: the compress worker's qpdf load (a same-origin module import).
 */
const FETCH_ALLOWLIST: string[] = ['lib/codecs/wasm-browser.ts', 'lib/pdf/compress/wasm-browser.ts'];

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

  it('uses fetch( only in allowlisted files, and the allowlist names exactly the two wasm loaders', () => {
    const hits = all
      .filter((f) => /\bfetch\s*\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).split('\\').join('/'));
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(FETCH_ALLOWLIST, h).toContain(h);
    expect(FETCH_ALLOWLIST).toEqual(['lib/codecs/wasm-browser.ts', 'lib/pdf/compress/wasm-browser.ts']);
  });

  it('never imports the original pdf-lib', () => {
    const hits = all.filter((f) => /from\s+['"]pdf-lib['"]/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
