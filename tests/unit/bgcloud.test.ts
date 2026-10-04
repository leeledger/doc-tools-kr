// C2-cloud (brief handoff/ARCHITECT-BRIEF-C2-CLOUD.md §10): the Pages Function and the docttak-bg Worker with fakes,
// the privacy greps of both trees, the page's cloud client (copy, request, answer, alpha), the remembered choice, the
// page states, the build flag and privacy gate, the service worker's bypass and the e2e no-upload allowlist.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { onRequest, MAX_BYTES as FN_MAX } from '../../functions/api/remove-bg';
import worker, { isQuotaError, sniff, type Env as WorkerEnv } from '../../workers/bg/src/index';
import { alphaMask, isCleanJpeg, makeCopy, readAnswer, requestCutout, sameShape, SEND_EDGE, type Canvas2d } from '../../src/lib/bgremove/cloud';
import { chooseDevice, deviceChosen, MODE_KEY } from '../../src/lib/bgremove/mode';
import { move, view } from '../../src/tools/remove-background/model';
import { CLOUD } from '../../src/tools/remove-background/copy';
import { route } from '../../src/sw/sw';
import { bgCloudFlag, bgCloudOn, EXCEPTION_RE, privacyGate } from '../../scripts/lib/bgcloud.mjs';
import { isAllowedUpload, uploadProblems, type RequestLike, type ResponseLike } from '../e2e/upload-guard';

const ROOT = join(__dirname, '..', '..');
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00];
const jpeg = (n = 64): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i < JPEG_HEAD.length ? JPEG_HEAD[i]! : 0));

/** A JPEG with an APP1 EXIF segment holding a GPS IFD pointer (the shape a phone camera writes). */
function exifJpeg(): Uint8Array {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x88, 0x25, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00, 0x00];
  const body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const len = body.length + 2;
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...body, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]);
}

function req(init: { method?: string; site?: string | null; type?: string; len?: number | null; body?: Uint8Array } = {}): Request {
  const body = init.body ?? jpeg();
  const headers = new Headers();
  if (init.site !== null) headers.set('sec-fetch-site', init.site ?? 'same-origin');
  headers.set('content-type', init.type ?? 'image/jpeg');
  if (init.len !== null) headers.set('content-length', String(init.len ?? body.length));
  headers.set('cf-connecting-ip', '203.0.113.7');
  const method = init.method ?? 'POST';
  return new Request('https://docttak.com/api/remove-bg', { method, headers, body: method === 'POST' ? (body as BodyInit) : undefined });
}

