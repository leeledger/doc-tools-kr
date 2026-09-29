// "모두 내려받기 (ZIP)": loaded on the ZIP click only (fflate is not in the page's initial JS).
import { zipSync, type Zippable } from 'fflate';

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

/**
 * Names made unique for Windows Explorer (case-insensitive): the second "a.jpg" becomes "a_2.jpg",
 * the third "a_3.jpg", skipping any name already taken.
 */
export function dedupeNames(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    for (let k = 2; taken.has(candidate.toLowerCase()); k++) candidate = `${base}_${k}${ext}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  });
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
