// Output names and the ZIP for PDF JPG 변환 (brief TOOLS4 T3 decision 16; the other tools' Korean-safe names via
// safeFileName). One page -> `{base}_p001.jpg`; several -> `{base}_jpg.zip` (lib/zip StoredZip) holding
// `{base}_p001.jpg`, … .
import { baseName, safeFileName } from '../../lib/ui/format';

/** `{base}_p{page}.jpg`, the page number padded to 3 digits (more for a document of 1,000 pages or more). */
export function jpgName(fileName: string, page: number, pageCount: number): string {
  const digits = Math.max(3, String(pageCount).length);
  return safeFileName(baseName(fileName), `_p${String(page).padStart(digits, '0')}.jpg`);
}

export const zipName = (fileName: string): string => safeFileName(baseName(fileName), '_jpg.zip');
