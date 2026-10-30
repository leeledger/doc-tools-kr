// What a picked file really is, from its first bytes (REQ1014-A D17 / REQ1014-B D1: one helper for the UX and
// the usage fail codes). Pure, never throws: magic bytes only, no inflate. Call sites load it with
// `await import()` on their error path only, so the initial JS of the tool pages does not change.

import { sniffContainer } from '../hwp/sniff';
import { sniffImage, type ImageFormat } from '../image/sniff';

export type FileFamily = 'pdf' | 'image' | 'hwp' | 'office-old' | 'hwpx' | 'docx' | 'xlsx' | 'pptx' | 'zip' | 'text' | 'hwp3' | 'hwpml' | 'other';

const ZIP_LOCAL = [0x50, 0x4b, 0x03, 0x04];
const ZIP_CENTRAL = [0x50, 0x4b, 0x01, 0x02];
const TEXT_BYTES = 512;

const at = (b: Uint8Array, i: number, sig: readonly number[]): boolean => i >= 0 && i + sig.length <= b.length && sig.every((v, k) => b[i + k] === v);
const u16le = (b: Uint8Array, i: number): number => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);

function ascii(b: Uint8Array, from: number, to: number): string {
  let s = '';
  for (let i = from; i < Math.min(to, b.length); i++) s += String.fromCharCode(b[i]!);
  return s;
}

/** `%PDF-` anywhere in the first 1,024 bytes (some writers put junk before the header). */
function hasPdfMark(b: Uint8Array): boolean {
  const end = Math.min(b.length, 1024) - 5;
  for (let i = 0; i <= end; i++) if (at(b, i, [0x25, 0x50, 0x44, 0x46, 0x2d])) return true;
  return false;
}

/** File names of every central-directory record found in a (possibly partial) tail; no inflate. */
function centralNames(tail: Uint8Array): string[] {
  const names: string[] = [];
  for (let i = 0; i + 46 <= tail.length; i++) {
    if (!at(tail, i, ZIP_CENTRAL)) continue;
    const len = u16le(tail, i + 28);
    if (i + 46 + len > tail.length) break;
    names.push(ascii(tail, i + 46, i + 46 + len));
    i += 45 + len;
  }
  return names;
}

function zipFamily(head: Uint8Array, tail?: Uint8Array): FileFamily {
  if (head.length >= 30 && at(head, 0, ZIP_LOCAL)) {
    const nameLen = u16le(head, 26);
    const extraLen = u16le(head, 28);
    if (ascii(head, 30, 30 + nameLen) === 'mimetype') {
      const start = 30 + nameLen + extraLen;
      if (ascii(head, start, start + 19) === 'application/hwp+zip') return 'hwpx';
    }
  }
  if (!tail) return 'zip';
  const names = centralNames(tail);
  if (names.some((n) => n.startsWith('word/'))) return 'docx';
  if (names.some((n) => n.startsWith('xl/'))) return 'xlsx';
  if (names.some((n) => n.startsWith('ppt/'))) return 'pptx';
  return 'zip';
}

/** UTF-8 (or UTF-16 with a BOM) text: no NUL and at least 90 % printable in the first 512 bytes. */
function isText(head: Uint8Array): boolean {
  const b = head.subarray(0, TEXT_BYTES);
  let enc = 'utf-8';
  if (at(b, 0, [0xff, 0xfe])) enc = 'utf-16le';
  else if (at(b, 0, [0xfe, 0xff])) enc = 'utf-16be';
  else if (b.includes(0)) return false;
  let s: string;
  try {
    s = new TextDecoder(enc).decode(b);
  } catch {
    return false;
  }
  s = s.replace(/^\uFEFF/, '');
  if (!s || s.includes('\0')) return false;
  let ok = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 9 || c === 10 || c === 13 || (c >= 0x20 && c !== 0x7f && c !== 0xfffd && !(c >= 0x80 && c < 0xa0))) ok++;
  }
  return ok / [...s].length >= 0.9;
}

/** `head`: the first bytes (1 KB or more); `tail`: the last bytes (a ZIP's central directory), optional. */
export function sniffFormat(head: Uint8Array, tail?: Uint8Array): FileFamily {
  try {
    if (!head || head.length < 4) return 'other';
    const container = sniffContainer(head);
    if (container === 'cfb') return 'hwp';
    if (container === 'zip') return zipFamily(head, tail);
    if (container === 'hwp3') return 'hwp3';
    if (container === 'unsupported') return 'hwpml';
    if (sniffImage(head).format !== 'unknown') return 'image';
    if (hasPdfMark(head)) return 'pdf';
    if (isText(head)) return 'text';
    return 'other';
  } catch {
    return 'other';
  }
}

/**
 * The usage fail code of a file a HWP tool could not read (labels: FAIL_LABELS in scripts/lib/usage.mjs). FAIL1030 D:
 * `empty` is a file under 4 bytes, `unread` one whose bytes could not be read; not-hwp-other is left for truly
 * unknown bytes.
 */
export function notHwpCode(f: FileFamily | 'empty' | 'unread'): string {
  switch (f) {
    case 'empty':
      return 'not-hwp-empty';
    case 'unread':
      return 'not-hwp-unread';
    case 'hwp3':
      return 'not-hwp-old';
    case 'hwpml':
      return 'not-hwp-hwpml';
    case 'pdf':
      return 'not-hwp-pdf';
    case 'hwpx':
      return 'not-hwp-hwpx';
    case 'docx':
      return 'not-hwp-docx';
    case 'xlsx':
    case 'pptx':
      return 'not-hwp-office';
    case 'office-old':
    case 'hwp':
      return 'not-hwp-cfb';
    case 'zip':
      return 'not-hwp-zip';
    case 'image':
      return 'not-hwp-img';
    case 'text':
      return 'not-hwp-text';
    default:
      return 'not-hwp-other';
  }
}

/** The usage fail code of a photo that did not decode, by what its bytes say it is. */
export function corruptCode(f: ImageFormat): string {
  switch (f) {
    case 'heic':
      return 'corrupt-heic';
    case 'jpeg':
      return 'corrupt-jpg';
    case 'png':
      return 'corrupt-png';
    case 'webp':
      return 'corrupt-webp';
    default:
      return 'corrupt-other';
  }
}
