// The no-upload rule as a pure check (tests/e2e/no-upload.ts runs it after every e2e test; tests/unit/bgcloud.test.ts
// covers it under "no-upload allowlist"). No Playwright import here, so the unit tests can load it.
import { isDesignedConnectSrc } from '../../scripts/lib/csp-connect.mjs';
import { GA_CONNECT_SRC, GTAG_ORIGIN } from '../../scripts/lib/ga.mjs';
import { ADSBYGOOGLE_URL, CONTENT_CSP, isContentPath } from '../../scripts/lib/adsense.mjs';

/**
 * A request that may carry data (C2-cloud, brief §10): the method and the exact same-origin path, no query. Only
 * the 배경 지우기 cloud spec passes one: `[{ method: 'POST', path: '/api/remove-bg' }]`.
 */
export interface AllowedUpload {
  method: string;
  path: string;
}

export interface RequestLike {
  url(): string;
  method(): string;
  postDataBuffer(): Buffer | null;
  /** The URL of the page (frame) that made the request, '' when unknown (a worker or service-worker request). */
  frameUrl?(): string;
}

export interface ResponseLike {
  url(): string;
  headers(): Record<string, string>;
  request(): { method(): string };
}

export interface GuardLog {
  requests: readonly RequestLike[];
  responses: readonly ResponseLike[];
  websockets: readonly string[];
}

/** Whether `method url` is one of `allow` (same origin, exact path, no query or fragment). */
export function isAllowedUpload(method: string, url: string, origin: string, allow: readonly AllowedUpload[]): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.origin === origin && u.search === '' && u.hash === '' && allow.some((a) => a.method === method && a.path === u.pathname);
}

/**
 * Google Analytics 4 (owner 2026-10-08): in a build with PUBLIC_GA_ID (the cloud-* projects set `ga`), a bodiless GET
 * to gtag.js or to a Google Analytics collect host is expected, and the CSP may name exactly the GA hosts. A POST or a
 * body to Google, or any other host, still fails. The fixture stubs both hosts: no test reaches Google.
 */
export function isGaRequest(method: string, url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (method !== 'GET' || u.protocol !== 'https:') return false;
  if (u.origin === GTAG_ORIGIN) return u.pathname === '/gtag/js';
  return u.hostname.endsWith('.google-analytics.com') || u.hostname.endsWith('.analytics.google.com');
}

/**
 * Google AdSense, review stage (ADS1020 Build Order H): in a build with PUBLIC_ADSENSE_ON=1 (the cloud-* projects set
 * `ads`), the bodiless GET of adsbygoogle.js is expected, and only from a content page (scripts/lib/adsense.mjs
 * isContentPath) of our own site (`origin`; round 2); those pages are served with CONTENT_CSP. The fixture stubs the script:
 * no test reaches Google.
 */
export function isAdsRequest(method: string, url: string, frameUrl: string, origin: string): boolean {
  let u: URL;
  let page: URL;
  try {
    u = new URL(url);
    page = new URL(frameUrl);
  } catch {
    return false;
  }
  return method === 'GET' && `${u.origin}${u.pathname}` === ADSBYGOOGLE_URL && page.origin === origin && isContentPath(page.pathname);
}

const SELF_ONLY = /(^|;)\s*connect-src 'self'\s*(;|$)/;
const SELF_AND_GA = new RegExp(`(^|;)\\s*connect-src 'self' ${GA_CONNECT_SRC.replace(/[.*]/g, (c: string) => `\\${c}`)}\\s*(;|$)`);

/**
 * Everything in the log that could have carried file data off the device (empty = clean). `designedCsp` (the A-1 live
 * smoke only, INTERNAL-TRAFFIC round 2): the deployed site may send any designed connect-src, i.e. 'self' plus exactly
 * the Web Analytics and GA hosts gen-headers adds (scripts/lib/csp-connect.mjs); any other host still fails.
 */
export function uploadProblems(log: GuardLog, baseURL: string, allow: readonly AllowedUpload[] = [], ga = false, designedCsp = false, ads = false): string[] {
  const origin = new URL(baseURL).origin;
  const problems: string[] = [];
  for (const r of log.requests) {
    const url = r.url();
    const scheme = url.slice(0, url.indexOf(':') + 1);
    const allowed = isAllowedUpload(r.method(), url, origin, allow);
    if (!['GET', 'HEAD'].includes(r.method()) && !allowed) problems.push(`${r.method()} ${url}`);
    if (r.postDataBuffer() !== null && !allowed) problems.push(`request body on ${url}`);
    const adsOk = ads && r.postDataBuffer() === null && isAdsRequest(r.method(), url, r.frameUrl?.() ?? '', origin);
    if (scheme !== 'blob:' && scheme !== 'data:' && new URL(url).origin !== origin && !(ga && r.postDataBuffer() === null && isGaRequest(r.method(), url)) && !adsOk) problems.push(`third-party ${url}`);
  }
  for (const ws of log.websockets) problems.push(`websocket ${ws}`);
  for (const r of log.responses) {
    const url = r.url();
    if (!url.startsWith(origin)) continue;
    // The allowed endpoint answers with an image or JSON, never a document (Pages Functions get no _headers).
    if (isAllowedUpload(r.request().method(), url, origin, allow)) continue;
    const csp = r.headers()['content-security-policy'] ?? '';
    const content = ads && csp === CONTENT_CSP && isContentPath(new URL(url).pathname);
    if (!SELF_ONLY.test(csp) && !(ga && SELF_AND_GA.test(csp)) && !(designedCsp && isDesignedConnectSrc(csp)) && !content) problems.push(`no CSP connect-src 'self' on ${url}`);
  }
  return problems;
}
