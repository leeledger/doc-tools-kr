// POST /api/addr-en (ADDREN1016, brief handoff/ARCHITECT-BRIEF-ADDREN1016.md decisions 4-9): the 영문주소 변환기 page
// sends {"q": typed address, "page": 1..5}; this Function asks the 행정안전부 영문주소 검색 API
// (business.juso.go.kr addrEngApi.do) with the secret JUSO_EN_KEY and answers with whitelisted fields only.
// Privacy (decision 6): no logging, no storage, no cache; the query and the answer live only for this request.
// Cost (decision 7): the zone WAF rule, the per-isolate limiter below, submit-only searches on the page, input limits.
// public/_routes.json runs Functions on /api/* only. The text rules live in src/tools/english-address/query.ts (the page
// uses them for instant messages; this Function is the authority).
import { cleanQuery, lengthProblem, MAX_PAGE } from '../../src/tools/english-address/query';

export { cleanQuery };

export interface Env {
  /** The build flag reaches Functions as a Pages env var; "1" = the tool is on (kill switch: remove it). */
  PUBLIC_ADDR_EN?: string;
  /** Pages secret: the 영문주소 검색 API key (never in a build, a log or an answer). */
  JUSO_EN_KEY?: string;
}
interface Ctx {
  request: Request;
  env: Env;
}

export const UPSTREAM = 'https://business.juso.go.kr/addrlink/addrEngApi.do';
export const MAX_BODY = 512;
export const MAX_ITEMS = 10;
export const MAX_FIELD = 200;
export const TIMEOUT_MS = 5000;
export const LIMIT = 20;
export const WINDOW_MS = 60_000;
export const MAX_KEYS = 5000;

const HEADERS = {
  'Cache-Control': 'no-store, private',
  'CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
  'Content-Type': 'application/json; charset=utf-8',
};

export type ErrorCode = 'off' | 'engine' | 'method' | 'origin' | 'size' | 'type' | 'bad' | 'short' | 'long' | 'sido' | 'digits' | 'chars' | 'broad' | 'busy' | 'upstream' | 'timeout';
export interface Item {
  road: string;
  jibun: string;
  zip: string;
  si: string;
  sgg: string;
  emd: string;
  kor: string;
}
export interface Answer {
  total: number;
  page: number;
  items: Item[];
}

function json(status: number, body: Answer | { error: ErrorCode }, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
}

/** Same origin: Sec-Fetch-Site says so, or (a browser without it) Origin equals this request's origin. */
function sameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null) return site === 'same-origin';
  return request.headers.get('origin') === new URL(request.url).origin;
}

/** The checked request, or the 400 code (decision 8). `body`: the parsed JSON. */
export function validateQuery(body: unknown): { q: string; page: number } | { error: 'bad' | 'short' | 'long' } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'bad' };
  const { q, page } = body as { q?: unknown; page?: unknown };
  if (typeof q !== 'string') return { error: 'bad' };
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > MAX_PAGE) return { error: 'bad' };
  const clean = cleanQuery(q);
  const problem = lengthProblem(clean);
  return problem ? { error: problem } : { q: clean, page };
}

/** upstream common.errorCode -> our answer (decision 9). */
const CODES: Record<string, [number, ErrorCode]> = {
  E0005: [400, 'short'],
  E0008: [400, 'short'],
  E0006: [400, 'sido'],
  E0009: [400, 'digits'],
  E0010: [400, 'long'],
  E0011: [400, 'chars'],
  E0012: [400, 'chars'],
  E0013: [400, 'chars'],
  E0015: [400, 'broad'],
  E0001: [503, 'engine'],
  E0014: [503, 'engine'],
};

const str = (x: unknown): string => (typeof x === 'string' ? x.slice(0, MAX_FIELD) : '');

