// Every WebAssembly load of the compress worker lives in this file (network-guard allowlist: these
// fetches only ever GET our own versioned static assets; no file data is sent anywhere).
// Loaded only inside the worker, which is created when "PDF 용량 줄이기" is pressed.
import encode, { init as initEncode } from '@jsquash/jpeg/encode.js';
import decode, { init as initDecode } from '@jsquash/jpeg/decode.js';
import mozjpegEncUrl from '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url';
import mozjpegDecUrl from '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm?url';
import initResize, { resize as wasmResize } from '@jsquash/resize/lib/resize/pkg/squoosh_resize.js';
import resizeWasmUrl from '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm?url';
import { codecDeps, type CompressDeps } from './deps';
import { runQpdf, type QpdfFactory } from './qpdf-run';

/** Must match QPDF_VENDOR_DIR in scripts/copy-vendor.mjs (unit-tested). */
export const QPDF_VENDOR_DIR = '12.2.0-w0.3.0';
const QPDF_MJS_URL = `/vendor/qpdf/${QPDF_VENDOR_DIR}/qpdf.mjs`;
const QPDF_WASM_URL = `/vendor/qpdf/${QPDF_VENDOR_DIR}/qpdf.wasm`;

/** Streaming compile; falls back to an ArrayBuffer compile if the server sent the wrong MIME type. */
async function compileWasm(url: string): Promise<WebAssembly.Module> {
  try {
    return await WebAssembly.compileStreaming(fetch(url));
  } catch {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`wasm ${res.status}`);
    return WebAssembly.compile(await res.arrayBuffer());
  }
}

let codecs: Promise<Pick<CompressDeps, 'jpegEncode' | 'jpegDecode' | 'resize'>> | null = null;

/** MozJPEG encoder/decoder and the resize codec, compiled once per worker. */
export function loadCodecs(): Promise<Pick<CompressDeps, 'jpegEncode' | 'jpegDecode' | 'resize'>> {
  codecs ??= (async () => {
    const [enc, dec, rz] = await Promise.all([compileWasm(mozjpegEncUrl), compileWasm(mozjpegDecUrl), compileWasm(resizeWasmUrl)]);
    await Promise.all([initEncode(enc), initDecode(dec), initResize(rz)]);
    return codecDeps(encode, decode, wasmResize);
  })();
  return codecs;
}

let qpdfFactory: Promise<QpdfFactory> | null = null;

/**
 * qpdf CLI runner. The Emscripten glue is our vendored ES module (not bundled by Vite). This qpdf-wasm
 * build accepts no `wasmBinary`, so each run's fresh module instance loads the wasm through
 * `locateFile` from the same immutable, versioned URL (served from the HTTP cache after the first run).
 */
export function loadQpdf(): CompressDeps['qpdf'] {
  return async (args, input) => {
    qpdfFactory ??= import(/* @vite-ignore */ QPDF_MJS_URL).then((m: { default: QpdfFactory }) => m.default);
    return runQpdf(await qpdfFactory, () => QPDF_WASM_URL, args, input);
  };
}
