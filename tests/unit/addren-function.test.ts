// 영문주소 변환기 Pages Function /api/addr-en (ADDREN1016 decisions 4-9) with a mocked upstream fetch: the gates, the
// input rules, the error mapping, the whitelist, the limiter, the headers and the privacy greps. Nothing reaches juso.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanQuery, createLimiter, LIMIT, mapUpstream, onRequest, UPSTREAM, validateQuery, type Env } from '../../functions/api/addr-en';

const ROOT = join(__dirname, '..', '..');
const KEY = 'test-key-SECRET-123';
const ON: Env = { PUBLIC_ADDR_EN: '1', JUSO_EN_KEY: KEY };
let ipSeq = 0;
const freshIp = () => `198.51.100.${++ipSeq % 250}-${ipSeq}`;

function req(init: { method?: string; site?: string | null; origin?: string; type?: string; len?: string | null; body?: string | Uint8Array | ReadableStream; ip?: string } = {}): Request {
  const body = init.body ?? JSON.stringify({ q: '세종대로 110', page: 1 });
  const headers = new Headers();
  if (init.site !== null) headers.set('sec-fetch-site', init.site ?? 'same-origin');
  if (init.origin) headers.set('origin', init.origin);
  headers.set('content-type', init.type ?? 'application/json');
  if (init.len !== null && typeof body === 'string') headers.set('content-length', init.len ?? String(new TextEncoder().encode(body).length));
  headers.set('cf-connecting-ip', init.ip ?? freshIp());
  const method = init.method ?? 'POST';
  return new Request('https://docttak.com/api/addr-en', { method, headers, body: method === 'POST' ? (body as BodyInit) : undefined, ...(body instanceof ReadableStream ? { duplex: 'half' } : {}) } as RequestInit);
}

const juso = (n: number, extra: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => ({
    roadAddr: `${i + 1} Sejong-daero, Jung-gu, Seoul`,
    jibunAddr: `${i + 1} Taepyeongno 1-ga, Jung-gu, Seoul`,
    zipNo: '04524',
    siNm: 'Seoul',
    sggNm: 'Jung-gu',
    emdNm: 'Taepyeongno 1-ga',
    korAddr: '서울특별시 중구 세종대로 110',
    admCd: '1114010300',
    rnMgtSn: '111403005011',
    bdKdcd: '1',
    ...extra,
  }));
const okBody = (n: number, total = n, extra: Record<string, unknown> = {}) => ({ results: { common: { totalCount: String(total), currentPage: '1', countPerPage: '10', errorCode: '0', errorMessage: '정상' }, juso: juso(n, extra) } });
const errBody = (code: string) => ({ results: { common: { totalCount: '0', errorCode: code, errorMessage: `upstream says ${code} ${KEY}` }, juso: null } });

let fetchMock: ReturnType<typeof vi.fn>;
function upstream(answer: () => Promise<Response> | Response) {
  fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => answer());
  vi.stubGlobal('fetch', fetchMock);
}
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
async function call(r: Request = req(), env: Env = ON) {
  const res = await onRequest({ request: r, env });
  const text = await res.text();
  return { res, text, body: JSON.parse(text) as Record<string, unknown> };
}

