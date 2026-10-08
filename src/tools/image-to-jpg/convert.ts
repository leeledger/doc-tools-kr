// 사진 JPG 변환 (brief TOOLS5 decision 8): pure decisions (strip only or re-encode, output type and quality, names,
// draw size within the canvas caps) and a thin canvas runner whose decoder, canvas and encoders are injected (the page
// passes createImageBitmap, an HTMLCanvasElement and toBlob; Node tests pass @napi-rs/canvas).
// Every output is drawn from pixels (EXIF incl. GPS, XMP and comments gone; orientation applied on decode), except a
// JPEG kept as JPG at 높음 that needs no turning: its metadata is stripped losslessly (the canEmbedRaw rule shape).
import type { Decoded } from '../../lib/image/engine';
import { fitWithinCaps, fitsCaps, type CanvasCaps } from '../../lib/image/caps';
import { JpegStripError } from '../../lib/image/jpeg-strip';
import { bandsHaveTransparency } from '../../lib/image/raster';
import { orientedSize, type ImageFormat, type Sniff } from '../../lib/image/sniff';
import { safeFileName } from '../../lib/ui/format';

export type Target = 'jpg' | 'png' | 'webp';
export type QualityLevel = 'high' | 'normal' | 'small';

export const TARGETS: readonly Target[] = ['jpg', 'png', 'webp'];
export const QUALITY: Record<QualityLevel, number> = { high: 0.92, normal: 0.82, small: 0.7 };
export const MIME: Record<Target, 'image/jpeg' | 'image/png' | 'image/webp'> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Formats this tool takes, by sniff (the device decodes HEIC and AVIF only where it can; the row says so otherwise). */
export const ACCEPTED_FORMATS: readonly ImageFormat[] = ['jpeg', 'png', 'webp', 'heic', 'avif', 'gif', 'bmp'];

/** True when the photo is saved by removing its metadata only (no decode, no quality loss). */
export function canStripOnly(info: Pick<Sniff, 'format' | 'orientation' | 'cmyk' | 'truncated'>, to: Target, quality: QualityLevel): boolean {
  return to === 'jpg' && quality === 'high' && info.format === 'jpeg' && !info.cmyk && !info.truncated && (info.orientation === undefined || info.orientation === 1);
}

/** Encoder quality: JPG and WebP from the level, PNG has none. */
export const encodeQuality = (to: Target, level: QualityLevel): number | undefined => (to === 'png' ? undefined : QUALITY[level]);

/** File name without its last extension. */
export const stem = (name: string): string => name.replace(/\.[^./\\]+$/, '');

/** `{base}.{jpg|png|webp}`. */
export const outputName = (fileName: string, to: Target): string => safeFileName(stem(fileName), `.${to}`);

/** `{first photo's base}_{jpg|png|webp}.zip`. */
export const zipName = (firstName: string, to: Target): string => safeFileName(stem(firstName), `_${to}.zip`);

/** Canvas size of a `w` × `h` photo within `caps`; `scaled` when it had to be drawn smaller. */
export function drawSize(w: number, h: number, caps: CanvasCaps): { width: number; height: number; scaled: boolean } {
  if (fitsCaps(w, h, caps)) return { width: w, height: h, scaled: false };
  const f = fitWithinCaps(w, h, caps);
  return { width: f.width, height: f.height, scaled: true };
}

/** Long edge to decode at when the header says the photo is over the caps (decoding smaller saves memory); else null. */
export function decodeEdge(sniff: Sniff, caps: CanvasCaps): number | null {
  const o = orientedSize(sniff);
  if (!o) return null;
  const d = drawSize(o.width, o.height, caps);
  return d.scaled ? Math.max(d.width, d.height) : null;
}

/**
 * Reports each code once (brief decision 7: one `fail c=heic` per picked batch however many photos in it are HEIC;
 * the same for the other codes, and once per run while converting). Usage allows 40 events per page load.
 */
export function oncePerCode(send: (code: string) => void): (code: string) => void {
  const sent = new Set<string>();
  return (code) => {
    if (sent.has(code)) return;
    sent.add(code);
    send(code);
  };
}

export type RowNote = { kind: 'scaled'; width: number; height: number } | { kind: 'transparent' } | { kind: 'first-frame' };

const px = (n: number): string => n.toLocaleString('ko-KR');

