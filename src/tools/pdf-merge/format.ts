import { MB } from './limits';

/** `12.4 MB` — one decimal, never shows 0.0 for a non-empty file. */
export function formatMB(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  const v = Math.max(bytes / MB, 0.1);
  return `${v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
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
const MAX_NAME = 80;

/** `{first base name}_외{n-1}건_합침.pdf`, sanitized for every OS and at most 80 characters. */
export function mergedFileName(firstName: string, count: number): string {
  const suffix = `_외${Math.max(count - 1, 0)}건_합침.pdf`;
  let base = baseName(firstName).replace(UNSAFE, '').trim().replace(/[. ]+$/, '');
  const room = MAX_NAME - Array.from(suffix).length;
  base = Array.from(base).slice(0, room).join('').replace(/[. ]+$/, '');
  return `${base || '문서'}${suffix}`;
}
