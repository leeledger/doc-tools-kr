// The inference worker's core (Sprint C, C2; brief Flow "runtime"; Arch round 2 ruling 2). The worker imports
// onnxruntime-web from /vendor/ (never bundled) and creates ONE session from the model bytes ('init'); each photo is a
// 'run' on that session, whose input and output tensors are disposed right after the mask is copied out. The page
// keeps the worker while the user is on it and terminates it on idle, hidden, crash, or after every photo on
// low-memory devices (session.ts): WebAssembly memory never shrinks while its module lives, so a terminated worker is
// the only real release of the engine.
// - 'webgpu': the native WebGPU build (ort.webgpu.min.mjs) with the asyncify wasm handed over as env.wasm.wasmBinary.
// - 'wasm': the plain WASM build, threads when this worker is crossOriginIsolated.
// JSEP builds are never used (spike: 0.64 mask error). Pure apart from the injected `ort` and adapter, for the tests.
import type { Backend } from './assets';
import { SIZE } from './infer';

export interface TensorLike {
  getData(): Promise<unknown>;
  dispose(): void;
}

export interface SessionLike {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  run(feeds: Record<string, TensorLike>): Promise<Record<string, TensorLike>>;
  release(): Promise<void>;
}

export interface OrtLike {
  env: {
    wasm: { wasmPaths?: unknown; wasmBinary?: unknown; numThreads?: number; proxy?: boolean };
    webgpu?: { adapter?: unknown; powerPreference?: string };
    logLevel?: string;
  };
  InferenceSession: { create(model: Uint8Array, options: Record<string, unknown>): Promise<SessionLike> };
  Tensor: new (type: 'float32', data: Float32Array, dims: readonly number[]) => TensorLike;
}

/**
 * Session graph optimisation. The model is pre-optimised offline (onnxsim, export.py), so ORT's own level matters
 * little; OPT_LEVEL is the faster-creating one measured at C2 round 2 (BUILD-LOG).
 */
export type OptLevel = 'all' | 'basic' | 'disabled';
export const OPT_LEVEL: OptLevel = 'basic';

/**
 * WebGPU EP storage-buffer cache (onnxruntime-web 1.30 option), pinned to 'bucket' (ORT's default pooling). Measured
 * at C2 round 2 with the session kept, 12 MP photos: 'disabled' peaked lower (2.18 GB) but took 2.7–2.9 s per photo,
 * 'simple' peaked at 2.97 GB, 'lazyRelease' was no better than 'bucket' (BUILD-LOG). Memory stays flat with 'bucket'
 * because the fusion step was made smaller.
 */
export type GpuCacheMode = 'disabled' | 'lazyRelease' | 'simple' | 'bucket';
export const GPU_BUFFER_CACHE: GpuCacheMode = 'bucket';

export interface InitRequest {
  type: 'init';
  backend: Backend;
  /** The engine script (ort.webgpu.min.mjs or ort.wasm.min.mjs) and its directory. */
  ortUrl: string;
  ortBase: string;
  wasm: ArrayBuffer;
  model: ArrayBuffer;
  /** Upper bound for WASM threads (used only when crossOriginIsolated). */
  maxThreads: number;
  /** Measurement overrides (regress harness); the page always sends OPT_LEVEL and GPU_BUFFER_CACHE. */
  optLevel?: OptLevel;
  gpuCache?: GpuCacheMode;
}

export interface RunRequest {
  type: 'run';
  id: number;
  /** 3×512×512 float32 (toInput). */
  input: ArrayBuffer;
}

export type WorkerRequest = InitRequest | RunRequest;

export type Stage = 'runtime' | 'session' | 'run';

export type WorkerResponse =
  | { type: 'ready'; backend: Backend; createMs: number }
  | { type: 'result'; id: number; mask: ArrayBuffer; runMs: number }
  | { type: 'error'; stage: Stage; id?: number; message: string };

export class StageError extends Error {
  constructor(
    readonly stage: Stage,
    message: string,
  ) {
    super(message);
    this.name = 'StageError';
  }
}

export interface CoreEnv {
  importOrt: (url: string) => Promise<OrtLike>;
  /** navigator.gpu.requestAdapter(), or null when there is no WebGPU here. */
  adapter: () => Promise<unknown | null>;
  crossOriginIsolated: boolean;
  hardwareConcurrency: number;
  now: () => number;
}

const msg = (err: unknown): string => String((err as Error)?.message ?? err);

