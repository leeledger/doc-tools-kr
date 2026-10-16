// 영문주소 변환기 page client (ADDREN1016 decisions 5, 13): the one request and how its answer is read.
import { describe, expect, it, vi } from 'vitest';
import { API, readAnswer, searchAddress } from '../../src/tools/english-address/search';

const ITEM = { road: '110 Sejong-daero, Jung-gu, Seoul', jibun: '31 Taepyeongno 1-ga, Jung-gu, Seoul', zip: '04524', si: 'Seoul', sgg: 'Jung-gu', emd: '', kor: '서울특별시 중구 세종대로 110' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('searchAddress', () => {
  it('POSTs exactly {"q","page"} as JSON to the same-origin API, no credentials beyond same-origin, no cache', async () => {
    const fetcher = vi.fn(async () => json(200, { total: 1, page: 2, items: [ITEM] }));
    const r = await searchAddress('세종대로 110', 2, fetcher as unknown as typeof fetch, true);
    expect(r).toEqual({ ok: true, total: 1, page: 2, items: [ITEM] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(API);
    expect(url).toBe('/api/addr-en');
    expect(init).toEqual({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"q":"세종대로 110","page":2}', credentials: 'same-origin', cache: 'no-store' });
  });

  it('offline: no request when the device says so; a rejected fetch is offline too', async () => {
    const fetcher = vi.fn(async () => json(200, {}));
    expect(await searchAddress('세종대로', 1, fetcher as unknown as typeof fetch, false)).toEqual({ ok: false, code: 'offline' });
    expect(fetcher).not.toHaveBeenCalled();
    const failing = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')));
    expect(await searchAddress('세종대로', 1, failing as unknown as typeof fetch, true)).toEqual({ ok: false, code: 'offline' });
  });

  it('an answer that is not JSON (a Cloudflare limit page) -> other', async () => {
    const fetcher = vi.fn(async () => new Response('<html>1027</html>', { status: 503 }));
    expect(await searchAddress('세종대로', 1, fetcher as unknown as typeof fetch, true)).toEqual({ ok: false, code: 'other' });
  });
});

describe('readAnswer', () => {
  it('error codes pass through; odd ones become other', () => {
    expect(readAnswer(429, { error: 'busy' })).toEqual({ ok: false, code: 'busy' });
    expect(readAnswer(400, { error: 'short' })).toEqual({ ok: false, code: 'short' });
    expect(readAnswer(500, { error: '<b>x</b>' })).toEqual({ ok: false, code: 'other' });
    expect(readAnswer(500, null)).toEqual({ ok: false, code: 'other' });
    expect(readAnswer(200, { items: 'x', total: 1, page: 1 })).toEqual({ ok: false, code: 'other' });
  });

  it('keeps only well-formed items with the seven string fields', () => {
    const r = readAnswer(200, { total: 3, page: 1, items: [ITEM, { ...ITEM, zip: 4524 }, { ...ITEM, road: '' }, null] });
    expect(r).toEqual({ ok: true, total: 3, page: 1, items: [ITEM] });
  });
});
