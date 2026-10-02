// docttak-bg: background removal via Cloudflare Images `segment: "foreground"`.
// Brief: handoff/ARCHITECT-BRIEF-C2-CLOUD.md §3, §5, §6.
// Privacy rules: no storage, no console output, no request data in errors, no caching.

interface ImagesBinding {
  input(stream: ReadableStream<Uint8Array>): {
    transform(o: Record<string, unknown>): {
      output(o: { format: string; quality?: number }): Promise<{ response(): Response }>;
    };
  };
}
interface RateLimit {
  limit(o: { key: string }): Promise<{ success: boolean }>;
}
export interface Env {
  IMAGES: ImagesBinding;
  RL_IP?: RateLimit;
  RL_IP10?: RateLimit;
}

export const MAX_BYTES = 2_000_000;
const NO_STORE = {
  'Cache-Control': 'no-store, private',
  'CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
};

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...NO_STORE, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function sniff(b: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return 'webp';
  return null;
}

// Reads just enough to check the magic bytes, then re-emits everything as one stream (no full copy).
async function peek(body: ReadableStream<Uint8Array>): Promise<{ head: Uint8Array; stream: ReadableStream<Uint8Array> }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  while (got < 12) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
  }
  const head = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { head.set(c, o); o += c.length; }
  let sent = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(ctl) {
      if (!sent) { sent = true; if (head.length) ctl.enqueue(head); return; }
      const { done, value } = await reader.read();
      if (done) ctl.close(); else ctl.enqueue(value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return { head, stream };
}

export function isQuotaError(e: unknown): boolean {
  return /9422|quota|limit exceeded/i.test(String((e as { message?: string })?.message ?? e));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return json(405, 'method');
    const len = Number(request.headers.get('content-length') ?? '0');
    if (!len || len > MAX_BYTES) return json(413, 'size');
    if (!request.body) return json(400, 'body');

    const ip = request.headers.get('cf-connecting-ip') ?? 'none';
    if (env.RL_IP10 && !(await env.RL_IP10.limit({ key: ip })).success) return json(429, 'busy');
    if (env.RL_IP && !(await env.RL_IP.limit({ key: ip })).success) return json(429, 'busy');

    const { head, stream } = await peek(request.body);
    if (!sniff(head)) {
      await stream.cancel();
      return json(415, 'type');
    }

    try {
      const out = await env.IMAGES.input(stream)
        .transform({ segment: 'foreground' })
        .output({ format: 'image/webp', quality: 100 });
      const res = out.response();
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(NO_STORE)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    } catch (e) {
      return isQuotaError(e) ? json(503, 'quota') : json(502, 'engine');
    }
  },
};
