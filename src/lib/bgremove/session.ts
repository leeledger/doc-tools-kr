// 배경 지우기 engine choice and the worker round trip (Sprint C, C2; brief Flow "runtime", failure rows "runtime").
// - WebGPU when navigator.gpu gives an adapter; otherwise the plain WASM build.
// - One worker per photo (infer-core.ts): it is terminated after its reply, so the session, its tensors and the
//   engine memory are gone before the next step (Arch ruling 6).
// - A WebGPU failure at session create or run (no adapter in the worker, adapter lost, kernel error) falls back to
//   WASM once; the caller downloads the WASM runtime if needed and calls runEngine again. A WASM failure is final.
import type { Backend } from './assets';
import type { RunRequest, RunResponse, Stage } from './infer-core';

export interface GpuNavigator {
  gpu?: { requestAdapter(o?: { powerPreference?: string }): Promise<unknown | null> };
}

/** 'webgpu' when an adapter is available here, else 'wasm'. Never throws. */
export async function pickBackend(nav: GpuNavigator | undefined = typeof navigator === 'undefined' ? undefined : (navigator as GpuNavigator)): Promise<Backend> {
  try {
    if (!nav?.gpu) return 'wasm';
    return (await nav.gpu.requestAdapter({ powerPreference: 'high-performance' })) ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}

export class EngineError extends Error {
  constructor(
    readonly stage: Stage | 'crash',
    readonly backend: Backend,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

/** True when this failure should be retried once on WASM. */
export const shouldFallBack = (err: unknown): boolean => err instanceof EngineError && err.backend === 'webgpu' && err.stage !== 'runtime';

export interface WorkerLike {
  onmessage: ((e: MessageEvent<RunResponse>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(m: RunRequest, transfer: Transferable[]): void;
  terminate(): void;
}

export interface EngineRun {
  result: Promise<{ mask: Float32Array; backend: Backend; createMs: number; runMs: number }>;
  /** Stops the run (the worker is terminated; the promise rejects with stage 'crash'). */
  cancel(): void;
}

/**
 * Sends one run to a fresh worker and terminates it when it answers, fails or is cancelled. The request's buffers
 * are transferred (the caller's copies become empty).
 */
export function runEngine(req: RunRequest, createWorker: () => WorkerLike, onCreated?: () => void): EngineRun {
  let worker: WorkerLike | null = null;
  let settle: ((e: EngineError) => void) | null = null;
  const result = new Promise<{ mask: Float32Array; backend: Backend; createMs: number; runMs: number }>((resolve, reject) => {
    const done = (): void => {
      worker?.terminate();
      worker = null;
      settle = null;
    };
    settle = (e) => {
      done();
      reject(e);
    };
    try {
      worker = createWorker();
    } catch (err) {
      settle(new EngineError('runtime', req.backend, `worker did not start: ${String(err)}`));
      return;
    }
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'created') onCreated?.();
      else if (m.type === 'result') {
        done();
        resolve({ mask: new Float32Array(m.mask), backend: m.backend, createMs: m.createMs, runMs: m.runMs });
      } else settle?.(new EngineError(m.stage, req.backend, m.message));
    };
    worker.onerror = (ev) => {
      ev.preventDefault?.();
      // The worker script itself failed (did not load, or the engine crashed it).
      settle?.(new EngineError('crash', req.backend, ev.message || 'worker error'));
    };
    worker.postMessage(req, [req.wasm, req.model, req.input]);
  });
  return {
    result,
    cancel: () => settle?.(new EngineError('crash', req.backend, 'cancelled')),
  };
}
