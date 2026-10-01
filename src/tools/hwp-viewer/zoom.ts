// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// Zoom of /hwp-viewer/ (G2 A0 build order 4). Pure. A scale of 1 draws a page at its own size (rhwp's page
// size in CSS px). Fit width uses the widest page, so the scale does not change while scrolling through a
// document that mixes portrait and landscape pages; fit page uses the page in view.

export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;
export const ZOOM_MIN = ZOOM_STEPS[0];
export const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];
/** Below this viewport width the viewer opens in fit width, otherwise in fit page (brief). */
export const PHONE_MAX_PX = 768;

export type ZoomMode = 'width' | 'page' | 'custom';

export interface Box {
  /** Inner size of the scroll box (padding removed). */
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The scale at which the widest page fills the box width. */
export function fitWidth(box: Box, pages: readonly { w: number }[]): number {
  const widest = Math.max(1, ...pages.map((p) => p.w));
  return clamp(box.w / widest, 0.05, ZOOM_MAX);
}

/** The scale at which `page` fits the box entirely. */
export function fitPage(box: Box, page: { w: number; h: number }): number {
  return clamp(Math.min(box.w / Math.max(1, page.w), box.h / Math.max(1, page.h)), 0.05, ZOOM_MAX);
}

/** The next step above `scale` (zoom in), or the largest step. */
export function stepIn(scale: number): number {
  return ZOOM_STEPS.find((s) => s > scale + 0.001) ?? ZOOM_MAX;
}

/** The next step below `scale` (zoom out), or the smallest step. */
export function stepOut(scale: number): number {
  return [...ZOOM_STEPS].reverse().find((s) => s < scale - 0.001) ?? ZOOM_MIN;
}

export const initialMode = (viewportWidth: number): ZoomMode => (viewportWidth < PHONE_MAX_PX ? 'width' : 'page');

export const percent = (scale: number): string => `${Math.round(scale * 100)}%`;

/**
 * The page that is "in view": the last page whose top is at or above a line one third down the box. `tops`
 * are the pages' top offsets in the scroll box, ascending.
 */
export function pageAt(tops: (i: number) => number, count: number, scrollTop: number, boxHeight: number): number {
  const line = scrollTop + boxHeight / 3;
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops(mid) <= line) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}
