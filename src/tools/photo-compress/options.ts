// Form state → validated engine options (brief Step 3 §3.2, "Encoder rules"). Pure.
import type { PhotoFormat, PhotoMode, PhotoOptions } from '../../lib/image/engine';

export interface FormState {
  mode: PhotoMode;
  /** KB preset ("100", "200", "300", "500", "1000") or "custom". */
  target: string;
  targetCustom: string;
  /** Percent preset ("70", "50", "30") or "custom". */
  percent: string;
  percentCustom: string;
  quality: string;
  /** Max long edge preset ("keep", "3840", …) or "custom". */
  edge: string;
  edgeCustom: string;
  format: PhotoFormat;
  fast: boolean;
}

export const DEFAULT_FORM: FormState = {
  mode: 'target',
  target: '500',
  targetCustom: '',
  percent: '50',
  percentCustom: '',
  quality: '80',
  edge: 'keep',
  edgeCustom: '',
  format: 'jpeg',
  fast: false,
};

export const RANGES = {
  targetKb: { min: 10, max: 20_000 },
  percent: { min: 10, max: 90 },
  quality: { min: 10, max: 95 },
  edge: { min: 64, max: 16_384 },
} as const;

/** 1 KB = 1,000 bytes, so the result fits a limit under both the 1000 and the 1024 convention. */
export const KB_BYTES = 1000;

export type FieldName = 'targetCustom' | 'percentCustom' | 'quality' | 'edgeCustom';

export type Parsed =
  | { ok: true; options: Omit<PhotoOptions, 'workingLongEdge'>; targetKb: number | null }
  | { ok: false; field: FieldName; message: string };

const n = (v: number): string => v.toLocaleString('ko-KR');

/** A whole number within [min, max] (digits only, optional thousands commas), else null. */
export function parseWhole(text: string, min: number, max: number): number | null {
  const t = text.trim().replace(/,/g, '');
  if (!/^\d+$/.test(t)) return null;
  const v = Number(t);
  return v >= min && v <= max ? v : null;
}

export function rangeMessage(field: FieldName): string {
  if (field === 'targetCustom') return `${n(RANGES.targetKb.min)}부터 ${n(RANGES.targetKb.max)} 사이의 숫자(KB)를 입력해 주세요.`;
  if (field === 'percentCustom') return `${RANGES.percent.min}부터 ${RANGES.percent.max} 사이의 숫자(%)를 입력해 주세요.`;
  if (field === 'quality') return `${RANGES.quality.min}부터 ${RANGES.quality.max} 사이의 숫자를 고르세요.`;
  return `${n(RANGES.edge.min)}부터 ${n(RANGES.edge.max)} 사이의 숫자(px)를 입력해 주세요.`;
}

export function parseOptions(f: FormState): Parsed {
  let maxLongEdge: number | null = null;
  if (f.edge === 'custom') {
    maxLongEdge = parseWhole(f.edgeCustom, RANGES.edge.min, RANGES.edge.max);
    if (maxLongEdge === null) return { ok: false, field: 'edgeCustom', message: rangeMessage('edgeCustom') };
  } else if (f.edge !== 'keep') {
    maxLongEdge = Number(f.edge);
  }
  const common = { maxLongEdge, format: f.format, fast: f.format === 'jpeg' && f.fast };

  if (f.mode === 'target') {
    const kb = f.target === 'custom' ? parseWhole(f.targetCustom, RANGES.targetKb.min, RANGES.targetKb.max) : Number(f.target);
    if (kb === null || !Number.isFinite(kb)) return { ok: false, field: 'targetCustom', message: rangeMessage('targetCustom') };
    return { ok: true, options: { mode: 'target', targetBytes: kb * KB_BYTES, ...common }, targetKb: kb };
  }
  if (f.mode === 'percent') {
    const p = f.percent === 'custom' ? parseWhole(f.percentCustom, RANGES.percent.min, RANGES.percent.max) : Number(f.percent);
    if (p === null || !Number.isFinite(p)) return { ok: false, field: 'percentCustom', message: rangeMessage('percentCustom') };
    return { ok: true, options: { mode: 'percent', percent: p, ...common }, targetKb: null };
  }
  const q = parseWhole(f.quality, RANGES.quality.min, RANGES.quality.max);
  if (q === null) return { ok: false, field: 'quality', message: rangeMessage('quality') };
  return { ok: true, options: { mode: 'quality', quality: q, ...common }, targetKb: null };
}

/** Display size, 1024-based and rounded up to 0.1 (never smaller than Windows Explorer shows). */
export function formatSize(bytes: number): string {
  const up = (v: number): string => (Math.ceil(v * 10 - 1e-9) / 10).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (bytes >= 1024 * 1024) return `${up(bytes / (1024 * 1024))} MB`;
  return `${up(bytes / 1024)} KB`;
}

/** floor(100 × (1 − out/in)), clamped to 0–100. */
export function reductionPercent(inBytes: number, outBytes: number): number {
  if (inBytes <= 0) return 0;
  return Math.min(100, Math.max(0, Math.floor(100 * (1 - outBytes / inBytes))));
}
