// Output names and the ZIP for PDF JPG 변환 (brief TOOLS4 T3 decision 16; the other tools' Korean-safe names via
// safeFileName). One page -> `{base}_p001.jpg`; several -> `{base}_jpg.zip` holding `{base}_p001.jpg`, … .
import { Zip, ZipPassThrough } from 'fflate';
import { baseName, safeFileName } from '../../lib/ui/format';

/** `{base}_p{page}.jpg`, the page number padded to 3 digits (more for a document of 1,000 pages or more). */
export function jpgName(fileName: string, page: number, pageCount: number): string {
  const digits = Math.max(3, String(pageCount).length);
  return safeFileName(baseName(fileName), `_p${String(page).padStart(digits, '0')}.jpg`);
}

export const zipName = (fileName: string): string => safeFileName(baseName(fileName), '_jpg.zip');

/**
 * A streaming stored ZIP (the JPEGs are already compressed): entries go in one at a time and their bytes are kept as
 * Blob parts, never as one growing array. fflate flags non-ASCII names as UTF-8.
 */
export class JpegZip {
  private readonly parts: BlobPart[] = [];
  private readonly zip: Zip;
  private readonly done: Promise<Blob>;

  constructor() {
    let resolve!: (b: Blob) => void;
    let reject!: (e: Error) => void;
    this.done = new Promise<Blob>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // Unhandled until finish() is awaited; the caller always awaits it or drops the object.
    this.done.catch(() => undefined);
    this.zip = new Zip((err, chunk, final) => {
      if (err) return reject(err);
      this.parts.push(chunk as Uint8Array<ArrayBuffer>);
      if (final) resolve(new Blob(this.parts, { type: 'application/zip' }));
    });
  }

  add(name: string, bytes: Uint8Array): void {
    const entry = new ZipPassThrough(name);
    this.zip.add(entry);
    entry.push(bytes, true);
  }

  finish(): Promise<Blob> {
    this.zip.end();
    return this.done;
  }
}
