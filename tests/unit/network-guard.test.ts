// Static guard (brief §3.3): shipped source must not contain network APIs that could carry file data.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', 'src');
const FORBIDDEN = ['sendBeacon', 'XMLHttpRequest', 'WebSocket', 'EventSource'];
/** Files allowed to call fetch( — only for our own static assets. Currently none. */
const FETCH_ALLOWLIST: string[] = [];

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
      .map((f) => relative(SRC, f).split('\\').join('/'))
      .filter((f) => !FETCH_ALLOWLIST.includes(f));
    expect(hits).toEqual([]);
  });

  it('never imports the original pdf-lib', () => {
    const hits = all.filter((f) => /from\s+['"]pdf-lib['"]/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
