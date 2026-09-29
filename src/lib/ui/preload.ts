// Engine preload (brief Polish P.7). Never on idle alone: the first user signal on the page (pointer, touch,
// key, scroll, or focus inside the tool) plus idle starts it, so Lighthouse (which never interacts) measures
// the page exactly as before. A pointerdown on the picker or a dragenter on the drop zone starts it at once.
// Skipped on Save-Data and on 2G. A failure is silent; the real load then shows the engine panel if it fails
// again. A real load that starts while the preload runs awaits the same promise, so nothing is fetched twice.
import { EngineLoadError } from './engine-load';

export interface Preload {
  /** Starts the preload now (idempotent). Resolves when it finished or failed; never rejects. */
  start(): Promise<void>;
  /** The preload in flight, or null (not started, skipped, finished or failed). */
  pending(): Promise<void> | null;
  /**
   * The real engine load starts now: returns the preload in flight (await it; nothing is fetched twice), or
   * null, and a preload that has not started yet never starts (it would only fetch the same files again).
   */
  claim(): Promise<void> | null;
  /** True when the preload is skipped for this connection. */
  readonly skipped: boolean;
}

interface Connection {
  saveData?: boolean;
  effectiveType?: string;
}

export interface PreloadEnv {
  win?: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setTimeout'> & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  connection?: Connection | undefined;
}

export const SIGNALS = ['pointerdown', 'pointermove', 'touchstart', 'keydown', 'scroll'] as const;
export const IDLE_FALLBACK_MS = 1000;

export function preloadSkipped(c: Connection | undefined): boolean {
  return Boolean(c?.saveData) || c?.effectiveType === 'slow-2g' || c?.effectiveType === '2g';
}

export function schedulePreload(
  fn: () => Promise<unknown>,
  opts: { root: EventTarget; immediate?: EventTarget[]; dropZone?: EventTarget },
  env: PreloadEnv = {},
): Preload {
  const win = env.win ?? window;
  const connection = 'connection' in env ? env.connection : (navigator as Navigator & { connection?: Connection }).connection;
  const skipped = preloadSkipped(connection);
  let running: Promise<void> | null = null;
  let done = false;

  const start = (): Promise<void> => {
    if (skipped || done) return Promise.resolve();
    running ??= fn().then(
      () => {
        done = true;
        running = null;
      },
      () => {
        // Silent: the real load retries and shows the engine panel if it fails again.
        running = null;
      },
    );
    return running;
  };

  if (!skipped) {
    const idle = (): void => {
      if (win.requestIdleCallback) win.requestIdleCallback(() => void start(), { timeout: 3000 });
      else win.setTimeout(() => void start(), IDLE_FALLBACK_MS);
    };
    const onSignal = (): void => {
      for (const s of SIGNALS) win.removeEventListener(s, onSignal, true);
      opts.root.removeEventListener('focusin', onSignal);
      idle();
    };
    for (const s of SIGNALS) win.addEventListener(s, onSignal, { capture: true, passive: true });
    opts.root.addEventListener('focusin', onSignal);
    const now = (): void => void start();
    for (const el of opts.immediate ?? []) el.addEventListener('pointerdown', now);
    opts.dropZone?.addEventListener('dragenter', now);
  }

  const claim = (): Promise<void> | null => {
    if (!running) done = true;
    return running;
  };

  return { start, pending: () => running, claim, skipped };
}

/**
 * Warms a tool worker: it loads its lazy modules and wasm on {type:'warm'} and answers {type:'warm-done'};
 * then it is terminated. The HTTP cache and the service worker keep the bytes for the real run.
 */
export function warmWorker(create: () => Worker, timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = create();
    } catch (err) {
      reject(new EngineLoadError('warm worker could not start', { cause: err }));
      return;
    }
    const timer = setTimeout(() => finish(false), timeoutMs);
    const finish = (ok: boolean): void => {
      clearTimeout(timer);
      w.terminate();
      if (ok) resolve();
      else reject(new EngineLoadError('warm worker failed'));
    };
    w.onmessage = (ev: MessageEvent<{ type?: string }>) => {
      if (ev.data?.type === 'warm-done') finish(true);
      else if (ev.data?.type === 'error') finish(false);
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      finish(false);
    };
    w.postMessage({ type: 'warm' });
  });
}