export function noteText(n: RowNote): string {
  if (n.kind === 'scaled') return `${px(n.width)}×${px(n.height)}픽셀로 줄여 저장했습니다.`;
  if (n.kind === 'transparent') return '투명한 부분은 흰색으로 바뀝니다.';
  return '움직이는 사진은 첫 장면만 저장했습니다.';
}

/** A conversion step that failed for this photo only: the canvas could not be made, or no encoder gave the type. */
export class ConvertError extends Error {
  constructor(readonly code: 'canvas' | 'encoder') {
    super(code);
    this.name = 'ConvertError';
  }
}

/** The 2d context calls the runner makes (method syntax so a DOM or @napi-rs/canvas context fits). */
export interface Ctx2D {
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  globalCompositeOperation: GlobalCompositeOperation;
  fillStyle: string | CanvasGradient | CanvasPattern;
  drawImage(src: unknown, x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  getImageData(x: number, y: number, w: number, h: number): ImageData;
}

export interface Surface<C> {
  canvas: C;
  ctx: Ctx2D | null;
  /** Frees the backing store now. */
  release(): void;
}

export interface ConvertDeps<Src, C> {
  readBytes(): Promise<Uint8Array>;
  strip(bytes: Uint8Array): Uint8Array;
  decode(maxLongEdge: number | null): Promise<Decoded<Src>>;
  surface(width: number, height: number): Surface<C>;
  encode(canvas: C, mime: string, quality: number | undefined): Promise<Blob | null>;
  /** WebP when the browser's encoder gave another type (Safari): quality 0–100. */
  webp(img: ImageData, quality: number): Promise<Uint8Array>;
}

export interface ConvertOptions {
  to: Target;
  quality: QualityLevel;
  caps: CanvasCaps;
}

export interface Converted {
  blob: Blob;
  notes: RowNote[];
  /** Saved by the lossless metadata strip. */
  stripped: boolean;
}

const asBlob = (bytes: Uint8Array, type: string): Blob => new Blob([bytes as Uint8Array<ArrayBuffer>], { type });

/** Converts one photo. Throws PhotoError (heic / corrupt from decode), ConvertError, or what the deps throw (oom). */
export async function convertImage<Src, C>(sniff: Sniff, opts: ConvertOptions, deps: ConvertDeps<Src, C>): Promise<Converted> {
  if (canStripOnly(sniff, opts.to, opts.quality)) {
    try {
      return { blob: asBlob(deps.strip(await deps.readBytes()), MIME.jpg), notes: [], stripped: true };
    } catch (err) {
      // A JPEG the strip cannot walk is drawn and re-encoded instead.
      if (!(err instanceof JpegStripError)) throw err;
    }
  }
  const d = await deps.decode(decodeEdge(sniff, opts.caps));
  let s: Surface<C> | null = null;
  try {
    const size = drawSize(d.width, d.height, opts.caps);
    s = deps.surface(size.width, size.height);
    const g = s.ctx;
    if (!g) throw new ConvertError('canvas');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(d.src, 0, 0, size.width, size.height);
    const notes: RowNote[] = [];
    if (d.capped || size.scaled) notes.push({ kind: 'scaled', width: size.width, height: size.height });
    if (sniff.animated) notes.push({ kind: 'first-frame' });
    if (opts.to === 'jpg') {
      if (sniff.format !== 'jpeg' && bandsHaveTransparency(size.height, (y, h) => g.getImageData(0, y, size.width, h))) notes.push({ kind: 'transparent' });
      // White underneath what is drawn: JPG has no transparency.
      g.globalCompositeOperation = 'destination-over';
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, size.width, size.height);
      g.globalCompositeOperation = 'source-over';
    }
    const mime = MIME[opts.to];
    const q = encodeQuality(opts.to, opts.quality);
    let blob = await deps.encode(s.canvas, mime, q);
    if (opts.to === 'webp' && blob?.type !== mime) {
      let bytes: Uint8Array;
      try {
        bytes = await deps.webp(g.getImageData(0, 0, size.width, size.height), Math.round((q ?? QUALITY.high) * 100));
      } catch (err) {
        if (err instanceof RangeError) throw err;
        throw new ConvertError('encoder');
      }
      blob = asBlob(bytes, mime);
    }
    // Never a file whose content is not the type its name says.
    if (!blob || blob.type !== mime || blob.size === 0) throw new ConvertError('encoder');
    return { blob, notes, stripped: false };
  } finally {
    d.close();
    s?.release();
  }
}
