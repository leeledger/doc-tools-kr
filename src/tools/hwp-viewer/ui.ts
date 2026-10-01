// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// The controls of /hwp-viewer/ around the shared page window (G2 A0 "Flow" V2): page navigation, fit width /
// fit page / zoom steps, the page list and the in-document search. Loaded when a file starts opening, never
// with the page. The markup is in src/pages/hwp-viewer/index.astro (hidden until a document is on screen).
// Every listener is tied to one document and removed with it (AbortController).
import type { OpenDocument } from '../hwp-shared/session';
import { GUARD_PAGES } from '../hwp-shared/limits';
import { announce } from '../../lib/ui/announce';
import { VIEWER_COPY } from './copy';
import { findAll, firstFrom, fold, glyphs, matchElements, type Hit } from './search';
import { selectedText } from './select';
import { createThumbs, pageId, type Thumbs } from './thumbs';
import { fitPage, fitWidth, initialMode, pageAt, percent, stepIn, stepOut, ZOOM_MAX, ZOOM_MIN, type ZoomMode } from './zoom';
// The controls' styles come as a string and go in with the controls: an imported stylesheet would be linked
// in the page head by Astro, as a second render-blocking request (LCP, G2 A0/V0).
import css from './viewer.css?inline';

/** Side list from this width; a bottom sheet below it. */
const WIDE = '(min-width: 900px)';
const GAP = 12;

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

export interface Attached {
  onRendered(i: number, el: HTMLDivElement): void;
  onCleared(i: number): void;
  destroy(): void;
}

const STYLE_ID = 'hv-style';

