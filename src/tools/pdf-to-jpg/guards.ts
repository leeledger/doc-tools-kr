// Small pure pieces of the PDF JPG 변환 controller (T3 review fixes), kept here so they are unit-tested.
import { isRestricted } from '../../lib/pdf/permissions';

/** A canvas that could not be drawn or encoded (iOS leaves an oversized one unusable). */
export class CanvasError extends Error {}

export type RunError = 'canvas' | 'oom' | 'corrupt' | 'unknown';

/** pdf.js errors that mean the page data itself is broken (the open path in inspect.ts treats them as 손상 too). */
const CORRUPT_NAMES = new Set(['InvalidPDFException', 'UnknownErrorException', 'FormatError', 'MissingPDFException']);

/** Maps an error thrown while a page is fetched, drawn or encoded to the message and usage code. */
export function runErrorCode(err: unknown, isOom: (e: unknown) => boolean): RunError {
  if (err instanceof CanvasError) return 'canvas';
  if (isOom(err)) return 'oom';
  const e = err as { code?: unknown; name?: unknown } | null;
  if (e?.code === 'corrupt' || (typeof e?.name === 'string' && CORRUPT_NAMES.has(e.name))) return 'corrupt';
  return 'unknown';
}

export const RESTRICTED_NOTE = '이 파일에는 복사·인쇄 제한이 걸려 있습니다. 파일을 만든 곳에서 허락한 경우에만 쓰세요.';

/**
 * The one-line notice for a PDF that opens without a password but carries copy/print/edit limits (orchestrator
 * decision, T3 deploy gate). `perms` is pdf.js `getPermissions()` (a Set of allowed flags): null when the file is not
 * encrypted.
 */
export function restrictionNote(perms: Iterable<number> | null): string | null {
  return isRestricted(perms) ? RESTRICTED_NOTE : null;
}

/**
 * The page render that a cancel should stop. A run only clears the slot if it still holds its own task, so a stale run
 * that wakes up late cannot drop a newer run's task (T3 review Should Fix 2).
 */
export class TaskSlot {
  private task: { cancel(): void } | null = null;

  set(task: { cancel(): void }): void {
    this.task = task;
  }

  release(task: { cancel(): void }): void {
    if (this.task === task) this.task = null;
  }

  cancel(): void {
    this.task?.cancel();
    this.task = null;
  }
}
