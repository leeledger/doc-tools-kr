// QR encoder wrapper (CARD1026 C3/C4). uqr 0.1.3 (Nayuki core) in UTF-8 byte mode, error correction M, no border
// (render.ts draws the 4-module quiet zone), no ECC boost. Never throws on user text: a lone surrogate becomes U+FFFD
// before uqr's encodeURI sees it, and anything over 2,331 UTF-8 bytes is `tooLong`, the binary capacity of version 40
// at level M (qrcode.com version table, handoff/sources/card1026/qrcode-com.txt, fetched 2026-10-26).
// QR1031 D6: with a logo in the middle the caller asks for level H and a minimum version (src/lib/qr/style.ts); the cap
// is then 1,273 bytes, version 40-H binary (same table). qrcode.com: 「공장 등 더러워지기 쉬운 환경에서는 레벨Q 또는 H를
// 선택」 (handoff/sources/qr1031/qrcode-com-error-correction.txt, fetched 2026-10-31). No options = exactly the M path.
import { encode } from 'uqr';

/** Binary (byte mode) capacity of version 40 at level M (qrcode.com). */
export const QR_MAX_BYTES = 2331;
/** Binary (byte mode) capacity of version 40 at level H (qrcode.com). */
export const QR_MAX_BYTES_H = 1273;
/** Versions above this get the "print it bigger" hint: 412 bytes is version 15 at M (qrcode.com). */
export const DENSE_VERSION = 15;

export type QrModules = readonly (readonly boolean[])[];
/** Level H and a minimum version (a QR with a logo); omitted = level M from version 1. */
export interface EncodeOptions {
  ecc: 'M' | 'H';
  minVersion: number;
}
export type QrEncoded =
  | { ok: true; size: number; modules: QrModules; version: number; dense: boolean }
  | { ok: false; code: 'empty' | 'tooLong' };

/** Replaces every unpaired UTF-16 surrogate with U+FFFD (what TextEncoder would write) so encodeURI cannot throw. */
export function fixSurrogates(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += text[i]! + text[i + 1]!;
        i++;
      } else out += '�';
    } else if (c >= 0xdc00 && c <= 0xdfff) out += '�';
    else out += text[i]!;
  }
  return out;
}

export const utf8Length = (text: string): number => new TextEncoder().encode(text).length;

/** QR modules for `text` (true = dark), without a quiet zone. */
export function encodeQr(text: string, opts?: EncodeOptions): QrEncoded {
  if (text === '') return { ok: false, code: 'empty' };
  const safe = fixSurrogates(text);
  // Byte mode is uqr's largest segment for any text, so every text within the byte capacity fits version 40.
  if (utf8Length(safe) > (opts?.ecc === 'H' ? QR_MAX_BYTES_H : QR_MAX_BYTES)) return { ok: false, code: 'tooLong' };
  const qr = opts
    ? encode(safe, { ecc: opts.ecc, minVersion: opts.minVersion, border: 0, boostEcc: false })
    : encode(safe, { ecc: 'M', border: 0, boostEcc: false });
  return { ok: true, size: qr.size, modules: qr.data, version: qr.version, dense: qr.version > DENSE_VERSION };
}
