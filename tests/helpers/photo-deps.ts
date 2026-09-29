// Node codecs for the photo engine tests and the fixture builder: real MozJPEG (encode/decode) and resize,
// from the same wasm the site ships. Needs the ImageData polyfill (tests/helpers/image-data.ts) loaded first.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import encode, { init as initEncode } from '@jsquash/jpeg/encode.js';
import decode, { init as initDecode } from '@jsquash/jpeg/decode.js';
import initResize, { resize as wasmResize } from '@jsquash/resize/lib/resize/pkg/squoosh_resize.js';
import decodeWebpWasm, { init as initWebpDecode } from '@jsquash/webp/decode.js';
import { quickScoreSize, type Decoded, type PhotoDeps } from '../../src/lib/image/engine';
import { ssim } from '../../src/lib/image/ssim';

const require = createRequire(import.meta.url);

export interface NodeCodecs {
  /** Baseline MozJPEG (jSquash defaults otherwise), as the photo worker encodes. */
  mozjpeg(img: ImageData, q: number, opts?: { progressive?: boolean }): Promise<Uint8Array>;
  decodeJpeg(bytes: Uint8Array): Promise<ImageData>;
  /** Test-only WebP decoder (the site never decodes WebP itself). */
  decodeWebp(bytes: Uint8Array): Promise<ImageData>;
  resize(img: ImageData, w: number, h: number, opts?: { premultiply?: boolean }): Promise<ImageData>;
}

let ready: Promise<NodeCodecs> | null = null;

export function nodeCodecs(): Promise<NodeCodecs> {
  ready ??= (async () => {
    const wasm = (p: string) => WebAssembly.compile(readFileSync(require.resolve(p)));
    await initEncode(await wasm('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm'));
    await initDecode(await wasm('@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'));
    await initResize(await wasm('@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm'));
    await initWebpDecode(await wasm('@jsquash/webp/codec/dec/webp_dec.wasm'));
    return {
      async mozjpeg(img, q, opts) {
        const progressive = opts?.progressive ?? false;
        return new Uint8Array(await encode(img, { quality: q, progressive, baseline: !progressive }));
      },
      decodeJpeg: (bytes) => decode(bytes.slice().buffer),
      decodeWebp: (bytes) => decodeWebpWasm(bytes.slice().buffer),
      async resize(img, w, h, opts) {
        const src = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
        const out = wasmResize(src, img.width, img.height, w, h, 3, opts?.premultiply ?? false, false);
        return new ImageData(new Uint8ClampedArray(out.buffer, out.byteOffset, out.byteLength) as Uint8ClampedArray<ArrayBuffer>, w, h);
      },
    };
  })();
  return ready;
}

/** A "canvas" in Node: the pixels at (w, h). */
export interface FakeCanvas {
  img: ImageData;
}

/**
 * PhotoDeps for Node: decode with the MozJPEG decoder (orientation ignored), draw = lanczos resize, and the
 * canvas JPEG is MozJPEG at the same q (brief: the real-encoder engine test).
 */
export async function nodePhotoDeps(): Promise<PhotoDeps<ImageData, FakeCanvas>> {
  const c = await nodeCodecs();
  return {
    async decode(bytes) {
      const img = await c.decodeJpeg(bytes);
      const d: Decoded<ImageData> = { src: img, width: img.width, height: img.height, sourceWidth: img.width, sourceHeight: img.height, capped: false, close: () => undefined };
      return d;
    },
    toCanvas: (src, w, h) => ({ img: w === src.width && h === src.height ? src : syncResize(src, w, h) }),
    pixels: (cv) => cv.img,
    release: () => undefined,
    canvasJpeg: (cv, q) => c.mozjpeg(cv.img, Math.round(q * 100)),
    async measure(bytes) {
      const img = await c.decodeJpeg(bytes);
      return { width: img.width, height: img.height };
    },
    mozjpeg: (img, q) => c.mozjpeg(img, q),
    resize: (img, w, h, o) => c.resize(img, w, h, o),
    async quickScore(src, bytes) {
      const { width, height } = quickScoreSize(src.width, src.height);
      const cand = await c.decodeJpeg(bytes);
      return ssim(syncResize(src, width, height), syncResize(cand, width, height));
    },
  };
}

/** Lanczos resize, synchronous (the wasm call is synchronous once initialised). */
function syncResize(img: ImageData, w: number, h: number): ImageData {
  const src = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  const out = wasmResize(src, img.width, img.height, w, h, 3, false, false);
  return new ImageData(new Uint8ClampedArray(out.buffer, out.byteOffset, out.byteLength) as Uint8ClampedArray<ArrayBuffer>, w, h);
}
