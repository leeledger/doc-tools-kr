// @vitest-environment jsdom
// 이어서 하기 (CHAIN X1): the handoff transport with an in-memory store and session (no IndexedDB in tests).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ARRIVED, HANDOFF_KEY, HANDOFF_TTL, SWEEP_FLAG, TAKE_FAILED, isBlobRefusal, isStale, pendingHandoff, receiveHandoff, recordBytes, sendTo, sweepDue, sweepLingering, takeHandoff, type HandoffRecord, type HandoffStore, type StoredRecord } from '../../src/lib/ui/handoff';

function memStore() {
  const recs = new Map<string, StoredRecord>();
  const calls: string[] = [];
  const store: HandoffStore = {
    put: async (r) => void (calls.push('put'), recs.set(r.key, r)),
    get: async (k) => (calls.push('get'), recs.get(k)),
    delete: async (k) => void (calls.push('delete'), recs.delete(k)),
    sweep: async (before) => {
      calls.push('sweep');
      for (const [k, r] of recs) if (isStale(r.at, before)) recs.delete(k);
    },
    count: async () => (calls.push('count'), recs.size),
  };
  return { store, recs, calls };
}

function memSession() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

const pdf = () => new Blob(['%PDF-1.7 test'], { type: 'application/pdf' });
const T0 = 1_000_000_000_000;

let mem: ReturnType<typeof memStore>;
let session: ReturnType<typeof memSession>;
let now: number;
let local: ReturnType<typeof memSession>;
let deps: { store: HandoffStore; session: ReturnType<typeof memSession>; local: ReturnType<typeof memSession>; now: () => number };
beforeEach(() => {
  mem = memStore();
  session = memSession();
  local = memSession();
  now = T0;
  deps = { store: mem.store, session, local, now: () => now };
});

describe('sendTo', () => {
  it('stores one record with a random 32-hex key, sets the marker and opens /<to>/', async () => {
    const go = vi.fn();
    expect(await sendTo('pdf-compress', 'jpg-to-pdf', pdf(), '사진.pdf', 'application/pdf', go, deps)).toBe(true);
    expect(go).toHaveBeenCalledWith('/pdf-compress/');
    expect(mem.recs.size).toBe(1);
    const [rec] = [...mem.recs.values()];
    expect(rec).toMatchObject({ to: 'pdf-compress', from: 'jpg-to-pdf', name: '사진.pdf', type: 'application/pdf', at: T0 });
    expect(rec!.key).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.parse(session.m.get(HANDOFF_KEY)!)).toEqual({ to: 'pdf-compress', key: rec!.key });
    expect(mem.calls.slice(0, 2)).toEqual(['sweep', 'put']);
  });

  it('a throwing store: false, no marker, no navigation', async () => {
    const go = vi.fn();
    const store = { ...mem.store, put: () => Promise.reject(new DOMException('quota', 'QuotaExceededError')) };
    expect(await sendTo('pdf-compress', 'jpg-to-pdf', pdf(), 'a.pdf', 'application/pdf', go, { ...deps, store })).toBe(false);
    expect(go).not.toHaveBeenCalled();
    expect(session.m.has(HANDOFF_KEY)).toBe(false);
  });

  it('blocked session storage: false and the stored record is removed again', async () => {
    const go = vi.fn();
    const blocked = { ...session, setItem: () => { throw new DOMException('blocked', 'SecurityError'); } };
    expect(await sendTo('pdf-compress', 'jpg-to-pdf', pdf(), 'a.pdf', 'application/pdf', go, { ...deps, session: blocked })).toBe(false);
    expect(go).not.toHaveBeenCalled();
    expect(mem.recs.size).toBe(0);
    expect(await sendTo('pdf-compress', 'jpg-to-pdf', pdf(), 'a.pdf', 'application/pdf', go, { ...deps, session: null })).toBe(false);
  });

  it('two hand-offs get different keys and each tab takes its own file', async () => {
    const other = memSession();
    await sendTo('pdf-compress', 'jpg-to-pdf', new Blob(['A'], { type: 'application/pdf' }), 'a.pdf', 'application/pdf', vi.fn(), deps);
    await sendTo('pdf-compress', 'jpg-to-pdf', new Blob(['B'], { type: 'application/pdf' }), 'b.pdf', 'application/pdf', vi.fn(), { ...deps, session: other });
    expect(mem.recs.size).toBe(2);
    const b = await takeHandoff('pdf-compress', { ...deps, session: other });
    const a = await takeHandoff('pdf-compress', deps);
    expect(a?.name).toBe('a.pdf');
    expect(b?.name).toBe('b.pdf');
    expect(await a!.text()).toBe('A');
    expect(mem.recs.size).toBe(0);
  });

  it('sweeps records older than 10 minutes on put', async () => {
    mem.recs.set('old', { key: 'old', to: 'x', from: 'y', name: 'o', type: '', blob: pdf(), at: T0 - HANDOFF_TTL - 1 });
    await sendTo('pdf-compress', 'jpg-to-pdf', pdf(), 'a.pdf', 'application/pdf', vi.fn(), deps);
    expect(mem.recs.has('old')).toBe(false);
    expect(mem.recs.size).toBe(1);
  });
});

