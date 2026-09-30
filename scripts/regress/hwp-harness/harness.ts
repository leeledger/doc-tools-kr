// regress:hwp harness page (served by Vite from scripts/regress/hwp.mjs; never part of dist/). Runs the
// production worker (src/lib/hwp/hwp.worker.ts: scan, rhwp, svg-string) and the production PDF export
// (src/lib/hwp/pdf/export.ts: svg-dom post-processing, the vector writer, the raster fallback, the same-origin
// font source) on one file, always exporting every page (routing is recorded, not obeyed). Returns the PDF as
// base64 with the export stats; the time `ms.ready` is open → PDF bytes, as the user waits for it.
import type { HwpResponse } from '../../../src/lib/hwp/hwp.worker';
import { danglingRefs, parsePageSvg } from '../../../src/lib/hwp/svg-dom';
import { route } from '../../../src/lib/hwp/route';
import { exportPdf } from '../../../src/lib/hwp/pdf/export';

type Msg = HwpResponse;

interface Result {
  ok: boolean;
  error?: string;
  format?: string;
  pages?: number;
  equations?: number;
  textboxes?: number;
  imageBytes?: number;
  wasmBytes?: number;
  measureCalls?: number;
  dangling?: number;
  parseErrors?: string[];
  stats?: Awaited<ReturnType<typeof exportPdf>>['stats'];
  pdf?: string;
  heapPeakMB?: number | null;
  route?: { desktop: ReturnType<typeof route>; mobile: ReturnType<typeof route> };
  ms?: { engine: number; parse: number; export: number; ready: number; inspect: number };
}

const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

async function run(url: string): Promise<Result> {
  const bytes = await (await fetch(url)).arrayBuffer();
  const fileBytes = bytes.byteLength;
  let heapPeak = 0;
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  const sample = (): void => {
    if (memory) heapPeak = Math.max(heapPeak, memory.usedJSHeapSize);
  };
  const timer = setInterval(sample, 100);
  const t0 = performance.now();
  const w = new Worker(new URL('../../../src/lib/hwp/hwp.worker.ts', import.meta.url), { type: 'module' });
  const queue: Msg[] = [];
  let wake: (() => void) | null = null;
  let crashed: string | null = null;
  w.onmessage = (e: MessageEvent<Msg>) => {
    queue.push(e.data);
    wake?.();
  };
  w.onerror = (e) => {
    e.preventDefault();
    crashed = e.message || 'worker error';
    wake?.();
  };
  const next = async (): Promise<Msg> => {
    for (;;) {
      if (queue.length) return queue.shift()!;
      if (crashed) throw new Error(`worker crashed: ${crashed}`);
      await new Promise<void>((r) => (wake = r));
      wake = null;
    }
  };
  const until = async <T extends Msg['type']>(type: T): Promise<Extract<Msg, { type: T }>> => {
    for (;;) {
      const m = await next();
      if (m.type === 'error') throw new Error(`worker error ${m.code}`);
      if (m.type === type) return m as Extract<Msg, { type: T }>;
    }
  };
  try {
    w.postMessage({ type: 'open', bytes }, [bytes]);
    const scanned = await until('scanned');
    let tEngine = 0;
    let parsed: Extract<Msg, { type: 'parsed' }> | null = null;
    for (;;) {
      const m = await next();
      if (m.type === 'error') throw new Error(`worker error ${m.code}`);
      if (m.type === 'progress' && m.phase === 'parse') tEngine = performance.now();
      if (m.type === 'parsed') {
        parsed = m;
        break;
      }
    }
    const tParse = performance.now();
    let measureCalls = parsed.measureCalls;
    let dangling = 0;
    let inspect = 0;
    const parseErrors: string[] = [];
    const { blob, stats } = await exportPdf({
      infos: parsed.pageInfos,
      getPage: async (i) => {
        w.postMessage({ type: 'render', i });
        const p = await until('page');
        measureCalls = Math.max(measureCalls, p.measureCalls);
        // Harness-only checks, timed separately (not part of the user's wait).
        const a = performance.now();
        if (!p.failed) {
          const one = parsePageSvg(p.svg);
          if (one.svg) dangling += danglingRefs(one.svg);
          else if (parseErrors.length < 3) {
            const d = new DOMParser().parseFromString(p.svg, 'image/svg+xml');
            parseErrors.push(`p${p.i + 1}: ${(d.getElementsByTagName('parsererror')[0]?.textContent ?? '').slice(0, 160)}`);
          }
        }
        inspect += performance.now() - a;
        sample();
        return p;
      },
    });
    const tDone = performance.now();
    w.terminate();
    clearInterval(timer);
    const out = new Uint8Array(await blob.arrayBuffer());
    const common = { fileBytes, pages: parsed.pages, wasmBytes: parsed.wasmBytes, imageBytes: scanned.imageBytes, textboxes: scanned.textboxes };
    return {
      ok: true,
      format: scanned.format,
      pages: parsed.pages,
      equations: scanned.equations,
      textboxes: scanned.textboxes,
      imageBytes: scanned.imageBytes,
      wasmBytes: parsed.wasmBytes,
      measureCalls,
      dangling,
      parseErrors,
      stats,
      pdf: b64(out),
      heapPeakMB: memory ? heapPeak / 1048576 : null,
      route: { desktop: route({ device: 'desktop', ...common }), mobile: route({ device: 'mobile', ...common }) },
      ms: { engine: tEngine - t0, parse: tParse - tEngine, export: tDone - tParse - inspect, ready: tDone - t0 - inspect, inspect },
    };
  } catch (err) {
    clearInterval(timer);
    w.terminate();
    return { ok: false, error: String(err instanceof Error ? `${err.message} ${err.stack?.split('\n').slice(0, 3).join(' | ')}` : err).slice(0, 500) };
  }
}

(window as unknown as { RUN: typeof run; READY: boolean }).RUN = run;
(window as unknown as { READY: boolean }).READY = true;
