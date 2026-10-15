// Limits of PDF 글자 넣기·편집 (TOOLS1015 E1): the PDF limits of PDF 서명·도장 넣기 (one file, the same save path through
// pdf-lib), at most MAX_ITEMS things put in per document, and the text size range in points.
export { LIMITS, fileLimitMessage } from '../pdf-sign/limits';

/** Text items and white boxes in one document. */
export const MAX_ITEMS = 200;
/** Characters in one text item (a filled-in form field, not a page of prose). */
export const MAX_TEXT = 500;
/** Text size in points: smallest, largest, a new item's. */
export const SIZE_MIN = 6;
export const SIZE_MAX = 48;
export const SIZE_DEFAULT = 11;
