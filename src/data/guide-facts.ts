// Fact check of the guides (Growth G.1, T9): every number with a unit that a guide shows must come from the
// verbatim quotes of that guide's sources, from a preset it cites (src/data/id-photo-presets.ts, the single
// source of truth) or from a tool fact it lists (src/data/tool-facts.ts). The build runs this on the guide's
// text and fails on any other number; the dist test runs it again on the rendered page.
import { getPreset, type IdPreset } from './id-photo-presets';
import { TOOL_FACTS, isToolFactRef } from './tool-facts';

export type Unit = 'KB' | 'MB' | '픽셀' | 'cm' | 'mm' | '개월';

export type GuideSource = { preset: string } | { url: string; title: string; quote: string; retrieved: string; via?: 'browser' };

export interface FactInput {
  sources: readonly GuideSource[];
  toolFacts?: readonly { ref: string; value: number | string }[];
}

/** A spec row (G2 A1; the zod shape is in guide-schema.ts). */
export interface SpecRow {
  label: string;
  kind: 'photo' | 'upload';
  preset?: string;
  px?: { w: number; h: number };
  kb?: number;
  mb?: number;
  mm?: { w: number; h: number };
  format?: string;
  fit?: boolean;
}

/**
 * The "number unit" facts a literal spec row states; a print size counts in cm (how the agencies write it) or mm.
 * Each entry lists the spellings that back it: one of them must be allowed.
 */
export function specRowFacts(r: SpecRow): string[][] {
  const out: string[][] = [];
  if (r.px) out.push([key(r.px.w, '픽셀')], [key(r.px.h, '픽셀')]);
  if (r.kb !== undefined) out.push([key(r.kb, 'KB')]);
  if (r.mb !== undefined) out.push([key(r.mb, 'MB')]);
  if (r.mm) for (const v of [r.mm.w, r.mm.h]) out.push([key(v / 10, 'cm'), key(v, 'mm')]);
  return out;
}

/** Spec-row problems of a guide (empty = ok): a preset row cites an official preset of this guide and states no
 * literal value; a literal row states something, and every number is backed by this guide's quotes. */
export function specProblems(g: FactInput & { spec?: readonly SpecRow[] }): string[] {
  const e: string[] = [];
  const allowed = allowedFacts(g);
  for (const r of g.spec ?? []) {
    const literal = r.px || r.kb !== undefined || r.mb !== undefined || r.mm;
    if (r.preset) {
      const p = getPreset(r.preset);
      if (!p || p.status !== 'official') e.push(`spec "${r.label}": preset "${r.preset}" is not an official preset`);
      if (!g.sources.some((s) => 'preset' in s && s.preset === r.preset)) e.push(`spec "${r.label}": preset "${r.preset}" is not a source of this guide`);
      if (literal) e.push(`spec "${r.label}": a preset row takes its numbers from the preset`);
      continue;
    }
    if (!literal && !r.format) e.push(`spec "${r.label}": states nothing`);
    for (const alts of specRowFacts(r)) if (!alts.some((f) => allowed.has(f))) e.push(`spec "${r.label}": ${alts[0]} has no source`);
  }
  return e;
}

const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
// "pixel" and "px" appear only inside official quotes (never rendered); they count as 픽셀.
const UNIT = String.raw`(?:KB|MB|kb|픽셀|pixel|px|cm|mm|개월)(?![A-Za-z])`;
const SEP = String.raw`\s*(?:×|x|X|\*|~|–|-)\s*`;
const CHAIN = new RegExp(String.raw`(?<![\d.,])${NUM}(?:\s*${UNIT})?(?:${SEP}${NUM}(?:\s*${UNIT})?)*`, 'g');
const PART = new RegExp(String.raw`(${NUM})(?:\s*(${UNIT}))?`, 'g');

const unitOf = (u: string): Unit => {
  const l = u.toLowerCase();
  if (l === 'kb') return 'KB';
  if (l === 'mb') return 'MB';
  if (l === 'pixel' || l === 'px') return '픽셀';
  return u as Unit;
};
const norm = (n: string): string => String(Number(n.replace(/,/g, '')));
export const key = (n: number | string, unit: Unit): string => `${norm(String(n))} ${unit}`;

/**
 * Agencies' unit spellings as the check reads them (G2 A2): the compatibility signs U+339D and U+339C
 * (cm, mm; 정부24) and a capitalised unit right after a number ("3Cm × 4Cm(126*165 Pixel)", TEPS). Only the reading changes; quotes stay verbatim.
 */
