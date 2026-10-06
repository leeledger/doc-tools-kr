// POST /api/usage (brief handoff/ARCHITECT-BRIEF-USAGE.md, decision 9): one anonymous usage event from our own pages
// (src/lib/ui/usage.ts, navigator.sendBeacon) -> one Workers Analytics Engine data point. Cheap guards first; the body
// must be exactly a whitelisted event (scripts/lib/usage.mjs). Privacy: no IP, no request.cf fields, no headers
// stored, no logging, empty answers. public/_routes.json runs Functions on /api/* only.
import { MAX_BODY, toDataPoint, validate } from '../../scripts/lib/usage.mjs';

export interface Env {
  USAGE?: { writeDataPoint(p: { indexes: string[]; blobs: string[]; doubles: number[] }): void };
}
interface Ctx {
  request: Request;
  env: Env;
}

const HEADERS = {
  'Cache-Control': 'no-store, private',
  'CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
};
const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|preview|curl|wget|python/i;

function empty(status: number, extra: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { ...HEADERS, ...extra } });
}

/** Same origin: Sec-Fetch-Site says so, or (a browser without it) Origin equals this request's origin. */
function sameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null) return site === 'same-origin';
  return request.headers.get('origin') === new URL(request.url).origin;
}

export async function onRequest({ request, env }: Ctx): Promise<Response> {
  if (request.method !== 'POST') return empty(405, { Allow: 'POST' });
  if (!sameOrigin(request)) return empty(403);
  // Content-Length may be absent over HTTP/2 and HTTP/3 (Review USAGE, Should Fix 1): then the body itself is measured.
  const lenHeader = request.headers.get('content-length');
  if (lenHeader !== null) {
    const len = Number(lenHeader);
    if (!Number.isInteger(len) || len < 1 || len > MAX_BODY) return empty(413);
  }
  // sendBeacon with a string sends text/plain;charset=UTF-8.
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'text/plain') return empty(415);
  if (BOT_RE.test(request.headers.get('user-agent') ?? '')) return empty(204);
  const text = await request.text();
  const bytes = new TextEncoder().encode(text).length;
  if (bytes < 1 || bytes > MAX_BODY) return empty(413);
  const ev = validate(text);
  if (!ev) return empty(400);
  // No binding (production before the owner sets it up): nothing is written.
  if (!env.USAGE) return empty(503);
  try {
    env.USAGE.writeDataPoint(toDataPoint(ev));
  } catch {
    // A full write quota or an Analytics Engine hiccup must not show on the page.
  }
  return empty(204);
}
