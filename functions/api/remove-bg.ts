// SPIKE (branch c2-cloud only, never main): cloud background removal probe.
// Brief: handoff/ARCHITECT-BRIEF-C2-CLOUD.md. No storage, no logging of image bytes.
//
// GET  /api/remove-bg?probe=1                 -> which runtime features exist (no image work)
// GET  /api/remove-bg?src=/spike/s01.jpg&f=  -> cf.image { segment: "foreground" } on a same-origin
//                                                static test photo (fetch subrequest path; needs no binding)
// POST /api/remove-bg  (body = image bytes)   -> Images binding path; 501 when env.IMAGES is absent
//                                                (Pages Functions do not list an Images binding)

interface ImagesBinding {
  input(stream: ReadableStream | ArrayBuffer): {
    transform(o: Record<string, unknown>): {
      output(o: { format: string }): Promise<{ response(o?: { headers?: Record<string, string> }): Response }>;
    };
  };
}
interface Env {
  IMAGES?: ImagesBinding;
}
interface Ctx {
  request: Request;
  env: Env;
}

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...NO_STORE, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get('probe') === '1') {
    return json(200, { images: typeof env.IMAGES, colo: (request as unknown as { cf?: { colo?: string } }).cf?.colo ?? null });
  }
  const src = url.searchParams.get('src') ?? '';
  if (!/^\/_spike\/[a-z0-9]+\.jpg$/.test(src)) return json(400, { error: 'src' });
  const f = url.searchParams.get('f') ?? '';
  const image: Record<string, unknown> = { segment: 'foreground' };
  if (f === 'png' || f === 'webp' || f === 'avif' || f === 'json') image.format = f;
  if (f === 'webp') image.quality = 100;
  const bust = url.searchParams.get('v');
  const target = new URL(src, url.origin);
  if (bust) target.searchParams.set('v', bust);
  const t0 = Date.now();
  const res = await fetch(target.toString(), { cf: { image } } as RequestInit);
  const ms = Date.now() - t0;
  const headers = new Headers(res.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Server-Timing', `seg;dur=${ms}`);
  headers.set('X-Spike-Status', String(res.status));
  return new Response(res.body, { status: res.status, headers });
}

export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!TYPES.has(type)) return json(415, { error: 'type' });
  const len = Number(request.headers.get('content-length') ?? '0');
  if (!len || len > MAX_BYTES) return json(413, { error: 'size' });
  if (!env.IMAGES || !request.body) return json(501, { error: 'no-images-binding' });
  const t0 = Date.now();
  const out = await env.IMAGES.input(request.body).transform({ segment: 'foreground' }).output({ format: 'image/png' });
  return out.response({ headers: { ...NO_STORE, 'Server-Timing': `seg;dur=${Date.now() - t0}` } });
}
