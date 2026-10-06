// Static guard (brief §3.3): shipped source must not contain network APIs that could carry file data.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', 'src');
const FORBIDDEN = ['XMLHttpRequest', 'WebSocket', 'EventSource'];
/**
 * Files allowed to call fetch( — only same-origin GETs of our own static files, never file data.
 * - lib/codecs/wasm-browser.ts: the jSquash codec loads (MozJPEG, resize, WebP) shared by both workers.
 * - lib/ui/engine-load.ts: GET /deploy-manifest.json for the engine-panel copy (Polish P.1).
 * - sw/sw.ts: the service worker's allowlisted same-origin GETs (Polish P.11; it never reads a body).
 * - lib/face/assets.ts: GETs of the versioned /vendor/mediapipe/ model, wasm and loader (Step 4; the photo
 *   never leaves the page: MediaPipe gets the pixels in memory).
 * - lib/hwp/wasm-browser.ts: rhwp wasm, own origin (Step 5; also its prefetch during the file dialog).
 * - lib/hwp/pdf/font-source.ts: HWP PDF fonts, own origin: the face list and the .woff slices under
 *   /fonts/hwp/ (HWP direct). Never file data.
 * - lib/bgremove/assets.ts: GETs of the versioned /vendor/onnxruntime-web/ engine parts and the
 *   /vendor/birefnet-lite-512/ model parts + manifest (Sprint C, C2), only after the user agreed; the photo stays in
 *   the page and its workers.
 * - lib/bgremove/cloud.ts (C2-cloud, the one exception to "no file bytes leave the device", owner-approved
 *   2026-10-02): one same-origin POST of a <= 1024 px JPEG copy to /api/remove-bg, after the user pressed 배경 지우기,
 *   only in a build with PUBLIC_BG_CLOUD on (dead code otherwise; check-dist proves the flag-off bundle never names
 *   the endpoint). The test below pins it to that one call.
 * (The preload, Polish P.7, calls no network API itself: its warm workers load through the wasm loaders.)
 */
const FETCH_ALLOWLIST: string[] = ['lib/codecs/wasm-browser.ts', 'lib/ui/engine-load.ts', 'sw/sw.ts', 'lib/face/assets.ts', 'lib/hwp/wasm-browser.ts', 'lib/hwp/pdf/font-source.ts', 'lib/bgremove/assets.ts', 'lib/bgremove/cloud.ts'];
/** sendBeacon only in the usage tracker, which is off (and dropped from the bundle) unless PUBLIC_USAGE_STATS=1. */
const BEACON_ALLOWLIST: string[] = ['lib/ui/usage.ts'];

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
    // Exactly the allowlist: a stale entry is removed, not kept.
    expect([...hits].sort()).toEqual([...FETCH_ALLOWLIST].sort());
  });

  it('in the HWP module only wasm-browser.ts and pdf/font-source.ts call fetch( (own origin)', () => {
    const hits = all
      .filter((f) => /\bfetch\s*\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).split('\\').join('/'));
    expect(hits.filter((h) => h.startsWith('lib/hwp/')).sort()).toEqual(['lib/hwp/pdf/font-source.ts', 'lib/hwp/wasm-browser.ts']);
  });

  it('the 배경 지우기 cloud client makes one fetch, a POST to the same-origin /api/remove-bg, loaded only behind __BG_CLOUD__', () => {
    const src = readFileSync(join(SRC, 'lib', 'bgremove', 'cloud.ts'), 'utf8');
    expect(src.match(/\bfetch\s*\(/g)).toHaveLength(1);
    expect(src).toMatch(/export const API_PATH = '\/api\/remove-bg';/);
    expect(src).toMatch(/fetcher\(API_PATH, \{\s*method: 'POST'/);
    expect(src).not.toMatch(/https?:\/\//);
    const importers = all.filter((f) => readFileSync(f, 'utf8').includes('lib/bgremove/cloud')).map((f) => relative(SRC, f).split('\\').join('/'));
    expect(importers).toEqual(['tools/remove-background/bg.ts']);
    const bg = readFileSync(join(SRC, 'tools', 'remove-background', 'bg.ts'), 'utf8');
    expect(bg).toMatch(/if \(__BG_CLOUD__ && !deviceChosen\(\)\) \{/);
  });

  it('uses sendBeacon only in the usage tracker', () => {
    const hits = all.filter((f) => readFileSync(f, 'utf8').includes('sendBeacon')).map((f) => relative(SRC, f).split('\\').join('/'));
    expect(hits).toEqual(BEACON_ALLOWLIST);
  });

  it('never imports the original pdf-lib', () => {
    const hits = all.filter((f) => /from\s+['"]pdf-lib['"]/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
