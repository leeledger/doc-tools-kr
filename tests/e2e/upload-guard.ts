// The no-upload rule as a pure check (tests/e2e/no-upload.ts runs it after every e2e test; tests/unit/upload-guard
// covers it). No Playwright import here, so the unit tests can load it.

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

/** Everything in the log that could have carried file data off the device (empty = clean). */
export function uploadProblems(log: GuardLog, baseURL: string, allow: readonly AllowedUpload[] = []): string[] {
  const origin = new URL(baseURL).origin;
  const problems: string[] = [];
  for (const r of log.requests) {
    const url = r.url();
    const scheme = url.slice(0, url.indexOf(':') + 1);
    const allowed = isAllowedUpload(r.method(), url, origin, allow);
    if (!['GET', 'HEAD'].includes(r.method()) && !allowed) problems.push(`${r.method()} ${url}`);
    if (r.postDataBuffer() !== null && !allowed) problems.push(`request body on ${url}`);
    if (scheme !== 'blob:' && scheme !== 'data:' && new URL(url).origin !== origin) problems.push(`third-party ${url}`);
  }
  for (const ws of log.websockets) problems.push(`websocket ${ws}`);
  for (const r of log.responses) {
    const url = r.url();
    if (!url.startsWith(origin)) continue;
    // The allowed endpoint answers with an image or JSON, never a document (Pages Functions get no _headers).
    if (isAllowedUpload(r.request().method(), url, origin, allow)) continue;
    const csp = r.headers()['content-security-policy'] ?? '';
    if (!/(^|;)\s*connect-src 'self'\s*(;|$)/.test(csp)) problems.push(`no CSP connect-src 'self' on ${url}`);
  }
  return problems;
}
