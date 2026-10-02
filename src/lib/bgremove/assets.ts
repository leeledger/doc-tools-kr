// 배경 지우기 assets (Sprint C, C2; brief Flow and build order 5). GETs of our own versioned, same-origin static files
// only: the onnxruntime-web wasm parts (/vendor/onnxruntime-web/<ver>/) and the BiRefNet parts with their manifest
// (/vendor/birefnet-lite-512/<exportId>/). No photo data is ever sent (the photo stays in the page and its workers).
// - Nothing is fetched before the user picked a photo and agreed to the download (the consent panel), unless every
//   file is already in this tool's Cache Storage ('docttak-model-birefnet-<exportId>').
// - Each part is checked against its SHA-256 (runtime parts: the build pins in src/generated/bgremove.json; model
//   parts: manifest.json). A mismatch deletes that cache entry and fails with 'corrupt'.
// - Finished parts stay cached, so a dropped connection resumes at the next part. A network failure is retried twice.
// - With less than 300 MB of free storage (or no Cache Storage, e.g. some private windows) nothing is cached and the
//   tool still runs; the caller tells the user it will download again next time.
// - Bytes are written straight into one buffer of the final size (no second copy of the parts).
// Pure apart from the injected fetch / caches / storage / digest, so the unit tests run it with mocks.
import plan from '../../generated/bgremove.json';

export type Backend = 'webgpu' | 'wasm';

export interface Part {
  url: string;
  bytes: number;
  sha256: string;
}

export interface ModelManifest {
  exportId: string;
  bytes: number;
  parts: { name: string; bytes: number; sha256: string }[];
  sha256Total: string;
}

export interface Progress {
  loaded: number;
  total: number;
}

export type AssetErrorCode = 'network' | 'corrupt';

export class AssetError extends Error {
  constructor(
    readonly code: AssetErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AssetError';
  }
}

export interface AssetDeps {
  fetch: (url: string, init: { signal: AbortSignal; credentials: 'same-origin' }) => Promise<Response>;
  /** null where Cache Storage is missing or throws (private windows, blocked storage). */
  caches: Pick<CacheStorage, 'open' | 'keys' | 'delete'> | null;
  /** navigator.storage.estimate, or null. */
  estimate: (() => Promise<{ quota?: number; usage?: number }>) | null;
  /** Lower-case hex SHA-256 of `data`. */
  digest: (data: Uint8Array) => Promise<string>;
}

export const CACHE_PREFIX = 'docttak-model-birefnet-';
/** Brief Flow: caching is skipped below this much free storage. */
export const MIN_FREE_BYTES = 300 * 1024 * 1024;
/** Network attempts per part (brief failure row "download": retry x2). */
export const ATTEMPTS = 3;

export const EXPORT_ID = plan.model.exportId;
export const cacheName = (exportId: string = EXPORT_ID): string => `${CACHE_PREFIX}${exportId}`;

/** The engine script of a backend. */
export const ortScript = (backend: Backend): string => plan[backend].mjs;
/** The directory of the engine scripts (env.wasm.wasmPaths). */
export const ortBase = (backend: Backend): string => plan[backend].mjs.slice(0, plan[backend].mjs.lastIndexOf('/') + 1);

export function runtimeParts(backend: Backend): Part[] {
  return plan[backend].wasm.parts.map((p) => ({ ...p }));
}

export const runtimeBytes = (backend: Backend): number => plan[backend].wasm.bytes;
/** Model bytes known at build time (the consent panel shows this before manifest.json is read). */
export const MODEL_BYTES = plan.model.bytes;
export const MODEL_MANIFEST_URL = plan.model.manifest;

/** Model + runtime bytes of a first visit on `backend`. */
export const downloadBytes = (backend: Backend): number => MODEL_BYTES + runtimeBytes(backend);

export function modelParts(manifest: ModelManifest, manifestUrl: string = MODEL_MANIFEST_URL): Part[] {
  const dir = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
  return manifest.parts.map((p) => ({ url: `${dir}${p.name}`, bytes: p.bytes, sha256: p.sha256 }));
}

