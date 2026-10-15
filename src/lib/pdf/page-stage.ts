// The page stage shared by PDF 서명·도장 넣기 and PDF 글자 넣기·편집 (TOOLS1015 E0): one page of an open PDF drawn
// with pdf.js (src/lib/pdf/inspect.ts), page navigation by index, and an overlay of boxes the person drags, resizes from
// the lower-right corner and moves with the arrow keys (1 point, Shift 10). Boxes live in the page as seen (pdf.js
// viewport at scale 1, points, origin top-left; place.ts), so `toPdfRect` maps them to PDF space. The owner keeps the
// items (which boxes show on a page, what they hold, where a moved box is stored); the stage keeps the page, its scale
// and the selection.
import type { PdfJsDoc } from './inspect';
import { formatPages } from '../ui/format';
import { clampBox, moveBox, resizeBox, resizeFree, type Box, type PageInfo } from '../../tools/pdf-sign/place';

/** One box on the page shown. */
export interface StageItem {
  id: number;
  /** Its box as shown on this page (clampBox keeps it inside when drawn). */
  box: Box;
  /** Accessible name of the box button. */
  label: string;
  /** `aspect`: the corner handle keeps the shape (a picture, a line of text); `free`: width and height apart. */
  resizeMode: 'aspect' | 'free';
  /** Fills the box button (before the corner handle is appended). */
  render(el: HTMLButtonElement): void;
}

export interface StageHooks {
  /** The items shown on 0-based page `index`, in drawing order. */
  items(index: number, info: PageInfo): StageItem[];
  /** The item's stored box now (it may have changed since the last draw), or undefined when it is gone. */
  boxOf(id: number): Box | undefined;
  /** Stores the item's new box (already kept inside the page shown). */
  store(id: number, box: Box): void;
  /** Whether boxes may be moved now. */
  editable(): boolean;
  /** The selection changed (a click, a drag or a key on a box). */
  selected(id: number | null): void;
  /** A drag on a box ended after it moved (`resized`: by the corner handle). */
  moved(id: number, resized: boolean): void;
  /** Delete or Backspace on a box. */
  remove(id: number): void;
  /** The page shown changed or finished drawing (the owner updates its buttons). */
  changed(): void;
}

export interface StageOptions {
  /** The stage element (position: relative); the page canvas and the boxes are its children. */
  el: HTMLElement;
  /** Class prefix: `${cls}-page`, `${cls}-box`, `${cls}-handle`. */
  cls: string;
  /** id of the element that explains the moves (each box's aria-describedby). */
  hintId: string;
  hooks: StageHooks;
}

/** Arrow keys move a box this many points (Shift: SHIFT_STEP). */
const STEP = 1;
const SHIFT_STEP = 10;
/** The page preview is at most this tall, as a share of the window height. */
const MAX_STAGE_HEIGHT = 0.8;

export interface PageStage {
  /** 0-based page shown. */
  readonly page: number;
  readonly pageCount: number;
  /** The selected item, or null. */
  readonly selection: number | null;
  /** Takes a newly opened document (page 0, nothing drawn yet). */
  open(doc: PdfJsDoc, pageCount: number): void;
  /** Forgets the document: page geometry, the canvas and the boxes (the owner closes the document). */
  clear(): void;
  /** Page geometry of 0-based page `index` (pdf.js viewport at scale 1). */
  info(index: number): Promise<PageInfo>;
  /** Geometry of the page shown, once known. */
  current(): PageInfo | undefined;
  /** Draws 0-based page `index` (kept in range). */
  show(index: number): Promise<void>;
  /** Redraws the boxes of the page shown; focus moves to `focusId` or stays on the focused box. */
  draw(focusId?: number): void;
  /** Selects an item (or none) and tells the owner; nothing when it is already selected. */
  choose(id: number | null): void;
  /** Sets the selection without telling the owner (it redraws or updates itself). */
  setSelection(id: number | null): void;
  /** Stores an item's new box, kept inside the page shown, and moves its element. */
  place(id: number, box: Box): void;
}

