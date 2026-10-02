// The inference worker's core (Sprint C, C2; brief Flow "runtime" and Arch ruling 6). One photo per worker: the
// worker imports onnxruntime-web from /vendor/ (never bundled), creates the session from the model bytes, runs once,
// copies the mask out, disposes the tensors and releases the session; the page then terminates the worker, which
// frees the whole engine (WebAssembly memory never shrinks while its module lives, so a terminated worker is the
// only real release).
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

export interface RunRequest {
  type: 'run';
  backend: Backend;
  /** The engine script (ort.webgpu.min.mjs or ort.wasm.min.mjs) and its directory. */
  ortUrl: string;
  ortBase: string;
  wasm: ArrayBuffer;
  model: ArrayBuffer;
  /** 3×512×512 float32 (toInput). */
  input: ArrayBuffer;
  /** Upper bound for WASM threads (used only when crossOriginIsolated). */
  maxThreads: number;
}

export type Stage = 'runtime' | 'session' | 'run';

export type RunResponse =
  | { type: 'created'; createMs: number }
  | { type: 'result'; mask: ArrayBuffer; backend: Backend; createMs: number; runMs: number }
  | { type: 'error'; stage: Stage; message: string };

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
  /** Called once the session exists (the page then says "배경을 지우는 중"). */
  onCreated?: (createMs: number) => void;
}

const msg = (err: unknown): string => String((err as Error)?.message ?? err);

/** Threads for the WASM engine: 1 without crossOriginIsolated (no SharedArrayBuffer), else up to `max`. */
export function threadCount(coi: boolean, cores: number, max: number): number {
  if (!coi) return 1;
  return Math.max(1, Math.min(cores || 1, max));
}

/** Runs the model once on `req.input`; the mask is a fresh 512×512 float32 buffer (transferable). */
export async function runOnce(req: RunRequest, env: CoreEnv): Promise<Extract<RunResponse, { type: 'result' }>> {
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
  // Only errors: the graph optimiser warns about every int64 shape node it leaves to the CPU (thousands of lines).
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
  let session: SessionLike;
  try {
    session = await ort.InferenceSession.create(new Uint8Array(req.model), { executionProviders: [req.backend], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
  } catch (err) {
    throw new StageError('session', `session create failed: ${msg(err)}`);
  }
  const t1 = env.now();
  env.onCreated?.(t1 - t0);
  const input = new ort.Tensor('float32', new Float32Array(req.input), [1, 3, SIZE, SIZE]);
  let out: Record<string, TensorLike> | null = null;
  try {
    out = await session.run({ [session.inputNames[0]!]: input });
    const y = out[session.outputNames[0]!];
    const data = y ? await y.getData() : null;
    if (!(data instanceof Float32Array) || data.length !== SIZE * SIZE) throw new Error('unexpected output');
    // A copy that owns its buffer (the tensor's may be a view into the engine's memory).
    const mask = new Float32Array(data);
    return { type: 'result', mask: mask.buffer, backend: req.backend, createMs: t1 - t0, runMs: env.now() - t1 };
  } catch (err) {
    throw err instanceof StageError ? err : new StageError('run', `run failed: ${msg(err)}`);
  } finally {
    input.dispose();
    if (out) for (const t of Object.values(out)) t.dispose();
    await session.release().catch(() => undefined);
  }
}
