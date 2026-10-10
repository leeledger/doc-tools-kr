// The connect-src the site is designed to send (INTERNAL-TRAFFIC round 2, Arch): 'self' alone, plus exactly the hosts
// gen-headers adds when Cloudflare Web Analytics (scripts/lib/analytics.mjs) and/or Google Analytics 4
// (scripts/lib/ga.mjs) are on. Derived by running those same generators on a minimal policy, so the live checks
// (smoke:assets, the A-1 no-upload guard) follow any change there and accept nothing else.
import { withAnalyticsCsp } from './analytics.mjs';
import { withGaCsp } from './ga.mjs';

const BASE = "  Content-Security-Policy: script-src 'self'; connect-src 'self'; img-src 'self'";

/** The connect-src value of a CSP header ('self' https://…), whitespace collapsed; null without one. */
export function connectSrcOf(csp) {
  for (const part of String(csp ?? '').split(';')) {
    const m = part.trim().match(/^connect-src(?:\s+(.*))?$/i);
    if (m) return (m[1] ?? '').trim().replace(/\s+/g, ' ');
  }
  return null;
}

/** Every designed connect-src, in gen-headers order (analytics first, then GA): off, analytics, GA, both. */
export const DESIGNED_CONNECT_SRC = Object.freeze(
  [BASE, withAnalyticsCsp(BASE), withGaCsp(BASE), withGaCsp(withAnalyticsCsp(BASE))].map((h) => /** @type {string} */ (connectSrcOf(h))),
);

/** Whether `csp` carries one of the designed connect-src values exactly. */
export function isDesignedConnectSrc(csp) {
  const v = connectSrcOf(csp);
  return v !== null && DESIGNED_CONNECT_SRC.includes(v);
}