/** The answer to the page for an upstream reply (`status`: its HTTP status, `body`: its parsed JSON or undefined). */
export function mapUpstream(status: number, body: unknown, page: number): { status: number; body: Answer | { error: ErrorCode } } {
  const upstream = { status: 502, body: { error: 'upstream' as const } };
  if (status !== 200 || !body || typeof body !== 'object') return upstream;
  const results = (body as { results?: unknown }).results;
  if (!results || typeof results !== 'object') return upstream;
  const { common, juso } = results as { common?: { errorCode?: unknown; totalCount?: unknown }; juso?: unknown };
  const code = String(common?.errorCode ?? '');
  if (code !== '0') {
    const hit = Object.hasOwn(CODES, code) ? CODES[code]! : null;
    return hit ? { status: hit[0], body: { error: hit[1] } } : upstream;
  }
  const total = Number(common?.totalCount);
  const list = Array.isArray(juso) ? juso.slice(0, MAX_ITEMS) : [];
  const items = list.map((j: Record<string, unknown>) => ({
    road: str(j?.roadAddr),
    jibun: str(j?.jibunAddr),
    zip: str(j?.zipNo),
    si: str(j?.siNm),
    sgg: str(j?.sggNm),
    emd: str(j?.emdNm),
    kor: str(j?.korAddr),
  }));
  return { status: 200, body: { total: Number.isInteger(total) && total >= 0 ? total : items.length, page, items } };
}

/**
 * Best-effort per-IP limiter (decision 7b): `limit` requests per `windowMs` for each key, in this isolate's memory only.
 * At most `maxKeys` keys; a new key past that drops the oldest. Expired windows are dropped on every call, so an IP is
 * held for at most `windowMs` after its window started. `hit` returns false when the key is over its limit.
 */
export function createLimiter({ limit = LIMIT, windowMs = WINDOW_MS, maxKeys = MAX_KEYS, now = () => Date.now() } = {}) {
  const seen = new Map<string, { start: number; count: number }>();
  return {
    hit(key: string): boolean {
      const t = now();
      // Review should-fix 1: drop every expired window first (the Map is ordered by window start), so no IP stays in
      // memory longer than one window.
      for (const [k, v] of seen) {
        if (t - v.start < windowMs) break;
        seen.delete(k);
      }
      const cur = seen.get(key);
      if (cur && t - cur.start < windowMs) {
        cur.count += 1;
        return cur.count <= limit;
      }
      // A new window moves the key to the end, so the first key in the Map is always the oldest window.
      seen.delete(key);
      while (seen.size >= maxKeys) seen.delete(seen.keys().next().value!);
      seen.set(key, { start: t, count: 1 });
      return true;
    },
    get size(): number {
      return seen.size;
    },
  };
}

const limiter = createLimiter();

/** The body as text, or null past `max` bytes (read in chunks, so a long body without Content-Length stops early). */
async function readCapped(request: Request, max: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.byteLength;
  }
  return new TextDecoder().decode(all);
}

export async function onRequest({ request, env }: Ctx): Promise<Response> {
  if (env.PUBLIC_ADDR_EN !== '1') return json(404, { error: 'off' });
  const key = env.JUSO_EN_KEY?.trim();
  if (!key) return json(503, { error: 'engine' });
  if (request.method !== 'POST') return json(405, { error: 'method' }, { Allow: 'POST' });
  if (!sameOrigin(request)) return json(403, { error: 'origin' });
  const lenHeader = request.headers.get('content-length');
  if (lenHeader !== null) {
    const len = Number(lenHeader);
    if (!Number.isInteger(len) || len < 1 || len > MAX_BODY) return json(413, { error: 'size' });
  }
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'application/json') return json(415, { error: 'type' });
  const text = await readCapped(request, MAX_BODY);
  if (text === null) return json(413, { error: 'size' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json(400, { error: 'bad' });
  }
  const checked = validateQuery(parsed);
  if ('error' in checked) return json(400, { error: checked.error });
  if (!limiter.hit(request.headers.get('cf-connecting-ip') ?? 'unknown')) return json(429, { error: 'busy' }, { 'Retry-After': '10' });

  const form = new URLSearchParams({ confmKey: key, currentPage: String(checked.page), countPerPage: String(MAX_ITEMS), keyword: checked.q, resultType: 'json' });
  let res: Response;
  try {
    res = await fetch(UPSTREAM, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    const name = (e as { name?: unknown })?.name;
    return name === 'TimeoutError' || name === 'AbortError' ? json(504, { error: 'timeout' }) : json(502, { error: 'upstream' });
  }
  let body: unknown;
  try {
    body = res.status === 200 ? await res.json() : undefined;
  } catch (e) {
    // A body cut off by the timeout is a timeout; anything else that is not JSON is the upstream's fault.
    if ((e as { name?: unknown })?.name === 'TimeoutError') return json(504, { error: 'timeout' });
    body = undefined;
  }
  const out = mapUpstream(res.status, body, checked.page);
  return json(out.status, out.body);
}
