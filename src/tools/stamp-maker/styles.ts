// 도장 만들기 (STAMP1015 D3): the 12 stamp styles. The ids are also the usage values (scripts/lib/usage.mjs STAMP_STYLES;
// a unit test keeps them equal); the names are late labels (controller text, any glyph).
import type { SizeMm } from './limits';

export const STYLE_IDS = [
  'round',
  'round-double',
  'oval',
  'square-seal',
  'square-round',
  'square-inverse',
  'rect-v',
  'rect-h',
  'plain',
  'corp-round',
  'corp-square',
  'date-round',
] as const;
export type StyleId = (typeof STYLE_IDS)[number];

/** personal = a person's name; corp = a company name; date = name under a date and a label. */
export type StyleKind = 'personal' | 'corp' | 'date';

export interface StyleDef {
  id: StyleId;
  /** Tile label (late copy). */
  name: string;
  kind: StyleKind;
  /** Most graphemes of typed text this style takes (D3); over it the tile is disabled, never clipped. */
  max: number;
  /** Most cells after the 인/지인 suffix (square grids only). */
  maxCells?: number;
  /** Frame width / height; 0 = from the text (plain). */
  aspect: number;
  /** Spaces are kept (collapsed to one) instead of dropped (D4). */
  keepSpaces: boolean;
  /** 가로/세로 toggle offered (D4). */
  orient: boolean;
  /** Text runs vertically unless the person picks 가로. */
  vertical: boolean;
  /** 붙이는 글자 control offered (D4). */
  suffix: boolean;
  defaultMm: SizeMm;
}

const P = (id: StyleId, name: string, more: Partial<StyleDef>): StyleDef => ({
  id,
  name,
  kind: 'personal',
  max: 6,
  aspect: 1,
  keepSpaces: false,
  orient: true,
  vertical: true,
  suffix: false,
  defaultMm: 15,
  ...more,
});

export const STYLES: Record<StyleId, StyleDef> = {
  round: P('round', '원형', {}),
  'round-double': P('round-double', '겹원', {}),
  oval: P('oval', '타원', { aspect: 0.72 }),
  'square-seal': P('square-seal', '사각 인감', { max: 9, maxCells: 9, suffix: true }),
  'square-round': P('square-round', '둥근 사각', { max: 9, maxCells: 9, suffix: true }),
  'square-inverse': P('square-inverse', '사각 음각', { max: 9, maxCells: 9, suffix: true }),
  'rect-v': P('rect-v', '세로 직사각', { max: 5, aspect: 0.5, orient: false }),
  'rect-h': P('rect-h', '가로 직사각', { max: 8, aspect: 2.4, orient: false, vertical: false, keepSpaces: true }),
  plain: P('plain', '선 없는 이름', { max: 8, aspect: 0, vertical: false, keepSpaces: true }),
  'corp-round': P('corp-round', '법인 직인', { kind: 'corp', max: 20, orient: false, vertical: false, keepSpaces: true, defaultMm: 24 }),
  'corp-square': P('corp-square', '사각 직인', { kind: 'corp', max: 16, maxCells: 16, suffix: true, orient: false, defaultMm: 24 }),
  'date-round': P('date-round', '날짜 도장', { kind: 'date', max: 5, orient: false, vertical: false, defaultMm: 18 }),
};

/** date-round top labels (D3). */
export const DATE_LABELS = ['확인', '승인', '검토', '접수', '완료', '결재'] as const;
export type DateLabel = (typeof DATE_LABELS)[number];

/** corp-round centre text default (D3). */
export const DEFAULT_CENTER = '대표이사';
/** Sample text painted before the person types (D3; marked 예시 in the page). */
export const SAMPLE_PERSONAL = '홍길동';
export const SAMPLE_CORP = '문서딱';

export function isStyleId(v: unknown): v is StyleId {
  return typeof v === 'string' && (STYLE_IDS as readonly string[]).includes(v);
}
