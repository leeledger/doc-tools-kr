// Postbuild (brief Polish P.19): appends the custom-domain headers to dist/_headers when PUBLIC_SITE_URL
// names a host other than *.pages.dev:
// - HSTS on that host, max-age one year. No includeSubDomains and no preload yet: preload is hard to
//   undo, so it is a later owner decision (docs/DOMAIN-RUNBOOK.md step 10).
// - noindex on the pages.dev production host, which then only redirects to the domain.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyticsToken, withAnalyticsCsp } from './lib/analytics.mjs';
import { BG_PATH, bgRemoveOn } from './lib/bgremove.mjs';
import { distDir, publicEnv } from './lib/dist.mjs';

export const PAGES_DEV = 'doc-tools-kr.pages.dev';

/** The block to append for `siteUrl`, or '' for a pages.dev (or missing) site URL. */
export function domainHeaders(siteUrl) {
  if (!siteUrl) return '';
  let host;
  try {
    host = new URL(siteUrl).host;
  } catch {
    throw new Error(`gen-headers: PUBLIC_SITE_URL "${siteUrl}" is not a URL`);
  }
  if (host === 'pages.dev' || host.endsWith('.pages.dev')) return '';
  return [`https://${host}/*`, '  Strict-Transport-Security: max-age=31536000', `https://${PAGES_DEV}/*`, '  X-Robots-Tag: noindex', ''].join('\n');
}

/**
 * 배경 지우기 (Sprint C, C2; brief build order 4): COEP require-corp on /remove-background/ (COOP same-origin is already
 * on every page), so the page is crossOriginIsolated and the WASM engine can use threads. Every resource the page
 * loads is same-origin. The page's dedicated workers need the header on their own scripts too (Chrome refuses to start
 * a worker without it under a require-corp page; measured at C2): the inference and fusion workers, and the engine
 * scripts that start the engine's thread workers. Those files are used by this page only, so no other page changes.
 * '' when the flag is off: nothing about the page ships.
 */
export const COEP_PATHS = [`${BG_PATH}*`, '/_astro/infer.worker*', '/_astro/fusion.worker*', '/vendor/onnxruntime-web/*'];

export function bgRemoveHeaders(on) {
  return on ? COEP_PATHS.map((p) => `${p}\n  Cross-Origin-Embedder-Policy: require-corp\n`).join('') : '';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = join(distDir(), '_headers');
  if (!existsSync(file)) throw new Error('gen-headers: dist/_headers is missing (public/_headers is copied by the build)');
  const env = publicEnv();
  const site = env.PUBLIC_SITE_URL;
  const coep = bgRemoveHeaders(bgRemoveOn(env.PUBLIC_BG_REMOVE));
  // Visitor counts (owner 2026-10-05): the site-wide CSP lets the Cloudflare Web Analytics beacon load and report.
  if (analyticsToken(env.PUBLIC_CF_ANALYTICS_TOKEN)) {
    writeFileSync(file, withAnalyticsCsp(readFileSync(file, 'utf8')));
    console.log('gen-headers: CSP allows the Cloudflare Web Analytics beacon');
  }
  // Path rules before the host rules: the COEP block applies on every host.
  if (coep) appendFileSync(file, coep);
  const block = domainHeaders(site);
  if (block) appendFileSync(file, `${block}`);
  if (coep) console.log(`gen-headers: COEP require-corp on ${COEP_PATHS.join(', ')}`);
  console.log(block ? `gen-headers: HSTS for ${new URL(site).host}, noindex on ${PAGES_DEV}` : 'gen-headers: pages.dev site, nothing added');
}
