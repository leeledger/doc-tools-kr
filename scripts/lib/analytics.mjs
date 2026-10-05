// Visitor counts (owner 2026-10-05): Cloudflare Web Analytics, cookieless, behind PUBLIC_CF_ANALYTICS_TOKEN (the site
// token from the Web Analytics dashboard, "manual JS snippet"). Unset: no beacon tag, no CSP change, policy unchanged.
// The automatic injection from the Pages dashboard stays off: the CSP would block it and ops health flags it.

/** The token Cloudflare shows in the snippet's data-cf-beacon. */
export const TOKEN_RE = /^[0-9a-f]{32}$/;
export const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';
/** Where the beacon sends its counts. */
export const BEACON_CONNECT = 'https://cloudflareinsights.com';

/** The trimmed token, '' when unset; throws on a value that is not a token (check-dist reports it). */
export function analyticsToken(value) {
  const t = typeof value === 'string' ? value.trim() : '';
  if (t && !TOKEN_RE.test(t)) throw new Error(`PUBLIC_CF_ANALYTICS_TOKEN "${t}" is not a Cloudflare Web Analytics token (32 hex characters)`);
  return t;
}

/** dist/_headers with the beacon allowed in the site-wide CSP (script-src and connect-src only). */
export function withAnalyticsCsp(headers) {
  let n = 0;
  const out = headers.replace(/^(\s*Content-Security-Policy:.*)$/m, (line) => {
    n++;
    return line.replace("script-src 'self'", `script-src 'self' ${new URL(BEACON_SRC).origin}`).replace("connect-src 'self'", `connect-src 'self' ${BEACON_CONNECT}`);
  });
  if (n !== 1 || out === headers) throw new Error('gen-headers: no site-wide Content-Security-Policy with script-src and connect-src to extend');
  return out;
}
