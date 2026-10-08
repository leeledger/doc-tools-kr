// A streaming stored ZIP (level 0: the entries are already compressed images or PDFs).
import { Zip, ZipPassThrough } from 'fflate';

/**
 * Entries go in one at a time and every chunk becomes its own Blob at once, so the browser may keep the bytes off the
 * JS heap and the final Blob (made of Blobs) does not copy them a second time. Callers pass unique names
 * (`dedupeNames` in ./names when names can repeat). fflate flags non-ASCII names as UTF-8.
 */
export class StoredZip {
  private readonly parts: Blob[] = [];
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
      this.parts.push(new Blob([chunk as Uint8Array<ArrayBuffer>]));
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
