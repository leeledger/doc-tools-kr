// 이어서 하기 (CHAIN, brief handoff/ARCHITECT-BRIEF-CHAIN.md): one tool's single-file result opens in the next tool
// without a download. The file (Blob as is) waits in this browser's IndexedDB (`docttak-handoff` / `files`); this tab's
// sessionStorage holds the marker `docttak:handoff` = { to, key }. The key is 16 random bytes made here; it is never
// sent anywhere and only keeps two tabs from taking each other's file. The receiver reads the marker synchronously, so a
// page opened without one never touches IndexedDB. Every put and take also deletes records older than 10 minutes, and
// so does a receiver page opened while the site flag says a file may still be waiting (handoff-marker.ts SWEEP_FLAG).
// Nothing leaves the device.
import { announce } from './announce';
import { HANDOFF_KEY, SWEEP_FLAG, readMarker, removeMarker, siteStorage, tabSession, type Session } from './handoff-marker';

export { HANDOFF_KEY, SWEEP_FLAG, pendingHandoff, sweepDue } from './handoff-marker';

export const HANDOFF_TTL = 10 * 60 * 1000;
const DB_NAME = 'docttak-handoff';
const STORE_NAME = 'files';

/** Receiver notice and polite status after the file arrived. */
export const ARRIVED = '방금 만든 파일을 가져왔습니다.';
/** Receiver alert when the file is missing, expired or unreadable. */
export const TAKE_FAILED = '파일을 가져오지 못했습니다. 파일을 다시 골라 주세요.';

export interface HandoffRecord {
  key: string;
  to: string;
  from: string;
  name: string;
  type: string;
  blob: Blob;
  at: number;
}

/** A record as read back: the bytes instead of the Blob where the browser refused to store a Blob (brief F3). */
export type StoredRecord = Omit<HandoffRecord, 'blob'> & { blob: Blob | ArrayBuffer };

/** Where records wait; IndexedDB in the page, an in-memory fake in unit tests. */
export interface HandoffStore {
  put(rec: HandoffRecord): Promise<void>;
  get(key: string): Promise<StoredRecord | undefined>;
  delete(key: string): Promise<void>;
  /** Deletes every record whose `at` is before `before` (isStale). */
  sweep(before: number): Promise<void>;
  count(): Promise<number>;
}

export interface HandoffDeps {
  store?: HandoffStore;
  session?: Session | null;
  /** localStorage, for SWEEP_FLAG. */
  local?: Session | null;
  now?: () => number;
}

/** A record stored at `at` is swept when `at` is before `before` (or not a number). */
export const isStale = (at: unknown, before: number): boolean => !(typeof at === 'number' && at >= before);

/**
 * Whether a failed put is the browser refusing a Blob (brief F3): DataCloneError, or WebKit's UnknownError "Error
 * preparing Blob/File data to be stored in object store" (seen in Playwright WebKit). Quota, blocked or missing storage
 * are not: retrying with a copy of the bytes would only spend memory.
 */
export function isBlobRefusal(err: unknown): boolean {
  const e = err as { name?: unknown; message?: unknown } | null;
  if (!e || typeof e.name !== 'string') return false;
  return e.name === 'DataCloneError' || (e.name === 'UnknownError' && typeof e.message === 'string' && /blob|file/i.test(e.message));
}

/** The bytes of `rec` when it is meant for `slug` and at most 10 minutes old; null otherwise. */
export async function recordBytes(rec: StoredRecord | undefined, slug: string, now: number): Promise<ArrayBuffer | null> {
  if (!rec || rec.to !== slug || !(now - rec.at <= HANDOFF_TTL)) return null;
  if (rec.blob instanceof Blob) return rec.blob.arrayBuffer();
  // Tag check, not instanceof: bytes can come from another realm.
  return Object.prototype.toString.call(rec.blob) === '[object ArrayBuffer]' ? (rec.blob as ArrayBuffer) : null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}

/** One transaction on `files`; resolves with the request's result once the transaction completes. */
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      let value: T | undefined;
      const req = fn(tx.objectStore(STORE_NAME));
      if (req) req.onsuccess = () => (value = req.result);
      tx.oncomplete = () => resolve(value);
      // The request's error names the cause (WebKit leaves tx.error empty).
      const fail = (): void => reject((req && req.error) ?? tx.error ?? new Error('abort'));
      tx.onerror = fail;
      tx.onabort = fail;
    });
  } finally {
    db.close();
  }
}

/** The real store. Creating it opens nothing; each call opens the database and closes it again. */
export const idbStore: HandoffStore = {
  put: async (rec) => {
    try {
      await run('readwrite', (s) => s.put(rec));
    } catch (err) {
      if (!isBlobRefusal(err)) throw err;
      // Brief F3: the browser refuses a Blob in IndexedDB; the bytes are stored instead.
      const bytes = await rec.blob.arrayBuffer();
      await run('readwrite', (s) => s.put({ ...rec, blob: bytes }));
    }
  },
  get: (key) => run<StoredRecord | undefined>('readonly', (s) => s.get(key)),
  delete: async (key) => void (await run('readwrite', (s) => s.delete(key))),
  sweep: async (before) =>
    void (await run('readwrite', (s) => {
      const req = s.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        if (isStale((cur.value as StoredRecord).at, before)) cur.delete();
        cur.continue();
      };
    })),
  count: async () => (await run<number>('readonly', (s) => s.count())) ?? 0,
};

