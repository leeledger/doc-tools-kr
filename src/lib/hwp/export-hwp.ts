// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// HWPX → HWP export with a reload gate (HWPX2HWP brief decision 4). Pure: rhwp comes in as the open document
// and the constructor used for the reload, so the unit tests run it with a fake and with the real engine.
// Order (memory-lean for phones): exportHwpWithReport() → contentLoss() → takeBytes() → free the export →
// pagesIn = doc.pageCount() → free the source → reload the exact bytes → same page count, > 0, CFB magic.
// The gate checks the bytes the user gets, not exportHwpVerify() (that serialises a second time).
// Throws HwpError: export (rhwp threw while exporting), oom (memory), unverified (the gate failed).
import { classifyParseError } from './engine';
import { HwpError } from './errors';

/** rhwp's DocumentExport: the bytes and the content-loss report of one export. */
export interface RhwpExport {
  contentLoss(): string;
  takeBytes(): Uint8Array;
  free(): void;
}

/** The part of rhwp's HwpDocument the export uses. */
export interface ExportableDocument {
  pageCount(): number;
  exportHwpWithReport(): RhwpExport;
  free(): void;
}

/** The reload: rhwp's HwpDocument constructor. */
export type ReloadCtor = new (bytes: Uint8Array) => { pageCount(): number; free(): void };

export interface HwpExportResult {
  bytes: Uint8Array;
  /** Places rhwp reports as not carried over (content-loss report); a report we cannot read counts as 1. */
  losses: number;
  /** Pages of the source as rhwp lays it out (never shown as 한글's page count). */
  pagesIn: number;
}

/** The first 8 bytes of every CFB (OLE2) file, so of every HWP 5 file. */
export const CFB_MAGIC: readonly number[] = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export const hasCfbMagic = (b: Uint8Array): boolean => b.length >= CFB_MAGIC.length && CFB_MAGIC.every((v, i) => b[i] === v);

const isOom = (err: unknown): boolean => classifyParseError(err, { distribution: false }) === 'oom';

/**
 * The number of losses in rhwp's content-loss report (`{"schemaVersion":1,"outputFormat":"hwp","count":0,
 * "losses":[]}`, SPIKE-HWPX-TO-HWP). rhwp documents no loss kinds, so only the count is used. A report that is
 * not that shape is never read as "no loss": it counts as one unknown loss.
 */
export function countLosses(report: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(report);
  } catch {
    return 1;
  }
  const r = parsed as { losses?: unknown; count?: unknown } | null;
  if (!r || typeof r !== 'object' || !Array.isArray(r.losses)) return 1;
  const count = typeof r.count === 'number' && Number.isInteger(r.count) && r.count >= 0 ? r.count : 0;
  return Math.max(r.losses.length, count);
}

/** Exports `doc` as HWP and checks the bytes by reopening them. Always frees `doc` (the caller drops it). */
export function exportHwp(doc: ExportableDocument, Reload: ReloadCtor): HwpExportResult {
  let bytes: Uint8Array;
  let losses: number;
  let pagesIn: number;
  try {
    let exp: RhwpExport;
    try {
      exp = doc.exportHwpWithReport();
    } catch (err) {
      throw new HwpError(isOom(err) ? 'oom' : 'export', 'rhwp could not export HWP', { cause: err });
    }
    try {
      let report: string;
      try {
        report = exp.contentLoss();
      } catch {
        report = '';
      }
      losses = countLosses(report);
      bytes = exp.takeBytes();
    } catch (err) {
      throw new HwpError(isOom(err) ? 'oom' : 'export', 'rhwp gave no HWP bytes', { cause: err });
    } finally {
      exp.free();
    }
    pagesIn = doc.pageCount();
  } finally {
    doc.free();
  }
  if (!hasCfbMagic(bytes) || !(pagesIn > 0)) throw new HwpError('unverified', 'the HWP bytes are not a CFB file');
  let pagesOut: number;
  try {
    const again = new Reload(bytes);
    try {
      pagesOut = again.pageCount();
    } finally {
      again.free();
    }
  } catch (err) {
    throw new HwpError(isOom(err) ? 'oom' : 'unverified', 'the HWP bytes did not reopen', { cause: err });
  }
  if (pagesOut !== pagesIn) throw new HwpError('unverified', `pages ${pagesIn} → ${pagesOut}`);
  return { bytes, losses, pagesIn };
}
