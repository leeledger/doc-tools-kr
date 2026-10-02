// 배경 지우기 engine choice and the engine worker (Sprint C, C2; brief Flow "runtime"; Arch round 2 ruling 2).
// - WebGPU when navigator.gpu gives an adapter; otherwise the plain WASM build.
// - One worker holds one session for as long as the page keeps it (startEngine -> run, run, … -> dispose). The page
//   disposes it after 2 minutes idle, after 60 s hidden, on pagehide and on a crash; low-memory devices
//   (keepEngine false) dispose it after every photo. Disposing terminates the worker, which frees the whole engine.
// - A WebGPU failure at session create or run (no adapter in the worker, adapter lost, kernel error) falls back to
//   WASM once; the caller downloads the WASM runtime if needed and starts again. A WASM failure is final.
import type { Backend } from './assets';
import type { InitRequest, Stage, WorkerRequest, WorkerResponse } from './infer-core';

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

/** Arch round 2: keep the session between photos unless the device is low on memory. */
export const LOW_MEMORY_GB = 4;
/** Disposed after this long without a photo. */
export const IDLE_MS = 2 * 60 * 1000;
/** Disposed after the page has been hidden this long. */
export const HIDDEN_MS = 60 * 1000;

export interface DeviceInfo {
  deviceMemory?: number | undefined;
  userAgent: string;
  platform?: string | undefined;
  maxTouchPoints?: number | undefined;
}

/** iPhone, iPod, iPad (also iPadOS, which reports itself as a Mac with touch). */
export function isIOS(d: DeviceInfo): boolean {
  return /iPhone|iPad|iPod/.test(d.userAgent) || (d.platform === 'MacIntel' && (d.maxTouchPoints ?? 0) > 1);
}

/**
 * False (dispose the engine after every photo) when navigator.deviceMemory ≤ 4 GB, or when it is unknown on iOS
 * (Safari never reports it). Everywhere else the session stays between photos.
 */
export function keepEngine(d: DeviceInfo): boolean {
  if (typeof d.deviceMemory === 'number') return d.deviceMemory > LOW_MEMORY_GB;
  return !isIOS(d);
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
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(m: WorkerRequest, transfer: Transferable[]): void;
  terminate(): void;
}

export interface EngineHandle {
  readonly backend: Backend;
  readonly createMs: number;
  /** One photo; the input buffer is transferred (the caller's copy becomes empty). */
  run(input: Float32Array): Promise<{ mask: Float32Array; runMs: number }>;
  /** Terminates the worker; pending runs reject with stage 'crash'. Safe to call twice. */
  dispose(): void;
  readonly disposed: boolean;
}

export interface StartedEngine {
  ready: Promise<EngineHandle>;
  /** Stops the start (the worker is terminated; `ready` rejects with stage 'crash'). */
  cancel(): void;
}

/**
 * Starts a worker and creates the session ('init'; the wasm and model buffers are transferred). `onLost` is called
 * once if the worker dies after it was ready (a crash), so the page can forget the engine.
 */
export function startEngine(req: InitRequest, createWorker: () => WorkerLike, onLost?: (e: EngineError) => void): StartedEngine {
  let worker: WorkerLike | null = null;
  let disposed = false;
  let handle: EngineHandle | null = null;
  let next = 0;
  const pending = new Map<number, { resolve: (r: { mask: Float32Array; runMs: number }) => void; reject: (e: EngineError) => void }>();
  let failStart: ((e: EngineError) => void) | null = null;

  const kill = (e: EngineError): void => {
    if (disposed) return;
    disposed = true;
    worker?.terminate();
    worker = null;
    failStart?.(e);
    failStart = null;
    for (const p of pending.values()) p.reject(e);
    pending.clear();
  };

  const ready = new Promise<EngineHandle>((resolve, reject) => {
    failStart = reject;
    try {
      worker = createWorker();
    } catch (err) {
      kill(new EngineError('runtime', req.backend, `worker did not start: ${String(err)}`));
      return;
    }
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'ready') {
        failStart = null;
        handle = {
          backend: req.backend,
          createMs: m.createMs,
          get disposed() {
            return disposed;
          },
          run: (input) =>
            new Promise((res, rej) => {
              if (disposed || !worker) return rej(new EngineError('crash', req.backend, 'engine disposed'));
              const id = ++next;
              pending.set(id, { resolve: res, reject: rej });
              const buf = input.buffer as ArrayBuffer;
              worker.postMessage({ type: 'run', id, input: buf }, [buf]);
            }),
          dispose: () => kill(new EngineError('crash', req.backend, 'disposed')),
        };
        resolve(handle);
      } else if (m.type === 'result') {
        const p = pending.get(m.id);
        pending.delete(m.id);
        p?.resolve({ mask: new Float32Array(m.mask), runMs: m.runMs });
      } else if (m.id !== undefined) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        p?.reject(new EngineError(m.stage, req.backend, m.message));
      } else kill(new EngineError(m.stage, req.backend, m.message));
    };
    worker.onerror = (ev) => {
      ev.preventDefault?.();
      // The worker script itself failed (did not load, or the engine crashed it).
      const e = new EngineError('crash', req.backend, ev.message || 'worker error');
      const wasReady = handle !== null && !disposed;
      kill(e);
      if (wasReady) onLost?.(e);
    };
    worker.postMessage(req, [req.wasm, req.model]);
  });
  return { ready, cancel: () => kill(new EngineError('crash', req.backend, 'cancelled')) };
}

export interface TimerApi {
  set: (fn: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
}

export interface DisposeTimers {
  /** An engine start or a run begins: the idle timer stops, and neither timer may dispose until `done`. */
  begin(): void;
  /** That start or run is over: dispose now if the page stayed hidden past HIDDEN_MS meanwhile, else re-arm idle. */
  done(): void;
  /** visibilitychange. */
  hidden(): void;
  visible(): void;
  /** Stops both timers (the engine was disposed for another reason). */
  stop(): void;
}

/**
 * When the kept engine is disposed (Arch round 2; Richard C2 Must Fix): after IDLE_MS without a photo, or after
 * HIDDEN_MS hidden, but never while an engine start or a run is in flight. A hidden timeout that fires mid-run is
 * remembered and acted on when the run ends, if the page is still hidden. Pure apart from the injected timers.
 */
export function disposeTimers(dispose: () => void, t: TimerApi = { set: (f, ms) => setTimeout(f, ms), clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) }): DisposeTimers {
  let idle: unknown;
  let hide: unknown;
  let busy = 0;
  let isHidden = false;
  let hiddenExpired = false;
  const clearIdle = (): void => {
    if (idle !== undefined) t.clear(idle);
    idle = undefined;
  };
  const clearHide = (): void => {
    if (hide !== undefined) t.clear(hide);
    hide = undefined;
  };
  const fire = (): void => {
    clearIdle();
    clearHide();
    hiddenExpired = false;
    dispose();
  };
  return {
    begin() {
      busy++;
      clearIdle();
    },
    done() {
      busy = Math.max(0, busy - 1);
      if (busy) return;
      if (hiddenExpired && isHidden) return fire();
      hiddenExpired = false;
      clearIdle();
      idle = t.set(() => (busy ? undefined : fire()), IDLE_MS);
    },
    hidden() {
      isHidden = true;
      clearHide();
      hide = t.set(() => {
        hide = undefined;
        if (busy) hiddenExpired = true;
        else fire();
      }, HIDDEN_MS);
    },
    visible() {
      isHidden = false;
      hiddenExpired = false;
      clearHide();
    },
    stop() {
      clearIdle();
      clearHide();
      hiddenExpired = false;
    },
  };
}
