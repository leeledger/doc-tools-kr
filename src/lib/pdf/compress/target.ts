// 목표 용량 search (brief Polish P.13). Pure and framework-free: the worker passes the real engine as
// `runRung`, the unit tests a fake. Rungs run in order (highest quality first) until one output is ≤ the
// target. Only the smallest valid output so far is kept; every other buffer is dropped as soon as it loses.
import { KEEP_ORIGINAL_RATIO, isPlainLevel, type RungName } from './levels';
import type { CompressReport } from './report';

export interface RungOutcome {
  bytes: Uint8Array;
  keptOriginal: boolean;
  report: CompressReport;
}

export type TargetResult =
  /** The input already fits: nothing runs. */
  | { outcome: 'already'; tried: RungName[] }
  /** `hit`: the first output ≤ the target (the highest-quality pass). `miss`: the smallest valid output. */
  | { outcome: 'hit' | 'miss'; rung: RungName; bytes: Uint8Array; report: CompressReport; tried: RungName[] }
  /** No rung produced an output worth offering (every one kept the original). */
  | { outcome: 'none'; report: CompressReport | null; tried: RungName[] };

export async function searchTarget(
  runRung: (rung: RungName, index: number) => Promise<RungOutcome>,
  ladder: readonly RungName[],
  targetBytes: number,
  inputBytes: number,
): Promise<TargetResult> {
  const tried: RungName[] = [];
  if (inputBytes <= targetBytes) return { outcome: 'already', tried };
  let best: { rung: RungName; bytes: Uint8Array; report: CompressReport } | null = null;
  let last: CompressReport | null = null;
  let skipNextPlain = false;
  for (let i = 0; i < ladder.length; i++) {
    const rung = ladder[i]!;
    // Skip-ahead (a speed-up only): a plain level that left more than twice the target cannot plausibly
    // be rescued by the next plain level. The target rungs are never skipped.
    if (skipNextPlain && isPlainLevel(rung)) {
      skipNextPlain = false;
      continue;
    }
    skipNextPlain = false;
    tried.push(rung);
    const r = await runRung(rung, i);
    last = r.report;
    const size = r.keptOriginal ? inputBytes : r.bytes.length;
    if (!r.keptOriginal && size < KEEP_ORIGINAL_RATIO * inputBytes && (!best || size < best.bytes.length)) {
      best = { rung, bytes: r.bytes, report: r.report };
    }
    if (!r.keptOriginal && size <= targetBytes) return { outcome: 'hit', rung, bytes: r.bytes, report: r.report, tried };
    if (isPlainLevel(rung) && size > 2 * targetBytes) skipNextPlain = true;
  }
  if (best) return { outcome: 'miss', ...best, tried };
  return { outcome: 'none', report: last, tried };
}
