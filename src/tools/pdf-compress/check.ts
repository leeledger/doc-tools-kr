// Main-thread result check (pure): the compressed PDF must have the input's page count and, for the
// three normal levels, the same text on the first, middle and last page. Any failure → error `verify`.

/** What the check needs from an opened document (pdf.js in the browser, anything in tests). */
export interface TextDoc {
  numPages: number;
  /** Raw text of page `i` (0-based). */
  pageText(i: number): Promise<string>;
}

/** Whitespace-stripped text, as the regression harness compares it. */
export const normalizeText = (s: string): string => s.replace(/\s+/g, '');

/** 0-based indices of the first, middle and last page (deduplicated). */
export function checkedPages(numPages: number): number[] {
  if (numPages < 1) return [];
  return [...new Set([0, Math.floor((numPages - 1) / 2), numPages - 1])];
}

export async function checkResult(original: TextDoc, output: TextDoc, compareText: boolean): Promise<boolean> {
  if (output.numPages !== original.numPages) return false;
  if (!compareText) return true;
  for (const i of checkedPages(original.numPages)) {
    if (normalizeText(await output.pageText(i)) !== normalizeText(await original.pageText(i))) return false;
  }
  return true;
}
