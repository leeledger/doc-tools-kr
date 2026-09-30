// The rhwp WebAssembly load (network-guard allowlist: "rhwp wasm, own origin"). The only fetch( of the HWP
// module: a same-origin GET of our own versioned static file, never file data. Read through a byte-progress
// reader whose denominator is the build-time raw size (src/generated/rhwp.json, written by
// scripts/vendor-rhwp.mjs), then compiled from the ArrayBuffer (compileStreaming cannot report progress).
// A fetch failure, a non-OK response or a compile error is an EngineLoadError (never the file's fault).
import rhwp from '../../generated/rhwp.json';
import { EngineLoadError } from '../ui/engine-load';

export const RHWP_VERSION: string = rhwp.version;
export const RHWP_WASM_BYTES: number = rhwp.bytes;
export const RHWP_WASM_URL = `/vendor/rhwp/${RHWP_VERSION}/rhwp_bg.wasm`;

export type Progress = (loaded: number, total: number) => void;

async function download(url: string, onProgress: Progress): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`wasm ${res.status}`);
  const total = RHWP_WASM_BYTES;
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onProgress(buf.byteLength, total);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(Math.min(loaded, total), total);
  }
  const out = new Uint8Array(loaded);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out.buffer;
}

let cached: Promise<WebAssembly.Module> | null = null;

/** The compiled rhwp module, once per worker. A failure is not cached, so the retry refetches. */
export function loadRhwpModule(onProgress: Progress = () => undefined): Promise<WebAssembly.Module> {
  cached ??= (async () => {
    try {
      return await WebAssembly.compile(await download(RHWP_WASM_URL, onProgress));
    } catch (err) {
      cached = null;
      throw new EngineLoadError(`rhwp wasm did not load: ${RHWP_WASM_URL}`, { cause: err });
    }
  })();
  return cached;
}

let prefetched: Promise<void> | null = null;

/**
 * Fetches the wasm bytes to the end without keeping them (SPIKE-HWP-DIRECT §6.7): the HTTP cache and the
 * service worker's /vendor/rhwp/ cache then serve the worker's own download. Called on the picker's
 * pointerdown / Enter / Space and the drop zone's dragenter, so the transfer overlaps the file dialog.
 * Once per page; a failure is silent (the real load reports it).
 */
export function prefetchRhwpWasm(): Promise<void> {
  prefetched ??= (async () => {
    try {
      const res = await fetch(RHWP_WASM_URL);
      if (!res.ok) throw new Error(`wasm ${res.status}`);
      if (!res.body) {
        await res.arrayBuffer();
        return;
      }
      const reader = res.body.getReader();
      while (!(await reader.read()).done);
    } catch {
      prefetched = null;
    }
  })();
  return prefetched;
}
