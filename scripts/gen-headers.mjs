// Postbuild (brief Polish P.19): appends the custom-domain headers to dist/_headers when PUBLIC_SITE_URL
// names a host other than *.pages.dev:
// - HSTS on that host, max-age one year. No includeSubDomains and no preload yet: preload is hard to
//   undo, so it is a later owner decision (docs/DOMAIN-RUNBOOK.md step 10).
// - noindex on the pages.dev production host, which then only redirects to the domain.
// Also the flagged CSP extensions (Web Analytics, GA4) and, with PUBLIC_ADSENSE_ON=1, the content-page CSP blocks (ADS1020 D5).
// siteHeaders is pure: check-dist runs it on the same input to check what will ship.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ADS_CFG_PATH, CONTENT_ROUTES, adsenseConfig, withContentCsp } from './lib/adsense.mjs';
import { analyticsToken, withAnalyticsCsp } from './lib/analytics.mjs';
import { BG_PATH, bgRemoveOn } from './lib/bgremove.mjs';
import { GA_LOADER, gaId, withGaCsp } from './lib/ga.mjs';
import { ID_CAMERA_PATH, cameraHeaders, idCameraOn } from './lib/idcamera.mjs';
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

/**
 * The final dist/_headers for `headers` (the copy of public/_headers) and the PUBLIC_* values `env`, plus the log lines.
 * Pure, so check-dist (which runs before this script) can check exactly what will ship.
 */
export function siteHeaders(headers, env) {
  let out = headers;
  const log = [];
  const site = env.PUBLIC_SITE_URL;
  const coep = bgRemoveHeaders(bgRemoveOn(env.PUBLIC_BG_REMOVE));
  // Visitor counts (owner 2026-10-05): the site-wide CSP lets the Cloudflare Web Analytics beacon load and report.
  if (analyticsToken(env.PUBLIC_CF_ANALYTICS_TOKEN)) {
    out = withAnalyticsCsp(out);
    log.push('CSP allows the Cloudflare Web Analytics beacon');
  }
  // Google Analytics 4 (owner 2026-10-08): the CSP lets gtag.js load and report; /ga.js is unhashed, so it is
  // revalidated on every load (a changed ID must not stick in caches).
  if (gaId(env.PUBLIC_GA_ID)) {
    out = `${withGaCsp(out)}${GA_LOADER}
  Cache-Control: no-cache
`;
    log.push(`CSP allows Google Analytics; ${GA_LOADER} no-cache`);
  }
  // Google AdSense, review stage (ADS1020 D5): after the GA and Web Analytics extensions, so the `/*` line stays what they
  // made; each content route detaches it and sets the scheme-source content CSP; /ads-cfg.js is cached for an hour.
  if (adsenseConfig(env).on) {
    out = withContentCsp(out);
    log.push(`content CSP on ${CONTENT_ROUTES.join(', ')}; ${ADS_CFG_PATH} max-age=3600`);
  }
  // Path rules before the host rules: the COEP block applies on every host.
  if (coep) out += coep;
  // IDCAM1022 D9: the camera page alone may use the camera (detach the site-wide policy, set camera=(self)).
  // Once: check-dist may run this on a dist/_headers that gen-headers already wrote.
  const camera = cameraHeaders(idCameraOn(env));
  if (camera && !out.includes(camera)) out += camera;
  const block = domainHeaders(site);
  if (block) out += block;
  if (coep) log.push(`COEP require-corp on ${COEP_PATHS.join(', ')}`);
  if (camera) log.push(`Permissions-Policy camera=(self) on ${ID_CAMERA_PATH} only`);
  log.push(block ? `HSTS for ${new URL(site).host}, noindex on ${PAGES_DEV}` : 'pages.dev site, nothing added');
  return { headers: out, log };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = join(distDir(), '_headers');
  if (!existsSync(file)) throw new Error('gen-headers: dist/_headers is missing (public/_headers is copied by the build)');
  const { headers, log } = siteHeaders(readFileSync(file, 'utf8'), publicEnv());
  writeFileSync(file, headers);
  for (const l of log) console.log(`gen-headers: ${l}`);
}
