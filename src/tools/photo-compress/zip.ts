// "모두 내려받기 (ZIP)": loaded on the ZIP click only (fflate is not in the page's initial JS).
import { zipSync, type Zippable } from 'fflate';
import { dedupeNames } from '../../lib/zip/names';

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

/** A stored (level 0) ZIP: the photos are already compressed. fflate flags non-ASCII names as UTF-8. */
export function buildZip(entries: readonly ZipEntry[], zip: typeof zipSync = zipSync): Uint8Array {
  const names = dedupeNames(entries.map((e) => e.name));
  const files: Zippable = {};
  entries.forEach((e, i) => {
    files[names[i]!] = [e.bytes, { level: 0 }];
  });
  return zip(files, { level: 0 });
}
