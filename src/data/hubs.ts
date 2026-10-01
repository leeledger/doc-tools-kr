// The two hub pages (G2 A1): /guide/photo-sizes/ and /guide/upload-limits/. Their tables are built at build time
// from the published guides' spec rows; a preset row takes every number from src/data/id-photo-presets.ts, a
// literal row from its guide (whose quotes back it). Nothing is typed twice, so a hub cannot drift from a guide.
// Pure: the pages and the unit tests call it with the guides.
import { getPreset, type IdPreset } from './id-photo-presets';
import { key, numberUnits, type SpecRow } from './guide-facts';
import { presetLimit } from './quicklinks';

export const HUB_SLUGS = ['photo-sizes', 'upload-limits'] as const;
export type HubSlug = (typeof HUB_SLUGS)[number];

export interface HubGuide {
  id: string;
  data: { title: string; cta: { href: string }; spec: readonly SpecRow[] };
}

export interface HubRow {
  label: string;
  kind: SpecRow['kind'];
  /** "413×531 픽셀", "3.5×4.5 cm · 137×177 픽셀", or '' when the source states no size. */
  size: string;
  /** "500 KB 이하", "350 KB 미만", "25 MB 이하", or ''. */
  limit: string;
  format: string;
  guide: { slug: string; title: string };
  /** The tool link that fits a file to this row (an id-photo preset deep link for a preset row); '' when no tool
   * of ours makes such a file (`fit: false`). */
  fit: string;
  /** Every "number unit" the row shows (the hub fact check). */
  facts: string[];
}

const dims = (w: number, h: number, unit: string): string => `${w}×${h} ${unit}`;
const kbText = (kb: number, rule: string): string => (kb >= 1000 && kb % 1000 === 0 ? `${kb / 1000} MB ${rule}` : `${kb} KB ${rule}`);

/** The size a preset's own quote states: pixels and print size only when the quote holds both numbers. */
function presetSize(p: IdPreset): string {
  const quoted = new Set(numberUnits(p.quote ?? ''));
  const parts: string[] = [];
  if (p.mm && quoted.has(key(p.mm.w / 10, 'cm')) && quoted.has(key(p.mm.h / 10, 'cm'))) parts.push(dims(p.mm.w / 10, p.mm.h / 10, 'cm'));
  if (quoted.has(key(p.outW, '픽셀')) && quoted.has(key(p.outH, '픽셀'))) parts.push(dims(p.outW, p.outH, '픽셀'));
  return parts.join(' · ');
}

function rowOf(r: SpecRow, g: HubGuide): HubRow {
  const guide = { slug: g.id, title: g.data.title };
  const ctaFits = r.kind === 'photo' ? g.data.cta.href.startsWith('/id-photo/') : true;
  if (r.preset) {
    const p = getPreset(r.preset)!;
    const lim = presetLimit(p);
    const size = presetSize(p);
    const limit = lim ? kbText(lim.kb, lim.rule) : '';
    return { label: r.label, kind: r.kind, size, limit, format: r.format ?? '', guide, fit: `/id-photo/?preset=${p.id}`, facts: numberUnits(`${size} ${limit}`) };
  }
  const size = [r.mm ? dims(r.mm.w / 10, r.mm.h / 10, 'cm') : '', r.px ? dims(r.px.w, r.px.h, '픽셀') : ''].filter(Boolean).join(' · ');
  const limit = r.kb !== undefined ? kbText(r.kb, '이하') : r.mb !== undefined ? `${r.mb} MB 이하` : '';
  const fit = r.fit === false ? '' : ctaFits ? g.data.cta.href : '/id-photo/';
  return { label: r.label, kind: r.kind, size, limit, format: r.format ?? '', guide, fit, facts: numberUnits(`${size} ${limit}`) };
}

/** Every spec row of the given kind, in the guides' order (one row per spec row). */
export function hubRows(guides: readonly HubGuide[], kind: SpecRow['kind']): HubRow[] {
  return guides.flatMap((g) => g.data.spec.filter((r) => r.kind === kind).map((r) => rowOf(r, g)));
}

/** The spec-row kind a hub is built from: it must link every guide with such a row. (/guide/upload-limits/ also
 * lists the photo rows that state a file limit, in a second table.) */
export const HUB_KIND: Record<HubSlug, SpecRow['kind']> = { 'photo-sizes': 'photo', 'upload-limits': 'upload' };