/** 16 random bytes as hex. */
function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const localOf = (deps: HandoffDeps): Session | null => (deps.local === undefined ? siteStorage() : deps.local);

/**
 * Deletes records older than 10 minutes and clears SWEEP_FLAG once nothing is left. Never throws. Run by every take and
 * by a receiver page opened while the flag is set.
 */
export async function sweepLingering(deps: HandoffDeps = {}): Promise<void> {
  const store = deps.store ?? idbStore;
  const now = (deps.now ?? Date.now)();
  try {
    await store.sweep(now - HANDOFF_TTL);
    if ((await store.count()) === 0) localOf(deps)?.removeItem(SWEEP_FLAG);
  } catch {
    // The flag stays; the next page that sees it tries again.
  }
}

/**
 * Takes the waiting file for `slug` once: the marker and the record are removed whatever happens. null when there is no
 * marker for `slug`, the record is missing, older than 10 minutes, meant for another tool, or storage fails.
 */
export async function takeHandoff(slug: string, deps: HandoffDeps = {}): Promise<File | null> {
  const session = deps.session === undefined ? tabSession() : deps.session;
  const marker = readMarker(session);
  removeMarker(session);
  if (!marker || marker.to !== slug) return null;
  const store = deps.store ?? idbStore;
  const now = (deps.now ?? Date.now)();
  let rec: StoredRecord | undefined;
  let bytes: ArrayBuffer | null = null;
  try {
    rec = await store.get(marker.key);
    // Read before the record is deleted: Firefox keeps a large stored Blob in a file that goes with the record, and a
    // Blob read after that fails (the receiver would call the file damaged).
    bytes = await recordBytes(rec, slug, now);
  } catch {
    bytes = null;
  }
  try {
    await store.delete(marker.key);
  } catch {
    // Left for a later sweep (the site flag is still set).
  }
  await sweepLingering(deps);
  if (!rec || !bytes) return null;
  return new File([bytes], rec.name, { type: rec.type });
}

/**
 * Stores `blob` for the tool `to` and opens it in this tab. false (nothing opened, nothing left behind where possible)
 * when the file could not be stored.
 */
export async function sendTo(
  to: string,
  from: string,
  blob: Blob,
  name: string,
  type: string,
  go: (path: string) => void = (p) => window.location.assign(p),
  deps: HandoffDeps = {},
): Promise<boolean> {
  const session = deps.session === undefined ? tabSession() : deps.session;
  if (!session) return false;
  const store = deps.store ?? idbStore;
  const now = (deps.now ?? Date.now)();
  let key: string;
  try {
    key = newKey();
    await store.sweep(now - HANDOFF_TTL);
    await store.put({ key, to, from, name, type, blob, at: now });
  } catch {
    return false;
  }
  try {
    // Before the marker: a record nobody takes is still found and swept later.
    localOf(deps)?.setItem(SWEEP_FLAG, '1');
  } catch {
    // Blocked localStorage: such a record is swept by the next put or take only.
  }
  try {
    session.setItem(HANDOFF_KEY, JSON.stringify({ to, key }));
  } catch {
    try {
      await store.delete(key);
    } catch {
      // Left for a later sweep (the site flag is set).
    }
    return false;
  }
  go(`/${to}/`);
  return true;
}

export interface ReceiveOptions {
  /** The tool's notice paragraph: shows ARRIVED (before any notice the tool set for the file). */
  notice: HTMLElement;
  /** Reports TAKE_FAILED; default: the tool's alert region. */
  fail?: (msg: string) => void;
}

/**
 * Receiver: takes the waiting file and hands it to the tool's own pick path (`deliver`), then shows ARRIVED unless the
 * tool reported an error for the file (its alert is showing) or `deliver` returned false (the tool did not start).
 */
export async function receiveHandoff(
  slug: string,
  root: HTMLElement,
  deliver: (file: File) => unknown,
  opts: ReceiveOptions,
  deps: HandoffDeps = {},
): Promise<void> {
  const file = await takeHandoff(slug, deps);
  if (!file) {
    (opts.fail ?? ((msg: string) => announce('alert', msg, root)))(TAKE_FAILED);
    return;
  }
  if ((await deliver(file)) === false) return;
  const alert = root.querySelector<HTMLElement>('[data-live="alert"]');
  if (alert && !alert.hidden && alert.textContent) return;
  const { notice } = opts;
  const existing = notice.hidden ? '' : (notice.textContent ?? '').trim();
  notice.textContent = existing ? `${ARRIVED} ${existing}` : ARRIVED;
  notice.hidden = false;
  announce('status', ARRIVED, root);
}