const HEX64 = /^[0-9a-f]{64}$/;

/** The manifest with its fields checked (a stale or broken file is 'corrupt', never a crash later). */
export function parseManifest(json: unknown): ModelManifest {
  const m = json as Partial<ModelManifest> | null;
  const ok =
    !!m &&
    typeof m.exportId === 'string' &&
    typeof m.bytes === 'number' &&
    typeof m.sha256Total === 'string' &&
    Array.isArray(m.parts) &&
    m.parts.length > 0 &&
    m.parts.every((p) => p && typeof p.name === 'string' && /^[\w.-]+$/.test(p.name) && Number.isInteger(p.bytes) && p.bytes > 0 && HEX64.test(p.sha256)) &&
    m.parts.reduce((a, p) => a + p.bytes, 0) === m.bytes;
  if (!ok) throw new AssetError('corrupt', 'model manifest is malformed');
  return m as ModelManifest;
}

async function openCache(deps: AssetDeps, name: string): Promise<Cache | null> {
  if (!deps.caches) return null;
  try {
    return await deps.caches.open(name);
  } catch {
    return null;
  }
}

async function cachedResponse(cache: Cache | null, url: string): Promise<Response | null> {
  if (!cache) return null;
  try {
    return (await cache.match(url)) ?? null;
  } catch {
    return null;
  }
}

