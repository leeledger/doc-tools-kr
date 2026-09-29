import { MB } from './device';

/** `12.4 MB` — one decimal, never shows 0.0 for a non-empty file. */
export function formatMB(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const v = Math.max(bytes / MB, 0.1);
  return `${v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

const KIB = 1024;

/**
 * Every file-size display (UX-AUDIT-1 P1-5). Below 1 MiB in KB, 1024-based and rounded up (Step 3 rule:
 * never smaller than Windows Explorer shows): one decimal below 10 KB (at least 0.1 KB), whole numbers from
 * 10 KB. From 1 MiB the formatMB rule. Limit messages keep formatMB.
 */
export function formatSize(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  if (bytes >= MB) return formatMB(bytes);
  const kb = bytes / KIB;
  const tenth = Math.max(Math.ceil(kb * 10 - 1e-9) / 10, 0.1);
  if (tenth < 10) return `${tenth.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KB`;
  return `${Math.ceil(kb - 1e-9).toLocaleString('ko-KR')} KB`;
}

export function formatPages(n: number): string {
  return `${n.toLocaleString('ko-KR')}쪽`;
}

/** File name without a trailing `.pdf` (any case). */
export function baseName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

// Windows-reserved characters and control characters.
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
export const MAX_FILE_NAME = 80;

/**
 * `{base}{suffix}`, with `base` sanitized for every OS and cut so the whole name is at most 80 characters
 * (never splitting a character). An empty base becomes `문서`.
 */
export function safeFileName(base: string, suffix: string): string {
  let b = base.replace(UNSAFE, '').trim().replace(/[. ]+$/, '');
  const room = MAX_FILE_NAME - Array.from(suffix).length;
  b = Array.from(b).slice(0, room).join('').replace(/[. ]+$/, '');
  return `${b || '문서'}${suffix}`;
}
