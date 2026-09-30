// Face-model asset loading (brief Step 4 §2). The only fetch( of /id-photo/ (network-guard allowlist): GETs of
// our own versioned, same-origin static files under /vendor/mediapipe/; no photo data is ever sent.
// - The model is kept as bytes and handed to MediaPipe as `modelAssetBuffer` (no second fetch).
// - The chosen wasm (SIMD or not) and its loader script are read once to warm the HTTP cache: MediaPipe then
//   loads them itself (a <script> element and its own fetch) and the immutable response is served from cache.
// Progress is bytes received over the build-time raw sizes (src/generated/mediapipe.json), because
// Content-Length is unreliable under brotli.
import { simd } from 'wasm-feature-detect';
import mediapipe from '../../generated/mediapipe.json';
import { EngineLoadError } from '../ui/engine-load';

export interface FaceAssets {
  model: Uint8Array;
  wasmLoaderPath: string;
  wasmBinaryPath: string;
}

export interface AssetProgress {
  loaded: number;
  total: number;
}

export async function assetPlan(): Promise<{ loader: string; wasm: string; model: string; total: number }> {
  const v = (await simd().catch(() => false)) ? mediapipe.simd : mediapipe.nosimd;
  return { loader: v.js.url, wasm: v.wasm.url, model: mediapipe.model.url, total: v.js.bytes + v.wasm.bytes + mediapipe.model.bytes };
}

/** Reads `url` to the end, reporting each chunk; keeps the bytes only when `keep`. */
async function read(url: string, signal: AbortSignal, onChunk: (n: number) => void, keep: boolean): Promise<Uint8Array | null> {
  let res: Response;
  try {
    res = await fetch(url, { signal, credentials: 'same-origin' });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new EngineLoadError(`face asset did not load: ${url}`, { cause: err });
  }
  if (!res.ok || !res.body) throw new EngineLoadError(`face asset ${res.status}: ${url}`);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    onChunk(value.byteLength);
    if (keep) parts.push(value);
  }
  if (!keep) return null;
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

export async function loadFaceAssets(onProgress: (p: AssetProgress) => void, signal: AbortSignal): Promise<FaceAssets> {
  const plan = await assetPlan();
  let loaded = 0;
  const tick = (n: number): void => {
    loaded += n;
    onProgress({ loaded: Math.min(loaded, plan.total), total: plan.total });
  };
  onProgress({ loaded: 0, total: plan.total });
  const [model] = await Promise.all([read(plan.model, signal, tick, true), read(plan.wasm, signal, tick, false), read(plan.loader, signal, tick, false)]);
  if (!model || model.byteLength !== mediapipe.model.bytes) throw new EngineLoadError('face model is incomplete');
  return { model, wasmLoaderPath: plan.loader, wasmBinaryPath: plan.wasm };
}
