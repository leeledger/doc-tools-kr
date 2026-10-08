// /admin/ (brief handoff/ARCHITECT-BRIEF-USAGE.md, decisions 10-11): the owner's usage tables, server-rendered, no
// client JS. Basic auth (user "admin", ADMIN_PASSWORD); with no password of 16+ characters the page does not exist
// (404). The tables come from the Analytics Engine SQL API (CF_ACCOUNT_ID, AE_API_TOKEN); every query is built
// from constants, a whitelisted period and a validated dataset name (scripts/lib/usage.mjs), never from request text.
// Every value from the rows is HTML-escaped. dist/ has no /admin page: this Function is the only answer there.
// The page itself is rendered by scripts/lib/admin-view.mjs (brief handoff/ARCHITECT-BRIEF-ADMIN-UI.md); for 1, 7
// and 30 days one more query reads the period before for the KPI changes (its failure only drops the comparison).
// Visits (brief handoff/ARCHITECT-BRIEF-ADMIN-VISITS.md) come from the Web Analytics GraphQL API in one POST
// (scripts/lib/visits.mjs); usage and visits are fetched side by side and each failure shows its own notice.
import { COMPARE_PERIODS, DEFAULT_DAYS, PERIODS, UsageApiError, datasetName, fetchPrevTotals, fetchUsage, shapeUsage } from '../../scripts/lib/usage.mjs';
import { VisitsApiError, fetchVisits, shapeVisits, siteTagOf } from '../../scripts/lib/visits.mjs';
import { renderAdminPage, sampleShareOf } from '../../scripts/lib/admin-view.mjs';

export interface Env {
  ADMIN_PASSWORD?: string;
  CF_ACCOUNT_ID?: string;
  AE_API_TOKEN?: string;
  USAGE_DATASET?: string;
  PUBLIC_USAGE_SAMPLE?: string;
  RUM_SITE_TAG?: string;
}
interface Ctx {
  request: Request;
  env: Env;
}

export const MIN_PASSWORD = 16;
export const REALM = 'Basic realm="docttak-admin", charset="UTF-8"';
const HEADERS = {
  'Cache-Control': 'no-store, private',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

function plain(status: number, extra: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { ...HEADERS, ...extra } });
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

/** The decoded "user:password" of a Basic Authorization header, or null. */
function basicCredentials(header: string | null): string | null {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header ?? '');
  if (!m) return null;
  try {
    const bin = atob(m[1]!);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** Compares SHA-256 digests in constant time (equal length by construction). */
async function authorized(header: string | null, password: string): Promise<boolean> {
  const given = basicCredentials(header);
  if (given === null) return false;
  const [a, b] = await Promise.all([sha256(given), sha256(`admin:${password}`)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** ?days= in PERIODS, else the default. */
export function period(url: URL): number {
  const raw = url.searchParams.get('days') ?? '';
  const n = /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
  return PERIODS.includes(n) ? n : DEFAULT_DAYS;
}

function html(page: string): Response {
  return new Response(page, { status: 200, headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function onRequest({ request, env }: Ctx): Promise<Response> {
  const password = env.ADMIN_PASSWORD ?? '';
  if (password.length < MIN_PASSWORD) return plain(404);
  const url = new URL(request.url);
  if (url.pathname === '/admin') return plain(301, { Location: '/admin/' });
  if (url.pathname !== '/admin/') return plain(404);
  if (!(await authorized(request.headers.get('authorization'), password))) return plain(401, { 'WWW-Authenticate': REALM });

  const days = period(url);
  const now = new Date();
  const base = { days, now, sampleShare: sampleShareOf(env.PUBLIC_USAGE_SAMPLE) };
  if (!env.CF_ACCOUNT_ID || !env.AE_API_TOKEN) {
    const missing = 'CF_ACCOUNT_ID 또는 AE_API_TOKEN 없음';
    return html(renderAdminPage({ ...base, notice: missing, visitsNotice: missing }));
  }
  const accountId = env.CF_ACCOUNT_ID;
  const token = env.AE_API_TOKEN;
  const dataset = datasetName(env.USAGE_DATASET);
  const siteTag = siteTagOf(env.RUM_SITE_TAG);
  const usageTask = async () => {
    if (!dataset) return { error: 'USAGE_DATASET 이름이 올바르지 않음' };
    const api = { accountId, token, dataset, days };
    const [rows, prev] = await Promise.all([fetchUsage(api), COMPARE_PERIODS.includes(days) ? fetchPrevTotals(api).catch(() => null) : null]);
    return { shaped: shapeUsage(rows), prev };
  };
  const visitsTask = async () => {
    if (!siteTag) return { error: 'RUM_SITE_TAG 형식이 올바르지 않음' };
    return { visits: shapeVisits(await fetchVisits({ accountId, token, siteTag, days, now }), days, now) };
  };
  const [u, v] = await Promise.allSettled([usageTask(), visitsTask()]);
  const usage =
    u.status === 'fulfilled'
      ? 'error' in u.value
        ? { notice: u.value.error }
        : { shaped: u.value.shaped, prev: u.value.prev }
      : { notice: u.reason instanceof UsageApiError ? `HTTP ${u.reason.status}` : '알 수 없는 오류' };
  const visits =
    v.status === 'fulfilled'
      ? 'error' in v.value
        ? { visitsNotice: v.value.error }
        : { visits: v.value.visits }
      : { visitsNotice: v.reason instanceof VisitsApiError ? v.reason.message : '알 수 없는 오류' };
  return html(renderAdminPage({ ...base, ...usage, ...visits }));
}
