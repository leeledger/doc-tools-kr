// The engine's WASM dependencies, injected so the same engine runs in the browser worker
// (src/lib/pdf/compress.worker.ts) and in Node (tests/helpers/compress-deps.ts, regress:compress).

export interface QpdfResult {
  /** Process exit code (0 = ok, 3 = ok with warnings). */
  code: number;
  /** Contents of the output file, or null when qpdf wrote none. */
  out: Uint8Array | null;
  /** stdout/stderr lines. Only ever mapped to error codes; never returned to the UI or logged. */
  logs: string[];
}

export interface JpegOptions {
  quality: number;
  /** Encode as 1-channel grayscale. */
  gray: boolean;
}

export interface CompressDeps {
  /** Runs the qpdf CLI once in a fresh module instance with `input` at `in.pdf`; reads `out.pdf`. */
  qpdf(args: string[], input: Uint8Array): Promise<QpdfResult>;
  /** MozJPEG, progressive, optimized Huffman, 4:2:0 chroma. */
  jpegEncode(img: ImageData, opts: JpegOptions): Promise<Uint8Array>;
  jpegDecode(bytes: Uint8Array): Promise<ImageData>;
  /** Lanczos3 resize, no premultiply, no linear-RGB conversion. */
  resize(img: ImageData, width: number, height: number): Promise<ImageData>;
}

/** MozJPEG encoder options shared by both implementations (spike `encodeJpeg`). */
export function mozjpegOptions(opts: JpegOptions) {
  return {
    quality: opts.quality,
    color_space: opts.gray ? 1 : 3,
    progressive: true,
    optimize_coding: true,
    trellis_multipass: false,
    chroma_subsample: 2,
  };
}

type Encode = (img: ImageData, opts: ReturnType<typeof mozjpegOptions>) => Promise<ArrayBuffer>;
type Decode = (buffer: ArrayBuffer) => Promise<ImageData>;
type WasmResize = (
  input: Uint8Array,
  inW: number,
  inH: number,
  outW: number,
  outH: number,
  method: number,
  premultiply: boolean,
  linearRgb: boolean,
) => Uint8ClampedArray;

/** Method index of Lanczos3 in @jsquash/resize's squoosh_resize. */
const LANCZOS3 = 3;

/** The image half of CompressDeps from initialised @jsquash codecs (same code in the worker and in Node). */
export function codecDeps(encode: Encode, decode: Decode, wasmResize: WasmResize): Pick<CompressDeps, 'jpegEncode' | 'jpegDecode' | 'resize'> {
  return {
    async jpegEncode(img, opts) {
      return new Uint8Array(await encode(img, mozjpegOptions(opts)));
    },
    jpegDecode: (bytes) => decode(bytes.slice().buffer),
    async resize(img, width, height) {
      const src = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
      const out = wasmResize(src, img.width, img.height, width, height, LANCZOS3, false, false);
      return new ImageData(new Uint8ClampedArray(out.buffer, out.byteOffset, out.byteLength) as Uint8ClampedArray<ArrayBuffer>, width, height);
    },
  };
}
