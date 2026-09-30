// The paged preview (brief Step 5 §3.2 "Lazy viewer", "Screen scaling"). Lazy chunk (with print.ts).
// Every page gets a placeholder sized from pageInfos. In lazy mode an IntersectionObserver on the preview
// renders the visible pages ±2 and evicts pages beyond ±6 (revoking their blob: URLs); in full mode every
// page is kept. Each arriving page SVG is parsed (DOMParser image/svg+xml), sanitized, given a viewBox,
// stripped of cell clips, fitted, adopted into its <div class="page p{W}x{H}"> and given word spaces.
import { downscaleImages } from '../../lib/hwp/downscale';
import { sizeKey, type PageInfo } from '../../lib/hwp/engine';
import { addSpaces, dropCellClips, ensureViewBox, fitFillImages, parsePageSvg, sanitize, type TextRun } from '../../lib/hwp/svg-dom';

export const WINDOW_RENDER = 2;
export const WINDOW_KEEP = 6;

export interface ViewerStats {
  failedPages: number;
  sanitizerRemovals: number;
  spacesAdded: number;
  fillFitted: number;
  downscaled: number;
}

interface Slot {
  el: HTMLDivElement;
  state: 'empty' | 'pending' | 'rendered';
  urls: string[];
  downscaled: boolean;
}

export interface Viewer {
  readonly stats: ViewerStats;
  /** Pages currently holding an SVG. */
  renderedCount(): number;
  /** Blob URLs currently alive. */
  blobCount(): number;
  isRendered(i: number): boolean;
  /** Inserts page i (a page that is no longer wanted in lazy mode is dropped). */
  insert(i: number, svg: string, runs: TextRun[], failed: boolean): void;
  /** Downscales the images of page i once (needs layout: the page must be in the DOM). */
  downscale(i: number): Promise<void>;
  /** Lazy mode on (window ±2 / ±6) or off (keep every page). */
  setLazy(on: boolean): void;
  destroy(): void;
}

export interface ViewerOptions {
  root: HTMLElement;
  infos: PageInfo[];
  lazy: boolean;
  /** Asks for page i (lazy mode); the controller answers with insert(). */
  request?: (i: number) => void;
  pageFailedText: string;
}

export function createViewer(opts: ViewerOptions): Viewer {
  const { root, infos } = opts;
  let lazy = opts.lazy;
  const stats: ViewerStats = { failedPages: 0, sanitizerRemovals: 0, spacesAdded: 0, fillFitted: 0, downscaled: 0 };
  const slots: Slot[] = infos.map((p, i) => {
    const el = document.createElement('div');
    el.className = `page ${sizeKey(p)}`;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', `${i + 1}쪽`);
    el.dataset.page = String(i);
    el.style.maxWidth = `${p.w}px`;
    el.style.aspectRatio = `${p.w} / ${p.h}`;
    return { el, state: 'empty', urls: [], downscaled: false };
  });
  root.replaceChildren(...slots.map((s) => s.el));

  const visible = new Set<number>();
  const clear = (s: Slot): void => {
    for (const u of s.urls) URL.revokeObjectURL(u);
    s.urls = [];
    s.el.replaceChildren();
    s.el.classList.remove('rendered', 'failed');
    s.state = 'empty';
    s.downscaled = false;
  };
  const wanted = (i: number): boolean => {
    if (!lazy) return true;
    for (const v of visible) if (Math.abs(v - i) <= WINDOW_KEEP) return true;
    return false;
  };
  const update = (): void => {
    if (!lazy || !visible.size) return;
    const lo = Math.max(0, Math.min(...visible) - WINDOW_RENDER);
    const hi = Math.min(slots.length - 1, Math.max(...visible) + WINDOW_RENDER);
    for (let i = lo; i <= hi; i++) {
      if (slots[i].state === 'empty') {
        slots[i].state = 'pending';
        opts.request?.(i);
      }
    }
    for (let i = 0; i < slots.length; i++) if (slots[i].state !== 'empty' && !wanted(i)) clear(slots[i]);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const i = Number((e.target as HTMLElement).dataset.page);
        if (e.isIntersecting) visible.add(i);
        else visible.delete(i);
      }
      update();
    },
    { root, rootMargin: '0px' },
  );
  for (const s of slots) io.observe(s.el);

  return {
    stats,
    renderedCount: () => slots.filter((s) => s.state === 'rendered').length,
    blobCount: () => slots.reduce((a, s) => a + s.urls.length, 0),
    isRendered: (i) => slots[i]?.state === 'rendered',
    insert(i, markup, runs, failed) {
      const s = slots[i];
      if (!s || s.state === 'rendered') return;
      if (!wanted(i)) {
        s.state = 'empty';
        return;
      }
      const parsed = failed ? { svg: null, failed: true } : parsePageSvg(markup);
      if (!parsed.svg) {
        stats.failedPages++;
        const p = document.createElement('p');
        p.className = 'page-failed';
        p.textContent = opts.pageFailedText;
        s.el.replaceChildren(p);
        s.el.classList.add('rendered', 'failed');
        s.state = 'rendered';
        return;
      }
      const svg = parsed.svg;
      stats.sanitizerRemovals += sanitize(svg);
      ensureViewBox(svg);
      dropCellClips(svg);
      stats.fillFitted += fitFillImages(svg);
      const adopted = document.importNode(svg, true) as unknown as SVGSVGElement;
      s.el.replaceChildren(adopted);
      stats.spacesAdded += addSpaces(adopted, runs);
      s.el.classList.add('rendered');
      s.state = 'rendered';
    },
    async downscale(i) {
      const s = slots[i];
      if (!s || s.state !== 'rendered' || s.downscaled) return;
      s.downscaled = true;
      const svg = s.el.querySelector('svg');
      if (!svg) return;
      const r = await downscaleImages(svg);
      if (s.state !== 'rendered') {
        for (const u of r.urls) URL.revokeObjectURL(u);
        return;
      }
      s.urls.push(...r.urls);
      stats.downscaled += r.downscaled;
    },
    setLazy(on) {
      lazy = on;
      update();
    },
    destroy() {
      io.disconnect();
      for (const s of slots) clear(s);
      root.replaceChildren();
    },
  };
}