describe('pendingHandoff / takeHandoff', () => {
  it('no marker: false / null and the store is never touched (F4)', async () => {
    expect(pendingHandoff('pdf-compress', session)).toBe(false);
    expect(await takeHandoff('pdf-compress', deps)).toBeNull();
    expect(mem.calls).toEqual([]);
  });

  it('takes once: File with name and type; marker and record gone; a second take is null', async () => {
    await sendTo('pdf-compress', 'jpg-to-pdf', pdf(), '사진.pdf', 'application/pdf', vi.fn(), deps);
    expect(pendingHandoff('pdf-compress', session)).toBe(true);
    const f = await takeHandoff('pdf-compress', deps);
    expect(f).toBeInstanceOf(File);
    expect(f!.name).toBe('사진.pdf');
    expect(f!.type).toBe('application/pdf');
    expect(await f!.text()).toBe('%PDF-1.7 test');
    expect(session.m.has(HANDOFF_KEY)).toBe(false);
    expect(mem.recs.size).toBe(0);
    expect(pendingHandoff('pdf-compress', session)).toBe(false);
    expect(await takeHandoff('pdf-compress', deps)).toBeNull();
  });

  it('a marker for another tool is removed and ignored', async () => {
    await sendTo('pdf-sign', 'jpg-to-pdf', pdf(), 'a.pdf', 'application/pdf', vi.fn(), deps);
    const calls = mem.calls.length;
    expect(pendingHandoff('pdf-compress', session)).toBe(false);
    expect(session.m.has(HANDOFF_KEY)).toBe(false);
    expect(mem.calls.length).toBe(calls);
  });

  it('a malformed marker is removed', () => {
    session.m.set(HANDOFF_KEY, '{"to":"pdf-compress","key":"../x"}');
    expect(pendingHandoff('pdf-compress', session)).toBe(false);
    expect(session.m.has(HANDOFF_KEY)).toBe(false);
  });

  it('expired (over 10 minutes): null and deleted; exactly 10 minutes still arrives', async () => {
    await sendTo('pdf-compress', 'jpg-to-pdf', pdf(), 'a.pdf', 'application/pdf', vi.fn(), deps);
    now = T0 + HANDOFF_TTL + 1;
    expect(await takeHandoff('pdf-compress', deps)).toBeNull();
    expect(mem.recs.size).toBe(0);
    now = T0;
    await sendTo('pdf-compress', 'jpg-to-pdf', pdf(), 'a.pdf', 'application/pdf', vi.fn(), deps);
    now = T0 + HANDOFF_TTL;
    expect(await takeHandoff('pdf-compress', deps)).not.toBeNull();
  });

  it('record meant for another tool (to mismatch): null and deleted', async () => {
    await sendTo('pdf-sign', 'jpg-to-pdf', pdf(), 'a.pdf', 'application/pdf', vi.fn(), deps);
    const key = (JSON.parse(session.m.get(HANDOFF_KEY)!) as { key: string }).key;
    session.m.set(HANDOFF_KEY, JSON.stringify({ to: 'pdf-compress', key }));
    expect(await takeHandoff('pdf-compress', deps)).toBeNull();
    expect(mem.recs.size).toBe(0);
  });

  it('key mismatch (record missing): null, marker removed', async () => {
    session.m.set(HANDOFF_KEY, JSON.stringify({ to: 'pdf-compress', key: 'a'.repeat(32) }));
    expect(await takeHandoff('pdf-compress', deps)).toBeNull();
    expect(session.m.has(HANDOFF_KEY)).toBe(false);
  });

  it('reads the bytes before the record is deleted (a Firefox file-backed Blob dies with its record)', async () => {
    class DyingBlob extends Blob {
      dead = false;
      readAlive = false;
      override arrayBuffer(): Promise<ArrayBuffer> {
        if (!this.dead) this.readAlive = true;
        return this.dead ? Promise.reject(new DOMException('gone', 'NotReadableError')) : super.arrayBuffer();
      }
    }
    const blob = new DyingBlob(['%PDF-1.7 big'], { type: 'application/pdf' });
    const store: HandoffStore = { ...mem.store, delete: async (k) => void ((blob.dead = true), mem.recs.delete(k)) };
    await sendTo('pdf-compress', 'jpg-to-pdf', blob, 'a.pdf', 'application/pdf', vi.fn(), { ...deps, store });
    const f = await takeHandoff('pdf-compress', { ...deps, store });
    expect(blob.dead).toBe(true);
    expect(blob.readAlive).toBe(true);
    expect(await f!.text()).toBe('%PDF-1.7 big');
  });

  it('a throwing store: null, never throws', async () => {
    session.m.set(HANDOFF_KEY, JSON.stringify({ to: 'pdf-compress', key: 'a'.repeat(32) }));
    const fail = () => Promise.reject(new Error('idb'));
    const store: HandoffStore = { put: fail, get: fail, delete: fail, sweep: fail, count: fail };
    expect(await takeHandoff('pdf-compress', { ...deps, store })).toBeNull();
  });
});

