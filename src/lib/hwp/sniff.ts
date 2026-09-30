// Container sniff on the first bytes of a file (brief Step 5 §2). Pure; runs on the main thread before
// anything heavy loads. HWP 5.x is a CFB (OLE2) file, HWPX a ZIP, HWP 3.0 starts with its own signature.
// HWPML (.hml) is XML and is not supported.

export type Container = 'cfb' | 'zip' | 'hwp3' | 'unsupported' | 'unknown';

/** Bytes the page reads for the sniff (an .hml root element can sit after a long XML declaration). */
export const SNIFF_BYTES = 1024;

const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const HWP3_MAGIC = 'HWP Document File V3';

const startsWith = (b: Uint8Array, sig: readonly number[]): boolean => b.length >= sig.length && sig.every((v, i) => b[i] === v);

function ascii(b: Uint8Array, n: number): string {
  let s = '';
  for (let i = 0; i < Math.min(n, b.length); i++) s += String.fromCharCode(b[i]);
  return s;
}

/** Text of an XML head: UTF-8 (BOM skipped), or UTF-16 with a BOM (BOM skipped, NUL bytes dropped: enough
 * for an ASCII search). */
function xmlText(b: Uint8Array): string {
  let start = 0;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) start = 3;
  else if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) start = 2;
  let s = '';
  for (let i = start; i < b.length; i++) if (b[i] !== 0) s += String.fromCharCode(b[i]);
  return s;
}

export function sniffContainer(head: Uint8Array): Container {
  if (startsWith(head, CFB_MAGIC)) return 'cfb';
  if (head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b) return 'zip';
  if (ascii(head, HWP3_MAGIC.length) === HWP3_MAGIC) return 'hwp3';
  const text = xmlText(head).trimStart();
  if (text.startsWith('<?xml') && text.includes('HWPML')) return 'unsupported';
  return 'unknown';
}
