// Every jSquash WebAssembly load of the workers lives in this file (network-guard allowlist: these fetches
// only ever GET our own versioned static assets; no file data is sent anywhere). Shared by the PDF
// compress worker and the photo worker; each codec is compiled at most once per worker.
import mozEncode, { init as initMozEncode } from '@jsquash/jpeg/encode.js';
import mozDecode, { init as initMozDecode } from '@jsquash/jpeg/decode.js';
import mozjpegEncUrl from '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?url';
import mozjpegDecUrl from '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm?url';
import initResize, { resize as wasmResize } from '@jsquash/resize/lib/resize/pkg/squoosh_resize.js';
import resizeWasmUrl from '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm?url';
import webpEncUrl from '@jsquash/webp/codec/enc/webp_enc.wasm?url';
import webpEncSimdUrl from '@jsquash/webp/codec/enc/webp_enc_simd.wasm?url';
import { EngineLoadError } from '../ui/engine-load';

/**
 * Streaming compile; falls back to an ArrayBuffer compile if the server sent the wrong MIME type. A fetch
 * failure, a non-OK response or a compile error is an EngineLoadError (Polish P.1): never the file's fault.
 */
export async function compileWasm(url: string): Promise<WebAssembly.Module> {
  try {
    return await WebAssembly.compileStreaming(fetch(url));
  } catch {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`wasm ${res.status}`);
      return await WebAssembly.compile(await res.arrayBuffer());
    } catch (err) {
      throw new EngineLoadError(`wasm did not load: ${url}`, { cause: err });
    }
  }
}

/** A lazily imported codec module that did not arrive is an engine failure too. */
async function importCodec<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    throw new EngineLoadError('codec module did not load', { cause: err });
  }
}

/** Runs a loader once per worker and caches its promise (a failure too: no refetch per item). */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= load());
}

export type MozjpegEncode = typeof mozEncode;
export type MozjpegDecode = typeof mozDecode;
export type WasmResize = typeof wasmResize;
export type WebpEncode = (typeof import('@jsquash/webp/encode.js'))['default'];

/** MozJPEG encoder (@jsquash/jpeg). */
export const loadMozjpegEncoder = once(async (): Promise<MozjpegEncode> => {
  await initMozEncode(await compileWasm(mozjpegEncUrl));
  return mozEncode;
});

/** MozJPEG decoder (@jsquash/jpeg). */
export const loadMozjpegDecoder = once(async (): Promise<MozjpegDecode> => {
  await initMozDecode(await compileWasm(mozjpegDecUrl));
  return mozDecode;
});

/** squoosh_resize (@jsquash/resize, pkg only: the hqx and magic-kernel wasm never ship). */
export const loadResize = once(async (): Promise<WasmResize> => {
  await initResize(await compileWasm(resizeWasmUrl));
  return wasmResize;
});

/**
 * WebP encoder (@jsquash/webp). Its glue picks the SIMD or plain build with wasm-feature-detect's
 * `simd()`; the same check picks the wasm compiled here, so both always match.
 */
export const loadWebpEncoder = once(async (): Promise<WebpEncode> => {
  const [{ simd }, webp] = await importCodec(() => Promise.all([import('wasm-feature-detect'), import('@jsquash/webp/encode.js')]));
  const module = await compileWasm((await simd()) ? webpEncSimdUrl : webpEncUrl);
  await webp.init(module);
  return webp.default;
});
