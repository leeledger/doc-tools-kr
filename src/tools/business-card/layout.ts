// 명함 그림 layout (CARD1026 C11), pure: the contact fields → where each text line and the QR go on the card, for a
// `measure` the caller supplies (canvas measureText on the page, a fake one in the unit tests). Every line shrinks to fit
// its box down to a floor; 주소 may take two lines; past that a line ends in 「…」. Sizes are fixed per layout, so the
// all-max card (every field at its maxLength) still fits its text box (tests/unit/business-card-layout.test.ts).
import { QUIET } from '../../lib/qr/render';
import { displayName, type ContactFields } from '../../lib/qr/vcard';

export type CardLayout = 'wide' | 'tall';
export const CARD_LAYOUTS: readonly CardLayout[] = ['wide', 'tall'];

/** Text width in px of `text` at `px` pixels and font `weight`. */
export type Measure = (text: string, px: number, weight: number) => number;

export type LineRole = 'name' | 'role' | 'org' | 'info';
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface CardLine extends Box {
  role: LineRole;
  text: string;
  px: number;
  weight: number;
  /** The text was cut and ends in 「…」. */
  ellipsis: boolean;
}
export interface CardPlan {
  width: number;
  height: number;
  /** The accent band. */
  bar: Box;
  /** The square the QR (quiet zone included) is drawn inside. */
  qr: Box;
  lines: CardLine[];
}

interface Style {
  px: number;
  floor: number;
  lineHeight: number;
  weight: number;
}
interface Spec {
  width: number;
  height: number;
  bar: Box;
  qr: Box;
  /** The text column: lines are stacked inside it, centred vertically. */
  text: Box;
  /** Space between the 회사 line and the contact lines. */
  gap: number;
  styles: Record<LineRole, Style>;
}

/** 가로 1800×1000 (QR on the right) and 세로 1080×1350 (QR at the bottom). */
export const SPECS: Readonly<Record<CardLayout, Spec>> = {
  wide: {
    width: 1800,
    height: 1000,
    bar: { x: 0, y: 0, w: 28, h: 1000 },
    qr: { x: 1100, y: 200, w: 600, h: 600 },
    text: { x: 130, y: 110, w: 900, h: 780 },
    gap: 34,
    styles: {
      name: { px: 104, floor: 60, lineHeight: 132, weight: 800 },
      role: { px: 44, floor: 30, lineHeight: 62, weight: 600 },
      org: { px: 50, floor: 32, lineHeight: 70, weight: 700 },
      info: { px: 38, floor: 28, lineHeight: 56, weight: 400 },
    },
  },
  tall: {
    width: 1080,
    height: 1350,
    bar: { x: 0, y: 0, w: 1080, h: 28 },
    qr: { x: 310, y: 800, w: 460, h: 460 },
    text: { x: 90, y: 110, w: 900, h: 650 },
    gap: 26,
    styles: {
      name: { px: 92, floor: 56, lineHeight: 118, weight: 800 },
      role: { px: 40, floor: 28, lineHeight: 56, weight: 600 },
      org: { px: 44, floor: 30, lineHeight: 62, weight: 700 },
      info: { px: 34, floor: 26, lineHeight: 50, weight: 400 },
    },
  },
};

/**
 * Smallest QR module size in card pixels that we treat as easy to scan from a re-sent picture (review C: messengers
 * resample and compress the image). An engineering floor, never stated in page copy; below it the page shows a hint.
 */
export const CARD_MIN_MODULE_PX = 4;

/** Pixels per QR module on a card of `layout` for a QR of `size` modules: the largest integer that fits the QR square with the quiet zone. */
export const cardModulePx = (layout: CardLayout, size: number): number => Math.floor(SPECS[layout].qr.w / (size + QUIET * 2));

const ELLIPSIS = '…';
const STEP = 2;