export const unitSpellings = (text: string): string =>
  text
    .replace(/\u339D/g, 'cm')
    .replace(/\u339C/g, 'mm')
    .replace(/(\d\s*)(Cm|CM|Mm|MM|Pixel|PIXEL|Px|PX)(?![A-Za-z])/g, (_, n: string, u: string) => n + u.toLowerCase());

/**
 * Every "number unit" in `text` as "413 픽셀", "3.5 cm", "500 KB". In a chain such as "3.5cm x 4.5cm",
 * "413×531픽셀" or "3.2~3.6cm", a number without its own unit takes the chain's last unit. Numbers without any
 * unit (dates, counts, 쪽, 장, 개) are not facts this check covers.
 */
export function numberUnits(text: string): string[] {
  const out: string[] = [];
  for (const chain of unitSpellings(text).match(CHAIN) ?? []) {
    const parts = [...chain.matchAll(PART)].map((m) => ({ n: m[1]!, u: m[2] }));
    const last = [...parts].reverse().find((p) => p.u)?.u;
    if (!last) continue;
    for (const p of parts) out.push(key(p.n, unitOf(p.u ?? last)));
  }
  return out;
}

/** The facts a preset source vouches for: its structured values and every number in its quote. */
export function presetFacts(p: IdPreset): string[] {
  const out = [key(p.outW, '픽셀'), key(p.outH, '픽셀')];
  if (p.pxRange) for (const v of [...p.pxRange.w, ...p.pxRange.h]) out.push(key(v, '픽셀'));
  if (p.limitBytes !== undefined && p.limitRule) {
    const kb = p.limitRule === 'lt' ? (p.limitBytes + 1) / 1000 : p.limitBytes / 1000;
    out.push(key(kb, 'KB'));
    if (kb >= 1000 && kb % 1000 === 0) out.push(key(kb / 1000, 'MB'));
  }
  if (p.mm) out.push(key(p.mm.w / 10, 'cm'), key(p.mm.h / 10, 'cm'), key(p.mm.w, 'mm'), key(p.mm.h, 'mm'));
  if (p.quote) out.push(...numberUnits(p.quote));
  return out;
}

/** Every "number unit" the guide may show. */
export function allowedFacts(g: FactInput): Set<string> {
  const allowed = new Set<string>();
  for (const s of g.sources) {
    if ('preset' in s) {
      const p = getPreset(s.preset);
      if (p) for (const f of presetFacts(p)) allowed.add(f);
    } else {
      for (const f of numberUnits(s.quote)) allowed.add(f);
    }
  }
  for (const f of g.toolFacts ?? []) {
    if (!isToolFactRef(f.ref)) continue;
    const fact: { value: number | string; unit?: 'KB' | 'MB' } = TOOL_FACTS[f.ref];
    if (fact.unit && typeof fact.value === 'number') allowed.add(key(fact.value, fact.unit));
  }
  return allowed;
}

/** The numbers with a unit in `text` that no source, preset or tool fact of the guide backs (empty = ok). */
export function unsourcedFacts(g: FactInput, text: string): string[] {
  const allowed = allowedFacts(g);
  return [...new Set(numberUnits(text).filter((f) => !allowed.has(f)))];
}

export interface ResolvedSource {
  url: string;
  /** What the link says (an agency page title, or the preset's agency). */
  title: string;
  retrieved: string;
}

/** Sources as the page lists them: a preset resolves to its first source URL, its agency and its date. The preset
 * label loses its own parentheses inside the title's ("인사혁신처 공무원 채용시스템 (국가공무원 시험)"). */
export function resolveSources(sources: readonly GuideSource[]): ResolvedSource[] {
  const out: ResolvedSource[] = [];
  for (const s of sources) {
    if ('preset' in s) {
      const p = getPreset(s.preset);
      if (p?.sourceUrls[0]) out.push({ url: p.sourceUrls[0], title: `${p.source} (${p.label.replace(/\s*\([^)]*\)/g, '')})`, retrieved: p.retrieved });
    } else {
      out.push({ url: s.url, title: s.title, retrieved: s.retrieved });
    }
  }
  // One entry per URL (two presets or quotes from the same page): the most recent date.
  const byUrl = new Map<string, ResolvedSource>();
  for (const s of out) {
    const prev = byUrl.get(s.url);
    if (!prev || s.retrieved > prev.retrieved) byUrl.set(s.url, s);
  }
  return [...byUrl.values()];
}