describe('Pages Function /api/remove-bg (guards, then the service binding)', () => {
  const bound = () => {
    const fetch = vi.fn(async (r: Request) => new Response('ok', { status: 200, headers: { 'content-type': 'image/webp', 'x-seen': r.method } }));
    return { env: { BG: { fetch } }, fetch };
  };

  it('forwards a same-origin JPEG POST unchanged to env.BG and returns its answer', async () => {
    const { env, fetch } = bound();
    const r = req();
    const res = await onRequest({ request: r, env });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe(r);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-seen')).toBe('POST');
  });

  it.each([
    ['GET', req({ method: 'GET' }), 405, 'method'],
    ['no Sec-Fetch-Site', req({ site: null }), 403, 'origin'],
    ['cross-site', req({ site: 'cross-site' }), 403, 'origin'],
    ['same-site (another subdomain)', req({ site: 'same-site' }), 403, 'origin'],
    ['no Content-Length', req({ len: null }), 413, 'size'],
    ['empty body', req({ len: 0 }), 413, 'size'],
    ['over 2,000,000 bytes', req({ len: FN_MAX + 1 }), 413, 'size'],
    ['text/plain', req({ type: 'text/plain' }), 415, 'type'],
    ['multipart form', req({ type: 'multipart/form-data; boundary=x' }), 415, 'type'],
  ])('refuses %s before the Worker runs', async (_name, r, status, error) => {
    const { env, fetch } = bound();
    const res = await onRequest({ request: r, env });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
    expect(res.headers.get('cache-control')).toBe('no-store, private');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts PNG and WebP, and Content-Type parameters', async () => {
    for (const type of ['image/png', 'image/webp', 'image/jpeg; charset=binary']) {
      const { env, fetch } = bound();
      expect((await onRequest({ request: req({ type }), env })).status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('without the binding (production before the owner sets it) answers 503 engine; a binding failure 502 engine', async () => {
    expect((await onRequest({ request: req(), env: {} })).status).toBe(503);
    const res = await onRequest({ request: req(), env: { BG: { fetch: async () => Promise.reject(new Error('boom')) } } });
    expect(res.status).toBe(502);
    expect(await res.text()).toBe('{"error":"engine"}');
  });

  it('exports only onRequest (the spike GET handler and its cf.image probe are gone)', async () => {
    const mod = await import('../../functions/api/remove-bg');
    expect(Object.keys(mod).sort()).toEqual(['MAX_BYTES', 'onRequest']);
    const src = readFileSync(join(ROOT, 'functions', 'api', 'remove-bg.ts'), 'utf8');
    expect(src).not.toMatch(/onRequestGet|cf:\s*\{|spike|IMAGES/);
  });
});

describe('Worker docttak-bg', () => {
  type Call = { opts: Record<string, unknown>; out: Record<string, unknown>; bytes: number };
  const fakeImages = (behaviour: 'ok' | Error = 'ok') => {
    const calls: Call[] = [];
    const IMAGES: WorkerEnv['IMAGES'] = {
      input(stream) {
        const call: Call = { opts: {}, out: {}, bytes: 0 };
        calls.push(call);
        return {
          transform(o) {
            call.opts = o;
            return {
              async output(o2) {
                call.out = o2;
                call.bytes = (await new Response(stream).arrayBuffer()).byteLength;
                if (behaviour !== 'ok') throw behaviour;
                return { response: () => new Response('webp-bytes', { headers: { 'content-type': 'image/webp', 'cache-control': 'public, max-age=31536000' } }) };
              },
            };
          },
        };
      },
    };
    return { IMAGES, calls };
  };
  const limiter = (ok: boolean) => ({ limit: vi.fn(async () => ({ success: ok })) });

  it('segments a JPEG into lossless WebP, streams the whole body, and answers no-store / noindex', async () => {
    const { IMAGES, calls } = fakeImages();
    const body = jpeg(5000);
    const res = await worker.fetch(req({ body }), { IMAGES, RL_IP: limiter(true), RL_IP10: limiter(true) });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('webp-bytes');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.opts).toEqual({ segment: 'foreground' });
    expect(calls[0]!.out).toEqual({ format: 'image/webp', quality: 100 });
    expect(calls[0]!.bytes).toBe(5000);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe('no-store, private');
    expect(res.headers.get('cdn-cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
  });

  it('magic bytes: JPEG, PNG and WebP pass; anything else is 415 and never reaches the binding', async () => {
    expect(sniff(jpeg())).toBe('jpeg');
    expect(sniff(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(sniff(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('webp');
    expect(sniff(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniff(Uint8Array.from([0xff, 0xd8]))).toBeNull();
    const { IMAGES, calls } = fakeImages();
    const res = await worker.fetch(req({ body: new TextEncoder().encode('GIF89a-not-allowed-here') }), { IMAGES });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'type' });
    expect(calls).toHaveLength(0);
  });

  it('rate limits per IP: either limiter saying no is 429 busy, before the binding', async () => {
    for (const env of [{ RL_IP10: limiter(false), RL_IP: limiter(true) }, { RL_IP10: limiter(true), RL_IP: limiter(false) }]) {
      const { IMAGES, calls } = fakeImages();
      const res = await worker.fetch(req(), { IMAGES, ...env });
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: 'busy' });
      expect(calls).toHaveLength(0);
    }
    const l = limiter(true);
    await worker.fetch(req(), { IMAGES: fakeImages().IMAGES, RL_IP: l });
    expect(l.limit).toHaveBeenCalledWith({ key: '203.0.113.7' });
  });

  it('maps the quota error (9422) to 503 quota and any other engine error to 502 engine, with no request data', async () => {
    expect(isQuotaError(new Error('ERROR 9422: transformation limit'))).toBe(true);
    expect(isQuotaError('Monthly quota exceeded')).toBe(true);
    expect(isQuotaError(new Error('segment failed'))).toBe(false);
    const quota = await worker.fetch(req(), { IMAGES: fakeImages(new Error('9422')).IMAGES });
    expect(quota.status).toBe(503);
    expect(await quota.text()).toBe('{"error":"quota"}');
    const other = await worker.fetch(req(), { IMAGES: fakeImages(new Error('model crashed on 203.0.113.7')).IMAGES });
    expect(other.status).toBe(502);
    expect(await other.text()).toBe('{"error":"engine"}');
  });

  it('refuses other methods and sizes', async () => {
    const { IMAGES } = fakeImages();
    expect((await worker.fetch(req({ method: 'GET' }), { IMAGES })).status).toBe(405);
    expect((await worker.fetch(req({ len: 2_000_001 }), { IMAGES })).status).toBe(413);
    expect((await worker.fetch(req({ len: 0 }), { IMAGES })).status).toBe(413);
  });

  it('wrangler.toml: Images binding, both rate limits, no workers.dev URL, no routes, no logs', () => {
    const toml = readFileSync(join(ROOT, 'workers', 'bg', 'wrangler.toml'), 'utf8');
    expect(toml).toMatch(/\[images\]\s*binding = "IMAGES"/);
    expect(toml).toMatch(/name = "RL_IP"[\s\S]*limit = 6, period = 60/);
    expect(toml).toMatch(/name = "RL_IP10"[\s\S]*limit = 3, period = 10/);
    expect(toml).toMatch(/^workers_dev = false$/m);
    expect(toml).toMatch(/^preview_urls = false$/m);
    expect(toml).not.toMatch(/^routes?\s*=/m);
    expect(toml).toMatch(/\[observability\]\s*enabled = false/);
  });
});

describe('privacy greps (brief §6.1): no storage and no logging in functions/api/ and workers/bg/', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : /\.(ts|js|mjs)$/.test(d.name) ? [join(dir, d.name)] : []));
  const all = [...files(join(ROOT, 'functions')), ...files(join(ROOT, 'workers', 'bg', 'src'))];

  it('scans both trees', () => {
    expect(all.map((f) => f.split(/[\\/]/).slice(-2).join('/')).sort()).toEqual(['api/remove-bg.ts', 'src/index.ts']);
  });

  it.each(['caches.', '.put(', 'R2', 'KV', 'console.', 'waitUntil', 'cacheEverything', 'cacheTtl', 'localStorage', 'D1', 'DurableObject'])('never uses %s', (needle) => {
    expect(all.filter((f) => readFileSync(f, 'utf8').includes(needle))).toEqual([]);
  });
});

describe('cloud client (src/lib/bgremove/cloud.ts)', () => {
  const fakeCanvas = (bytes: Uint8Array | null) => {
    const seen: { w: number; h: number; draw?: number[]; type?: string; q?: number; fill?: unknown } = { w: 0, h: 0 };
    const create = (w: number, h: number): Canvas2d => {
      seen.w = w;
      seen.h = h;
      const g = {
        fillStyle: '' as unknown,
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low' as ImageSmoothingQuality,
        fillRect: () => {
          seen.fill = g.fillStyle;
        },
        drawImage: (...a: unknown[]) => {
          seen.draw = a.slice(1) as number[];
        },
      };
      return {
        canvas: {
          width: w,
          height: h,
          toBlob: (cb, type, q) => {
            seen.type = type;
            seen.q = q;
            cb(bytes ? new Blob([bytes as BlobPart], { type: 'image/jpeg' }) : null);
          },
        },
        g: g as unknown as Canvas2d['g'],
      };
    };
    return { create, seen };
  };
  const src = (width: number, height: number) => ({ width, height }) as unknown as ImageBitmap;

  it('the copy: long edge 1024 (never larger than the work copy), on white, JPEG q0.9', async () => {
    const { create, seen } = fakeCanvas(jpeg(4000));
    const c = await makeCopy(src(4096, 3072), create);
    expect(c && { w: c.width, h: c.height }).toEqual({ w: 1024, h: 768 });
    expect(seen).toMatchObject({ w: 1024, h: 768, draw: [0, 0, 1024, 768], type: 'image/jpeg', q: 0.9, fill: '#FFFFFF' });
    const small = await makeCopy(src(600, 400), fakeCanvas(jpeg()).create);
    expect(small && [small.width, small.height]).toEqual([600, 400]);
    const tall = await makeCopy(src(2048, 4000), fakeCanvas(jpeg()).create);
    expect(tall && Math.max(tall.width, tall.height)).toBe(SEND_EDGE);
  });

  it('never sends a copy with EXIF/GPS (APP1), an empty one or one over 2 MB', async () => {
    expect(isCleanJpeg(jpeg())).toBe(true);
    expect(isCleanJpeg(exifJpeg())).toBe(false);
    expect(isCleanJpeg(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(false);
    expect(await makeCopy(src(800, 600), fakeCanvas(exifJpeg()).create)).toBeNull();
    expect(await makeCopy(src(800, 600), fakeCanvas(null).create)).toBeNull();
    expect(await makeCopy(src(800, 600), fakeCanvas(jpeg(2_000_001)).create)).toBeNull();
    expect(await makeCopy(src(800, 600), () => null)).toBeNull();
  });

  it('the GPS-tagged photo fixture is what isCleanJpeg refuses (tests/fixtures/photo/exif6_gps.jpg)', () => {
    expect(isCleanJpeg(new Uint8Array(readFileSync(join(ROOT, 'tests', 'fixtures', 'photo', 'exif6_gps.jpg'))))).toBe(false);
  });

  it('one POST to /api/remove-bg: JPEG body, no cookies, no cache, no redirects', async () => {
    const fetcher = vi.fn(async () => new Response('x', { status: 200, headers: { 'content-type': 'image/webp' } }));
    const body = jpeg() as Uint8Array<ArrayBuffer>;
    const r = await requestCutout(body, new AbortController().signal, fetcher);
    expect(r.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/remove-bg');
    expect(init).toMatchObject({ method: 'POST', body, credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'image/jpeg' } });
  });

  it('answers: 429 busy, 503 quota, other 503 / 5xx / 4xx / wrong type failed; nothing is retried', async () => {
    const ans = (status: number, body = '', type = 'application/json') => readAnswer(new Response(body, { status, headers: { 'content-type': type } }));
    expect(await ans(429, '{"error":"busy"}')).toEqual({ ok: false, why: 'busy' });
    expect(await ans(503, '{"error":"quota"}')).toEqual({ ok: false, why: 'quota' });
    expect(await ans(503, 'error code: 9422', 'text/plain')).toEqual({ ok: false, why: 'quota' });
    expect(await ans(503, '{"error":"engine"}')).toEqual({ ok: false, why: 'failed' });
    for (const s of [500, 502, 403, 413, 415]) expect(await ans(s, '{}')).toEqual({ ok: false, why: 'failed' });
    expect(await ans(200, '<html>', 'text/html')).toEqual({ ok: false, why: 'failed' });
    const fetcher = vi.fn(async () => new Response('{"error":"busy"}', { status: 429 }));
    await requestCutout(new Uint8Array(0), new AbortController().signal, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('a network error is failed, the page cancelling is aborted, and 30 s without an answer is failed', async () => {
    expect(await requestCutout(new Uint8Array(0), new AbortController().signal, async () => Promise.reject(new TypeError('offline')))).toEqual({ ok: false, why: 'failed' });
    const hang = (_u: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const page = new AbortController();
    const p = requestCutout(new Uint8Array(0), page.signal, hang);
    page.abort();
    expect(await p).toEqual({ ok: false, why: 'aborted' });
    vi.useFakeTimers();
    try {
      const t = requestCutout(new Uint8Array(0), new AbortController().signal, hang);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await t).toEqual({ ok: false, why: 'failed' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps only the alpha of the answer, and only for the copy shape', () => {
    const rgba = Uint8ClampedArray.from([10, 20, 30, 255, 1, 2, 3, 0, 9, 9, 9, 128]);
    expect(Array.from(alphaMask(rgba, 3, 1)).map((v) => +v.toFixed(3))).toEqual([1, 0, 0.502]);
    expect(sameShape(1024, 768, 1024, 768)).toBe(true);
    expect(sameShape(1024, 768, 1023, 768)).toBe(true);
    expect(sameShape(1024, 768, 768, 1024)).toBe(false);
    expect(sameShape(1024, 768, 0, 0)).toBe(false);
  });
});

describe('remembered choice (localStorage docttak-bg-mode)', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  it('stores only "device", and forgets it', () => {
    const s = mem();
    expect(deviceChosen(s)).toBe(false);
    chooseDevice(true, s);
    expect([...s.m]).toEqual([[MODE_KEY, 'device']]);
    expect(deviceChosen(s)).toBe(true);
    chooseDevice(false, s);
    expect(deviceChosen(s)).toBe(false);
  });
  it('storage that throws (private mode) means "not chosen" and never breaks the page', () => {
    const boom = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    expect(deviceChosen(boom)).toBe(false);
    expect(() => chooseDevice(true, boom)).not.toThrow();
    expect(deviceChosen(null)).toBe(false);
  });
});

describe('page states with the cloud path (model.ts)', () => {
  it('opening -> ready -> sending -> working -> done; quota -> consent; errors retry or go to the device', () => {
    expect(move('opening', 'ready')).toBe('ready');
    expect(move('ready', 'sending')).toBe('sending');
    expect(move('sending', 'working')).toBe('working');
    expect(move('working', 'done')).toBe('done');
    expect(move('sending', 'consent')).toBe('consent');
    expect(move('ready', 'consent')).toBe('consent');
    expect(move('error', 'sending')).toBe('sending');
    expect(move('error', 'consent')).toBe('consent');
    expect(move('ready', 'done')).toBe('ready');
    expect(move('empty', 'sending')).toBe('empty');
    expect(move('sending', 'empty')).toBe('empty');
  });
  it('ready shows its panel only; sending shows progress with 취소', () => {
    expect(view('ready')).toMatchObject({ ready: true, drop: false, consent: false, progress: false, cancel: false });
    expect(view('sending')).toMatchObject({ ready: false, progress: true, bytes: false, cancel: true });
    expect(view('consent').ready).toBe(false);
  });
  it('the brief §4 lines, word for word', () => {
    expect(CLOUD.busy).toBe('잠시 사용이 많아요. 1분 뒤 다시 해 보세요.');
    expect(CLOUD.quota).toBe('이번 달 무료 처리량이 다 찼어요. 이 기기에서 처리할 수 있어요.');
    expect(CLOUD.failed).toBe('지금은 처리할 수 없어요. 다시 시도하거나 기기에서 처리해 보세요.');
    expect([CLOUD.sending, CLOUD.working, CLOUD.refining]).toEqual(['사진을 보내는 중…', '배경을 지우는 중… (보통 5초쯤)', '가장자리를 다듬는 중…']);
    expect(CLOUD.device('약 110 MB')).toBe('사진을 보내지 않고 기기에서 처리 (처음 한 번 약 110 MB 받기)');
    expect(EXCEPTION_RE.test(CLOUD.notice)).toBe(true);
    for (const line of Object.values(CLOUD)) if (typeof line === 'string') expect(line).not.toMatch(/업로드|서버|브라우저|네트워크|EXIF/);
  });
});

describe('flag and privacy gate (scripts/lib/bgcloud.mjs)', () => {
  const on = { PUBLIC_BG_REMOVE: '1', PUBLIC_BG_CLOUD: '1', PUBLIC_PRIVACY_OFFICER: '이종림', PUBLIC_CONTACT_EMAIL: 'robotncoding@kakao.com' };
  it('default off; on only with both flags', () => {
    expect(bgCloudFlag(undefined)).toBe(false);
    expect(bgCloudFlag(' 1 ')).toBe(true);
    expect(bgCloudOn({})).toBe(false);
    expect(bgCloudOn({ PUBLIC_BG_CLOUD: '1' })).toBe(false);
    expect(bgCloudOn({ PUBLIC_BG_REMOVE: '1' })).toBe(false);
    expect(bgCloudOn(on)).toBe(true);
  });
  it('the cloud path needs the officer and a valid contact', () => {
    expect(privacyGate(on)).toEqual([]);
    expect(privacyGate({ ...on, PUBLIC_PRIVACY_OFFICER: ' ' })).toEqual([expect.stringContaining('PUBLIC_PRIVACY_OFFICER')]);
    expect(privacyGate({ ...on, PUBLIC_CONTACT_EMAIL: undefined })).toEqual([expect.stringContaining('PUBLIC_CONTACT_EMAIL')]);
    expect(privacyGate({ ...on, PUBLIC_CONTACT_EMAIL: 'nope' })).toEqual([expect.stringContaining('PUBLIC_CONTACT_EMAIL')]);
    expect(privacyGate({ PUBLIC_BG_CLOUD: '0' })).toEqual([]);
    expect(privacyGate({ PUBLIC_BG_CLOUD: '1' })).toEqual([]);
  });
});

describe('service worker (brief §6.4): /api/ and every non-GET go to the network untouched', () => {
  const origin = 'https://docttak.com';
  it.each([
    ['POST', '/api/remove-bg', 'cors'],
    ['GET', '/api/remove-bg', 'cors'],
    ['POST', '/remove-background/', 'navigate'],
    ['PUT', '/_astro/x.js', 'cors'],
  ])('%s %s is the browser default', (method, path, mode) => {
    expect(route({ method, url: origin + path, mode }, origin)).toBe('default');
  });
});

describe('no-upload allowlist (tests/e2e/upload-guard.ts)', () => {
  const base = 'http://127.0.0.1:4173';
  const rq = (method: string, url: string, body: Buffer | null = null): RequestLike => ({ url: () => url, method: () => method, postDataBuffer: () => body });
  const rs = (url: string, method = 'GET', csp = "default-src 'self'; connect-src 'self'"): ResponseLike => ({ url: () => url, headers: (): Record<string, string> => (csp ? { 'content-security-policy': csp } : {}), request: () => ({ method: () => method }) });
  const page = [rq('GET', `${base}/remove-background/`)];
  const allow = [{ method: 'POST', path: '/api/remove-bg' }];
  const post = (path: string) => rq('POST', `${base}${path}`, Buffer.from('jpeg'));

  it('(a) a POST to /api/remove-bg fails without the allowlist', () => {
    const log = { requests: [...page, post('/api/remove-bg')], responses: [], websockets: [] };
    expect(uploadProblems(log, base)).toEqual([`POST ${base}/api/remove-bg`, `request body on ${base}/api/remove-bg`]);
  });

  it('(b) with it, only that exact path passes: a query, another path, another method or another origin fail', () => {
    expect(uploadProblems({ requests: [...page, post('/api/remove-bg')], responses: [rs(`${base}/api/remove-bg`, 'POST', '')], websockets: [] }, base, allow)).toEqual([]);
    for (const path of ['/api/remove-bg?x', '/api/other', '/api/remove-bg/', '/api/remove-bg#a']) {
      expect(uploadProblems({ requests: [post(path)], responses: [], websockets: [] }, base, allow), path).not.toEqual([]);
    }
    expect(uploadProblems({ requests: [rq('PUT', `${base}/api/remove-bg`, Buffer.from('x'))], responses: [], websockets: [] }, base, allow)).not.toEqual([]);
    expect(uploadProblems({ requests: [rq('POST', 'https://evil.example/api/remove-bg', Buffer.from('x'))], responses: [], websockets: [] }, base, allow)).not.toEqual([]);
    expect(isAllowedUpload('POST', 'not a url', base, allow)).toBe(false);
  });

  it('(c) GET-only pages still pass, and the CSP check still holds for every other response', () => {
    expect(uploadProblems({ requests: page, responses: [rs(`${base}/remove-background/`)], websockets: [] }, base)).toEqual([]);
    expect(uploadProblems({ requests: page, responses: [rs(`${base}/remove-background/`, 'GET', '')], websockets: [] }, base, allow)).toEqual([`no CSP connect-src 'self' on ${base}/remove-background/`]);
    expect(uploadProblems({ requests: page, responses: [], websockets: ['ws://x'] }, base, allow)).toEqual(['websocket ws://x']);
  });
});
