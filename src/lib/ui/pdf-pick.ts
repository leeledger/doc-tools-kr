// Non-PDF files are rejected before they enter a list or a card (brief Polish P.15). The check reads only the
// first 1024 bytes on the main thread (the engine's own %PDF- rule), so it needs no engine.
import { hasPdfHeader } from '../pdf/errors';
import { josa } from './josa';

export async function isPdfFile(file: Blob): Promise<boolean> {
  try {
    return hasPdfHeader(new Uint8Array(await file.slice(0, 1024).arrayBuffer()));
  } catch {
    // Unreadable here: let the engine decide (it reports a file error).
    return true;
  }
}

export async function splitPdfFiles<T extends File>(files: T[]): Promise<{ pdfs: T[]; rejected: T[] }> {
  const ok = await Promise.all(files.map(isPdfFile));
  return { pdfs: files.filter((_, i) => ok[i]), rejected: files.filter((_, i) => !ok[i]) };
}

/** The one alert for rejected files, the same wording in both PDF tools. */
export function nonPdfMessage(names: string[]): string {
  if (names.length === 1) return `${josa(names[0]!, '은/는')} PDF 파일이 아니어서 넣지 않았습니다. PDF 파일만 넣을 수 있습니다.`;
  const shown = names.slice(0, 3).join(', ');
  const more = names.length > 3 ? ` 외 ${names.length - 3}개` : '';
  return `파일 ${names.length}개는 PDF가 아니어서 넣지 않았습니다: ${shown}${more}`;
}
