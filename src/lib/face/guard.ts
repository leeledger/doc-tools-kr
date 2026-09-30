// When to try face auto-framing (brief Step 4 §2). Pure, with the storage and navigator injected.
// Skipped when the build flag is off, when navigator.deviceMemory ≤ 2 (where the API exists), or when the
// sessionStorage key from an earlier attempt is still there: that attempt never finished, most likely
// because the tab crashed while the model was loading. No photo data is ever stored, only "1".

export const ATTEMPT_KEY = 'idphoto-mp-attempt';
export const MIN_DEVICE_MEMORY = 2;

export interface GuardStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function shouldTryAutoFrame(o: { flag: boolean; deviceMemory?: number | undefined; storage: GuardStorage | null }): boolean {
  if (!o.flag) return false;
  if (typeof o.deviceMemory === 'number' && o.deviceMemory <= MIN_DEVICE_MEMORY) return false;
  try {
    if (o.storage && o.storage.getItem(ATTEMPT_KEY) !== null) return false;
  } catch {
    // Storage blocked: no crash memory, try anyway.
  }
  return true;
}

/** Before the model is initialised. */
export function markAttempt(storage: GuardStorage | null): void {
  try {
    storage?.setItem(ATTEMPT_KEY, '1');
  } catch {
    // Storage blocked or full: nothing to remember.
  }
}

/** After the first successful detect (the tab survived). */
export function clearAttempt(storage: GuardStorage | null): void {
  try {
    storage?.removeItem(ATTEMPT_KEY);
  } catch {
    // Storage blocked.
  }
}

/** sessionStorage, or null where reading it throws (blocked storage, sandboxed frames). */
export function sessionStore(): GuardStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}
