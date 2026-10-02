// 사진 배경 지우기 (Sprint C, C2; brief "C2 Test map"): assets (consent, progress, resume, SHA mismatch, quota skip),
// engine choice and the WebGPU -> WASM fallback with a mocked `ort`, pre/post-processing, blur-fusion against the
// spike's Python fg_blur, the crash guard, the page state, copy and limits. No network, no model.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { describe, expect, it, vi } from 'vitest';
import {
  ATTEMPTS,
  AssetError,
  CACHE_PREFIX,
  MIN_FREE_BYTES,
  MODEL_BYTES,
  cacheName,
  canStore,
  deleteOldCaches,
  downloadBytes,
  isCached,
  loadManifest,
  loadParts,
  modelParts,
  ortBase,
  ortScript,
  parseManifest,
  runtimeBytes,
  runtimeParts,
  type AssetDeps,
  type ModelManifest,
  type Part,
} from '../../src/lib/bgremove/assets';
import { blurFusion, boxFilter, plainCutout, reflect } from '../../src/lib/bgremove/fusion';
import { ATTEMPT_KEY, SMALL_KEY, clearAttempt, markAttempt, takeCrash, workEdge, type GuardStorage } from '../../src/lib/bgremove/guard';
import { MEAN, NOSUBJECT_AREA, SIZE, STD, fusionRadii, hasSubject, maskArea, pilResizeRgba, resizeMask, toInput, validMask } from '../../src/lib/bgremove/infer';
import { StageError, runOnce, threadCount, type CoreEnv, type OrtLike, type RunRequest, type SessionLike, type TensorLike } from '../../src/lib/bgremove/infer-core';
import { EngineError, pickBackend, runEngine, shouldFallBack, type WorkerLike } from '../../src/lib/bgremove/session';
import { BG_COLORS, COPY, FIT_LINE, aboutMB, fileName, saveLabel } from '../../src/tools/remove-background/copy';
import { LIMITS, checkDims, checkFileBytes } from '../../src/tools/remove-background/limits';
import { move, view, type Phase } from '../../src/tools/remove-background/model';
import { BG_REMOVE_TOOL, TOOLS } from '../../src/data/tools';
import { defaultDescription } from '../../src/data/site';
import { bgRemoveHeaders, COEP_PATHS } from '../../scripts/gen-headers.mjs';
import { NOT_PRECACHED } from '../../scripts/gen-sw.mjs';
import { route, NETWORK_PREFIXES } from '../../src/sw/sw';
import { bgRemoveOn } from '../../scripts/lib/bgremove.mjs';
import { componentProblems } from '../../scripts/check-licenses.mjs';
import { renderBrand } from '../../scripts/gen-brand.mjs';

const ROOT = join(__dirname, '..', '..');
const FIX = join(ROOT, 'tests', 'fixtures', 'bgremove');
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

// ---------- assets ----------

/** An in-memory Cache Storage. */
function memCaches() {
  const stores = new Map<string, Map<string, Uint8Array>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      match: async (url: string) => (m.has(url) ? new Response(m.get(url)!.slice()) : undefined),
      put: async (url: string, res: Response) => void m.set(url, new Uint8Array(await res.arrayBuffer())),
      delete: async (url: string) => m.delete(url),
    } as unknown as Cache;
  };
  return { stores, api: { open, keys: async () => [...stores.keys()], delete: async (k: string) => stores.delete(k) } };
}

function bytes(n: number, seed: number): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + seed) & 255;
  return b;
}

function setup(files: Record<string, Uint8Array | string>, opts: { failFirst?: Record<string, number>; quota?: number; noCaches?: boolean } = {}) {
  const caches = memCaches();
  const calls: string[] = [];
  const fails = { ...(opts.failFirst ?? {}) };
  const deps: AssetDeps = {
    fetch: async (url) => {
      calls.push(url);
      if ((fails[url] ?? 0) > 0) {
        fails[url]!--;
        throw new TypeError('network down');
      }
      const f = files[url];
      if (f === undefined) return new Response('missing', { status: 404 });
      return new Response(typeof f === 'string' ? f : f.slice());
    },
    caches: opts.noCaches ? null : caches.api,
    estimate: opts.quota === undefined ? null : async () => ({ quota: opts.quota, usage: 0 }),
    digest: async (d) => sha(d),
  };
  return { deps, caches, calls };
}

const signal = () => new AbortController().signal;

