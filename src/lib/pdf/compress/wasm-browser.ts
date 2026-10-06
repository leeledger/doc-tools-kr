// Every WebAssembly load of the compress worker goes through this file, src/lib/codecs/wasm-browser.ts or
// src/lib/pdf/qpdf/load.ts (all only ever GET our own versioned static assets; no file data is sent
// anywhere). Loaded only inside the worker, which is created when "PDF 용량 줄이기" is pressed.
import { loadMozjpegDecoder, loadMozjpegEncoder, loadResize } from '../../codecs/wasm-browser';
import { codecDeps, type CompressDeps } from './deps';

let codecs: Promise<Pick<CompressDeps, 'jpegEncode' | 'jpegDecode' | 'resize'>> | null = null;

/** MozJPEG encoder/decoder and the resize codec (the shared loaders compile each once per worker). */
export function loadCodecs(): Promise<Pick<CompressDeps, 'jpegEncode' | 'jpegDecode' | 'resize'>> {
  codecs ??= (async () => {
    const [enc, dec, rz] = await Promise.all([loadMozjpegEncoder(), loadMozjpegDecoder(), loadResize()]);
    return codecDeps(enc, dec, rz);
  })();
  return codecs;
}