beforeEach(() => upstream(() => jsonRes(okBody(3))));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('gates (decisions 4, 8)', () => {
  it('flag off -> 404 off, upstream never called', async () => {
    for (const env of [{ JUSO_EN_KEY: KEY }, { PUBLIC_ADDR_EN: '0', JUSO_EN_KEY: KEY }, { PUBLIC_ADDR_EN: 'true', JUSO_EN_KEY: KEY }]) {
      const { res, body } = await call(req(), env);
      expect(res.status).toBe(404);
      expect(body).toEqual({ error: 'off' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no key -> 503 engine', async () => {
    for (const env of [{ PUBLIC_ADDR_EN: '1' }, { PUBLIC_ADDR_EN: '1', JUSO_EN_KEY: '  ' }]) {
      const { res, body } = await call(req(), env);
      expect(res.status).toBe(503);
      expect(body).toEqual({ error: 'engine' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', () => req({ method: 'GET' }), 405, 'method'],
    ['cross-site', () => req({ site: 'cross-site' }), 403, 'origin'],
    ['same-site', () => req({ site: 'same-site' }), 403, 'origin'],
    ['no Sec-Fetch-Site, foreign Origin', () => req({ site: null, origin: 'https://evil.example' }), 403, 'origin'],
    ['no Sec-Fetch-Site, no Origin', () => req({ site: null }), 403, 'origin'],
    ['form post', () => req({ type: 'application/x-www-form-urlencoded' }), 415, 'type'],
    ['text/plain', () => req({ type: 'text/plain' }), 415, 'type'],
    ['Content-Length over 512', () => req({ len: '513' }), 413, 'size'],
    ['Content-Length 0', () => req({ len: '0' }), 413, 'size'],
    ['Content-Length junk', () => req({ len: 'x' }), 413, 'size'],
  ])('%s -> %i', async (_, make, status, error) => {
    const { res, body } = await call(make());
    expect(res.status).toBe(status);
    expect(body).toEqual({ error });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('405 names POST in Allow', async () => {
    const { res } = await call(req({ method: 'GET' }));
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('same origin by Origin when Sec-Fetch-Site is absent', async () => {
    const { res } = await call(req({ site: null, origin: 'https://docttak.com' }));
    expect(res.status).toBe(200);
  });

  it('a body over 512 bytes without Content-Length is measured -> 413', async () => {
    const big = JSON.stringify({ q: '가'.repeat(200), page: 1 });
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const { res, body } = await call(req({ body: stream, len: null }));
    expect(res.status).toBe(413);
    expect(body).toEqual({ error: 'size' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['not JSON', '{q:'],
    ['an array', '[]'],
    ['q missing', '{"page":1}'],
    ['q a number', '{"q":5,"page":1}'],
    ['page 0', '{"q":"세종대로","page":0}'],
    ['page 6', '{"q":"세종대로","page":6}'],
    ['page "x"', '{"q":"세종대로","page":"x"}'],
    ['page 1.5', '{"q":"세종대로","page":1.5}'],
    ['page "1"', '{"q":"세종대로","page":"1"}'],
  ])('%s -> 400 bad', async (_, body) => {
    const r = await call(req({ body }));
    expect(r.res.status).toBe(400);
    expect(r.body).toEqual({ error: 'bad' });
  });

  it('1 character -> short; only %%% -> short; 81 characters -> long; 80 -> ok', async () => {
    expect((await call(req({ body: '{"q":"가","page":1}' }))).body).toEqual({ error: 'short' });
    expect((await call(req({ body: '{"q":"%%%=<>[]","page":1}' }))).body).toEqual({ error: 'short' });
    expect((await call(req({ body: JSON.stringify({ q: '가'.repeat(81), page: 1 }) }))).body).toEqual({ error: 'long' });
    expect((await call(req({ body: JSON.stringify({ q: '가'.repeat(80), page: 1 }) }))).res.status).toBe(200);
  });
});

describe('cleanQuery and validateQuery (decision 8)', () => {
  it('NFC, whitespace collapsed, control/format chars and % = < > [ ] stripped before the length check', () => {
    expect(cleanQuery('  세종대로\t\n 110  ')).toBe('세종대로 110');
    expect(cleanQuery('세종%대로=<110>[1]')).toBe('세종대로1101');
    expect(cleanQuery('세\u0000종​대로\u0007')).toBe('세종대로');
    expect(cleanQuery('세종')).toBe('세종');
    expect(validateQuery({ q: '%가%', page: 1 })).toEqual({ error: 'short' });
    expect(validateQuery({ q: `${'%'.repeat(100)}세종대로`, page: 2 })).toEqual({ q: '세종대로', page: 2 });
  });
});

describe('upstream call and answers (decisions 5, 9)', () => {
  it('POSTs a form with the key, keyword, page, 10 per page and json, with a timeout signal', async () => {
    const { res } = await call(req({ body: JSON.stringify({ q: ' 세종대로  110 ', page: 3 }) }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(UPSTREAM);
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const form = init.body as URLSearchParams;
    expect(Object.fromEntries(form)).toEqual({ confmKey: KEY, currentPage: '3', countPerPage: '10', keyword: '세종대로 110', resultType: 'json' });
  });

  it('200 whitelist: only road/jibun/zip/si/sgg/emd/kor, ≤ 10 items, fields ≤ 200 chars', async () => {
    upstream(() => jsonRes(okBody(14, 37, { roadAddr: 'R'.repeat(300), emdNm: undefined })));
    const { res, body } = await call();
    expect(res.status).toBe(200);
    expect(body.total).toBe(37);
    expect(body.page).toBe(1);
    const items = body.items as Record<string, string>[];
    expect(items).toHaveLength(10);
    expect(Object.keys(items[0]!).sort()).toEqual(['emd', 'jibun', 'kor', 'road', 'sgg', 'si', 'zip']);
    expect(items[0]!.road).toHaveLength(200);
    expect(items[0]!.emd).toBe('');
    expect(items[0]!.zip).toBe('04524');
    expect(items[0]!.kor).toBe('서울특별시 중구 세종대로 110');
  });

  it('0 results -> 200 with no items', async () => {
    upstream(() => jsonRes({ results: { common: { totalCount: '0', errorCode: '0' }, juso: [] } }));
    const { res, body } = await call();
    expect(res.status).toBe(200);
    expect(body).toEqual({ total: 0, page: 1, items: [] });
  });

  it.each([
    ['E0005', 400, 'short'],
    ['E0008', 400, 'short'],
    ['E0006', 400, 'sido'],
    ['E0009', 400, 'digits'],
    ['E0010', 400, 'long'],
    ['E0011', 400, 'chars'],
    ['E0012', 400, 'chars'],
    ['E0013', 400, 'chars'],
    ['E0015', 400, 'broad'],
    ['E0001', 503, 'engine'],
    ['E0014', 503, 'engine'],
    ['-999', 502, 'upstream'],
    ['E9999', 502, 'upstream'],
  ])('errorCode %s -> %i %s, never the upstream message or the key', async (code, status, error) => {
    upstream(() => jsonRes(errBody(code)));
    const { res, body, text } = await call();
    expect(res.status).toBe(status);
    expect(body).toEqual({ error });
    expect(text).not.toContain(KEY);
    expect(text).not.toContain('upstream says');
  });

  it.each([
    ['non-JSON', () => new Response('<html>점검</html>', { status: 200 })],
    ['HTTP 500', () => jsonRes(okBody(1), 500)],
    ['no results object', () => jsonRes({ nope: 1 })],
    ['fetch throws', () => Promise.reject(new TypeError('fetch failed'))],
  ])('%s -> 502 upstream', async (_, answer) => {
    upstream(answer);
    const { res, body } = await call();
    expect(res.status).toBe(502);
    expect(body).toEqual({ error: 'upstream' });
  });

  it('timeout (the 5 s signal fires) -> 504 timeout', async () => {
    vi.useFakeTimers();
    upstream(() => new Promise<Response>(() => undefined));
    fetchMock.mockImplementation((_u: string, init?: RequestInit) => new Promise<Response>((_, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason))));
    const pending = call();
    await vi.advanceTimersByTimeAsync(5_001);
    const { res, body } = await pending;
    expect(res.status).toBe(504);
    expect(body).toEqual({ error: 'timeout' });
  });

  it('a TimeoutError rejection -> 504', async () => {
    upstream(() => Promise.reject(new DOMException('timed out', 'TimeoutError')));
    expect((await call()).res.status).toBe(504);
  });

  it('every answer carries no-store, noindex, nosniff and JSON; none contains the key', async () => {
    const answers = [await call(), await call(req({ method: 'GET' })), await call(req({ body: '{"q":"가","page":1}' })), await call(req(), { PUBLIC_ADDR_EN: '1' })];
    for (const { res, text } of answers) {
      expect(res.headers.get('cache-control')).toBe('no-store, private');
      expect(res.headers.get('cdn-cache-control')).toBe('no-store');
      expect(res.headers.get('x-robots-tag')).toBe('noindex');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
      expect(text).not.toContain(KEY);
    }
  });

  it('mapUpstream: a total that is not a count falls back to the item count', () => {
    const out = mapUpstream(200, { results: { common: { errorCode: 0, totalCount: 'x' }, juso: juso(2) } }, 1);
    expect(out).toMatchObject({ status: 200, body: { total: 2, page: 1 } });
    expect(mapUpstream(200, null, 1)).toEqual({ status: 502, body: { error: 'upstream' } });
  });
});

describe('per-IP limiter (decision 7b)', () => {
  it('the 21st request from one IP within 60 s -> 429 busy; it recovers after the window; other IPs are not affected', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T00:00:00Z'));
    const ip = '203.0.113.99';
    for (let i = 0; i < LIMIT; i++) expect((await call(req({ ip }))).res.status).toBe(200);
    const over = await call(req({ ip }));
    expect(over.res.status).toBe(429);
    expect(over.body).toEqual({ error: 'busy' });
    expect((await call(req({ ip: '203.0.113.100' }))).res.status).toBe(200);
    vi.setSystemTime(new Date('2026-10-16T00:01:00.001Z'));
    expect((await call(req({ ip }))).res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(LIMIT + 2);
  });

  it('createLimiter: limit per window and the key cap drops the oldest key', () => {
    let t = 0;
    const l = createLimiter({ limit: 2, windowMs: 1000, maxKeys: 3, now: () => t });
    expect([l.hit('a'), l.hit('a'), l.hit('a')]).toEqual([true, true, false]);
    l.hit('b');
    l.hit('c');
    expect(l.size).toBe(3);
    l.hit('d');
    expect(l.size).toBe(3);
    // 'a' was dropped (oldest), so it starts a fresh window.
    expect(l.hit('a')).toBe(true);
    t = 1000;
    expect([l.hit('c'), l.hit('c'), l.hit('c')]).toEqual([true, true, false]);
  });
});

describe('privacy greps (decision 6)', () => {
  const src = readFileSync(join(ROOT, 'functions', 'api', 'addr-en.ts'), 'utf8');
  it('no console, no storage, no cache API, no Analytics Engine write in the Function', () => {
    expect(src).not.toMatch(/console\./);
    expect(src).not.toMatch(/caches\b|\.put\(|writeDataPoint|KV|localStorage|sessionStorage/);
  });
  it('the key is read from env only, never a literal', () => {
    expect(src).toMatch(/env\.JUSO_EN_KEY/);
    expect(src.match(/confmKey/g)).toHaveLength(1);
  });
});