describe('assets: manifest, parts, cache (brief Flow, failure rows "download" and "storage")', () => {
  const a = bytes(1000, 1);
  const b = bytes(700, 2);
  const parts: Part[] = [
    { url: '/vendor/m/model.part0', bytes: a.length, sha256: sha(a) },
    { url: '/vendor/m/model.part1', bytes: b.length, sha256: sha(b) },
  ];
  const files = { '/vendor/m/model.part0': a, '/vendor/m/model.part1': b };

  it('reads the parts in order into one buffer, checks each SHA-256, caches them, and reports bytes', async () => {
    const { deps, caches } = setup(files);
    const seen: number[] = [];
    const out = await loadParts(parts, { deps, signal: signal(), store: true, onProgress: (p) => seen.push(p.loaded) });
    expect(out.length).toBe(1700);
    expect(sha(out.subarray(0, 1000))).toBe(sha(a));
    expect(sha(out.subarray(1000))).toBe(sha(b));
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(1700);
    expect([...caches.stores.get(cacheName())!.keys()].sort()).toEqual(parts.map((p) => p.url));
  });

  it('resume: a cached part is not fetched again and its bytes count from the start', async () => {
    const { deps, calls } = setup(files);
    await loadParts(parts.slice(0, 1), { deps, signal: signal(), store: true });
    calls.length = 0;
    const seen: number[] = [];
    await loadParts(parts, { deps, signal: signal(), store: true, onProgress: (p) => seen.push(p.loaded) });
    expect(calls).toEqual(['/vendor/m/model.part1']);
    expect(seen).toContain(1000);
  });

  it(`network: retried up to ${ATTEMPTS} times, then AssetError network`, async () => {
    const ok = setup(files, { failFirst: { '/vendor/m/model.part1': ATTEMPTS - 1 } });
    await expect(loadParts(parts, { deps: ok.deps, signal: signal(), store: true })).resolves.toHaveLength(1700);
    const bad = setup(files, { failFirst: { '/vendor/m/model.part1': ATTEMPTS } });
    await expect(loadParts(parts, { deps: bad.deps, signal: signal(), store: true })).rejects.toMatchObject({ code: 'network' });
    // The part that did arrive stays cached (resume next time).
    expect(bad.caches.stores.get(cacheName())!.has('/vendor/m/model.part0')).toBe(true);
  });

  it('SHA-256 mismatch: AssetError corrupt, nothing of that part cached', async () => {
    const { deps, caches } = setup({ ...files, '/vendor/m/model.part1': bytes(700, 9) });
    await expect(loadParts(parts, { deps, signal: signal(), store: true })).rejects.toMatchObject({ name: 'AssetError', code: 'corrupt' });
    expect(caches.stores.get(cacheName())!.has('/vendor/m/model.part1')).toBe(false);
  });

  it('a damaged cache entry is dropped and read again from the network', async () => {
    const { deps, caches, calls } = setup(files);
    const c = await caches.api.open(cacheName());
    await c.put('/vendor/m/model.part0', new Response(bytes(1000, 7) as Uint8Array<ArrayBuffer>));
    const out = await loadParts(parts, { deps, signal: signal(), store: true });
    expect(sha(out.subarray(0, 1000))).toBe(sha(a));
    expect(calls).toContain('/vendor/m/model.part0');
  });

  it('a wrong length is a network failure, never a silent short buffer', async () => {
    const { deps } = setup({ ...files, '/vendor/m/model.part1': bytes(600, 2) });
    await expect(loadParts(parts, { deps, signal: signal(), store: false })).rejects.toBeInstanceOf(AssetError);
  });

  it('store false (quota skip): nothing is cached, the bytes are still returned', async () => {
    const { deps, caches } = setup(files);
    await loadParts(parts, { deps, signal: signal(), store: false });
    expect(caches.stores.get(cacheName())?.size ?? 0).toBe(0);
  });

  it('abort: the fetch error propagates as is (취소), not as AssetError', async () => {
    const ctl = new AbortController();
    const { deps } = setup(files);
    deps.fetch = async () => {
      ctl.abort();
      throw new DOMException('aborted', 'AbortError');
    };
    await expect(loadParts(parts, { deps, signal: ctl.signal, store: true })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('canStore: below 300 MB free, without Cache Storage, or when it throws: no caching', async () => {
    expect(await canStore(setup({}, { quota: MIN_FREE_BYTES }).deps)).toBe(true);
    expect(await canStore(setup({}, { quota: MIN_FREE_BYTES - 1 }).deps)).toBe(false);
    expect(await canStore(setup({}).deps)).toBe(true);
    expect(await canStore(setup({}, { noCaches: true }).deps)).toBe(false);
    const broken = setup({});
    broken.deps.caches = { open: async () => Promise.reject(new Error('SecurityError')), keys: async () => [], delete: async () => false };
    expect(await canStore(broken.deps)).toBe(false);
  });

  it('deleteOldCaches keeps the current export only, and never touches other caches', async () => {
    const { deps, caches } = setup({});
    for (const k of [`${CACHE_PREFIX}old1`, cacheName(), 'anolim-b1', 'other']) await caches.api.open(k);
    expect(await deleteOldCaches(deps)).toEqual([`${CACHE_PREFIX}old1`]);
    expect([...caches.stores.keys()].sort()).toEqual(['anolim-b1', cacheName(), 'other'].sort());
  });

  const manifest = (over: Partial<ModelManifest> = {}): ModelManifest => ({
    exportId: 'x',
    bytes: 1700,
    sha256Total: 'f'.repeat(64),
    parts: [
      { name: 'model.part0', bytes: 1000, sha256: sha(a) },
      { name: 'model.part1', bytes: 700, sha256: sha(b) },
    ],
    ...over,
  });

  it('parseManifest: rejects a broken manifest (sizes that do not add up, bad names or hashes)', () => {
    expect(parseManifest(manifest()).parts).toHaveLength(2);
    expect(() => parseManifest(manifest({ bytes: 1 }))).toThrow(AssetError);
    expect(() => parseManifest(manifest({ parts: [{ name: '../x', bytes: 1700, sha256: sha(a) }] }))).toThrow(AssetError);
    expect(() => parseManifest(manifest({ parts: [{ name: 'p', bytes: 1700, sha256: 'nothex' }] }))).toThrow(AssetError);
    expect(() => parseManifest(null)).toThrow(AssetError);
  });

  it('modelParts: URLs next to the manifest; loadManifest caches it; isCached needs every runtime and model part', async () => {
    const url = '/vendor/m/manifest.json';
    expect(modelParts(manifest(), url).map((p) => p.url)).toEqual(['/vendor/m/model.part0', '/vendor/m/model.part1']);
    const rt = runtimeParts('wasm');
    const rtFiles = Object.fromEntries(rt.map((p) => [p.url, new Uint8Array(0)]));
    const { deps, calls } = setup({ [url]: JSON.stringify(manifest()), ...files, ...rtFiles });
    expect(await isCached(deps, 'wasm', url)).toBe(false);
    await loadManifest(deps, signal(), true, url);
    calls.length = 0;
    expect((await loadManifest(deps, signal(), true, url)).bytes).toBe(1700);
    expect(calls).toEqual([]);
    await loadParts(modelParts(manifest(), url), { deps, signal: signal(), store: true });
    expect(await isCached(deps, 'wasm', url)).toBe(false);
    const c = await deps.caches!.open(cacheName());
    for (const p of rt) await c.put(p.url, new Response('x'));
    expect(await isCached(deps, 'wasm', url)).toBe(true);
    expect(await isCached(deps, 'webgpu', url)).toBe(false);
  });

  it('loadManifest: a 404 or broken JSON is an AssetError (network / corrupt)', async () => {
    await expect(loadManifest(setup({}).deps, signal(), true, '/m.json')).rejects.toMatchObject({ code: 'network' });
    await expect(loadManifest(setup({ '/m.json': '{nope' }).deps, signal(), true, '/m.json')).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('the build plan: runtime parts are pinned (≤ 24 MiB each, SHA-256), the WebGPU wasm is split in two', () => {
    const gpu = runtimeParts('webgpu');
    expect(gpu).toHaveLength(2);
    for (const p of [...gpu, ...runtimeParts('wasm')]) {
      expect(p.bytes).toBeLessThan(24 * 1024 * 1024);
      expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(p.url).toMatch(/^\/vendor\/onnxruntime-web\/1\.30\.0\//);
    }
    expect(gpu.reduce((s, p) => s + p.bytes, 0)).toBe(runtimeBytes('webgpu'));
    expect(ortScript('webgpu')).toBe('/vendor/onnxruntime-web/1.30.0/ort.webgpu.min.mjs');
    expect(ortScript('wasm')).toBe('/vendor/onnxruntime-web/1.30.0/ort.wasm.min.mjs');
    expect(ortBase('wasm')).toBe('/vendor/onnxruntime-web/1.30.0/');
    expect(downloadBytes('webgpu')).toBe(MODEL_BYTES + runtimeBytes('webgpu'));
    // The committed model manifest is what the build pins.
    const committed = JSON.parse(readFileSync(join(ROOT, 'vendor-assets', 'birefnet-lite-512', 'aa62cd87-ce158794', 'manifest.json'), 'utf8'));
    expect(committed.bytes).toBe(MODEL_BYTES);
    expect(parseManifest(committed).parts.every((p) => p.bytes < 24 * 1024 * 1024)).toBe(true);
  });
});

// ---------- pre/post ----------

describe('infer: resize, normalise, sigmoid range, area check, upsample', () => {
  it('toInput: planar ImageNet normalisation', () => {
    const px = new Uint8ClampedArray(SIZE * SIZE * 4);
    px[0] = 255;
    px[1] = 0;
    px[2] = 128;
    const x = toInput(px);
    const n = SIZE * SIZE;
    expect(x.length).toBe(3 * n);
    expect(x[0]).toBeCloseTo((1 - MEAN[0]) / STD[0], 5);
    expect(x[n]).toBeCloseTo((0 - MEAN[1]) / STD[1], 5);
    expect(x[2 * n]).toBeCloseTo((128 / 255 - MEAN[2]) / STD[2], 5);
    expect(() => toInput(new Uint8ClampedArray(4))).toThrow();
  });

  it('area: under 1 % above 0.5 is no subject; the mask must be 0..1 (a sigmoid)', () => {
    const m = new Float32Array(10_000);
    for (let i = 0; i < 99; i++) m[i] = 0.9;
    expect(maskArea(m)).toBeCloseTo(0.0099);
    expect(hasSubject(m)).toBe(false);
    m[99] = 0.51;
    expect(maskArea(m)).toBe(NOSUBJECT_AREA);
    expect(hasSubject(m)).toBe(true);
    expect(validMask(m)).toBe(true);
    m[5] = Number.NaN;
    expect(validMask(m)).toBe(false);
    m[5] = 1.5;
    expect(validMask(m)).toBe(false);
  });

  it('resizeMask: identity at the same size, constant stays constant, half-pixel bilinear like cv2', () => {
    const src = Float32Array.from([0, 1, 0, 1]);
    expect([...resizeMask(src, 2, 2, 2, 2)]).toEqual([0, 255, 0, 255]);
    expect([...resizeMask(new Float32Array(4).fill(0.5), 2, 2, 5, 3)].every((v) => v === 128)).toBe(true);
    // cv2.resize([[0, 1]], (4, 1), INTER_LINEAR) = [0, 0.25, 0.75, 1].
    expect([...resizeMask(Float32Array.from([0, 1]), 2, 1, 4, 1)]).toEqual([0, 64, 191, 255]);
  });

  it('pilResizeRgba equals Pillow BILINEAR byte for byte (the Python reference input), down and up', async () => {
    const src = await png(join(FIX, 'fusion-a.png'));
    for (const [file, crop, w, h] of [
      ['pil-down.png', null, 51, 37],
      ['pil-up.png', [20, 15], 47, 33],
    ] as const) {
      let px = src.data;
      let sw = src.width;
      let sh = src.height;
      if (crop) {
        const c = new Uint8ClampedArray(crop[0] * crop[1] * 4);
        for (let y = 0; y < crop[1]; y++) c.set(src.data.subarray(y * src.width * 4, y * src.width * 4 + crop[0] * 4), y * crop[0] * 4);
        [px, sw, sh] = [c, crop[0], crop[1]];
      }
      const ours = pilResizeRgba(px, sw, sh, w, h);
      const ref = await png(join(FIX, file));
      let worst = 0;
      for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(ours[i * 4 + c]! - ref.data[i * 4 + c]!));
      expect(worst, file).toBe(0);
    }
  });

  it('fusion radii: r1 = 45·s, r2 = 4·s with s = long edge / 1600, at least 1', () => {
    expect(fusionRadii(1600)).toEqual({ r1: 45, r2: 4 });
    expect(fusionRadii(4096)).toEqual({ r1: 115, r2: 10 });
    expect(fusionRadii(10)).toEqual({ r1: 1, r2: 1 });
  });
});

// ---------- blur-fusion ----------

async function png(path: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const img = await loadImage(readFileSync(path));
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height);
  return { data: new Uint8ClampedArray(d.data), width: img.width, height: img.height };
}

describe('blur-fusion (Forte & Pitié, our implementation) vs the spike pp.fg_blur', () => {
  it('reflect: cv2 BORDER_REFLECT for any index', () => {
    expect([-3, -2, -1, 0, 1, 2, 3, 4, 5].map((i) => reflect(i, 3))).toEqual([2, 1, 0, 0, 1, 2, 2, 1, 0]);
    expect(reflect(-7, 1)).toBe(0);
    expect(reflect(10, 3)).toBe(1);
  });

  it('boxFilter equals a brute-force reflected mean, also for a radius larger than the image', () => {
    const w = 7;
    const h = 5;
    const src = Float32Array.from({ length: w * h }, (_, i) => (i * 37) % 11);
    for (const r of [1, 3, 9]) {
      const out = new Float32Array(w * h);
      boxFilter(src, w, h, r, out, new Float32Array(w * h));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let s = 0;
          for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) s += src[reflect(y + dy, h) * w + reflect(x + dx, w)]!;
          expect(out[y * w + x]).toBeCloseTo(s / (2 * r + 1) ** 2, 4);
        }
      }
    }
  });

  const meta = JSON.parse(readFileSync(join(FIX, 'meta.json'), 'utf8')).fixtures;
  for (const name of ['a', 'b']) {
    it(`fixture fusion-${name}: mean |ours − Python| ≤ 0.002 per channel value`, async () => {
      const m = meta[`fusion-${name}`];
      const img = await png(join(FIX, `fusion-${name}.png`));
      const al = await png(join(FIX, `fusion-${name}.alpha.png`));
      const alpha = new Uint8ClampedArray(img.width * img.height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = al.data[i * 4]!;
      const out = blurFusion(img.data, alpha, img.width, img.height, m.r1, m.r2);
      const ref = new Uint16Array(new Uint8Array(gunzipSync(readFileSync(join(FIX, `fusion-${name}.fg.u16.gz`)))).buffer);
      expect(ref.length).toBe(img.width * img.height * 3);
      let sum = 0;
      for (let i = 0; i < img.width * img.height; i++) for (let c = 0; c < 3; c++) sum += Math.abs(out[i * 4 + c]! / 255 - ref[i * 3 + c]! / 65535);
      const mean = sum / (img.width * img.height * 3);
      expect(mean).toBeLessThanOrEqual(0.002);
      for (let i = 0; i < alpha.length; i++) if (out[i * 4 + 3] !== alpha[i]) throw new Error('alpha not kept');
    });
  }

  it('plainCutout keeps the colours and takes the alpha; a size mismatch throws', () => {
    const out = plainCutout(Uint8ClampedArray.from([1, 2, 3, 255, 4, 5, 6, 255]), Uint8ClampedArray.from([10, 20]));
    expect([...out]).toEqual([1, 2, 3, 10, 4, 5, 6, 20]);
    expect(() => blurFusion(new Uint8ClampedArray(8), new Uint8ClampedArray(3), 2, 1, 1, 1)).toThrow();
  });
});

// ---------- engine ----------

function fakeOrt(o: { createFails?: boolean; runFails?: boolean; outLength?: number } = {}) {
  const log: string[] = [];
  const env: OrtLike['env'] = { wasm: {}, webgpu: {} };
  const tensor = (data: unknown): TensorLike => ({ getData: async () => data, dispose: () => void log.push('dispose') });
  const session: SessionLike = {
    inputNames: ['input_image'],
    outputNames: ['output_image'],
    run: async (feeds) => {
      log.push(`run:${Object.keys(feeds).join()}`);
      if (o.runFails) throw new Error('kernel error');
      return { output_image: tensor(new Float32Array(o.outLength ?? SIZE * SIZE).fill(0.25)) };
    },
    release: async () => void log.push('release'),
  };
  const ort: OrtLike = {
    env,
    InferenceSession: {
      create: async (_m, opts) => {
        log.push(`create:${JSON.stringify(opts.executionProviders)}`);
        if (o.createFails) throw new Error('no kernel');
        return session;
      },
    },
    Tensor: class {
      constructor(
        _t: string,
        readonly data: Float32Array,
        readonly dims: readonly number[],
      ) {
        log.push(`tensor:${dims.join('x')}`);
      }
      getData = async () => this.data;
      dispose = () => void log.push('dispose');
    } as unknown as OrtLike['Tensor'],
  };
  return { ort, log, env };
}

const req = (backend: 'webgpu' | 'wasm'): RunRequest => ({
  type: 'run',
  backend,
  ortUrl: `/vendor/onnxruntime-web/1.30.0/ort.${backend}.min.mjs`,
  ortBase: 'http://x/vendor/onnxruntime-web/1.30.0/',
  wasm: new ArrayBuffer(8),
  model: new ArrayBuffer(16),
  input: new Float32Array(3 * SIZE * SIZE).buffer,
  maxThreads: 8,
});

const coreEnv = (ort: OrtLike, over: Partial<CoreEnv> = {}): CoreEnv => ({
  importOrt: async () => ort,
  adapter: async () => ({}),
  crossOriginIsolated: true,
  hardwareConcurrency: 16,
  now: () => 0,
  ...over,
});

describe('engine core (mocked ort): EP choice, env, release after the run', () => {
  it('wasm: threads only when crossOriginIsolated, capped; the session is released and the tensors disposed', async () => {
    const { ort, log, env } = fakeOrt();
    const created = vi.fn();
    const r = await runOnce(req('wasm'), coreEnv(ort, { onCreated: created }));
    expect(new Float32Array(r.mask)[0]).toBe(0.25);
    expect(env.wasm.numThreads).toBe(8);
    expect(env.wasm.wasmBinary).toBeInstanceOf(ArrayBuffer);
    expect(env.wasm.wasmPaths).toBe('http://x/vendor/onnxruntime-web/1.30.0/');
    expect(env.wasm.proxy).toBe(false);
    expect(created).toHaveBeenCalledOnce();
    expect(log).toEqual(['create:["wasm"]', 'tensor:1x3x512x512', 'run:input_image', 'dispose', 'dispose', 'release']);
    expect(threadCount(false, 16, 8)).toBe(1);
    expect(threadCount(true, 2, 8)).toBe(2);
  });

  it('webgpu: the adapter is handed to ort; no adapter in the worker is a session-stage failure (falls back)', async () => {
    const { ort, env } = fakeOrt();
    const adapter = { name: 'gpu' };
    await runOnce(req('webgpu'), coreEnv(ort, { adapter: async () => adapter }));
    expect(env.webgpu!.adapter).toBe(adapter);
    await expect(runOnce(req('webgpu'), coreEnv(fakeOrt().ort, { adapter: async () => null }))).rejects.toMatchObject({ stage: 'session' });
  });

  it('stages: script load -> runtime, create -> session, run or a wrong output -> run (always released)', async () => {
    await expect(runOnce(req('wasm'), coreEnv(fakeOrt().ort, { importOrt: () => Promise.reject(new Error('404')) }))).rejects.toMatchObject({ stage: 'runtime' });
    await expect(runOnce(req('wasm'), coreEnv(fakeOrt({ createFails: true }).ort))).rejects.toMatchObject({ stage: 'session' });
    const run = fakeOrt({ runFails: true });
    await expect(runOnce(req('wasm'), coreEnv(run.ort))).rejects.toBeInstanceOf(StageError);
    expect(run.log.at(-1)).toBe('release');
    await expect(runOnce(req('wasm'), coreEnv(fakeOrt({ outLength: 10 }).ort))).rejects.toMatchObject({ stage: 'run' });
  });
});

class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  terminated = false;
  posted: unknown[] = [];
  transfer: Transferable[] = [];
  postMessage(m: RunRequest, transfer: Transferable[]): void {
    this.posted.push(m);
    this.transfer = transfer;
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe('session: one worker per photo, terminated after its reply; WebGPU -> WASM fallback rule', () => {
  it('result: the mask comes back, the worker is terminated, the buffers were transferred', async () => {
    const w = new FakeWorker();
    const created = vi.fn();
    const run = runEngine(req('wasm'), () => w, created);
    expect(w.transfer).toHaveLength(3);
    w.reply({ type: 'created', createMs: 5 });
    expect(created).toHaveBeenCalledOnce();
    w.reply({ type: 'result', mask: new Float32Array([0.5]).buffer, backend: 'wasm', createMs: 5, runMs: 7 });
    const r = await run.result;
    expect(r.mask[0]).toBe(0.5);
    expect(w.terminated).toBe(true);
  });

  it('errors: a stage error, a worker crash and 취소 all reject with EngineError and terminate the worker', async () => {
    const w1 = new FakeWorker();
    const r1 = runEngine(req('webgpu'), () => w1);
    w1.reply({ type: 'error', stage: 'session', message: 'no adapter' });
    const e1 = await r1.result.catch((e) => e);
    expect(e1).toMatchObject({ stage: 'session', backend: 'webgpu' });
    expect(shouldFallBack(e1)).toBe(true);
    expect(w1.terminated).toBe(true);

    const w2 = new FakeWorker();
    const r2 = runEngine(req('webgpu'), () => w2);
    w2.onerror?.({ message: 'boom', preventDefault: () => undefined } as ErrorEvent);
    expect(await r2.result.catch((e) => e)).toMatchObject({ stage: 'crash' });

    const w3 = new FakeWorker();
    const r3 = runEngine(req('wasm'), () => w3);
    r3.cancel();
    const e3 = await r3.result.catch((e) => e);
    expect(e3).toBeInstanceOf(EngineError);
    expect(shouldFallBack(e3)).toBe(false);
    expect(w3.terminated).toBe(true);
    // A WASM failure or a runtime-script failure never falls back.
    expect(shouldFallBack(new EngineError('runtime', 'webgpu', 'x'))).toBe(false);
    expect(shouldFallBack(new EngineError('run', 'wasm', 'x'))).toBe(false);
  });

  it('pickBackend: webgpu only with an adapter; never throws', async () => {
    expect(await pickBackend(undefined)).toBe('wasm');
    expect(await pickBackend({})).toBe('wasm');
    expect(await pickBackend({ gpu: { requestAdapter: async () => null } })).toBe('wasm');
    expect(await pickBackend({ gpu: { requestAdapter: async () => ({}) } })).toBe('webgpu');
    expect(await pickBackend({ gpu: { requestAdapter: () => Promise.reject(new Error('x')) } })).toBe('wasm');
  });
});

// ---------- guard, state, copy, limits ----------

function mem(): GuardStorage & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

describe('guard (face-guard pattern): a marker left by a crashed attempt halves the work size for the tab', () => {
  it('mark -> crash -> reload: message once, then half size; a finished attempt leaves nothing', () => {
    const s = mem();
    expect(takeCrash(s)).toBe(false);
    markAttempt(s);
    clearAttempt(s);
    expect(takeCrash(s)).toBe(false);
    expect(workEdge(s, 4096)).toBe(4096);
    markAttempt(s);
    expect(s.m.get(ATTEMPT_KEY)).toBe('1');
    expect(takeCrash(s)).toBe(true);
    expect(takeCrash(s)).toBe(false);
    expect(s.m.get(SMALL_KEY)).toBe('1');
    expect(workEdge(s, 4096)).toBe(2048);
    expect(workEdge(s, 2048)).toBe(1024);
  });

  it('blocked storage: no crash memory, nothing throws', () => {
    const blocked: GuardStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => markAttempt(blocked)).not.toThrow();
    expect(takeCrash(blocked)).toBe(false);
    expect(workEdge(null, 2048)).toBe(2048);
  });
});

describe('page state (reducer)', () => {
  it('the brief path, the cached path, the fallback, and no jumps from a stale reply', () => {
    const path: Phase[] = ['opening', 'consent', 'downloading', 'loading-engine', 'working', 'done'];
    let p: Phase = 'empty';
    for (const n of path) p = move(p, n);
    expect(p).toBe('done');
    expect(move('opening', 'downloading')).toBe('downloading');
    expect(move('working', 'downloading')).toBe('downloading');
    expect(move('working', 'nosubject')).toBe('nosubject');
    expect(move('empty', 'done')).toBe('empty');
    expect(move('consent', 'done')).toBe('consent');
    for (const from of ['done', 'consent', 'downloading'] as Phase[]) expect(move(from, 'opening')).toBe('opening');
    expect(move('done', 'error')).toBe('error');
  });

  it('views: consent shows only its panel; the byte bar and 취소 only while downloading; the result only when done', () => {
    expect(view('consent')).toMatchObject({ consent: true, drop: false, progress: false, result: false });
    expect(view('downloading')).toMatchObject({ progress: true, bytes: true, cancel: true });
    expect(view('working')).toMatchObject({ progress: true, bytes: false, cancel: false });
    expect(view('done')).toMatchObject({ result: true, progress: false });
    expect(view('nosubject')).toMatchObject({ nosubject: true, result: false });
    expect(view('error')).toMatchObject({ drop: true });
  });
});

describe('copy and limits (brief: honest limits up front, plain words)', () => {
  const call = (k: string, v: unknown): string => {
    if (typeof v !== 'function') return String(v);
    if (k === 'nosubjectPaper' || k === 'saved') return (v as (s: string) => string)('이름');
    return (v as (...a: number[]) => string)(114 * 1048576, 1, 1);
  };
  const all = [FIT_LINE, ...Object.entries(COPY).map(([k, v]) => call(k, v))].join('\n');

  it('the brief lines; never a competitor or "remove.bg급"; no 업로드/서버/브라우저/메모리', () => {
    expect(FIT_LINE).toBe('증명사진·상품·반려동물·자동차 사진에 잘 맞아요. 유리나 투명한 물건, 여러 사람이 함께 나온 사진, 복잡한 배경은 잘 안 될 수 있어요.');
    expect(COPY.nosubject).toBe('사진에서 피사체를 찾지 못했어요. 피사체가 크게, 배경이 단순하게 나온 사진으로 해 보세요.');
    expect(COPY.nosubjectPaper('전자서명·도장 이미지 만들기')).toBe('종이에 찍힌 도장·서명·로고라면 전자서명·도장 이미지 만들기를 써 보세요.');
    expect(COPY.consent(114.5 * 1048576)).toBe('배경을 지우는 프로그램 114.5 MB를 한 번 받아요 (와이파이 권장).');
    expect(all).not.toMatch(/remove\.bg|업로드|서버|브라우저|메모리|네트워크/i);
    for (const t of TOOLS) expect(`${t.description}${t.faq.map((f) => f.a).join('')}`).not.toMatch(/remove\.bg/i);
  });

  it('first-time size rounded to 10 MB; file names and button labels per background and format', () => {
    expect(aboutMB(114.5 * 1048576)).toBe('약 110 MB');
    expect(COPY.firstTime(114.5 * 1048576)).toBe('처음 한 번 약 110 MB를 받아요.');
    expect(fileName('transparent', 'jpeg')).toBe('누끼.png');
    expect(fileName('white', 'jpeg')).toBe('누끼-흰배경.jpg');
    expect(fileName('blue', 'png')).toBe('누끼-파란배경.png');
    expect(saveLabel('transparent', 'jpeg')).toBe('PNG로 내려받기');
    expect(saveLabel('white', 'jpeg')).toBe('JPG로 내려받기');
    expect(BG_COLORS).toEqual({ white: '#FFFFFF', blue: '#3D6FD6' });
  });

  it('limits: 150 MP / 64 MP and the 4,096 / 2,048 work edge, every message with its number', () => {
    expect(LIMITS.desktop).toMatchObject({ maxPixels: 150_000_000, workEdge: 4096 });
    expect(LIMITS.mobile).toMatchObject({ maxPixels: 64_000_000, workEdge: 2048 });
    expect(checkDims(13_000, 12_000, 'desktop')).toContain('15,000만 화소(150 MP)');
    expect(checkDims(10_000, 7_000, 'mobile')).toContain('휴대폰에서는 6,400만 화소(64 MP)');
    expect(checkDims(20_000, 100, 'mobile')).toContain('16,384픽셀');
    expect(checkDims(4000, 3000, 'mobile')).toBeNull();
    expect(checkFileBytes(31 * 1048576, 'mobile')).toContain('30 MB');
  });

  it('tool entry: name = h1, 80–120 character description with the keywords; FAQ states the output size and links /stamp-signature/', () => {
    const t = BG_REMOVE_TOOL;
    expect(t.name).toBe(t.h1);
    expect(t.title).toBe('사진 배경 지우기·누끼 따기 무료 — 투명 PNG | 문서딱');
    const n = [...t.description].length;
    expect(n).toBeGreaterThanOrEqual(80);
    expect(n).toBeLessThanOrEqual(120);
    expect(t.description).toContain('배경 지우기');
    expect(t.description).toContain('누끼 따기');
    expect(t.faq.map((f) => f.a).join()).toContain('4,096픽셀');
    expect(t.faq.flatMap((f) => f.links ?? []).map((l) => l.href)).toContain('/stamp-signature/');
    // With the flag on (eight tools) the home description still fits 80–120 characters.
    const d = defaultDescription([...TOOLS, t]);
    expect([...d].length).toBeLessThanOrEqual(120);
    expect([...d].length).toBeGreaterThanOrEqual(80);
    expect(d).toContain(t.name);
  });
});

describe('release flag and build wiring (PUBLIC_BG_REMOVE)', () => {
  it('flag: only "1" turns it on; the default is off', () => {
    expect(bgRemoveOn(undefined)).toBe(false);
    expect(bgRemoveOn('')).toBe(false);
    expect(bgRemoveOn('0')).toBe(false);
    expect(bgRemoveOn(' 1 ')).toBe(true);
    // vitest builds the shipping default: the tool is not in TOOLS.
    expect(TOOLS.some((t) => t.slug === 'remove-background')).toBe(false);
  });

  it('headers: COEP require-corp on the page and its worker scripts only, nothing when off', () => {
    expect(bgRemoveHeaders(false)).toBe('');
    const h = bgRemoveHeaders(true);
    expect(COEP_PATHS).toEqual(['/remove-background/*', '/_astro/infer.worker*', '/_astro/fusion.worker*', '/vendor/onnxruntime-web/*']);
    for (const p of COEP_PATHS) expect(h).toContain(`${p}\n  Cross-Origin-Embedder-Policy: require-corp\n`);
    expect(h).not.toMatch(/^\/\*$/m);
  });

  it('service worker: the model and runtime go to the network; the page is never precached', () => {
    const o = 'https://docttak.com';
    const r = (path: string) => route({ method: 'GET', url: `${o}${path}`, mode: 'cors' }, o);
    expect(NETWORK_PREFIXES).toEqual(['/vendor/birefnet-lite-512/', '/vendor/onnxruntime-web/']);
    expect(r('/vendor/birefnet-lite-512/aa62cd87-ce158794/model.part0')).toBe('default');
    expect(r('/vendor/onnxruntime-web/1.30.0/ort.webgpu.min.mjs')).toBe('default');
    expect(r('/vendor/pdfjs/6.3.289/pdf.worker.min.mjs')).toBe('runtime');
    expect(NOT_PRECACHED('/remove-background/')).toBe(true);
    expect(NOT_PRECACHED('/stamp-signature/')).toBe(false);
  });

  it('licences: the bgremove entries are judged only when they ship; the share image only with the flag', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'licenses.manifest.json'), 'utf8'));
    const bg = manifest.packages.filter((e: { bgremove?: boolean }) => e.bgremove);
    expect(bg.map((e: { name?: string; component?: string }) => e.name ?? e.component)).toEqual(['onnxruntime-web', expect.stringContaining('BiRefNet_lite')]);
    expect(componentProblems(manifest, { autoframe: false, bgremove: true }).problems).toEqual([]);
    const ort = bg[0];
    expect(ort.localFiles).toEqual(['licenses/third-party/onnxruntime/LICENSE', 'licenses/third-party/onnxruntime/ThirdPartyNotices.txt']);
    expect(ort.use).toContain('f2c39fe2f838cf35ce7da92824f5a5e3ee6e88a7');
    expect(readFileSync(join(ROOT, 'licenses', 'third-party', 'birefnet', 'LICENSE'), 'utf8')).toContain('Copyright (c) 2024 ZhengPeng');
    const off = Object.keys(renderBrand('docttak.com') as Record<string, unknown>);
    const on = Object.keys(renderBrand('docttak.com', { bgRemove: true }) as Record<string, unknown>);
    expect(off).not.toContain('brand/og-remove-background.png');
    expect(on).toContain('brand/og-remove-background.png');
  });
});
