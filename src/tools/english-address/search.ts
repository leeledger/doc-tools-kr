// 영문주소 변환기: the page's one network call (ADDREN1016 decisions 5, 13). A same-origin POST of {"q","page"} as JSON
// to /api/addr-en after 찾기 or 더 보기 is pressed; never a GET, never in a URL; no credentials, no cache. The answer is
// checked here so the controller only sees whitelisted items or a message code.
import type { AddrItem } from './split';
import type { MessageCode } from './messages';

export const API = '/api/addr-en';

export type SearchResult = { ok: true; total: number; page: number; items: AddrItem[] } | { ok: false; code: MessageCode | 'engine' | 'upstream' | 'timeout' | 'off' };

const FIELDS = ['road', 'jibun', 'zip', 'si', 'sgg', 'emd', 'kor'] as const;

function item(x: unknown): AddrItem | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const out = {} as AddrItem;
  for (const k of FIELDS) {
    if (typeof o[k] !== 'string') return null;
    out[k] = o[k] as string;
  }
  return out.road ? out : null;
}

/** Reads the Function's answer: 200 with items, or an error code ('other' when the answer is not one of ours). */
export function readAnswer(status: number, body: unknown): SearchResult {
  if (!body || typeof body !== 'object') return { ok: false, code: 'other' };
  const o = body as { error?: unknown; total?: unknown; page?: unknown; items?: unknown };
  if (status !== 200) return { ok: false, code: typeof o.error === 'string' && /^[a-z]{1,12}$/.test(o.error) ? (o.error as MessageCode) : 'other' };
  if (!Array.isArray(o.items) || typeof o.total !== 'number' || typeof o.page !== 'number') return { ok: false, code: 'other' };
  const items = o.items.map(item).filter((x): x is AddrItem => x !== null);
  return { ok: true, total: o.total, page: o.page, items };
}

/** One search. `online` false or a fetch TypeError -> offline (no request when already offline). */
export async function searchAddress(q: string, page: number, fetcher: typeof fetch = fetch, online = navigator.onLine): Promise<SearchResult> {
  if (online === false) return { ok: false, code: 'offline' };
  let res: Response;
  try {
    res = await fetcher(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, page }),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'offline' };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, code: 'other' };
  }
  return readAnswer(res.status, body);
}
