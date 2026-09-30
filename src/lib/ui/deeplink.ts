// Tool deep links (Growth G.5). Pure: no DOM. A link like /id-photo/?preset=gosi or /photo-compress/?target=200
// opens the tool with that option chosen. Only whitelisted params with valid values are read; anything else is
// ignored and the tool keeps its defaults. The canonical URL of a tool page never carries a query (G.3).
import { DEFAULT_PRESET_ID as DEFAULT_PRESET, PRESET_IDS } from '../../data/preset-ids';
import { DEFAULT_FORM, RANGES } from '../../tools/photo-compress/options';
import { TARGET_MB } from '../../tools/pdf-compress/target';

export type DeepSlug = 'id-photo' | 'photo-compress' | 'pdf-compress';

export interface DeepState {
  /** /id-photo/: a preset id (never "custom"). */
  preset?: string;
  /** /photo-compress/: KB (integer); /pdf-compress/: MB (at most one decimal). */
  target?: number;
}

/** The one param each tool reads. */
export const DEEP_PARAM: Record<DeepSlug, 'preset' | 'target'> = {
  'id-photo': 'preset',
  'photo-compress': 'target',
  'pdf-compress': 'target',
};

/** A value longer than this is ignored without looking at it. */
export const MAX_PARAM_LENGTH = 20;

export const isDeepSlug = (slug: string): slug is DeepSlug => Object.hasOwn(DEEP_PARAM, slug);

/** The defaults (/photo-compress/ target mode 500 KB, /id-photo/ the passport preset) are omitted from a serialized link. */
const PHOTO_DEFAULT_KB = Number(DEFAULT_FORM.target);

function value(slug: DeepSlug, raw: string): DeepState | null {
  if (slug === 'id-photo') {
    return /^[a-z_]+$/.test(raw) && raw !== 'custom' && (PRESET_IDS as readonly string[]).includes(raw) ? { preset: raw } : null;
  }
  if (slug === 'photo-compress') {
    if (!/^\d{1,5}$/.test(raw)) return null;
    const kb = Number(raw);
    return kb >= RANGES.targetKb.min && kb <= RANGES.targetKb.max ? { target: kb } : null;
  }
  if (!/^\d{1,3}(\.\d)?$/.test(raw)) return null;
  const mb = Number(raw);
  return mb >= TARGET_MB.min && mb <= TARGET_MB.max ? { target: mb } : null;
}

/** The valid deep-link state of `slug` in `params`, or null (unknown tool, no param, or an invalid value). */
export function parse(slug: string, params: URLSearchParams | string): DeepState | null {
  if (!isDeepSlug(slug)) return null;
  const p = typeof params === 'string' ? new URLSearchParams(params) : params;
  const raw = p.get(DEEP_PARAM[slug]);
  if (raw === null || raw.length === 0 || raw.length > MAX_PARAM_LENGTH) return null;
  return value(slug, raw);
}

/** "?preset=gosi", "?target=200", or "" (no state, or the tool's default). Whitelisted params only. */
export function serialize(slug: string, state: DeepState | null | undefined): string {
  if (!isDeepSlug(slug) || !state) return '';
  const param = DEEP_PARAM[slug];
  const v = param === 'preset' ? state.preset : state.target;
  if (v === undefined) return '';
  const text = String(v);
  const checked = value(slug, text);
  if (!checked) return '';
  if (slug === 'photo-compress' && checked.target === PHOTO_DEFAULT_KB) return '';
  if (slug === 'id-photo' && checked.preset === DEFAULT_PRESET) return '';
  return `?${param}=${text}`;
}

/**
 * A site-internal href that opens a live tool page, with or without a deep link: "/pdf-merge/",
 * "/id-photo/?preset=gosi". Null when the path is not a tool path, or when a query is present that is not
 * exactly one valid param in its plain form (so a CTA can never carry an unknown or invalid param).
 */
export function parseHref(href: string, toolSlugs: readonly string[]): { slug: string; state: DeepState | null } | null {
  const m = /^\/([a-z0-9-]+)\/(\?[^#]*)?$/.exec(href);
  if (!m || !toolSlugs.includes(m[1]!)) return null;
  const slug = m[1]!;
  const query = m[2] ?? '';
  if (!query) return { slug, state: null };
  const state = parse(slug, query);
  if (!state) return null;
  const param = DEEP_PARAM[slug as DeepSlug];
  // Exactly one param in its plain form ("?target=200", not "?target=0200&x=1").
  if (query !== `?${param}=${String(param === 'preset' ? state.preset : state.target)}`) return null;
  return { slug, state };
}
