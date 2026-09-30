// Module worker of 여권·증명사진 (brief Step 4 §2). Created on the save click, never before: MozJPEG loads
// then. It receives the rendered output pixels (transferred) and answers with the verified JPEG.
import { loadMozjpegEncoder } from '../codecs/wasm-browser';
import { EncodeError, encodeIdPhoto, type EncodeErrorCode, type EncodeSpec } from './encode';

export type EncodeRequest = { type: 'encode'; pixels: ImageData; spec: EncodeSpec };
export type EncodeResponse =
  | { type: 'done'; bytes: Uint8Array; q: number; fallback: boolean }
  | { type: 'error'; code: EncodeErrorCode; detail: string };

interface WorkerScope {
  postMessage(message: EncodeResponse, transfer: Transferable[]): void;
  onmessage: ((ev: MessageEvent<EncodeRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;

async function canvasJpeg(img: ImageData, q: number): Promise<Uint8Array> {
  const c = new OffscreenCanvas(img.width, img.height);
  try {
    const g = c.getContext('2d');
    if (!g) throw new Error('2d context unavailable');
    g.putImageData(img, 0, 0);
    return new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: q })).arrayBuffer());
  } finally {
    c.width = 0;
    c.height = 0;
  }
}

scope.onmessage = (ev) => {
  const req = ev.data;
  if (req.type !== 'encode') return;
  void (async () => {
    try {
      const r = await encodeIdPhoto(req.pixels, req.spec, {
        async mozjpeg(img, q) {
          const encode = await loadMozjpegEncoder();
          // Baseline (SOF0), as for 기관 uploads in Step 3: progressive off and quantisers capped at 255.
          return new Uint8Array(await encode(img, { quality: q, progressive: false, baseline: true }));
        },
        canvas: canvasJpeg,
      });
      scope.postMessage({ type: 'done', bytes: r.bytes, q: r.q, fallback: r.fallback }, [r.bytes.buffer]);
    } catch (err) {
      const code: EncodeErrorCode = err instanceof EncodeError ? err.code : 'verify';
      scope.postMessage({ type: 'error', code, detail: String((err as Error)?.message ?? err) }, []);
    }
  })();
};