export function createPageStage(o: StageOptions): PageStage {
  const { el: stage, cls, hooks } = o;
  let doc: PdfJsDoc | null = null;
  let pageCount = 0;
  let cur = 0;
  let selected: number | null = null;
  /** Page geometry by page; dropped with the document. */
  const infos = new Map<number, PageInfo>();
  /** CSS pixels per point of the page shown. */
  let scale = 1;
  let renderId = 0;
  let pageCanvas: HTMLCanvasElement | null = null;

  async function info(index: number): Promise<PageInfo> {
    const known = infos.get(index);
    if (known) return known;
    if (!doc) throw new Error('no document');
    const page = await doc.getPage(index + 1);
    const vp = page.getViewport({ scale: 1 });
    const pi: PageInfo = { width: vp.width, height: vp.height, rotate: page.rotate, toPdf: (x, y) => vp.convertToPdfPoint(x, y) };
    infos.set(index, pi);
    return pi;
  }

  const current = (): PageInfo | undefined => infos.get(cur);

  async function show(index: number): Promise<void> {
    const d = doc;
    if (!d) return;
    cur = Math.max(0, Math.min(pageCount - 1, index));
    const id = ++renderId;
    hooks.changed();
    try {
      const pi = await info(cur);
      const page = await d.getPage(cur + 1);
      if (id !== renderId) return;
      const avail = stage.clientWidth || stage.parentElement?.clientWidth || 320;
      const maxH = Math.max(320, window.innerHeight * MAX_STAGE_HEIGHT);
      scale = Math.min(avail / pi.width, maxH / pi.height);
      const cssW = Math.round(pi.width * scale);
      const cssH = Math.round(pi.height * scale);
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale: scale * dpr });
      const canvas = document.createElement('canvas');
      canvas.className = `${cls}-page`;
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `${formatPages(cur + 1)} 미리보기`);
      await page.render({ canvas, viewport }).promise;
      page.cleanup();
      if (id !== renderId) {
        canvas.width = 0;
        return;
      }
      if (pageCanvas) pageCanvas.width = 0;
      pageCanvas = canvas;
      stage.style.width = `${cssW}px`;
      stage.style.height = `${cssH}px`;
      draw();
      hooks.changed();
    } catch {
      // A page that cannot be drawn still takes boxes by its size; the stage stays empty.
      if (id === renderId) draw();
    }
  }

  function boxStyle(b: HTMLElement, box: Box): void {
    b.style.left = `${box.x * scale}px`;
    b.style.top = `${box.y * scale}px`;
    b.style.width = `${box.w * scale}px`;
    b.style.height = `${box.h * scale}px`;
  }

  function draw(focusId?: number): void {
    // Replacing the boxes keeps keyboard focus on the same box.
    const active = document.activeElement as HTMLElement | null;
    const keep = focusId ?? (active && stage.contains(active) && active.dataset.id ? Number(active.dataset.id) : undefined);
    const pi = current();
    const els: HTMLElement[] = pageCanvas ? [pageCanvas] : [];
    if (pi) for (const item of hooks.items(cur, pi)) els.push(boxButton(item, clampBox(item.box, pi.width, pi.height)));
    stage.replaceChildren(...els);
    if (keep !== undefined) stage.querySelector<HTMLElement>(`[data-id="${keep}"]`)?.focus({ preventScroll: focusId === undefined });
  }

  function boxButton(item: StageItem, shown: Box): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = item.id === selected ? `${cls}-box selected` : `${cls}-box`;
    b.type = 'button';
    b.dataset.id = String(item.id);
    b.setAttribute('aria-label', item.label);
    b.setAttribute('aria-pressed', String(item.id === selected));
    b.setAttribute('aria-describedby', o.hintId);
    item.render(b);
    const handle = document.createElement('span');
    handle.className = `${cls}-handle`;
    handle.setAttribute('aria-hidden', 'true');
    b.append(handle);
    boxStyle(b, shown);
    b.addEventListener('pointerdown', (ev) => beginDrag(ev, b, item, ev.target === handle));
    b.addEventListener('keydown', (ev) => onBoxKey(ev, item.id));
    b.addEventListener('click', () => choose(item.id));
    return b;
  }

  function choose(id: number | null): void {
    if (selected === id) return;
    selected = id;
    for (const b of stage.querySelectorAll<HTMLElement>(`.${cls}-box`)) {
      const on = b.dataset.id === String(id);
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', String(on));
    }
    hooks.selected(id);
  }

  function place(id: number, box: Box): void {
    const pi = current();
    if (!pi) return;
    const kept = clampBox(box, pi.width, pi.height);
    hooks.store(id, kept);
    const b = stage.querySelector<HTMLElement>(`.${cls}-box[data-id="${id}"]`);
    if (b) boxStyle(b, kept);
  }

  function beginDrag(ev: PointerEvent, b: HTMLElement, item: StageItem, resizing: boolean): void {
    const pi = current();
    const stored = hooks.boxOf(item.id);
    if (!hooks.editable() || ev.button > 0 || !pi || !stored) return;
    ev.preventDefault();
    choose(item.id);
    b.focus({ preventScroll: true });
    // From the box as shown on this page (a shared box may be clamped here).
    const start = clampBox(stored, pi.width, pi.height);
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    let moved = false;
    try {
      b.setPointerCapture(ev.pointerId);
    } catch {
      // Capture is a nicety; moves still arrive while the pointer stays over the box.
    }
    const onMove = (e: PointerEvent): void => {
      const dx = (e.clientX - x0) / scale;
      const dy = (e.clientY - y0) / scale;
      if (!moved && Math.hypot(dx, dy) * scale < 2) return;
      moved = true;
      if (!resizing) place(item.id, moveBox(start, dx, dy, pi.width, pi.height));
      else if (item.resizeMode === 'free') place(item.id, resizeFree(start, start.w + dx, start.h + dy, pi.width, pi.height));
      else place(item.id, resizeBox(start, start.w + dx, pi.width, pi.height));
    };
    const onEnd = (): void => {
      b.removeEventListener('pointermove', onMove);
      b.removeEventListener('pointerup', onEnd);
      b.removeEventListener('pointercancel', onEnd);
      if (moved) hooks.moved(item.id, resizing);
    };
    b.addEventListener('pointermove', onMove);
    b.addEventListener('pointerup', onEnd);
    b.addEventListener('pointercancel', onEnd);
  }

  function onBoxKey(ev: KeyboardEvent, id: number): void {
    const pi = current();
    const stored = hooks.boxOf(id);
    if (!hooks.editable() || !pi || !stored) return;
    const step = ev.shiftKey ? SHIFT_STEP : STEP;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = d[ev.key];
    if (move) {
      ev.preventDefault();
      choose(id);
      // From the box as shown on this page (as the drag), so the first press moves visibly on a smaller page.
      place(id, moveBox(clampBox(stored, pi.width, pi.height), move[0], move[1], pi.width, pi.height));
      return;
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      choose(id);
      hooks.remove(id);
    }
  }

  return {
    get page() {
      return cur;
    },
    get pageCount() {
      return pageCount;
    },
    get selection() {
      return selected;
    },
    open(d, count) {
      doc = d;
      pageCount = count;
    },
    clear() {
      renderId++;
      infos.clear();
      if (pageCanvas) pageCanvas.width = 0;
      pageCanvas = null;
      stage.replaceChildren();
      doc = null;
      pageCount = 0;
      cur = 0;
      selected = null;
    },
    info,
    current,
    show,
    draw,
    choose,
    setSelection(id) {
      selected = id;
    },
    place,
  };
}
