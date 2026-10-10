// 이어서 하기 (CHAIN): the synchronous half of src/lib/ui/handoff.ts. A receiver page script imports only this, so a page
// opened without a waiting file loads no IndexedDB code and never opens the database. A stored file that nobody took
// (tab closed while storing, a receiver that could not load) is found through the site flag SWEEP_FLAG: set when a file
// is stored, cleared once the store is empty; while it is there, these pages load handoff.ts and sweep expired records.

export const HANDOFF_KEY = 'docttak:handoff';
/** localStorage flag "a stored file may still be waiting"; its value is only '1'. */
export const SWEEP_FLAG = 'docttak:handoff-sweep';

export type Session = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** This tab's sessionStorage, or null where reading it throws (blocked storage). */
export function tabSession(): Session | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** This site's localStorage, or null where reading it throws (blocked storage). */
export function siteStorage(): Session | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Whether a stored file may still be waiting somewhere (synchronous; IndexedDB is not touched). */
export function sweepDue(local: Session | null = siteStorage()): boolean {
  try {
    return local !== null && local.getItem(SWEEP_FLAG) !== null;
  } catch {
    return false;
  }
}

const KEY_RE = /^[0-9a-f]{32}$/;

/** The marker { to, key }, or null when there is none or it is malformed. */
export function readMarker(session: Session | null): { to: string; key: string } | null {
  try {
    const raw = session?.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as unknown;
    if (!m || typeof m !== 'object') return null;
    const { to, key } = m as Record<string, unknown>;
    return typeof to === 'string' && typeof key === 'string' && KEY_RE.test(key) ? { to, key } : null;
  } catch {
    return null;
  }
}

export function removeMarker(session: Session | null): void {
  try {
    session?.removeItem(HANDOFF_KEY);
  } catch {
    // Blocked storage: nothing to remove.
  }
}

/** Whether a file is waiting for `slug`. A marker for another tool (or a malformed one) is removed. */
export function pendingHandoff(slug: string, session: Session | null = tabSession()): boolean {
  let raw: string | null;
  try {
    raw = session?.getItem(HANDOFF_KEY) ?? null;
  } catch {
    return false;
  }
  if (raw === null) return false;
  if (readMarker(session)?.to === slug) return true;
  removeMarker(session);
  return false;
}
