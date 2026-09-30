// Row states of a batch (brief Step 3 §3). Pure: the controller renders, this decides.

export type RowState =
  /** Failed a pre-flight check (sniff or limits); never sent to the worker. */
  | 'invalid'
  /** Waiting (대기). */
  | 'pending'
  | 'decode'
  | 'search'
  | 'final'
  | 'done'
  /** Not smaller than the original: no download. */
  | 'kept'
  /** Failed in the worker. */
  | 'error';

export interface QueueRow {
  id: number;
  state: RowState;
}

export const RUNNING: ReadonlySet<RowState> = new Set(['decode', 'search', 'final']);

/** Rows a run processes: everything that passed the pre-flight checks. */
export function runnable(rows: readonly QueueRow[]): number[] {
  return rows.filter((r) => r.state !== 'invalid').map((r) => r.id);
}

/** A new run: every runnable row waits again (old results are discarded by the caller). */
export function startRun(rows: QueueRow[]): number[] {
  const ids = runnable(rows);
  for (const r of rows) if (r.state !== 'invalid') r.state = 'pending';
  return ids;
}

/** The row the worker is on: the one in a running phase, else the first waiting one of the run. */
export function currentRow(rows: readonly QueueRow[], runIds: readonly number[]): number | null {
  const running = rows.find((r) => RUNNING.has(r.state) && runIds.includes(r.id));
  if (running) return running.id;
  const waiting = runIds.find((id) => rows.find((r) => r.id === id)?.state === 'pending');
  return waiting ?? null;
}

/**
 * The worker died (onerror or out of memory). The current row gets the error; the rows still waiting are
 * returned so a fresh worker can continue with them.
 */
export function crash(rows: QueueRow[], runIds: readonly number[]): { failed: number | null; rest: number[] } {
  const failed = currentRow(rows, runIds);
  const row = rows.find((r) => r.id === failed);
  if (row) row.state = 'error';
  const rest = runIds.filter((id) => rows.find((r) => r.id === id)?.state === 'pending');
  return { failed, rest };
}

/** Cancel: finished rows keep their results; running and waiting rows go back to 대기. */
export function cancelRun(rows: QueueRow[]): { anyFinished: boolean } {
  for (const r of rows) if (RUNNING.has(r.state)) r.state = 'pending';
  return { anyFinished: rows.some((r) => r.state === 'done' || r.state === 'kept' || r.state === 'error') };
}
