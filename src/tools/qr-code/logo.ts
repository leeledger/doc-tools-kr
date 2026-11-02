// /qr-code/ 색 바꾸기·로고 넣기 code (QR1031 D3–D7, D9), one lazy chunk the controller loads when the panel is first
// opened or used (D5: the colors moved in here too, so the controller stays within its budget). Colors: the line under
// them (style.ts checkColors) and the styled renderers (styled.ts, logo-render.ts). Picture: the pdf-sign decode path:
// sniff the bytes, decode (EXIF orientation applied) at most LOGO_EDGE on the long edge, draw it on a canvas and keep a
// PNG data URL (for the SVG) and that canvas (for the PNG) in memory only. The file is never sent or stored;
// re-encoding drops its EXIF. Errors are the shared photo texts (pdf-sign's), one line under the picker.
import { decodeImage } from '../../lib/image/decode';
import { ERRORS, photoErrorCode } from '../../lib/image/messages';
import { HEAD_BYTES, TAIL_BYTES, sniffImage, type ImageFormat } from '../../lib/image/sniff';
import type { QrModules } from '../../lib/qr/encode';
import { logoPng, logoSvg, type QrLogo } from '../../lib/qr/logo-render';
import { pngModulePx, rgbaPng } from '../../lib/qr/render';
import { LOGO_MIN_VERSION, checkColors } from '../../lib/qr/style';
import { cleanColors, colorRgba, colorSvg, type QrColors } from '../../lib/qr/styled';
import { detectDevice } from '../../lib/ui/device';
import { imageLimitMessage } from '../pdf-sign/limits';

/** The logo is kept at most this many pixels on its long edge. */
export const LOGO_EDGE = 512;
/** encodeQr options with a logo (D6). */
export const LOGO_ENCODE = { ecc: 'H', minVersion: LOGO_MIN_VERSION } as const;

/** Logo on and the text over 1,273 bytes (QR_MAX_BYTES_H). */
export const LOGO_OVER = '로고를 넣으면 QR에 담을 수 있는 글자가 줄어요. 글자를 줄이거나 로고를 빼 주세요.';
const COLOR_TEXT = {
  inverted: 'QR 색이 배경 색보다 어두워야 잘 찍혀요.',
  low: '두 색의 차이가 작아 잘 찍히지 않을 수 있어요. QR 색을 더 어둡게 골라 주세요.',
};

/** The line under the colors: '' when the pair is fine. */
export function colorProblem(colors: QrColors): string {
  const { fg, bg } = cleanColors(colors);
  const check = checkColors(fg, bg);
  return check === 'ok' ? '' : COLOR_TEXT[check];
}

/** The preview / SVG file in the chosen colors, with the picture when there is one. */
export function styledSvg(modules: QrModules, colors: QrColors, pic: QrLogo | null): string {
  const c = cleanColors(colors);
  const svg = colorSvg(modules, c);
  return pic ? logoSvg(svg, modules.length, c.bg, pic) : svg;
}

/** The PNG file in the chosen colors, with the picture when there is one. */
export function styledPng(modules: QrModules, colors: QrColors, pic: QrLogo | null): Promise<Blob> {
  const c = cleanColors(colors);
  const img = colorRgba(modules, pngModulePx(modules.length), c);
  return pic ? logoPng(img, modules.length, c.bg, pic) : rgbaPng(img);
}

const FORMATS: readonly ImageFormat[] = ['png', 'jpeg', 'webp', 'heic'];
/** createImageBitmap's resize needs OffscreenCanvas when the browser ignores it (decode.ts); without it, full size. */
const canShrinkOnDecode = (): boolean => typeof OffscreenCanvas !== 'undefined';

/** A picture that cannot be used; `message` is the line shown under the picker. */
export class LogoError extends Error {
  constructor(
    readonly code: 'heic' | 'not-image' | 'corrupt' | 'too-big' | 'oom',
    message: string,
  ) {
    super(message);
  }
}

/** The picked file as the QR logo (long edge at most LOGO_EDGE). Throws LogoError. */
export async function readLogo(file: Blob): Promise<QrLogo> {
  const tooBig = imageLimitMessage(file.size, detectDevice());
  if (tooBig) throw new LogoError('too-big', tooBig);
  if (file.size === 0) throw new LogoError('corrupt', ERRORS.empty);
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - TAIL_BYTES)).arrayBuffer());
  const sniff = sniffImage(head, { tail, size: file.size });
  if (!FORMATS.includes(sniff.format)) throw new LogoError('not-image', ERRORS['not-image']);
  if (sniff.truncated) throw new LogoError('corrupt', ERRORS.truncated);
  let d: Awaited<ReturnType<typeof decodeImage>>;
  try {
    d = await decodeImage(file, sniff, { maxLongEdge: canShrinkOnDecode() ? LOGO_EDGE : null });
  } catch (err) {
    const code = photoErrorCode(err);
    if (code === 'heic') throw new LogoError('heic', ERRORS.heic);
    if (code === 'oom') throw new LogoError('oom', ERRORS.oom);
    throw new LogoError('corrupt', ERRORS.corrupt);
  }
  const s = Math.min(1, LOGO_EDGE / Math.max(d.width, d.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(d.width * s));
  c.height = Math.max(1, Math.round(d.height * s));
  try {
    const g = c.getContext('2d');
    if (!g) throw new LogoError('oom', ERRORS.oom);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(d.src, 0, 0, c.width, c.height);
    let dataUrl = '';
    try {
      dataUrl = c.toDataURL('image/png');
    } catch {
      // A canvas the browser cannot encode (memory): handled below.
    }
    if (!dataUrl.startsWith('data:image/png;base64,')) throw new LogoError('oom', ERRORS.oom);
    return { dataUrl, width: c.width, height: c.height, image: c };
  } catch (err) {
    c.width = 0;
    c.height = 0;
    throw err;
  } finally {
    d.close();
  }
}