/** Reads the manifest from the cache, else the network (and caches it when `store`). */
export async function loadManifest(deps: AssetDeps, signal: AbortSignal, store: boolean, url: string = MODEL_MANIFEST_URL): Promise<ModelManifest> {
  const cache = await openCache(deps, cacheName());
  const hit = await cachedResponse(cache, url);
  if (hit) {
    try {
      return parseManifest(await hit.json());
    } catch {
      await cache?.delete(url).catch(() => false);
    }
  }
  let text: string | null = null;
  let lastErr: unknown;
  for (let i = 0; i < ATTEMPTS && text === null; i++) {
    try {
      const res = await deps.fetch(url, { signal, credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } catch (err) {
      if (signal.aborted) throw err;
      lastErr = err;
    }
  }
  if (text === null) throw new AssetError('network', `model manifest did not load: ${url}`, { cause: lastErr });
  let manifest: ModelManifest;
  try {
    manifest = parseManifest(JSON.parse(text));
  } catch {
    throw new AssetError('corrupt', 'model manifest is malformed');
  }
  if (store && cache) await cache.put(url, new Response(text, { headers: { 'content-type': 'application/json' } })).catch(() => undefined);
  return manifest;
}

/** True when the manifest and every runtime and model part of `backend` are in the cache (no download needed). */
export async function isCached(deps: AssetDeps, backend: Backend, url: string = MODEL_MANIFEST_URL): Promise<boolean> {
  const cache = await openCache(deps, cacheName());
  if (!cache) return false;
  const hit = await cachedResponse(cache, url);
  if (!hit) return false;
  let manifest: ModelManifest;
  try {
    manifest = parseManifest(await hit.json());
  } catch {
    return false;
  }
  for (const p of [...runtimeParts(backend), ...modelParts(manifest, url)]) if (!(await cachedResponse(cache, p.url))) return false;
  return true;
}

/** Whether to cache: Cache Storage opens and at least 300 MB stay free (unknown quota: yes). */
export async function canStore(deps: AssetDeps): Promise<boolean> {
  if (!(await openCache(deps, cacheName()))) return false;
  if (!deps.estimate) return true;
  try {
    const { quota, usage } = await deps.estimate();
    if (typeof quota !== 'number') return true;
    return quota - (usage ?? 0) >= MIN_FREE_BYTES;
  } catch {
    return true;
  }
}

/** Deletes every docttak-model-birefnet-* cache except the current export (one model version on the device). */
export async function deleteOldCaches(deps: AssetDeps, current: string = cacheName()): Promise<string[]> {
  if (!deps.caches) return [];
  const gone: string[] = [];
  try {
    for (const k of await deps.caches.keys()) {
      if (k.startsWith(CACHE_PREFIX) && k !== current && (await deps.caches.delete(k))) gone.push(k);
    }
  } catch {
    // Storage blocked: nothing to clean.
  }
  return gone;
}

/** Streams `res` into `out` (exactly `bytes` long), calling `tick` per chunk. False when the length is wrong. */
async function readInto(res: Response, out: Uint8Array, tick: (n: number) => void): Promise<boolean> {
  if (!res.body) {
    const b = new Uint8Array(await res.arrayBuffer());
    if (b.byteLength !== out.byteLength) return false;
    out.set(b);
    tick(b.byteLength);
    return true;
  }
  const reader = res.body.getReader();
  let o = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (o + value.byteLength > out.byteLength) {
      await reader.cancel().catch(() => undefined);
      return false;
    }
    out.set(value, o);
    o += value.byteLength;
    tick(value.byteLength);
  }
  return o === out.byteLength;
}

export interface LoadOptions {
  deps: AssetDeps;
  signal: AbortSignal;
  /** Cache the parts read from the network. */
  store: boolean;
  onProgress?: (p: Progress) => void;
}

/**
 * Reads `parts` in order into one buffer of their total size: each from the cache when there, else the network
 * (x3), each checked against its SHA-256. Progress counts cached bytes too, so a resumed download starts part-way.
 */
export async function loadParts(parts: Part[], o: LoadOptions): Promise<Uint8Array> {
  const total = parts.reduce((a, p) => a + p.bytes, 0);
  const out = new Uint8Array(total);
  const cache = await openCache(o.deps, cacheName());
  let loaded = 0;
  const report = (): void => o.onProgress?.({ loaded: Math.min(loaded, total), total });
  report();
  let offset = 0;
  for (const p of parts) {
    const view = out.subarray(offset, offset + p.bytes);
    const start = loaded;
    const tick = (n: number): void => {
      loaded += n;
      report();
    };
    let ok = false;
    const hit = await cachedResponse(cache, p.url);
    if (hit) {
      try {
        ok = (await readInto(hit, view, tick)) && (await o.deps.digest(view)) === p.sha256;
      } catch {
        ok = false;
      }
      if (!ok) {
        // A damaged cache entry: drop it and read the part from the network instead.
        await cache?.delete(p.url).catch(() => false);
        loaded = start;
        report();
      }
    }
    if (!ok) {
      let lastErr: unknown;
      let read = false;
      for (let i = 0; i < ATTEMPTS && !read; i++) {
        loaded = start;
        try {
          const res = await o.deps.fetch(p.url, { signal: o.signal, credentials: 'same-origin' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          read = await readInto(res, view, tick);
          if (!read) throw new Error(`length mismatch: ${p.url}`);
        } catch (err) {
          if (o.signal.aborted) throw err;
          lastErr = err;
        }
      }
      if (!read) throw new AssetError('network', `part did not load: ${p.url}`, { cause: lastErr });
      if ((await o.deps.digest(view)) !== p.sha256) {
        await cache?.delete(p.url).catch(() => false);
        throw new AssetError('corrupt', `SHA-256 mismatch: ${p.url}`);
      }
      if (o.store && cache) await cache.put(p.url, new Response(view.slice())).catch(() => undefined);
    }
    offset += p.bytes;
  }
  return out;
}

/** The browser implementations (null where an API is missing or throws on access). */
export function browserDeps(): AssetDeps {
  let cs: CacheStorage | null = null;
  try {
    cs = typeof caches === 'undefined' ? null : caches;
  } catch {
    cs = null;
  }
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  return {
    fetch: (url, init) => fetch(url, init),
    caches: cs,
    estimate: storage?.estimate ? () => storage.estimate() : null,
    digest: async (data) => {
      const h = new Uint8Array(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>));
      let s = '';
      for (const b of h) s += b.toString(16).padStart(2, '0');
      return s;
    },
  };
}