export function attach(doc: OpenDocument): Attached {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.append(style);
  }
  const root = must<HTMLElement>('hwp-tool');
  const bar = must<HTMLElement>('hv-bar');
  const prev = must<HTMLButtonElement>('hv-prev');
  const next = must<HTMLButtonElement>('hv-next');
  const pageInput = must<HTMLInputElement>('hv-page');
  const total = must<HTMLElement>('hv-total');
  const fitW = must<HTMLButtonElement>('hv-fit-width');
  const fitP = must<HTMLButtonElement>('hv-fit-page');
  const zoomOut = must<HTMLButtonElement>('hv-zoom-out');
  const zoomIn = must<HTMLButtonElement>('hv-zoom-in');
  const zoomLabel = must<HTMLOutputElement>('hv-zoom');
  const thumbsBtn = must<HTMLButtonElement>('hv-thumbs-toggle');
  const findBtn = must<HTMLButtonElement>('hv-find-toggle');
  const nav = must<HTMLElement>('hv-thumbs');
  const tilesBox = must<HTMLElement>('hv-tiles');
  const closeThumbs = must<HTMLButtonElement>('hv-thumbs-close');
  const form = must<HTMLFormElement>('hv-find');
  const q = must<HTMLInputElement>('hv-q');
  const stopBtn = must<HTMLButtonElement>('hv-find-stop');
  const status = must<HTMLElement>('hv-find-status');
  const hitPrev = must<HTMLButtonElement>('hv-hit-prev');
  const hitNext = must<HTMLButtonElement>('hv-hit-next');
  const hitPos = must<HTMLElement>('hv-hit-pos');
  const { viewer, infos, preview } = doc;
  const count = infos.length;
  const ctl = new AbortController();
  const on = { signal: ctl.signal };
  const wide = window.matchMedia(WIDE);

  let current = 0;
  /** The page box holds a number being typed: scrolling does not overwrite it. */
  let typing = false;
  let mode: ZoomMode = initialMode(window.innerWidth);
  let scale = 1;
  /** The last page a control put in view (page change, zoom), and where that left the scroll box. */
  let landed = { page: 0, top: 0 };

  // ---------- zoom ----------

  const pad = (): { x: number; y: number } => {
    const cs = getComputedStyle(preview);
    return { x: parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), y: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) };
  };
  const box = (): { w: number; h: number } => {
    const p = pad();
    return { w: Math.max(1, preview.clientWidth - p.x), h: Math.max(1, preview.clientHeight - p.y - GAP) };
  };
  const top = (i: number): number => viewer.pageElement(i)?.offsetTop ?? 0;

  function show(next: number): void {
    const el = viewer.pageElement(current);
    const frac = el && el.offsetHeight ? (preview.scrollTop - el.offsetTop) / el.offsetHeight : 0;
    const hfrac = preview.scrollWidth > preview.clientWidth ? (preview.scrollLeft + preview.clientWidth / 2) / preview.scrollWidth : 0.5;
    scale = next;
    preview.style.setProperty('--hv-zoom', String(scale));
    if (el) preview.scrollTop = el.offsetTop + frac * el.offsetHeight;
    preview.scrollLeft = Math.max(0, hfrac * preview.scrollWidth - preview.clientWidth / 2);
    // The page that was in view stays the current one after the change (several fit in view when zoomed out).
    landed = { page: current, top: preview.scrollTop };
    zoomLabel.value = percent(scale);
    fitW.setAttribute('aria-pressed', String(mode === 'width'));
    fitP.setAttribute('aria-pressed', String(mode === 'page'));
    zoomOut.disabled = scale <= ZOOM_MIN + 0.001;
    zoomIn.disabled = scale >= ZOOM_MAX - 0.001;
  }
  const fit = (): void => {
    if (mode === 'width') show(fitWidth(box(), infos));
    else if (mode === 'page') show(fitPage(box(), infos[current]));
  };
  const setMode = (m: ZoomMode, s?: number): void => {
    mode = m;
    if (s === undefined) fit();
    else show(s);
    announce('status', VIEWER_COPY.zoom(percent(scale)), root);
  };

  // ---------- pages ----------

  function setCurrent(i: number): void {
    if (i === current && pageInput.value === String(i + 1)) return;
    current = i;
    if (!typing) pageInput.value = String(i + 1);
    prev.disabled = i <= 0;
    next.disabled = i >= count - 1;
    thumbs?.setCurrent(i);
  }
  function go(i: number): void {
    const t = Math.min(count - 1, Math.max(0, i));
    const el = viewer.pageElement(t);
    if (!el) return;
    preview.scrollTop = el.offsetTop - parseFloat(getComputedStyle(preview).paddingTop);
    landed = { page: t, top: preview.scrollTop };
    setCurrent(t);
  }
  let frame = 0;
  preview.addEventListener(
    'scroll',
    () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Short pages (zoomed out) put several in view: after 이전/다음 or a page number, that page stays current.
        if (Math.abs(preview.scrollTop - landed.top) < 2) setCurrent(landed.page);
        else setCurrent(pageAt(top, count, preview.scrollTop, preview.clientHeight));
      });
    },
    { passive: true, ...on },
  );
  prev.addEventListener('click', () => go(current - 1), on);
  next.addEventListener('click', () => go(current + 1), on);
  pageInput.addEventListener('input', () => (typing = true), on);
  const fromInput = (): void => {
    typing = false;
    const v = Number.parseInt(pageInput.value.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(v)) go(v - 1);
    pageInput.value = String(current + 1);
  };
  pageInput.addEventListener('change', fromInput, on);
  pageInput.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        fromInput();
      }
    },
    on,
  );
  pageInput.addEventListener(
    'blur',
    () => {
      typing = false;
      pageInput.value = String(current + 1);
    },
    on,
  );
  fitW.addEventListener('click', () => setMode('width'), on);
  fitP.addEventListener('click', () => setMode('page'), on);
  zoomIn.addEventListener('click', () => setMode('custom', stepIn(scale)), on);
  zoomOut.addEventListener('click', () => setMode('custom', stepOut(scale)), on);

  // ---------- page list ----------

  let thumbs: Thumbs | null = null;
  const setThumbs = (open: boolean, focus = false): void => {
    nav.hidden = !open;
    thumbsBtn.setAttribute('aria-expanded', String(open));
    root.classList.toggle('hv-list-open', open);
    if (open) {
      thumbs ??= createThumbs(tilesBox, infos, (i) => {
        go(i);
        if (!wide.matches) setThumbs(false, true);
      });
      thumbs.layout();
      thumbs.setCurrent(current);
      // Phones: the sheet covers the lower half; bring the controls and the top of the pages above it.
      if (!wide.matches) {
        const y = bar.getBoundingClientRect().top;
        if (y > window.innerHeight * 0.3) window.scrollBy({ top: y - window.innerHeight * 0.1, behavior: 'instant' });
      }
      if (focus) (tilesBox.querySelector<HTMLElement>('.is-now') ?? closeThumbs).focus();
    } else if (focus) thumbsBtn.focus();
    if (mode !== 'custom') fit();
  };
  thumbsBtn.addEventListener('click', () => setThumbs(nav.hidden === true, true), on);
  closeThumbs.addEventListener('click', () => setThumbs(false, true), on);
  nav.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key === 'Escape' && !wide.matches) setThumbs(false, true);
    },
    on,
  );
  wide.addEventListener('change', () => setThumbs(wide.matches), on);

  // ---------- search ----------

  const texts = new Map<number, string>();
  let run = 0;
  let running = false;
  let needle = '';
  let hits: Hit[] = [];
  let at = -1;
  let marked: Hit | null = null;

  const setStatus = (text: string): void => {
    status.textContent = text;
  };
  const clearMarks = (): void => {
    for (const m of Array.from(preview.querySelectorAll('.hv-mark'))) m.remove();
  };
  const paint = (h: Hit): boolean => {
    const el = viewer.pageElement(h.page);
    const svg = el?.querySelector(':scope > svg');
    if (!el || !svg) return false;
    const els = matchElements(
      glyphs(Array.from(svg.querySelectorAll('text'), (t) => ({ el: t, text: t.textContent ?? '' }))),
      needle,
      h.k,
    );
    const pr = el.getBoundingClientRect();
    if (!els.length || !pr.width || !pr.height) return false;
    // One mark per line: glyph boxes on the same line are merged.
    const lines: DOMRect[] = [];
    for (const e of els) {
      const r = e.getBoundingClientRect();
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.top - r.top) < r.height / 2) {
        const l = Math.min(last.left, r.left);
        const right = Math.max(last.right, r.right);
        lines[lines.length - 1] = new DOMRect(l, Math.min(last.top, r.top), right - l, Math.max(last.bottom, r.bottom) - Math.min(last.top, r.top));
      } else lines.push(r);
    }
    for (const r of lines) {
      const m = document.createElement('span');
      m.className = 'hv-mark';
      m.style.left = `${((r.left - pr.left) / pr.width) * 100}%`;
      m.style.top = `${((r.top - pr.top) / pr.height) * 100}%`;
      m.style.width = `${(r.width / pr.width) * 100}%`;
      m.style.height = `${(r.height / pr.height) * 100}%`;
      el.append(m);
    }
    // Bring the first mark to the middle of the box when it is not in view.
    const vr = preview.getBoundingClientRect();
    const first = lines[0];
    if (first.top < vr.top || first.bottom > vr.bottom) preview.scrollTop += first.top - vr.top - preview.clientHeight / 2;
    if (first.left < vr.left || first.right > vr.right) preview.scrollLeft += first.left - vr.left - preview.clientWidth / 2;
    return true;
  };
  const showHit = (i: number): void => {
    if (!hits.length) return;
    at = (i + hits.length) % hits.length;
    const h = hits[at];
    marked = h;
    clearMarks();
    hitPos.textContent = VIEWER_COPY.hitAt(at + 1, hits.length, h.page + 1);
    hitPrev.disabled = hitNext.disabled = hits.length < 2;
    announce('status', hitPos.textContent, root);
    if (!viewer.isRendered(h.page) || !paint(h)) go(h.page);
  };
  const endRun = (): void => {
    running = false;
    stopBtn.hidden = true;
    form.removeAttribute('aria-busy');
  };
  async function search(raw: string): Promise<void> {
    const want = fold(raw);
    const mine = ++run;
    hits = [];
    at = -1;
    marked = null;
    clearMarks();
    hitPos.textContent = '';
    hitPrev.disabled = hitNext.disabled = true;
    if (!want) {
      endRun();
      setStatus(VIEWER_COPY.empty);
      return;
    }
    needle = want;
    running = true;
    stopBtn.hidden = false;
    form.setAttribute('aria-busy', 'true');
    // The guard of the converter: past 100 pages the search stops (memory on phones; brief).
    const limit = Math.min(count, GUARD_PAGES);
    for (let i = 0; i < limit; i++) {
      let t = texts.get(i);
      if (t === undefined) {
        setStatus(VIEWER_COPY.searching(i, limit));
        const got = await doc.text(i);
        if (mine !== run || got === null || !doc.alive()) return;
        t = fold(got);
        texts.set(i, t);
      }
      const n = findAll(t, needle).length;
      for (let k = 0; k < n; k++) hits.push({ page: i, k });
    }
    if (mine !== run) return;
    endRun();
    const line = limit < count ? VIEWER_COPY.capped(limit, hits.length) : VIEWER_COPY.found(hits.length);
    setStatus(line);
    announce('status', line, root);
    if (hits.length) showHit(firstFrom(hits, current));
  }
  form.addEventListener(
    'submit',
    (ev) => {
      ev.preventDefault();
      void search(q.value);
    },
    on,
  );
  stopBtn.addEventListener(
    'click',
    () => {
      if (!running) return;
      run++;
      endRun();
      const line = VIEWER_COPY.stopped(hits.length);
      setStatus(line);
      announce('status', line, root);
      if (hits.length) showHit(firstFrom(hits, current));
      q.focus();
    },
    on,
  );
  hitPrev.addEventListener('click', () => showHit(at - 1), on);
  hitNext.addEventListener('click', () => showHit(at + 1), on);
  findBtn.addEventListener(
    'click',
    () => {
      const open = form.hidden;
      form.hidden = !open;
      findBtn.setAttribute('aria-expanded', String(open));
      if (open) q.focus();
      else findBtn.focus();
    },
    on,
  );

  // ---------- copy ----------

  // A selection inside the pages is copied as lines of text, not one glyph per line (./select).
  document.addEventListener(
    'copy',
    (ev) => {
      const sel = getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount || !ev.clipboardData) return;
      const range = sel.getRangeAt(0);
      if (!preview.contains(range.commonAncestorContainer)) return;
      const text = selectedText(preview, range);
      if (text === null) return;
      ev.clipboardData.setData('text/plain', text);
      ev.preventDefault();
    },
    on,
  );

  // ---------- start ----------

  const resize = new ResizeObserver(() => {
    if (mode !== 'custom') fit();
    if (!nav.hidden) thumbs?.layout();
  });
  resize.observe(preview);
  bar.hidden = false;
  total.textContent = VIEWER_COPY.total(count);
  pageInput.value = '1';
  prev.disabled = true;
  next.disabled = count <= 1;
  const onRendered = (i: number, el: HTMLDivElement): void => {
    el.querySelector(':scope > svg')?.setAttribute('id', pageId(i));
    thumbs?.setDrawn(i, !el.classList.contains('failed'));
    if (marked && marked.page === i) paint(marked);
  };
  // The first page and its window were drawn before this module ran.
  for (let i = 0; i < count; i++) {
    const el = viewer.pageElement(i);
    if (el && viewer.isRendered(i)) onRendered(i, el);
  }
  setThumbs(wide.matches);
  fit();

  return {
    onRendered,
    onCleared(i) {
      thumbs?.setDrawn(i, false);
    },
    destroy() {
      run++;
      ctl.abort();
      resize.disconnect();
      cancelAnimationFrame(frame);
      thumbs?.destroy();
      thumbs = null;
      bar.hidden = true;
      nav.hidden = true;
      form.hidden = true;
      thumbsBtn.setAttribute('aria-expanded', 'false');
      findBtn.setAttribute('aria-expanded', 'false');
      root.classList.remove('hv-list-open');
      stopBtn.hidden = true;
      form.removeAttribute('aria-busy');
      setStatus('');
      hitPos.textContent = '';
      preview.style.removeProperty('--hv-zoom');
    },
  };
}
