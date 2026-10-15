// PDF 글자 넣기·편집 「흰 상자로 가린 쪽은 그림으로 바꿔 저장」 (TOOLS1015 E2, off by default): after the E1 save, each
// page with a white box is drawn with pdf.js at FLATTEN_PPI (within the device's canvas caps, PDF JPG 변환's pageScale),
// encoded as JPEG 0.9, and edit.worker puts it on a page of the same size in place of the page. The old text under the
// box is then gone from the file; so is every other text of that page (it cannot be copied any more).
import type { CanvasCaps } from '../../lib/image/caps';
import type { PdfJsDoc } from '../../lib/pdf/inspect';
import { pageScale } from '../pdf-to-jpg/scale';
import { FLATTEN_PPI } from './limits';
import type { EditItem } from './items';

/** One page drawn as a picture: 0-based page, JPEG bytes, its size as seen (points, rotation and CropBox applied). */
export interface FlatPage {
  index: number;
  jpeg: ArrayBuffer;
  width: number;
  height: number;
}

/** The canvas could not be drawn or encoded (fail code `canvas`). */
export class CanvasFailure extends Error {
  constructor() {
    super('canvas');
  }
}

/** 0-based pages that carry a white box, in order. */
export function pagesToFlatten(items: readonly EditItem[]): number[] {
  return [...new Set(items.filter((i) => i.kind === 'white').map((i) => i.page))].sort((a, b) => a - b);
}

/** Page `index` of `doc` as a JPEG at FLATTEN_PPI within `caps`. */
export async function renderFlat(doc: PdfJsDoc, index: number, caps: CanvasCaps): Promise<FlatPage> {
  const page = await doc.getPage(index + 1);
  const unit = page.getViewport({ scale: 1 });
  const s = pageScale(unit.width, unit.height, FLATTEN_PPI, caps);
  const canvas = document.createElement('canvas');
  canvas.width = s.width;
  canvas.height = s.height;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new CanvasFailure();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: page.getViewport({ scale: s.scale }) }).promise;
    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob(resolve, 'image/jpeg', 0.9);
      } catch {
        resolve(null);
      }
    });
    if (!blob) throw new CanvasFailure();
    return { index, jpeg: await blob.arrayBuffer(), width: unit.width, height: unit.height };
  } finally {
    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;
  }
}
