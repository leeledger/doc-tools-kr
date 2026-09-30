// SPIKE-HWP-DIRECT harness entry. window.DIRECT(url, approach, opts) runs the production worker (scan, rhwp,
// svg-string) and the production per-page post-processing (svg-dom: sanitize, ensureViewBox, dropCellClips,
// fitFillImages, addSpaces), streaming page by page (no full DOM render), into one of:
//   A  svg2pdf.js + jsPDF       B  raster + invisible text layer
//   C  pdf-lib vector writer    H  hybrid: C per page, B for a page C cannot express
// and returns the PDF (base64) with timings and per-page stats.
import { PDFDocument } from '@cantoo/pdf-lib';
import fontkit from '@cantoo/fontkit';
import type { HwpResponse } from '../../../src/lib/hwp/hwp.worker';
import { addSpaces, dropCellClips, ensureViewBox, fitFillImages, parsePageSvg, sanitize } from '../../../src/lib/hwp/svg-dom';
import { FontBook } from './fontbook';
import { ImageCache } from './images';
import { VectorWriter, type PageStats } from './vector';
import { rasterPage, type RasterOptions } from './raster';

type Msg = HwpResponse;
export interface DirectOptions {
  dpi?: number;
  enc?: RasterOptions['enc'];
  textLayer?: boolean;
  maxPages?: number;
  settleMs?: number;
}

const PRETENDARD_CSS = '/@fs/' + (window as any).PRETENDARD_CSS;

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}

let heapPeak = 0;
const sampleHeap = (): void => {
  const m = (performance as any).memory;
  if (m) heapPeak = Math.max(heapPeak, m.usedJSHeapSize);
};

