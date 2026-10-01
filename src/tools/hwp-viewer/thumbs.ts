// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// The page list of /hwp-viewer/ (G2 A0 build order 5): a side list on wide screens, a bottom sheet behind
// 「쪽 목록」 on phones. Tiles are DOM only: a page number and a box with the page's shape. While a page is in
// the viewer's window its tile shows a mini preview, an <svg><use> of the page drawing already on screen,
// so no page is drawn twice by the engine and nothing is kept for pages outside the window. Above 100 pages
// the list is virtualised: only the rows near the visible part exist.
import type { PageInfo } from '../../lib/hwp/engine';

export const VIRTUAL_ABOVE = 100;
export const TILE_W = 104;
export const TILE_H = 150;
const BOX_W = 84;
const BOX_H = 112;
const OVERSCAN_ROWS = 3;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The rows a scroll position shows, with overscan; [0, rows) when the list is not virtualised. */
export function visibleRows(count: number, cols: number, scrollTop: number, height: number): [number, number] {
  const rows = Math.ceil(count / Math.max(1, cols));
  if (count <= VIRTUAL_ABOVE) return [0, rows];
  const first = Math.max(0, Math.floor(scrollTop / TILE_H) - OVERSCAN_ROWS);
  const last = Math.min(rows, Math.ceil((scrollTop + height) / TILE_H) + OVERSCAN_ROWS);
  return [first, last];
}

export interface Thumbs {
  /** The page in view changed. */
  setCurrent(i: number): void;
  /** Page i is drawn in the viewer (its <svg> has id `pageId(i)`), or left the window. */
  setDrawn(i: number, drawn: boolean): void;
  /** Re-lays the tiles (the list was shown or resized). */
  layout(): void;
  destroy(): void;
}

export const pageId = (i: number): string => `hv-p${i}`;

export function createThumbs(list: HTMLElement, infos: readonly PageInfo[], go: (i: number) => void): Thumbs {
  const count = infos.length;
  const tiles = new Map<number, HTMLButtonElement>();
  let current = 0;
  let cols = 1;
  let range: [number, number] = [0, 0];
  const spacer = document.createElement('div');
  spacer.className = 'hv-spacer';
  list.replaceChildren(spacer);

  const mini = (i: number): SVGSVGElement => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'hv-mini-svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#${pageId(i)}`);
    use.setAttribute('width', '100%');
    use.setAttribute('height', '100%');
    svg.append(use);
    return svg;
  };

  const make = (i: number): HTMLButtonElement => {
    const p = infos[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hv-tile';
    b.dataset.page = String(i);
    b.setAttribute('aria-label', `${(i + 1).toLocaleString('ko-KR')}쪽`);
    const s = Math.min(BOX_W / p.w, BOX_H / p.h);
    const box = document.createElement('span');
    box.className = 'hv-mini';
    box.style.width = `${Math.round(p.w * s)}px`;
    box.style.height = `${Math.round(p.h * s)}px`;
    if (document.getElementById(pageId(i))) box.append(mini(i));
    const num = document.createElement('span');
    num.className = 'hv-num';
    num.textContent = String(i + 1);
    num.setAttribute('aria-hidden', 'true');
    b.append(box, num);
    if (i === current) {
      b.classList.add('is-now');
      b.setAttribute('aria-current', 'page');
    }
    b.addEventListener('click', () => go(i));
    return b;
  };

  const place = (): void => {
    const [first, last] = visibleRows(count, cols, list.scrollTop, list.clientHeight);
    if (first === range[0] && last === range[1] && tiles.size) return;
    range = [first, last];
    const lo = first * cols;
    const hi = Math.min(count, last * cols);
    for (const [i, t] of tiles) {
      if (i < lo || i >= hi) {
        t.remove();
        tiles.delete(i);
      }
    }
    for (let i = lo; i < hi; i++) {
      let t = tiles.get(i);
      if (!t) {
        t = make(i);
        tiles.set(i, t);
        list.append(t);
      }
      t.style.top = `${Math.floor(i / cols) * TILE_H}px`;
      t.style.left = `${(i % cols) * TILE_W}px`;
    }
  };

  const layout = (): void => {
    cols = Math.max(1, Math.floor(list.clientWidth / TILE_W));
    spacer.style.height = `${Math.ceil(count / cols) * TILE_H}px`;
    spacer.style.width = `${cols * TILE_W}px`;
    range = [0, 0];
    place();
  };

  let frame = 0;
  const onScroll = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place();
    });
  };
  list.addEventListener('scroll', onScroll, { passive: true });

  return {
    setCurrent(i) {
      const old = tiles.get(current);
      old?.classList.remove('is-now');
      old?.removeAttribute('aria-current');
      current = i;
      const t = tiles.get(i);
      t?.classList.add('is-now');
      t?.setAttribute('aria-current', 'page');
      // Keep the current tile in the list's view.
      const top = Math.floor(i / cols) * TILE_H;
      if (list.clientHeight && (top < list.scrollTop || top + TILE_H > list.scrollTop + list.clientHeight)) list.scrollTop = Math.max(0, top - (list.clientHeight - TILE_H) / 2);
    },
    setDrawn(i, on) {
      const box = tiles.get(i)?.querySelector('.hv-mini');
      if (!box) return;
      if (on && !box.firstChild) box.append(mini(i));
      else if (!on) box.replaceChildren();
    },
    layout,
    destroy() {
      cancelAnimationFrame(frame);
      list.removeEventListener('scroll', onScroll);
      list.replaceChildren();
      tiles.clear();
    },
  };
}
