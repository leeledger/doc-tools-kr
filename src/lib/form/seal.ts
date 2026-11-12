// 직인 그림 (QUOTE1112 Q9): the seal picture a form build may carry, checked in the worker before ./build places it.
// Pure. The page re-encodes every picture as a PNG of at most SEAL_MAX_PX on its long side (no metadata), so anything
// else here is a damaged message: the form is then built without a seal rather than failing.
import type { FormExtras } from './build';

/** The seal as the page sends it (bytes transferred). */
export interface FormSealMsg {
  bytes: ArrayBuffer;
  w: number;
  h: number;
}

/** The longest side of the re-encoded picture (pixels). */
export const SEAL_MAX_PX = 600;
/** The largest file the page decodes (2 MB, Q9). */
export const SEAL_MAX_BYTES = 2 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The seal as the builder takes it, or none when it is not a PNG of a sane size. */
export function sealExtras(seal: FormSealMsg | undefined): FormExtras {
  if (!seal || !(seal.bytes instanceof ArrayBuffer)) return {};
  const bytes = new Uint8Array(seal.bytes);
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= SEAL_MAX_PX;
  if (!ok(seal.w) || !ok(seal.h) || bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return {};
  return { seal: { bytes, w: seal.w, h: seal.h, ext: 'png' } };
}

/** The long side scaled to at most SEAL_MAX_PX, the aspect kept (whole pixels, at least 1). */
export function sealFit(w: number, h: number): { w: number; h: number } {
  const k = Math.min(1, SEAL_MAX_PX / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
