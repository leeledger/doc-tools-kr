// 신분증 사본 만들기 (TOOLS1015 I1): the 용도 문구 (watermark) and the fixed file names, pure. Three lines — 「{place} 제출용」,
// 「다른 용도 사용 금지」 and (optional) the local date — drawn as one block, repeated on a grid turned by -30° that
// covers the whole copy, so cropping the copy later never removes it.

/** Turn of the watermark grid, in degrees (negative: rising to the right). */
export const MARK_ANGLE = -30;
export const MARK_ALPHA = 0.35;
export const MARK_COLOR = '#5f6368';
export const MARK_LINE_HEIGHT = 1.3;
/** The 「어디에 낼 건가요」 field takes at most this many characters. */
export const PLACE_MAX = 30;
const SUFFIX = '제출용';
export const MARK_LINE_2 = '다른 용도 사용 금지';

/** `YYYY.MM.DD` of the device's local date. */
export function markDate(d: Date): string {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/** The typed place, trimmed, inner spaces folded, at most PLACE_MAX characters. */
export function cleanPlace(s: string): string {
  return [...s.replace(/\s+/g, ' ').trim()].slice(0, PLACE_MAX).join('').trim();
}

/** The watermark lines; none while the place is empty. A place that already ends in 제출용 is not given a second one. */
export function markLines(place: string, withDate: boolean, now: Date): string[] {
  const p = cleanPlace(place);
  if (!p) return [];
  const first = p.endsWith(SUFFIX) ? p : `${p} ${SUFFIX}`;
  return withDate ? [first, MARK_LINE_2, markDate(now)] : [first, MARK_LINE_2];
}

/** Font size of the watermark in the copy's pixels: from its short edge, never under 10. */
export function markFontPx(w: number, h: number): number {
  return Math.max(10, Math.round(Math.min(w, h) / 22));
}

/**
 * Block centres of the watermark grid, in the grid's own frame (origin at the canvas centre, axes turned by
 * `angleDeg`): rows `stepY` apart, every other row shifted by half a step, far enough out that every point of the
 * `w` × `h` canvas lies inside one block's step cell.
 */
export function tileGrid(w: number, h: number, stepX: number, stepY: number, angleDeg: number): { x: number; y: number }[] {
  const a = (Math.abs(angleDeg) * Math.PI) / 180;
  const ex = (w * Math.cos(a) + h * Math.sin(a)) / 2;
  const ey = (w * Math.sin(a) + h * Math.cos(a)) / 2;
  const nx = Math.ceil(ex / stepX) + 1;
  const ny = Math.ceil(ey / stepY) + 1;
  const out: { x: number; y: number }[] = [];
  for (let j = -ny; j <= ny; j++) {
    const shift = Math.abs(j) % 2 ? stepX / 2 : 0;
    for (let i = -nx; i <= nx; i++) out.push({ x: i * stepX + shift, y: j * stepY });
  }
  return out;
}

/** `YYYYMMDD` of the local date. */
const stamp = (d: Date): string => markDate(d).replace(/\./g, '');

/** The saved file's name: fixed, never the picked file's name (it may hold a person's name). */
export function copyName(now: Date, ext: 'jpg' | 'pdf'): string {
  return `신분증_사본_${stamp(now)}.${ext}`;
}