/** The largest size from `px` down to `floor` (steps of 2) at which `text` fits `w`; the text cut with 「…」 if none does. */
function fit(text: string, st: Style, w: number, measure: Measure): { text: string; px: number; ellipsis: boolean } {
  let px = st.px;
  while (px > st.floor && measure(text, px, st.weight) > w) px = Math.max(st.floor, px - STEP);
  if (measure(text, px, st.weight) <= w) return { text, px, ellipsis: false };
  const chars = [...text];
  while (chars.length && measure(chars.join('') + ELLIPSIS, px, st.weight) > w) chars.pop();
  return { text: chars.join('').trimEnd() + ELLIPSIS, px, ellipsis: true };
}

/** Splits `text` where the first part still fits `w` at `px`: at the last space in that part when there is one, else mid-word. */
function breakAt(text: string, px: number, weight: number, w: number, measure: Measure): [string, string] {
  const chars = [...text];
  let n = 0;
  while (n < chars.length && measure(chars.slice(0, n + 1).join(''), px, weight) <= w) n++;
  const head = chars.slice(0, n).join('');
  const space = head.lastIndexOf(' ');
  const cut = space > 0 && n < chars.length ? space : head.length;
  return [text.slice(0, cut).trim(), text.slice(cut).trim()];
}

/** The lines of the card in reading order: name, 직함·부서, 회사, then 휴대폰, 회사 전화, FAX, 이메일, 홈페이지, 주소 (no 메모). */
function texts(f: ContactFields): [LineRole, string][] {
  const v = (s: string): string => s.trim().replace(/\s+/g, ' ');
  const hasName = Boolean(v(f.last) || v(f.first));
  const out: [LineRole, string][] = [['name', v(displayName(f.last, f.first, f.org))]];
  const role = [v(f.title), v(f.dept)].filter(Boolean).join(' · ');
  if (role) out.push(['role', role]);
  if (hasName && v(f.org)) out.push(['org', v(f.org)]);
  if (v(f.mobile)) out.push(['info', `휴대폰 ${v(f.mobile)}`]);
  if (v(f.work)) out.push(['info', `전화 ${v(f.work)}`]);
  if (v(f.fax)) out.push(['info', `FAX ${v(f.fax)}`]);
  if (v(f.email)) out.push(['info', v(f.email)]);
  if (v(f.url)) out.push(['info', v(f.url)]);
  if (v(f.address)) out.push(['info', v(f.address)]);
  return out;
}

/** Where everything goes on a card of `layout` for the (validated) fields `f`. */
export function layoutCard(f: ContactFields, layout: CardLayout, measure: Measure): CardPlan {
  const spec = SPECS[layout];
  const { text: box, styles } = spec;
  const placed: Omit<CardLine, 'x' | 'y' | 'w'>[] = [];
  const items = texts(f);
  items.forEach(([role, t], i) => {
    const st = styles[role];
    const isAddress = role === 'info' && i === items.length - 1 && f.address.trim() !== '';
    if (isAddress && measure(t, st.floor, st.weight) > box.w) {
      // 주소: two lines at the normal size, each then fitted on its own.
      const [a, b] = breakAt(t, st.px, st.weight, box.w, measure);
      for (const part of [a, b].filter(Boolean)) placed.push({ role, ...fit(part, st, box.w, measure), weight: st.weight, h: st.lineHeight });
      return;
    }
    placed.push({ role, ...fit(t, st, box.w, measure), weight: st.weight, h: st.lineHeight });
  });
  const gapBefore = (i: number): number => (placed[i]!.role === 'info' && placed[i - 1]?.role !== 'info' && i > 0 ? spec.gap : 0);
  const total = placed.reduce((sum, l, i) => sum + l.h + gapBefore(i), 0);
  let y = box.y + Math.max(0, Math.floor((box.h - total) / 2));
  const lines = placed.map((l, i) => {
    y += gapBefore(i);
    const line: CardLine = { ...l, x: box.x, y, w: box.w };
    y += l.h;
    return line;
  });
  return { width: spec.width, height: spec.height, bar: spec.bar, qr: spec.qr, lines };
}