describe('receiveHandoff', () => {
  const page = () => {
    document.body.innerHTML = `<div id="t"><p id="n" hidden></p><p data-live="alert" hidden></p><p data-live="status"></p></div>`;
    return { root: document.getElementById('t')!, notice: document.getElementById('n')! };
  };

  it('delivers the file, then shows the notice (before a notice the tool set)', async () => {
    const { root, notice } = page();
    await sendTo('pdf-compress', 'jpg-to-pdf', pdf(), 'a.pdf', 'application/pdf', vi.fn(), deps);
    const got: File[] = [];
    await receiveHandoff('pdf-compress', root, (f) => {
      got.push(f);
      notice.hidden = false;
      notice.textContent = '도구 알림.';
    }, { notice }, deps);
    expect(got.map((f) => f.name)).toEqual(['a.pdf']);
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toBe(`${ARRIVED} 도구 알림.`);
  });

  it('no notice when the tool reported an error or did not start', async () => {
    const { root, notice } = page();
    await sendTo('pdf-compress', 'jpg-to-pdf', pdf(), 'a.pdf', 'application/pdf', vi.fn(), deps);
    await receiveHandoff('pdf-compress', root, () => {
      const a = root.querySelector<HTMLElement>('[data-live="alert"]')!;
      a.hidden = false;
      a.textContent = 'PDF 파일이 아닙니다.';
    }, { notice }, deps);
    expect(notice.hidden).toBe(true);
    await sendTo('pdf-compress', 'jpg-to-pdf', pdf(), 'a.pdf', 'application/pdf', vi.fn(), deps);
    root.querySelector<HTMLElement>('[data-live="alert"]')!.hidden = true;
    await receiveHandoff('pdf-compress', root, () => false, { notice }, deps);
    expect(notice.hidden).toBe(true);
  });

  it('missing file: the alert (or the page fail callback); nothing delivered', async () => {
    const { root, notice } = page();
    session.m.set(HANDOFF_KEY, JSON.stringify({ to: 'pdf-compress', key: 'b'.repeat(32) }));
    const deliver = vi.fn();
    await receiveHandoff('pdf-compress', root, deliver, { notice }, deps);
    expect(deliver).not.toHaveBeenCalled();
    const alert = root.querySelector<HTMLElement>('[data-live="alert"]')!;
    expect(alert.hidden).toBe(false);
    expect(alert.textContent).toBe(TAKE_FAILED);
    session.m.set(HANDOFF_KEY, JSON.stringify({ to: 'pdf-compress', key: 'b'.repeat(32) }));
    const fail = vi.fn();
    await receiveHandoff('pdf-compress', root, deliver, { notice, fail }, deps);
    expect(fail).toHaveBeenCalledWith(TAKE_FAILED);
  });
});

