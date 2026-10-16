// 영문주소 변환기: the search text rules shared by the page (instant messages) and the Function, which is the authority
// (ADDREN1016 decision 8). Pure; no network.

export const MIN_LEN = 2;
export const MAX_LEN = 80;
export const MAX_PAGE = 5;

/** The search text as sent upstream: NFC, whitespace collapsed, control and format characters and `% = < > [ ]` gone. */
export function cleanQuery(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/[\p{Cc}\p{Cf}%=<>[\]]/gu, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** 'short' / 'long' for a cleaned query outside 2..80 characters, else null. */
export function lengthProblem(clean: string): 'short' | 'long' | null {
  const len = [...clean].length;
  if (len < MIN_LEN) return 'short';
  if (len > MAX_LEN) return 'long';
  return null;
}
