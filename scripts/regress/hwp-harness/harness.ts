// regress:hwp harness page (served by Vite from scripts/regress/hwp.mjs; never part of dist/). Runs the
// production worker (src/lib/hwp/hwp.worker.ts: scan, rhwp, svg-string), the production viewer (svg-dom:
// sanitize, ensureViewBox, dropCellClips, fitFillImages, addSpaces; downscale) and the production print CSS
// and @page rules on one file, always as a full render (routing is recorded, not obeyed).
import '../../../src/tools/hwp-to-pdf/hwp.css';
import type { HwpResponse } from '../../../src/lib/hwp/hwp.worker';
import { danglingRefs, parsePageSvg } from '../../../src/lib/hwp/svg-dom';
import { route } from '../../../src/lib/hwp/route';
import { createViewer } from '../../../src/tools/hwp-to-pdf/viewer';
import { installPageStyle } from '../../../src/tools/hwp-to-pdf/print';
import { hwpFontsReady, loadHwpFonts } from '../../../src/tools/hwp-to-pdf/fonts';

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
  sanitizerRemovals?: number;
  failedPages?: number;
  spacesAdded?: number;
  fillFitted?: number;
  downscaled?: number;
  screenPages?: number;
  parseErrors?: string[];
  route?: { desktop: ReturnType<typeof route>; mobile: ReturnType<typeof route> };
  ms?: { engine: number; parse: number; render: number; fonts: number; ready: number; worker: number; engineRender: number; insert: number; downscale: number };
}

async function run(url: string): Promise<Result> {
  const root = document.getElementById('hwp-print-root') as HTMLDivElement;
  const bytes = await (await fetch(url)).arrayBuffer();
  const fileBytes = bytes.byteLength;
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
    const n = parsed.pages;
    const viewer = createViewer({ root, infos: parsed.pageInfos, lazy: false, pageFailedText: 'failed' });
    let measureCalls = parsed.measureCalls;
    void loadHwpFonts();
    // As the tool does (controller.ts fullRender): build hidden, then show, wait for the fonts, downscale.
    root.classList.add('hw-building');
    const parseErrors: string[] = [];
    const split = { worker: 0, engineRender: 0, insert: 0, downscale: 0 };
    for (let i = 0; i < n; i++) {
      const a = performance.now();
      w.postMessage({ type: 'render', i });
      const p = await until('page');
      const b = performance.now();
      measureCalls = Math.max(measureCalls, p.measureCalls);
      split.engineRender += p.ms;
      if (!p.failed && parsePageSvg(p.svg).failed && parseErrors.length < 3) {
        const d = new DOMParser().parseFromString(p.svg, 'image/svg+xml');
        const msg = d.getElementsByTagName('parsererror')[0]?.textContent ?? '';
        const m = /line (\d+) at column (\d+)/.exec(msg);
        const line = m ? (p.svg.split('\n')[Number(m[1]) - 1] ?? '') : '';
        parseErrors.push(`p${p.i + 1}: ${msg.slice(0, 160)} :: ${m ? line.slice(Math.max(0, Number(m[2]) - 100), Number(m[2]) + 30) : ''}`);
      }
      viewer.insert(p.i, p.svg, p.runs, p.failed);
      split.worker += b - a;
      split.insert += performance.now() - b;
      await new Promise((r) => setTimeout(r, 0));
    }
    w.terminate();
    root.classList.remove('hw-building');
    installPageStyle(parsed.pageInfos);
    document.body.classList.add('hwp-printable');
    const tRender = performance.now();
    await hwpFontsReady();
    const c = performance.now();
    for (let i = 0; i < n; i++) await viewer.downscale(i);
    split.downscale = performance.now() - c;
    await document.fonts.ready;
    const tFonts = performance.now();
    let dangling = 0;
    for (const svg of Array.from(root.querySelectorAll('.page svg'))) dangling += danglingRefs(svg);
    const common = { fileBytes, pages: n, wasmBytes: parsed.wasmBytes, imageBytes: scanned.imageBytes, equations: scanned.equations, textboxes: scanned.textboxes };
    return {
      ok: true,
      format: scanned.format,
      pages: n,
      equations: scanned.equations,
      textboxes: scanned.textboxes,
      imageBytes: scanned.imageBytes,
      wasmBytes: parsed.wasmBytes,
      measureCalls,
      dangling,
      ...viewer.stats,
      screenPages: root.querySelectorAll('.page').length,
      parseErrors,
      route: { desktop: route({ device: 'desktop', ...common }), mobile: route({ device: 'mobile', ...common }) },
      ms: { engine: tEngine - t0, parse: tParse - tEngine, render: tRender - tParse, fonts: tFonts - tRender, ready: tFonts - t0, ...split },
    };
  } catch (err) {
    w.terminate();
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

(window as unknown as { RUN: typeof run; READY: boolean }).RUN = run;
(window as unknown as { READY: boolean }).READY = true;
