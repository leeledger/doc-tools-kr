/// <reference lib="webworker" />
// HWP PDF 변환 worker (brief Step 5 §2). One document per worker; cancel and reset terminate it.
// In:  {type:'open', bytes, inflateCap}  (the file's ArrayBuffer, transferred; the device's inflate cap)
//      {type:'render', i}    (one page; the page drives the order, so a cancel is a run token, not a restart)
//      {type:'close'}        (doc.free())
//      {type:'warm'}         (preload: answers at once; loading this script was the point, never the 10 MB wasm)
// Out: progress | scanned | parsed | page | error {code} | warm-done
// The scan runs before the engine loads, so a non-HWP, password or damaged file never downloads the wasm.
import init, { HwpDocument } from '@rhwp/core';
import { HwpError, type HwpErrorCode } from './errors';
import { openDocument, pageInfos, renderPage, type PageInfo, type RhwpDocument } from './engine';
import { scanFeatures, type Features } from './features';
import type { TextRun } from './svg-dom';
import { withEngineRetry } from '../ui/engine-load';
import { loadRhwpModule } from './wasm-browser';

export type HwpRequest = { type: 'open'; bytes: ArrayBuffer; inflateCap?: number } | { type: 'render'; i: number } | { type: 'close' } | { type: 'warm' };

export type HwpResponse =
  | { type: 'progress'; phase: 'engine'; loaded: number; total: number }
  | { type: 'progress'; phase: 'parse' }
  | { type: 'scanned'; format: Features['format']; equations: number; textboxes: number; imageBytes: number; distribution: boolean }
  | { type: 'parsed'; pages: number; pageInfos: PageInfo[]; wasmBytes: number; measureCalls: number }
  | { type: 'page'; i: number; svg: string; runs: TextRun[]; failed: boolean; measureCalls: number; ms: number }
  | { type: 'error'; code: HwpErrorCode }
  | { type: 'warm-done' };

declare const self: DedicatedWorkerGlobalScope;

// rhwp asks the host for text widths through globalThis.measureTextWidth; register it before init. Layout
// uses rhwp's internal metrics (the spike counted 0 calls on 120 files); the counter proves that per run.
let measureCalls = 0;
let measureCtx: OffscreenCanvasRenderingContext2D | null | undefined;
/** Wide (1 em) code points of the estimate: Hangul Jamo, CJK symbols to CJK ideographs, Hangul syllables, CJK
 * compatibility ideographs, fullwidth forms. Numeric ranges keep the source ASCII. */
const WIDE: [number, number][] = [
  [0x1100, 0x11ff],
  [0x3000, 0x9fff],
  [0xac00, 0xd7af],
  [0xf900, 0xfaff],
  [0xff00, 0xffef],
];
const isWide = (cp: number): boolean => WIDE.some(([a, b]) => cp >= a && cp <= b);
(globalThis as unknown as { measureTextWidth: (font: string, text: string) => number }).measureTextWidth = (font: string, text: string): number => {
  measureCalls++;
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1).getContext('2d') : null;
    } catch {
      measureCtx = null;
    }
  }
  if (measureCtx) {
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
  }
  // Deterministic estimate (no OffscreenCanvas, e.g. WebKit on Windows): CJK 1 em, others 0.55 em.
  const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
  let w = 0;
  for (const ch of text) w += isWide(ch.codePointAt(0) ?? 0) ? px : px * 0.55;
  return w;
};

let wasmMemory: WebAssembly.Memory | null = null;
let doc: RhwpDocument | null = null;

const post = (msg: HwpResponse, transfer: Transferable[] = []): void => self.postMessage(msg, transfer);

async function engine(): Promise<void> {
  if (wasmMemory) return;
  const exports = await withEngineRetry(async () => {
    const module = await loadRhwpModule((loaded, total) => post({ type: 'progress', phase: 'engine', loaded, total }));
    // Always pass the compiled module: the glue's default new URL('rhwp_bg.wasm', import.meta.url) never runs.
    return init({ module_or_path: module });
  });
  wasmMemory = exports.memory;
}

async function open(buffer: ArrayBuffer, inflateCap?: number): Promise<void> {
  const bytes = new Uint8Array(buffer);
  const features = scanFeatures(bytes, { inflateCap });
  post({ type: 'scanned', format: features.format, equations: features.equations, textboxes: features.textboxes, imageBytes: features.imageBytes, distribution: features.distribution });
  await engine();
  post({ type: 'progress', phase: 'parse' });
  doc = openDocument(HwpDocument, bytes, features);
  const pages = doc.pageCount();
  post({ type: 'parsed', pages, pageInfos: pageInfos(doc, pages), wasmBytes: wasmMemory?.buffer.byteLength ?? 0, measureCalls });
}

function render(i: number): void {
  if (!doc) return;
  const t0 = performance.now();
  try {
    const p = renderPage(doc, i);
    post({ type: 'page', i, svg: p.svg, runs: p.runs, failed: false, measureCalls, ms: performance.now() - t0 });
  } catch {
    post({ type: 'page', i, svg: '', runs: [], failed: true, measureCalls, ms: performance.now() - t0 });
  }
}

function codeOf(err: unknown): HwpErrorCode {
  if (err instanceof HwpError) return err.code;
  if ((err as { code?: unknown } | null)?.code === 'engine') return 'engine';
  if (err instanceof RangeError) return 'oom';
  return 'corrupt';
}

self.onmessage = async (ev: MessageEvent<HwpRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'warm') {
      post({ type: 'warm-done' });
    } else if (msg.type === 'open') {
      await open(msg.bytes, msg.inflateCap);
    } else if (msg.type === 'render') {
      render(msg.i);
    } else if (msg.type === 'close') {
      doc?.free();
      doc = null;
    }
  } catch (err) {
    post({ type: 'error', code: codeOf(err) });
  }
};
