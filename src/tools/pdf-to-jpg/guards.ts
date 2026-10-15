// Small pure pieces of the PDF JPG 변환 controller (T3 review fixes), kept here so they are unit-tested.
import { isRestricted } from '../../lib/pdf/permissions';

/** A canvas that could not be drawn or encoded (iOS leaves an oversized one unusable). */
export class CanvasError extends Error {}

/** What a run was doing when it failed (REQ1015 D-P1): fetch the page, draw it, make the JPG, write the dpi, add to the ZIP. */
export type RunStage = 'page' | 'render' | 'encode' | 'stamp' | 'zip';

/** The usage code of a failed run. worker-gone and unknown-* show MESSAGES.unknown. */
export type RunError = 'canvas' | 'oom' | 'corrupt' | 'worker-gone' | `unknown-${RunStage}`;

/** pdf.js errors that mean the page data itself is broken (the open path in inspect.ts treats them as 손상 too). */
const CORRUPT_NAMES = new Set(['InvalidPDFException', 'UnknownErrorException', 'FormatError', 'MissingPDFException']);

/**
 * pdf.js 6.3.289 when its worker or the document's transport is gone (build/pdf.mjs: "Worker was destroyed",
 * "Worker was destroyed.", "Worker was destroyed during onPassword callback", "Worker was terminated.",
 * "Transport destroyed", "PDFWorker.create - the worker is being destroyed.").
 */
const WORKER_GONE = /worker was (destroyed|terminated)|transport destroyed|worker is being destroyed/i;

/** Maps an error thrown while a page is fetched, drawn or encoded to the usage code (stage names the unknown ones). */
export function runErrorCode(err: unknown, isOom: (e: unknown) => boolean, stage: RunStage): RunError {
  if (err instanceof CanvasError) return 'canvas';
  if (isOom(err)) return 'oom';
  const e = err as { code?: unknown; name?: unknown; message?: unknown } | null;
  if (e?.code === 'corrupt' || (typeof e?.name === 'string' && CORRUPT_NAMES.has(e.name))) return 'corrupt';
  if (typeof e?.message === 'string' && WORKER_GONE.test(e.message)) return 'worker-gone';
  return `unknown-${stage}`;
}

/**
 * What a run does after an error (REQ1015 D-P2): a cancel just stops; a worker-gone failure reopens the file and runs
 * once more; anything else (or a second worker-gone) is reported.
 */
export function afterRunError(o: { cancelled: boolean; code: RunError; retried: boolean }): 'stop' | 'retry' | 'fail' {
  if (o.cancelled) return 'stop';
  return o.code === 'worker-gone' && !o.retried ? 'retry' : 'fail';
}

/**
 * Before a run: a document that failed last time is reopened first; when its pdf.js worker died, the shared worker is
 * replaced as well (REQ1015 D-P2).
 */
export function reopenPlan(stale: boolean, lastCode: RunError | null): 'none' | 'reopen' | 'reset-worker' {
  if (!stale) return 'none';
  return lastCode === 'worker-gone' ? 'reset-worker' : 'reopen';
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
