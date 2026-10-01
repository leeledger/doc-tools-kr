// What the guides may say about our own tools (Growth G.1): every value is read from the constant the tool
// itself uses, never retyped. A guide lists the facts it relies on as `toolFacts: [{ ref, value }]`; the schema
// fails the build when a ref is unknown or its value differs from this table, and the fact check only accepts
// a number with a unit in a guide when it comes from the page's sources, presets or these facts.
import { MB } from '../lib/ui/device';
import { GUARD_PAGES, LIMITS as HWP_LIMITS, MB_DEC } from '../lib/hwp/limits';
import { LIMITS as COMPRESS_LIMITS } from '../tools/pdf-compress/limits';
import { LEVEL_COPY } from '../tools/pdf-compress/level-copy';
import { TARGET_MB } from '../tools/pdf-compress/target';
import { LIMITS as MERGE_LIMITS, MAX_FILES } from '../tools/pdf-merge/limits';
import { LIMITS as PHOTO_LIMITS } from '../tools/photo-compress/limits';
import { KB_BYTES, RANGES } from '../tools/photo-compress/options';

/** A unit the fact check knows (a fact without one is a count or a word and is not number-checked). */
export type FactUnit = 'KB' | 'MB';

export interface ToolFact {
  value: number | string;
  unit?: FactUnit;
}

const levelNames = LEVEL_COPY.map((l) => l.label.replace(/ \(.*\)$/, '')).join('·');

export const TOOL_FACTS = {
  'photo-compress.targetKb.min': { value: RANGES.targetKb.min, unit: 'KB' },
  'photo-compress.targetKb.max': { value: RANGES.targetKb.max, unit: 'KB' },
  'photo-compress.kbBytes': { value: KB_BYTES },
  'photo-compress.maxFiles.desktop': { value: PHOTO_LIMITS.desktop.maxFiles },
  'photo-compress.maxFiles.mobile': { value: PHOTO_LIMITS.mobile.maxFiles },
  'photo-compress.maxFileMb.desktop': { value: PHOTO_LIMITS.desktop.maxFileBytes / MB, unit: 'MB' },
  'photo-compress.maxFileMb.mobile': { value: PHOTO_LIMITS.mobile.maxFileBytes / MB, unit: 'MB' },
  'pdf-compress.targetMb.min': { value: TARGET_MB.min, unit: 'MB' },
  'pdf-compress.targetMb.max': { value: TARGET_MB.max, unit: 'MB' },
  'pdf-compress.levels': { value: levelNames },
  'pdf-compress.maxMb.desktop': { value: COMPRESS_LIMITS.desktop.hardBytes / MB, unit: 'MB' },
  'pdf-compress.maxMb.mobile': { value: COMPRESS_LIMITS.mobile.hardBytes / MB, unit: 'MB' },
  'pdf-merge.maxFiles': { value: MAX_FILES },
  'pdf-merge.maxTotalMb.desktop': { value: MERGE_LIMITS.desktop.hardBytes / MB, unit: 'MB' },
  'pdf-merge.maxTotalMb.mobile': { value: MERGE_LIMITS.mobile.hardBytes / MB, unit: 'MB' },
  // HWP (1 MB = 1,000,000 bytes there): the largest file a device opens, the PDF caps on phones, the search span.
  'hwp.maxMb.desktop': { value: HWP_LIMITS.desktop.hardBytes / MB_DEC, unit: 'MB' },
  'hwp.maxMb.mobile': { value: HWP_LIMITS.mobile.hardBytes / MB_DEC, unit: 'MB' },
  'hwp.pdfMb.mobile': { value: HWP_LIMITS.mobile.capBytes / MB_DEC, unit: 'MB' },
  'hwp.pdfPages.mobile': { value: HWP_LIMITS.mobile.capPages },
  'hwp.pdfMb.desktop': { value: HWP_LIMITS.desktop.capBytes / MB_DEC, unit: 'MB' },
  'hwp.pdfPages.desktop': { value: HWP_LIMITS.desktop.capPages },
  'hwp-viewer.searchPages': { value: GUARD_PAGES },
} as const satisfies Record<string, ToolFact>;

export type ToolFactRef = keyof typeof TOOL_FACTS;

export const isToolFactRef = (ref: string): ref is ToolFactRef => Object.hasOwn(TOOL_FACTS, ref);
