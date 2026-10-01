// Message handling of the ink worker (Sprint C, C1), kept apart from the worker global so unit tests drive it.
// One photo per worker: `load` transfers the work copy once; each control change sends `run` with the options
// only, and the paper planes are reused from the cache (the photo does not change, the controls do).
import { processInk, type InkCache, type InkStatus, type ProcessOptions, type Rect } from './key';

export type InkRequest = { type: 'load'; pixels: ArrayBuffer; width: number; height: number } | { type: 'run'; run: number; opts: ProcessOptions };

export type InkResponse =
  | { type: 'loaded'; width: number; height: number }
  | {
      type: 'result';
      run: number;
      status: InkStatus;
      guess: 'red' | 'black';
      inkShare: number;
      rect: Rect | null;
      /** Straight RGBA of the cropped, sized PNG content; null when there is nothing to download. */
      out: { pixels: ArrayBuffer; width: number; height: number } | null;
      fileName: string;
      ms: number;
    }
  | { type: 'error'; run: number | null; code: 'noimage' | 'engine' };

export interface Reply {
  msg: InkResponse;
  transfer: Transferable[];
}

export function createInkHandler(now: () => number = () => performance.now()): (req: InkRequest) => Reply {
  let img: { data: Uint8ClampedArray; width: number; height: number } | null = null;
  let cache: InkCache = {};
  return (req) => {
    if (req.type === 'load') {
      img = { data: new Uint8ClampedArray(req.pixels), width: req.width, height: req.height };
      cache = {};
      return { msg: { type: 'loaded', width: req.width, height: req.height }, transfer: [] };
    }
    if (!img) return { msg: { type: 'error', run: req.run, code: 'noimage' }, transfer: [] };
    try {
      const t0 = now();
      const r = processInk(img, req.opts, cache);
      const ms = Math.round(now() - t0);
      const out = r.out ? { pixels: r.out.data.buffer as ArrayBuffer, width: r.out.width, height: r.out.height } : null;
      return {
        msg: { type: 'result', run: req.run, status: r.status, guess: r.guess, inkShare: r.inkShare, rect: r.rect, out, fileName: r.fileName, ms },
        transfer: out ? [out.pixels] : [],
      };
    } catch {
      // Out of memory or any engine failure: the page shows the engine error with 다시 시도.
      return { msg: { type: 'error', run: req.run, code: 'engine' }, transfer: [] };
    }
  };
}
