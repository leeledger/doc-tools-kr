// The no-upload rule as a pure check (tests/e2e/no-upload.ts runs it after every e2e test; tests/unit/bgcloud.test.ts
// covers it under "no-upload allowlist"). No Playwright import here, so the unit tests can load it.
import { GA_CONNECT_SRC, GTAG_ORIGIN } from '../../scripts/lib/ga.mjs';

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

const SELF_ONLY = /(^|;)\s*connect-src 'self'\s*(;|$)/;
const SELF_AND_GA = new RegExp(`(^|;)\\s*connect-src 'self' ${GA_CONNECT_SRC.replace(/[.*]/g, (c: string) => `\\${c}`)}\\s*(;|$)`);

/** Everything in the log that could have carried file data off the device (empty = clean). */
export function uploadProblems(log: GuardLog, baseURL: string, allow: readonly AllowedUpload[] = [], ga = false): string[] {
  const origin = new URL(baseURL).origin;
  const problems: string[] = [];
  for (const r of log.requests) {
    const url = r.url();
    const scheme = url.slice(0, url.indexOf(':') + 1);
    const allowed = isAllowedUpload(r.method(), url, origin, allow);
    if (!['GET', 'HEAD'].includes(r.method()) && !allowed) problems.push(`${r.method()} ${url}`);
    if (r.postDataBuffer() !== null && !allowed) problems.push(`request body on ${url}`);
    if (scheme !== 'blob:' && scheme !== 'data:' && new URL(url).origin !== origin && !(ga && r.postDataBuffer() === null && isGaRequest(r.method(), url))) problems.push(`third-party ${url}`);
  }
  for (const ws of log.websockets) problems.push(`websocket ${ws}`);
  for (const r of log.responses) {
    const url = r.url();
    if (!url.startsWith(origin)) continue;
    // The allowed endpoint answers with an image or JSON, never a document (Pages Functions get no _headers).
    if (isAllowedUpload(r.request().method(), url, origin, allow)) continue;
    const csp = r.headers()['content-security-policy'] ?? '';
    if (!SELF_ONLY.test(csp) && !(ga && SELF_AND_GA.test(csp))) problems.push(`no CSP connect-src 'self' on ${url}`);
  }
  return problems;
}
