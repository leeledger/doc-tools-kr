// Postbuild, last (brief Polish P.11): builds dist/sw.js from src/sw/sw.ts with typescript.transpileModule
// (no new dependency) and injects BUILD_ID and the precache list:
// - the HTML of /, every live tool page (the sitemap minus NOT_PRECACHED) and /offline/, the
//   navigation fallback (not /404.html: Cloudflare Pages redirects *.html, and a redirected response cannot
//   answer a navigation). /licenses/ is left out (Step 4): its embedded license texts are ~220 KB with the
//   MediaPipe components, alone half the budget, and it is not a page anyone needs offline.
// - the CSS, the entry JS (with its static imports; plus a lazily imported tool controller) and the UI font
//   files those pages preload (400, 800)
// - never a worker, wasm or vendor file (those are cached at runtime, on first use)
// The build fails if the precache is over 450 KB raw or sw.js over 6 KB gzip.
// Kill switch: PUBLIC_SW=0 emits a self-unregistering worker instead (registration still runs, so an
// installed SW removes itself and its caches).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import ts from 'typescript';
import { ROOT, distDir, moduleEntries, publicEnv, readBuildId, staticClosure } from './lib/dist.mjs';

export const PRECACHE_LIMIT = 450 * 1024;
export const SW_LIMIT = 6 * 1024;

// Never reloads a tab (a merge or compression may be running there): open pages keep working from the
// network and are uncontrolled from their next load.
export const KILL_SWITCH = `// Kill switch (PUBLIC_SW=0): removes every cache and this service worker; no tab is reloaded.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
})()));
`;

/**
 * Sitemap pages that are not precached (fetched from the network when visited): /licenses/, and the guides and
 * their share images (Growth G.3): gen-sw would otherwise precache every guide and pass the 450 KB limit, and
 * /remove-background/ (Sprint C, C2; Arch ruling 3: C2 adds 0 bytes to the precache; its page, controller, runtime and
 * model are cached at runtime only, like the /stamp-signature/ photo controller). Offline it needs its 120 MB anyway.
 * C2 round 2 (Arch): /terms/ and /privacy/ too: useless offline; the SW stores them when visited (sw.ts RUNTIME_PAGES).
 * TOOLS4 T2 (brief decision 10): /jpg-to-pdf/ too. With its page and controller the precache measured 466.9 KB, over the
 * 450 KB limit (432.8 KB without it); the limit is never raised, so the page loads from the network like /remove-background/.
 * TOOLS4 T3: /pdf-to-jpg/ too (483.7 KB with its page and controller precached, 441.7 KB without).
 */
export const NOT_PRECACHED = (path) => ['/licenses/', '/terms/', '/privacy/', '/remove-background/', '/jpg-to-pdf/', '/pdf-to-jpg/'].includes(path) || path.startsWith('/guide/') || path.startsWith('/og/');

/** Page paths from dist/sitemap.xml (minus NOT_PRECACHED) plus the offline fallback page. */
function pages(dist) {
  const xml = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname).filter((p) => !NOT_PRECACHED(p));
  return [...paths, '/offline/'];
}

const htmlFile = (path) => (path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1));

/** The precache list (URL paths) and its raw size. */
export function precacheList(dist) {
  const urls = new Set();
  const assets = new Set();
  for (const page of pages(dist)) {
    urls.add(page);
    const html = readFileSync(join(dist, htmlFile(page)), 'utf8');
    for (const m of html.matchAll(/<link rel="stylesheet" href="\/(_astro\/[^"]+\.css)"/g)) assets.add(m[1]);
    for (const e of moduleEntries(html)) {
      for (const js of staticClosure(dist, e)) {
        assets.add(js);
        // A tool controller the page imports on first interaction (/id-photo/, Step 4 round 2): precached too,
        // so the precached page also works on a first visit while offline.
        const code = readFileSync(join(dist, js), 'utf8');
        for (const m of code.matchAll(/["'`](?:\.\/|\/?_astro\/)(controller\.[\w-]+\.js)["'`]/g)) for (const c of staticClosure(dist, `_astro/${m[1]}`)) assets.add(c);
      }
    }
    // The UI font files the pages preload (400 and 800). 700 is cached at runtime on first use:
    // with it the precache would pass its 450 KB budget (the /licenses/ page alone is ~140 KB).
    for (const m of html.matchAll(/<link rel="preload" href="\/(_astro\/[^"]+\.woff2)" as="font"/g)) assets.add(m[1]);
  }
  for (const a of [...assets].sort()) urls.add(`/${a}`);
  let bytes = 0;
  for (const u of urls) bytes += readFileSync(join(dist, u.endsWith('/') ? htmlFile(u) : u.slice(1))).length;
  return { urls: [...urls], bytes };
}

export function buildServiceWorker(dist) {
  const buildId = readBuildId(dist);
  const { urls, bytes } = precacheList(dist);
  const source = readFileSync(join(ROOT, 'src', 'sw', 'sw.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, removeComments: true },
  });
  const header = `'use strict';\nvar exports = {};\nconst __BUILD_ID__ = ${JSON.stringify(buildId)};\nconst __PRECACHE__ = ${JSON.stringify(urls)};\n`;
  return { code: header + outputText.replace(/^"use strict";\s*/, ''), urls, bytes, buildId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = distDir();
  const off = publicEnv().PUBLIC_SW === '0';
  if (off) {
    writeFileSync(join(dist, 'sw.js'), KILL_SWITCH);
    console.log('gen-sw: PUBLIC_SW=0, wrote the self-unregistering kill switch');
  } else {
    const { code, urls, bytes, buildId } = buildServiceWorker(dist);
    const gz = gzipSync(Buffer.from(code), { level: 9 }).length;
    const errors = [];
    if (bytes > PRECACHE_LIMIT) errors.push(`precache is ${(bytes / 1024).toFixed(1)} KB raw, budget ${PRECACHE_LIMIT / 1024} KB`);
    if (gz > SW_LIMIT) errors.push(`sw.js is ${(gz / 1024).toFixed(1)} KB gzip, budget ${SW_LIMIT / 1024} KB`);
    if (errors.length) {
      console.error(`gen-sw: FAIL\n  ${errors.join('\n  ')}`);
      process.exit(1);
    }
    writeFileSync(join(dist, 'sw.js'), code);
    console.log(`gen-sw: build ${buildId}, ${urls.length} precached URLs, ${(bytes / 1024).toFixed(1)} KB raw / 450; sw.js ${(gz / 1024).toFixed(1)} KB gzip / 6`);
  }
}