/** Threads for the WASM engine: 1 without crossOriginIsolated (no SharedArrayBuffer), else up to `max`. */
export function threadCount(coi: boolean, cores: number, max: number): number {
  if (!coi) return 1;
  return Math.max(1, Math.min(cores || 1, max));
}

export interface Engine {
  ort: OrtLike;
  session: SessionLike;
  backend: Backend;
}

/** Imports the engine and creates the session ('init'). The model buffer is dropped by the caller afterwards. */
export async function createEngine(req: InitRequest, env: CoreEnv): Promise<{ engine: Engine; createMs: number }> {
  let ort: OrtLike;
  try {
    ort = await env.importOrt(req.ortUrl);
  } catch (err) {
    throw new StageError('runtime', `engine script did not load: ${msg(err)}`);
  }
  ort.env.wasm.wasmPaths = req.ortBase;
  ort.env.wasm.wasmBinary = req.wasm;
  ort.env.wasm.numThreads = threadCount(env.crossOriginIsolated, env.hardwareConcurrency, req.maxThreads);
  ort.env.wasm.proxy = false;
  // Only errors: the graph optimiser can warn about every node it leaves to the CPU.
  ort.env.logLevel = 'error';
  if (req.backend === 'webgpu') {
    let adapter: unknown | null = null;
    try {
      adapter = await env.adapter();
    } catch {
      adapter = null;
    }
    if (!adapter) throw new StageError('session', 'no WebGPU adapter in the worker');
    if (ort.env.webgpu) ort.env.webgpu.adapter = adapter;
  }
  const t0 = env.now();
  try {
    const session = await ort.InferenceSession.create(new Uint8Array(req.model), {
      executionProviders: [req.backend === 'webgpu' ? { name: 'webgpu', storageBufferCacheMode: req.gpuCache ?? GPU_BUFFER_CACHE } : 'wasm'],
      graphOptimizationLevel: req.optLevel ?? OPT_LEVEL,
      logSeverityLevel: 3,
    });
    return { engine: { ort, session, backend: req.backend }, createMs: env.now() - t0 };
  } catch (err) {
    throw new StageError('session', `session create failed: ${msg(err)}`);
  }
}

/** One photo on a live session; the input and output tensors are disposed before returning. */
export async function runEngineOnce(engine: Engine, input: ArrayBuffer, now: () => number): Promise<{ mask: ArrayBuffer; runMs: number }> {
  const { ort, session } = engine;
  const t0 = now();
  const x = new ort.Tensor('float32', new Float32Array(input), [1, 3, SIZE, SIZE]);
  let out: Record<string, TensorLike> | null = null;
  try {
    out = await session.run({ [session.inputNames[0]!]: x });
    const y = out[session.outputNames[0]!];
    const data = y ? await y.getData() : null;
    if (!(data instanceof Float32Array) || data.length !== SIZE * SIZE) throw new Error('unexpected output');
    // A copy that owns its buffer (the tensor's may be a view into the engine's memory).
    return { mask: new Float32Array(data).buffer, runMs: now() - t0 };
  } catch (err) {
    throw new StageError('run', `run failed: ${msg(err)}`);
  } finally {
    x.dispose();
    if (out) for (const t of Object.values(out)) t.dispose();
  }
}

/**
 * The worker's message handler: 'init' once, then any number of 'run'. Replies go to `post` (with the mask buffer
 * as transferable). A second 'init' replaces nothing: the page starts a new worker instead.
 */
export function createHandler(env: CoreEnv, post: (m: WorkerResponse, transfer?: Transferable[]) => void): (m: WorkerRequest) => Promise<void> {
  let engine: Engine | null = null;
  return async (m) => {
    if (m.type === 'init') {
      if (engine) return post({ type: 'error', stage: 'session', message: 'already initialised' });
      try {
        const r = await createEngine(m, env);
        engine = r.engine;
        post({ type: 'ready', backend: m.backend, createMs: r.createMs });
      } catch (err) {
        post({ type: 'error', stage: err instanceof StageError ? err.stage : 'session', message: msg(err) });
      }
      return;
    }
    if (!engine) return post({ type: 'error', stage: 'run', id: m.id, message: 'no session' });
    try {
      const r = await runEngineOnce(engine, m.input, env.now);
      post({ type: 'result', id: m.id, mask: r.mask, runMs: r.runMs }, [r.mask]);
    } catch (err) {
      post({ type: 'error', stage: 'run', id: m.id, message: msg(err) });
    }
  };
}
