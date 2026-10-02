// Crash memory for 배경 지우기 (Sprint C, C2; brief build order 5, the src/lib/face/guard.ts pattern). A sessionStorage
// marker is set before the engine starts on a photo and cleared after its first result. A marker still there on the
// next load means that attempt never finished, most likely because the phone closed the tab for lack of room: the
// page says so and halves the default work size for this tab. No photo data is stored, only "1".
import type { GuardStorage } from '../face/guard';

export type { GuardStorage };
export const ATTEMPT_KEY = 'bgremove-attempt';
/** Set when a crashed attempt was seen in this tab: later photos use half the work size. */
export const SMALL_KEY = 'bgremove-small';

function get(storage: GuardStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function set(storage: GuardStorage | null, key: string, value: string | null): void {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // Storage blocked or full: nothing to remember.
  }
}

/**
 * On page start: true when the previous attempt in this tab did not finish. The marker becomes the "small" flag,
 * so the message shows once and the smaller work size stays for the tab.
 */
export function takeCrash(storage: GuardStorage | null): boolean {
  if (get(storage, ATTEMPT_KEY) === null) return false;
  set(storage, ATTEMPT_KEY, null);
  set(storage, SMALL_KEY, '1');
  return true;
}

/** Work long edge for this tab: `edge`, halved after a crash. */
export function workEdge(storage: GuardStorage | null, edge: number): number {
  return get(storage, SMALL_KEY) === null ? edge : Math.round(edge / 2);
}

/** Before the engine starts on a photo. */
export function markAttempt(storage: GuardStorage | null): void {
  set(storage, ATTEMPT_KEY, '1');
}

/** After the photo's result (or a handled error): the tab survived. */
export function clearAttempt(storage: GuardStorage | null): void {
  set(storage, ATTEMPT_KEY, null);
}
