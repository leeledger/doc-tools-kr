// /admin/ (brief handoff/ARCHITECT-BRIEF-USAGE.md, decisions 10-11): the owner's usage tables, server-rendered, no
// client JS. Basic auth (user "admin", ADMIN_PASSWORD); with no password of 16+ characters the page does not exist
// (404). The tables come from the Analytics Engine SQL API (CF_ACCOUNT_ID, AE_API_TOKEN); every query is built
// from constants, a whitelisted period and a validated dataset name (scripts/lib/usage.mjs), never from request text.
// Every value from the rows is HTML-escaped. dist/ has no /admin page: this Function is the only answer there.
import { DEFAULT_DAYS, PERIODS, UsageApiError, datasetName, escapeHtml, fetchUsage, renderTables, shapeUsage } from '../../scripts/lib/usage.mjs';

export interface Env {
  ADMIN_PASSWORD?: string;
  CF_ACCOUNT_ID?: string;
  AE_API_TOKEN?: string;
  USAGE_DATASET?: string;
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

function page(days: number, body: string): string {
  const links = PERIODS.map((d) => (d === days ? `<strong>${d}일</strong>` : `<a href="?days=${d}">${d}일</a>`)).join(' · ');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>문서딱 사용 통계</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;margin:24px auto;max-width:960px;padding:0 16px;color:#1a1a1a}
h1{font-size:22px}h2{font-size:17px;margin-top:28px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}
th{background:#f3f3f3}td:not(:first-child){font-variant-numeric:tabular-nums}
.notice{background:#fff4e5;border:1px solid #f0b46a;padding:8px 12px}
footer{margin-top:28px;color:#555}
</style>
</head>
<body>
<h1>문서딱 사용 통계 (지난 ${days}일)</h1>
<p>기간: ${links}</p>
${body}
<footer>기록은 3개월 동안만 남아요.</footer>
</body>
</html>`;
}

function html(days: number, body: string): Response {
  return new Response(page(days, body), { status: 200, headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' } });
}

const notice = (status: number | string): string => `<p class="notice">통계를 불러오지 못했어요 (${escapeHtml(String(status))}).</p>`;

export async function onRequest({ request, env }: Ctx): Promise<Response> {
  const password = env.ADMIN_PASSWORD ?? '';
  if (password.length < MIN_PASSWORD) return plain(404);
  const url = new URL(request.url);
  if (url.pathname === '/admin') return plain(301, { Location: '/admin/' });
  if (url.pathname !== '/admin/') return plain(404);
  if (!(await authorized(request.headers.get('authorization'), password))) return plain(401, { 'WWW-Authenticate': REALM });

  const days = period(url);
  const dataset = datasetName(env.USAGE_DATASET);
  if (!env.CF_ACCOUNT_ID || !env.AE_API_TOKEN) return html(days, notice('CF_ACCOUNT_ID 또는 AE_API_TOKEN 없음'));
  if (!dataset) return html(days, notice('USAGE_DATASET 이름이 올바르지 않음'));
  try {
    const rows = await fetchUsage({ accountId: env.CF_ACCOUNT_ID, token: env.AE_API_TOKEN, dataset, days });
    return html(days, renderTables(shapeUsage(rows), 'html'));
  } catch (err) {
    return html(days, notice(err instanceof UsageApiError ? `HTTP ${err.status}` : '알 수 없는 오류'));
  }
}
