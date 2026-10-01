// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// The paged preview (brief Step 5 §3.2 "Lazy viewer", "Screen scaling"; HWP direct: always lazy, the PDF is
// written from the worker's pages, not from the preview). Every page gets a placeholder sized from pageInfos.
// An IntersectionObserver on the preview renders the visible pages ±2 and evicts pages beyond ±6. Each
// arriving page SVG is parsed (DOMParser image/svg+xml), sanitized, given a viewBox, stripped of cell clips,
// fitted, adopted into its <div class="page"> and given word spaces. The preview shows the original images.
import type { PageInfo } from '../../lib/hwp/engine';
import { addSpaces, dropCellClips, ensureViewBox, fitFillImages, parsePageSvg, sanitize, type TextRun } from '../../lib/hwp/svg-dom';

export const WINDOW_RENDER = 2;
export const WINDOW_KEEP = 6;

export interface ViewerStats {
  failedPages: number;
  sanitizerRemovals: number;
  spacesAdded: number;
  fillFitted: number;
}

interface Slot {
  el: HTMLDivElement;
  state: 'empty' | 'pending' | 'rendered';
}

export interface Viewer {
  readonly stats: ViewerStats;
  /** Pages currently holding an SVG. */
  renderedCount(): number;
  isRendered(i: number): boolean;
  /** Inserts page i (a page that is no longer wanted in lazy mode is dropped). */
  insert(i: number, svg: string, runs: TextRun[], failed: boolean): void;
  destroy(): void;
}

export interface ViewerOptions {
  root: HTMLElement;
  infos: PageInfo[];
  /** Asks for page i; the controller answers with insert(). */
  request?: (i: number) => void;
  pageFailedText: string;
}

export function createViewer(opts: ViewerOptions): Viewer {
  const { root, infos } = opts;
  const stats: ViewerStats = { failedPages: 0, sanitizerRemovals: 0, spacesAdded: 0, fillFitted: 0 };
  const slots: Slot[] = infos.map((p, i) => {
    const el = document.createElement('div');
    el.className = 'page';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', `${i + 1}쪽`);
    el.dataset.page = String(i);
    el.style.maxWidth = `${p.w}px`;
    el.style.aspectRatio = `${p.w} / ${p.h}`;
    return { el, state: 'empty' };
  });
  root.replaceChildren(...slots.map((s) => s.el));

  const visible = new Set<number>();
  const clear = (s: Slot): void => {
    s.el.replaceChildren();
    s.el.classList.remove('rendered', 'failed');
    s.state = 'empty';
  };
  const wanted = (i: number): boolean => {
    // Before the first observer callback the preview shows its top: the first page and the window after it.
    if (!visible.size) return i <= WINDOW_RENDER;
    for (const v of visible) if (Math.abs(v - i) <= WINDOW_KEEP) return true;
    return false;
  };
  const update = (): void => {
    if (!visible.size) return;
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
    destroy() {
      io.disconnect();
      for (const s of slots) clear(s);
      root.replaceChildren();
    },
  };
}
