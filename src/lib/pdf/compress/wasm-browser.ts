// Every WebAssembly load of the compress worker goes through this file or src/lib/codecs/wasm-browser.ts
// (network-guard allowlist: both only ever GET our own versioned static assets; no file data is sent
// anywhere). Loaded only inside the worker, which is created when "PDF 용량 줄이기" is pressed.
import { loadMozjpegDecoder, loadMozjpegEncoder, loadResize } from '../../codecs/wasm-browser';
import { codecDeps, type CompressDeps } from './deps';
import { runQpdf, type QpdfFactory } from './qpdf-run';

/** Must match QPDF_VENDOR_DIR in scripts/copy-vendor.mjs (unit-tested). */
export const QPDF_VENDOR_DIR = '12.2.0-w0.3.0';
const QPDF_MJS_URL = `/vendor/qpdf/${QPDF_VENDOR_DIR}/qpdf.mjs`;
const QPDF_WASM_URL = `/vendor/qpdf/${QPDF_VENDOR_DIR}/qpdf.wasm`;

let codecs: Promise<Pick<CompressDeps, 'jpegEncode' | 'jpegDecode' | 'resize'>> | null = null;

/** MozJPEG encoder/decoder and the resize codec (the shared loaders compile each once per worker). */
export function loadCodecs(): Promise<Pick<CompressDeps, 'jpegEncode' | 'jpegDecode' | 'resize'>> {
  codecs ??= (async () => {
    const [enc, dec, rz] = await Promise.all([loadMozjpegEncoder(), loadMozjpegDecoder(), loadResize()]);
    return codecDeps(enc, dec, rz);
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
