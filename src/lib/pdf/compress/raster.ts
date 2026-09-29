// "이미지로 변환": pages rendered on the main thread (pdf.js) arrive one at a time as RGBA and are
// stored as JPEG pages. Text becomes unselectable; the caller discards the result when it is not smaller.
import { PDFDocument } from '@cantoo/pdf-lib';
import type { CompressDeps } from './deps';
import { isGray } from './images';
import { RASTER } from './levels';

export class RasterAssembler {
  private doc: PDFDocument | null = null;
  pages = 0;
  /** Pages encoded as 1-channel gray JPEG. */
  grayPages = 0;

  constructor(private readonly deps: Pick<CompressDeps, 'jpegEncode'>) {}

  /** Adds one page: `rgba` is `w × h` pixels rendered from a page of `ptW × ptH` points (rotation applied). */
  async addPage(rgba: Uint8ClampedArray, w: number, h: number, ptW: number, ptH: number): Promise<void> {
    this.doc ??= await PDFDocument.create({ updateMetadata: false });
    const img = new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h);
    const gray = isGray(img);
    const jpg = await this.deps.jpegEncode(img, { quality: RASTER.q, gray });
    const embedded = await this.doc.embedJpg(jpg);
    const page = this.doc.addPage([ptW, ptH]);
    page.drawImage(embedded, { x: 0, y: 0, width: ptW, height: ptH });
    this.pages++;
    if (gray) this.grayPages++;
  }

  async finish(): Promise<Uint8Array> {
    if (!this.doc) throw new Error('RasterAssembler: no pages');
    const bytes = await this.doc.save({ useObjectStreams: true });
    this.doc = null;
    return bytes;
  }
}