async function direct(url: string, approach: 'A' | 'B' | 'C' | 'H', o: DirectOptions = {}): Promise<any> {
  heapPeak = 0;
  const timer = setInterval(sampleHeap, 100);
  const bytes = await (await fetch(url)).arrayBuffer();
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
  const host = document.getElementById('host') as HTMLDivElement;
  const pageStats: any[] = [];
  const split = { engine: 0, post: 0, write: 0, save: 0, fontsInit: 0 };
  try {
    w.postMessage({ type: 'open', bytes }, [bytes]);
    await until('scanned');
    const parsed = await until('parsed');
    const tParsed = performance.now();
    split.engine = tParsed - t0;
    const n = Math.min(parsed.pages, o.maxPages ?? Infinity);
    const tf = performance.now();
    const fonts = await FontBook.create({ pretendardCss: PRETENDARD_CSS });
    split.fontsInit = performance.now() - tf;
    let pdf: PDFDocument | null = null;
    let vw: VectorWriter | null = null;
    let images: ImageCache | null = null;
    let jw: any = null;
    if (approach === 'A') {
      const { JsPdfWriter } = await import('./svg2pdf-a');
      const rootFs = '/@fs/' + String((window as any).ROOT);
      // The site ships only .woff2 slices; jsPDF needs TrueType, so A reads the .woff sibling from @fontsource.
      jw = new JsPdfWriter(fonts, (u) => {
        const m = /\/fonts\/hwp\/([a-z-]+)@[^/]+\/([^/]+)$/.exec(new URL(u).pathname);
        return m ? `${rootFs}/node_modules/@fontsource/${m[1]}/files/${m[2]}` : u;
      });
    } else {
      pdf = await PDFDocument.create();
      pdf.registerFontkit(fontkit as any);
      images = new ImageCache(pdf, { dpi: o.dpi && approach !== 'B' ? undefined : undefined });
      vw = new VectorWriter(pdf, fonts, images);
    }
    const ropt: RasterOptions = { dpi: o.dpi ?? 200, enc: o.enc ?? 'rule', textLayer: o.textLayer ?? true, settleMs: o.settleMs ?? 150 };
    let failedPages = 0;
    let fallbackPages = 0;
    for (let i = 0; i < n; i++) {
      w.postMessage({ type: 'render', i });
      const p = await until('page');
      const a = performance.now();
      const info = parsed.pageInfos[i];
      const pp = p.failed ? { svg: null, failed: true } : parsePageSvg(p.svg);
      if (!pp.svg) {
        failedPages++;
        if (pdf) pdf.addPage([info.w * 0.75, info.h * 0.75]);
        continue;
      }
      const svg = document.importNode(pp.svg, true) as unknown as SVGSVGElement;
      sanitize(svg);
      ensureViewBox(svg);
      dropCellClips(svg);
      fitFillImages(svg);
      addSpaces(svg, p.runs);
      const b = performance.now();
      split.post += b - a;
      const ps: any = { i };
      if (approach === 'A') {
        await jw.addPage(svg, info.w, info.h, host);
      } else if (approach === 'C') {
        const r = await vw!.addPage(svg, info.w, info.h, { mode: 'full' });
        Object.assign(ps, r.stats);
      } else if (approach === 'B') {
        const r = await rasterPage(pdf!, svg, info.w, info.h, fonts, vw, ropt);
        Object.assign(ps, r.stats, { text: r.text });
      } else {
        // Hybrid: write the vector page into a scratch check first (cheap: stats only), fall back to raster.
        const probe = await vw!.addPage(svg, info.w, info.h, { mode: 'full' });
        const s: PageStats = probe.stats;
        const bad = s.unsupported.length > 0 || s.missingGlyphs > 0 || s.nonFinite > 0;
        if (bad) {
          pdf!.removePage(pdf!.getPageCount() - 1);
          const r = await rasterPage(pdf!, svg, info.w, info.h, fonts, vw, ropt);
          fallbackPages++;
          Object.assign(ps, { fallback: true, why: [...new Set(s.unsupported)].slice(0, 5), missing: s.missingGlyphs, nonFinite: s.nonFinite, raster: r.stats });
        } else Object.assign(ps, s);
      }
      split.write += performance.now() - b;
      pageStats.push(ps);
      sampleHeap();
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    }
    w.postMessage({ type: 'close' });
    w.terminate();
    const ts = performance.now();
    const out = approach === 'A' ? jw.output() : await pdf!.save({ useObjectStreams: true });
    split.save = performance.now() - ts;
    const total = performance.now() - t0;
    clearInterval(timer);
    sampleHeap();
    const agg = (k: string): number => pageStats.reduce((x, s) => x + (typeof s[k] === 'number' ? s[k] : 0), 0);
    const unsupported: Record<string, number> = {};
    for (const s of pageStats) for (const u of s.unsupported ?? s.why ?? []) unsupported[u] = (unsupported[u] ?? 0) + 1;
    return {
      ok: true,
      pages: parsed.pages,
      written: n,
      pdfBytes: out.length,
      b64: b64(out),
      failedPages,
      fallbackPages,
      glyphs: agg('glyphs'),
      missingGlyphs: approach === 'A' ? jw.missing : agg('missingGlyphs'),
      missingChars: [...fonts.missing.keys()].slice(0, 30).map((c) => String.fromCodePoint(c)).join(''),
      nonFinite: agg('nonFinite'),
      unsupported,
      images: images?.stats ?? null,
      fontBytesFetched: fonts.fetchedBytes,
      pdfFontBytes: fonts.pdfFetchedBytes,
      heapPeakMB: heapPeak / 1048576,
      wasmBytes: parsed.wasmBytes,
      raster: approach === 'B' ? { encs: pageStats.map((s) => s.enc).join(''), msDecode: agg2(pageStats, 'decode'), msDraw: agg2(pageStats, 'draw'), msEncode: agg2(pageStats, 'encode'), msFonts: agg2(pageStats, 'fonts') } : null,
      ms: { total, ...split },
    };
  } catch (err) {
    clearInterval(timer);
    w.terminate();
    return { ok: false, error: String(err instanceof Error ? `${err.message} ${err.stack?.split('\n').slice(0, 4).join(' | ')}` : err).slice(0, 600), ms: { total: performance.now() - t0 } };
  }
}
const agg2 = (ps: any[], k: string): number => Math.round(ps.reduce((x, s) => x + (s.ms?.[k] ?? 0), 0));

(window as any).DIRECT = direct;
(window as any).DIRECT_READY = true;
