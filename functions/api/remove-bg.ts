// POST /api/remove-bg (C2-cloud, brief handoff/ARCHITECT-BRIEF-C2-CLOUD.md §3, §5, §6). Pages Function: cheap guards,
// then the request goes unchanged to the docttak-bg Worker over the service binding BG (Pages Functions have no
// Images binding). public/_routes.json runs Functions on /api/* only, so static pages stay free.
// Privacy: no storage, no logging, no request data in any answer; the body is streamed through, never read here.

export interface Env {
  BG?: { fetch(r: Request): Promise<Response> };
}
interface Ctx {
  request: Request;
  env: Env;
}

/** The page sends a ≤ 1024 px JPEG of about 150-300 KB; the Worker checks the same cap. */
export const MAX_BYTES = 2_000_000;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const HEADERS = {
  'Cache-Control': 'no-store, private',
  'CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
};

function json(status: number, error: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...HEADERS, ...extra, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function onRequest({ request, env }: Ctx): Promise<Response> {
  if (request.method !== 'POST') return json(405, 'method', { Allow: 'POST' });
  // Only our own page may call it: browsers set Sec-Fetch-Site on every request (a cross-site form post says
  // "cross-site", a script on another site cannot change it).
  if (request.headers.get('sec-fetch-site') !== 'same-origin') return json(403, 'origin');
  const len = Number(request.headers.get('content-length') ?? '');
  if (!Number.isInteger(len) || len < 1 || len > MAX_BYTES) return json(413, 'size');
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!TYPES.has(type)) return json(415, 'type');
  // No binding (production before the owner sets it): the page shows its "지금은 처리할 수 없어요" line.
  if (!env.BG) return json(503, 'engine');
  try {
    return await env.BG.fetch(request);
  } catch {
    return json(502, 'engine');
  }
}
