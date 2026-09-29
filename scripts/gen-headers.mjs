// Postbuild (brief Polish P.19): appends the custom-domain headers to dist/_headers when PUBLIC_SITE_URL
// names a host other than *.pages.dev:
// - HSTS on that host, max-age one year. No includeSubDomains and no preload yet: preload is hard to
//   undo, so it is a later owner decision (docs/DOMAIN-RUNBOOK.md step 10).
// - noindex on the pages.dev production host, which then only redirects to the domain.
import { appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = join(distDir(), '_headers');
  if (!existsSync(file)) throw new Error('gen-headers: dist/_headers is missing (public/_headers is copied by the build)');
  const site = publicEnv().PUBLIC_SITE_URL;
  const block = domainHeaders(site);
  if (block) appendFileSync(file, `${block}`);
  console.log(block ? `gen-headers: HSTS for ${new URL(site).host}, noindex on ${PAGES_DEV}` : 'gen-headers: pages.dev site, nothing added');
}