describe('lingering files: the site flag (Richard SF1/SF2, orchestrator decision)', () => {
  it('a stored file sets the flag (value only "1"); taking the last file clears it', async () => {
    await sendTo('pdf-compress', 'jpg-to-pdf', pdf(), 'a.pdf', 'application/pdf', vi.fn(), deps);
    expect(local.m.get(SWEEP_FLAG)).toBe('1');
    expect(sweepDue(local)).toBe(true);
    await takeHandoff('pdf-compress', deps);
    expect(local.m.has(SWEEP_FLAG)).toBe(false);
    expect(sweepDue(local)).toBe(false);
  });

  it('a file nobody took: kept while fresh (flag stays), swept after 10 minutes (flag cleared)', async () => {
    await sendTo('pdf-compress', 'jpg-to-pdf', pdf(), 'a.pdf', 'application/pdf', vi.fn(), deps);
    session.m.clear(); // the tab closed before the next tool opened
    now = T0 + HANDOFF_TTL;
    await sweepLingering(deps);
    expect(mem.recs.size).toBe(1);
    expect(sweepDue(local)).toBe(true);
    now = T0 + HANDOFF_TTL + 1;
    await sweepLingering(deps);
    expect(mem.recs.size).toBe(0);
    expect(sweepDue(local)).toBe(false);
  });

  it('a failing store keeps the flag and never throws; blocked localStorage is no flag', async () => {
    local.m.set(SWEEP_FLAG, '1');
    const fail = () => Promise.reject(new Error('idb'));
    await sweepLingering({ ...deps, store: { ...mem.store, sweep: fail } });
    expect(sweepDue(local)).toBe(true);
    const blocked = { ...local, getItem: () => { throw new DOMException('blocked', 'SecurityError'); } };
    expect(sweepDue(blocked)).toBe(false);
    expect(sweepDue(null)).toBe(false);
  });

  it('a blocked localStorage does not stop the hand-off', async () => {
    const blocked = { ...local, setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); } };
    expect(await sendTo('pdf-compress', 'jpg-to-pdf', pdf(), 'a.pdf', 'application/pdf', vi.fn(), { ...deps, local: blocked })).toBe(true);
  });
});

describe('pure helpers', () => {
  it('isStale: before the cut-off or not a number', () => {
    expect(isStale(99, 100)).toBe(true);
    expect(isStale(100, 100)).toBe(false);
    expect(isStale(101, 100)).toBe(false);
    for (const bad of [undefined, null, 'x', NaN]) expect(isStale(bad, 100), String(bad)).toBe(true);
  });

  it('isBlobRefusal: DataCloneError and WebKit\'s Blob UnknownError only; quota, blocked, other errors are not', () => {
    expect(isBlobRefusal(new DOMException('x', 'DataCloneError'))).toBe(true);
    expect(isBlobRefusal(new DOMException('Error preparing Blob/File data to be stored in object store', 'UnknownError'))).toBe(true);
    expect(isBlobRefusal(new DOMException('x', 'QuotaExceededError'))).toBe(false);
    expect(isBlobRefusal(new DOMException('x', 'SecurityError'))).toBe(false);
    expect(isBlobRefusal(new DOMException('Internal error', 'UnknownError'))).toBe(false);
    expect(isBlobRefusal(new Error('blocked'))).toBe(false);
    for (const bad of [null, undefined, 'DataCloneError', {}]) expect(isBlobRefusal(bad)).toBe(false);
  });

  it('recordBytes: Blob or stored bytes for the right tool within 10 minutes; null otherwise', async () => {
    const base = { key: 'k', to: 'pdf-sign', from: 'pdf-compress', name: 'a.pdf', type: 'application/pdf', at: T0 };
    const bytes = new TextEncoder().encode('%PDF-1.4').buffer as ArrayBuffer;
    expect(await recordBytes({ ...base, blob: bytes }, 'pdf-sign', T0)).toBe(bytes);
    const fromBlob = await recordBytes({ ...base, blob: new Blob(['%PDF-1.4']) }, 'pdf-sign', T0 + HANDOFF_TTL);
    expect(new TextDecoder().decode(fromBlob!)).toBe('%PDF-1.4');
    expect(await recordBytes({ ...base, blob: bytes }, 'pdf-split', T0)).toBeNull();
    expect(await recordBytes({ ...base, blob: bytes }, 'pdf-sign', T0 + HANDOFF_TTL + 1)).toBeNull();
    expect(await recordBytes(undefined, 'pdf-sign', T0)).toBeNull();
  });

  it('stored bytes (the F3 fallback) come back as a File with the name and type', async () => {
    const key = 'd'.repeat(32);
    mem.recs.set(key, { key, to: 'pdf-sign', from: 'pdf-compress', name: '합본.pdf', type: 'application/pdf', blob: new TextEncoder().encode('%PDF-1.4').buffer as ArrayBuffer, at: T0 });
    session.m.set(HANDOFF_KEY, JSON.stringify({ to: 'pdf-sign', key }));
    const f = await takeHandoff('pdf-sign', deps);
    expect(f!.name).toBe('합본.pdf');
    expect(f!.type).toBe('application/pdf');
    expect(await f!.text()).toBe('%PDF-1.4');
  });
});
