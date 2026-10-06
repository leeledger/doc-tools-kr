// Module worker for 사진 PDF 변환 (brief TOOLS4 T2): photos in, one PDF out. @cantoo/pdf-lib is only ever loaded here
// (the /pdf-merge/ pattern: progress messages, cancel = terminate). One photo at a time: read, embed or re-draw, place,
// release. The PDF carries nothing from the photos' metadata: raw JPEGs are stripped first, re-drawn photos carry none,
// no title comes from a file name, and the producer/creator are 문서딱.
import { PDFDocument, type PDFImage } from '@cantoo/pdf-lib';
import { decodeImage } from '../image/decode';
import { stripJpegMetadata } from '../image/jpeg-strip';
import { PhotoError, photoErrorCode, type PhotoErrorCode } from '../image/messages';
import { canvasHasTransparency, releaseCanvas } from '../image/raster';
import { sniffImage } from '../image/sniff';
import { ACCEPTED_FORMATS, canEmbedRaw, type SizeOption } from '../../tools/jpg-to-pdf/embed';
import { layout, rotatedSize, type LayoutOptions, type Rotation } from '../../tools/jpg-to-pdf/layout';
import { verifyOutput } from './verify';

export interface ImageItem {
  file: Blob;
  rotation: Rotation;
}

export interface ImagesRequest {
  type: 'build';
  items: ImageItem[];
  layout: LayoutOptions;
  size: SizeOption;
  /** Long edge a re-drawn photo is decoded at, at most (the device cap, or 2,000 for 줄이기). */
  maxEdge: number;
}

export type ImagesErrorCode = Extract<PhotoErrorCode, 'heic' | 'not-image' | 'corrupt' | 'oom' | 'engine' | 'unknown'>;

export type ImagesResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; bytes: Uint8Array; pages: number }
  | { type: 'error'; code: ImagesErrorCode; index?: number };

interface WorkerScope {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((ev: MessageEvent<ImagesRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const post = (msg: ImagesResponse, transfer: Transferable[] = []): void => scope.postMessage(msg, transfer);

const JPEG_QUALITY = 0.92;

/** The photo decoded (EXIF orientation applied, long edge capped), turned by `rotation`, as JPEG or (with alpha) PNG. */
async function redraw(doc: PDFDocument, file: Blob, rotation: Rotation, maxEdge: number, sniff: ReturnType<typeof sniffImage>): Promise<PDFImage> {
  const decoded = await decodeImage(file, sniff, { maxLongEdge: maxEdge });
  const { w, h } = rotatedSize(decoded.width, decoded.height, rotation);
  const c = new OffscreenCanvas(w, h);
  try {
    const g = c.getContext('2d', { colorSpace: 'srgb', willReadFrequently: sniff.alphaPossible });
    if (!g) throw new Error('2d context unavailable');
    g.translate(w / 2, h / 2);
    g.rotate((rotation * Math.PI) / 180);
    g.drawImage(decoded.src, -decoded.width / 2, -decoded.height / 2);
    decoded.close();
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (sniff.alphaPossible && canvasHasTransparency(c)) {
      return await doc.embedPng(new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()));
    }
    // Opaque: white underneath (a fully opaque photo is unchanged by it), then JPEG.
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    return await doc.embedJpg(new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })).arrayBuffer()));
  } finally {
    decoded.close();
    releaseCanvas(c);
  }
}

async function build(req: ImagesRequest): Promise<void> {
  const doc = await PDFDocument.create();
  doc.setProducer('문서딱');
  doc.setCreator('문서딱');
  const total = req.items.length;
  for (let i = 0; i < total; i++) {
    const { file, rotation } = req.items[i]!;
    let image: PDFImage;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sniff = sniffImage(bytes);
      if (!ACCEPTED_FORMATS.includes(sniff.format)) throw new PhotoError('not-image');
      let raw: PDFImage | null = null;
      if (canEmbedRaw(sniff, rotation, req.size)) {
        try {
          raw = await doc.embedJpg(stripJpegMetadata(bytes));
        } catch {
          raw = null; // A JPEG pdf-lib or the strip cannot read is re-drawn instead.
        }
      }
      image = raw ?? (await redraw(doc, file, rotation, req.maxEdge, sniff));
    } catch (err) {
      // A photo that cannot be read is the photo's problem (corrupt), unless the cause is known.
      const code = photoErrorCode(err);
      post({ type: 'error', code: code === 'heic' || code === 'not-image' || code === 'engine' || code === 'oom' ? code : 'corrupt', index: i });
      return;
    }
    const p = layout(image.width, image.height, 0, req.layout);
    doc.addPage([p.pageW, p.pageH]).drawImage(image, { x: p.x, y: p.y, width: p.w, height: p.h });
    post({ type: 'progress', done: i + 1, total });
  }
  const bytes = await doc.save();
  await verifyOutput(bytes, total);
  post({ type: 'done', bytes, pages: total }, [bytes.buffer]);
}

scope.onmessage = async (ev) => {
  const req = ev.data;
  if (req?.type !== 'build') return;
  try {
    await build(req);
  } catch (err) {
    const code = photoErrorCode(err);
    post({ type: 'error', code: code === 'engine' || code === 'oom' ? code : 'unknown' });
  }
};
