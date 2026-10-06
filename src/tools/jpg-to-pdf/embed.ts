// How a photo goes into the PDF (brief TOOLS4 T2). Pure.
// A JPEG is embedded as it is (bit for bit, only its metadata stripped) when nothing about it has to change: no EXIF
// rotation to apply, no user rotation, no shrinking, and not CMYK/YCCK (PDF readers disagree on Adobe CMYK JPEGs, so
// those are always re-encoded). Everything else is decoded, drawn and re-encoded.
import type { Sniff } from '../../lib/image/sniff';
import type { Rotation } from './layout';

export type SizeOption = 'original' | 'reduce';

export function canEmbedRaw(info: Pick<Sniff, 'format' | 'orientation' | 'cmyk' | 'truncated'>, rotation: Rotation, size: SizeOption): boolean {
  return info.format === 'jpeg' && !info.cmyk && !info.truncated && (info.orientation === undefined || info.orientation === 1) && rotation === 0 && size === 'original';
}

/** Formats this tool takes (the device decodes HEIC only where it can; the row says so otherwise). */
export const ACCEPTED_FORMATS: readonly Sniff['format'][] = ['jpeg', 'png', 'webp', 'heic'];
