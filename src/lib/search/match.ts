// SEARCH1031 D6/D8: the site search matcher. Pure: search(index, query) ranks the tools and guides of the build-time
// index (src/pages/search-index.json.ts) for what a visitor typed, with alias folding, intent concepts, the choseong
// mode and a jamo-distance typo allowance. No dependency; runs in the page module (ui.ts) and in Node (unit tests).
import { clean } from './normalize';
import { choseong, distance, fuzzyBudget, isChoseongQuery, toJamo } from './hangul';
import { ALIASES, CONCEPTS, PARTICLES, POPULAR, STOPWORDS, type Concept } from './synonyms';

/** A tool: url, name, summary, keywords, FAQ questions. */
export interface ToolDoc {
  u: string;
  n: string;
  s: string;
  k: string[];
  f: string[];
}
/** A guide or hub: url, title, search query, category. */
export interface GuideDoc {
  u: string;
  n: string;
  q: string;
  c: string;
}
export interface SearchIndex {
  v: 1;
  t: ToolDoc[];
  g: GuideDoc[];
}
export interface SearchResult {
  tools: ToolDoc[];
  guides: GuideDoc[];
  /** 많이 찾는 도구: filled for an empty query and when nothing matched, else empty. */
  popular: ToolDoc[];
}

export const MAX_TOOLS = 6;
export const MAX_GUIDES = 4;
/** D8 field scores. A typo or a half-typed word (fuzzy) on a name word or a concept term outranks one on a keyword. */
export const SCORE = { exact: 1000, name: 100, concept: 60, choseong: 50, keyword: 40, fuzzyName: 30, fuzzy: 20, summary: 15, faq: 8 } as const;

/** The shortest half-typed last word (in jamo) completed to the words it starts (샂 -> 사진, 압추 -> 압축). */
export const PREFIX_MIN = 2;

/** Korean readings of the Latin alias keys (pdf -> 피디에프, 피디프), so the choseong mode finds PDF tools (ㅍㄷㅍ). */
const READINGS = ALIASES.filter((a) => /^[a-z]+$/.test(a.key)).map((a) => ({ key: a.key, readings: a.variants.filter((v) => /^[가-힣]+$/.test(v)) }));

/** The choseong strings of a text: as written, and with each Latin alias key read in Korean. */
function choseongs(text: string): string[] {
  const t = clean(text);
  const out = [choseong(t)];
  for (const { key, readings } of READINGS) if (t.includes(key)) for (const r of readings) out.push(choseong(t.split(key).join(r)));
  return out;
}

const VARIANTS = ALIASES.flatMap((a) => a.variants.map((v) => ({ v, key: a.key, word: a.word === true }))).sort((a, b) => b.v.length - a.v.length);

/** One cleaned word with its aliases folded to their keys. */
export function foldWord(w: string): string {
  let out = w;
  for (const { v, key, word } of VARIANTS) {
    if (v === key) continue;
    if (word) {
      if (out.startsWith(v)) out = key + out.slice(v.length);
    } else if (out.includes(v)) out = out.split(v).join(key);
  }
  return out;
}

/** Folded words of a text. */
export function words(text: string): string[] {
  const c = clean(text);
  return c ? c.split(' ').map(foldWord) : [];
}

/** The word without a trailing particle, when it has three or more letters (D8); else the word. */
export function stripParticle(w: string): string {
  if ([...w].length < 3) return w;
  for (const p of PARTICLES) if (w.endsWith(p) && [...w].length - p.length >= 2) return w.slice(0, -p.length);
  return w;
}

interface Token {
  /** The forms tried (folded word, and without its particle), best hit wins. */
  forms: string[];
  cho: boolean;
}

/** The query's meaningful tokens (stopwords dropped) and the whole query without spaces, folded. */
export function tokenize(query: string): { tokens: Token[]; whole: string } {
  const raw = clean(query.slice(0, 200)).split(' ').filter((w) => w && !STOPWORDS.includes(w));
  const tokens: Token[] = [];
  const kept: string[] = [];
  for (const w of raw.slice(0, 12)) {
    const base = stripParticle(w);
    if (STOPWORDS.includes(base)) continue;
    const forms = [...new Set([foldWord(w), foldWord(base)])];
    kept.push(forms[forms.length - 1]!);
    tokens.push({ forms, cho: isChoseongQuery(w) });
  }
  return { tokens, whole: tokens.length > 1 ? kept.join('') : '' };
}

interface Prepared<D> {
  doc: D;
  slug: string;
  name: string;
  /** Exact-equality form of the name (folded, no spaces). */
  nameKey: string;
  keys: string[];
  cho: string[];
  summary: string;
  faq: string[];
  concepts: Set<string>;
  terms: string[];
  /** The terms as jamo (fuzzy matching). */
  termJamo: string[];
  /** The name (title) words as jamo: a fuzzy hit on one of them scores SCORE.fuzzyName. */
  nameJamo: string[];
}

const compactWords = (t: string): string => words(t).join('');
const slugOf = (u: string): string => u.replace(/^\/(?:guide\/)?|\/$/g, '');

function prepTool(d: ToolDoc, table: readonly Concept[]): Prepared<ToolDoc> {
  const slug = slugOf(d.u);
  const name = compactWords(d.n);
  return {
    doc: d,
    slug,
    name,
    nameKey: name,
    keys: d.k.map(compactWords),
    cho: [d.n, ...d.k].flatMap(choseongs),
    summary: compactWords(d.s),
    faq: d.f.map(compactWords),
    concepts: new Set(table.filter((c) => c.tools.includes(slug)).map((c) => c.id)),
    ...termsOf(words(d.n), d.k.flatMap(words)),
  };
}

function termsOf(names: string[], rest: string[]): { terms: string[]; termJamo: string[]; nameJamo: string[] } {
  const terms = [...new Set([...names, ...rest])];
  return { terms, termJamo: terms.map(toJamo), nameJamo: [...new Set(names)].map(toJamo) };
}

function prepGuide(d: GuideDoc): Prepared<GuideDoc> {
  return {
    doc: d,
    slug: slugOf(d.u),
    name: '',
    nameKey: '',
    keys: [compactWords(d.n), compactWords(d.q)].filter(Boolean),
    cho: [],
    summary: '',
    faq: [],
    concepts: new Set(),
    ...termsOf(words(d.n), words(d.q)),
  };
}

type PreparedIndex = {
  tools: Prepared<ToolDoc>[];
  guides: Prepared<GuideDoc>[];
  conceptJamo: Map<string, string[]>;
  /** Every word a half-typed last word can complete to (terms, concept terms, alias keys) and its jamo. */
  vocab: [word: string, jamo: string][];
};
const cache = new WeakMap<SearchIndex, WeakMap<readonly Concept[], PreparedIndex>>();
function prepare(index: SearchIndex, table: readonly Concept[]): PreparedIndex {
  let byTable = cache.get(index);
  if (!byTable) cache.set(index, (byTable = new WeakMap()));
  let p = byTable.get(table);
  if (!p) {
    const tools = index.t.map((d) => prepTool(d, table));
    const guides = index.g.map(prepGuide);
    // Alias variants complete to their key (한그 -> 한글 -> hwp, 큐아 -> 큐알 -> qr).
    const vocab = new Map<string, string>();
    const add = (word: string, as: string): void => {
      const j = toJamo(word);
      if (!vocab.has(j)) vocab.set(j, as);
    };
    for (const d of [...tools, ...guides]) for (const t of d.terms) add(t, t);
    for (const c of table) for (const t of c.terms) add(t, t);
    for (const a of ALIASES) for (const v of [a.key, ...a.variants]) add(v, a.key);
    p = { tools, guides, conceptJamo: new Map(table.map((c) => [c.id, c.terms.map(toJamo)])), vocab: [...vocab].map(([j, w]) => [w, j]) };
    byTable.set(table, p);
  }
  return p;
}

/** Concept ids a token form names (it equals or contains one of their terms). */
function conceptsOf(form: string, table: readonly Concept[]): Set<string> {
  return new Set(table.filter((c) => c.terms.some((t) => form.includes(t))).map((c) => c.id));
}

/** Best field score of one token form for one doc, and the sum of every field it hit (tie-break). */
function hit(p: Prepared<ToolDoc | GuideDoc>, form: string, cho: boolean, concepts: Set<string>): [number, number] {
  if (cho) {
    const s = p.cho.some((c) => c.includes(form)) ? SCORE.choseong : 0;
    return [s, s];
  }
  const fields = [
    p.name.includes(form) ? SCORE.name : 0,
    [...p.concepts].some((c) => concepts.has(c)) ? SCORE.concept : 0,
    p.keys.some((k) => k.includes(form)) ? SCORE.keyword : 0,
    p.summary.includes(form) ? SCORE.summary : 0,
    p.faq.some((f) => f.includes(form)) ? SCORE.faq : 0,
  ];
  return [Math.max(...fields), fields.reduce((a, b) => a + b, 0)];
}

type Doc = Prepared<ToolDoc | GuideDoc>;
/** Loose (typo or half-typed) hits: doc -> score. */
type Loose = Map<Doc, number>;

/**
 * Docs whose single terms (name words, keywords, concept terms) are within the jamo allowance of the form (D8):
 * SCORE.fuzzyName for a name word or a concept term, SCORE.fuzzy for a keyword only.
 */
function fuzzyDocs(form: string, all: Doc[], conceptJamo: Map<string, string[]>): Loose {
  const out: Loose = new Map();
  const j = toJamo(form);
  const max = fuzzyBudget([...j].length);
  if (!max) return out;
  const near = (t: string): boolean => distance(j, t, max) <= max;
  const concepts = new Set([...conceptJamo].filter(([, terms]) => terms.some(near)).map(([id]) => id));
  for (const p of all) {
    if (p.nameJamo.some(near) || [...p.concepts].some((c) => concepts.has(c))) out.set(p, SCORE.fuzzyName);
    else if (p.termJamo.some(near)) out.set(p, SCORE.fuzzy);
  }
  return out;
}

/**
 * The last word while it is still being typed (샂, 사지, 압추, 증명ㅅ): the docs that a word it is the jamo start of
 * would find, at the fuzzy scores (a name or concept hit above a keyword hit). A finished word is not the jamo start
 * of a different one (사진 ㅅㅏㅈㅣㄴ never starts 사직서 ㅅㅏㅈㅣㄱㅅㅓ).
 */
function prefixDocs(form: string, all: Doc[], vocab: PreparedIndex['vocab'], cOf: (form: string) => Set<string>): Loose {
  const out: Loose = new Map();
  const j = toJamo(form);
  if ([...j].length < PREFIX_MIN) return out;
  const done = vocab.filter(([w, wj]) => wj.length > j.length && wj.startsWith(j) && w !== form).map(([w]) => w);
  if (!done.length) return out;
  for (const p of all) {
    let s = 0;
    for (const w of done) {
      const b = hit(p, w, false, cOf(w))[0];
      s = Math.max(s, b >= SCORE.concept ? SCORE.fuzzyName : b > 0 ? SCORE.fuzzy : 0);
      if (s === SCORE.fuzzyName) break;
    }
    if (s) out.set(p, s);
  }
  return out;
}

interface Ranked<D> {
  p: Prepared<D>;
  covered: number;
  score: number;
  breadth: number;
}

function rank<D extends ToolDoc | GuideDoc>(list: Prepared<D>[], q: ReturnType<typeof tokenize>, loose: Map<number, Loose[]>, cOf: (form: string) => Set<string>): Ranked<D>[] {
  const need = Math.ceil(q.tokens.length / 2);
  const out: Ranked<D>[] = [];
  for (const p of list) {
    let covered = 0;
    let score = 0;
    let breadth = 0;
    q.tokens.forEach((t, i) => {
      let best = 0;
      let wide = 0;
      for (const f of t.forms) {
        const [b, w] = hit(p, f, t.cho, cOf(f));
        best = Math.max(best, b);
        wide = Math.max(wide, w);
      }
      if (!best) for (const m of loose.get(i) ?? []) best = wide = Math.max(best, m.get(p) ?? 0);
      if (best) covered++;
      score += best;
      breadth += wide;
    });
    if (q.whole) {
      const exact = p.nameKey !== '' && p.nameKey === q.whole;
      const [b, w] = exact ? [SCORE.exact, SCORE.exact] : hit(p, q.whole, false, cOf(q.whole));
      // The whole query matching covers every token (pdf합치기 typed as 「pdf 합치기」).
      if (b) covered = q.tokens.length;
      score += b;
      breadth += w;
    } else if (q.tokens.length === 1 && p.nameKey !== '' && q.tokens[0]!.forms.includes(p.nameKey)) {
      score += SCORE.exact;
    }
    if (covered >= need && score > 0) out.push({ p, covered, score, breadth });
  }
  // Ties (D8: covered, score, then name): first the doc hit in more fields, then the 많이 찾는 도구 order (「pdf」 lists
  // PDF 합치기 and PDF 용량 줄이기 before the other PDF tools), then the name.
  const pop = (p: Prepared<D>): number => {
    const i = POPULAR.indexOf(p.slug);
    return i < 0 ? POPULAR.length : i;
  };
  return out.sort((a, b) => b.covered - a.covered || b.score - a.score || b.breadth - a.breadth || pop(a.p) - pop(b.p) || a.p.doc.n.localeCompare(b.p.doc.n, 'ko'));
}

/**
 * The tools and guides for a query, best first (D8), with the 많이 찾는 도구 list when there is nothing to show.
 * `table`: the concept table (default: this build's; the unit tests pass one with every release flag on).
 */
export function search(index: SearchIndex, query: string, table: readonly Concept[] = CONCEPTS): SearchResult {
  const { tools, guides, conceptJamo, vocab } = prepare(index, table);
  const popular = (): ToolDoc[] => POPULAR.map((s) => tools.find((t) => t.slug === s)?.doc).filter((d): d is ToolDoc => d !== undefined);
  const q = tokenize(query);
  if (!q.tokens.length) return { tools: [], guides: [], popular: popular() };
  const all: Doc[] = [...tools, ...guides];
  const memo = new Map<string, Set<string>>();
  const cOf = (form: string): Set<string> => {
    let c = memo.get(form);
    if (!c) memo.set(form, (c = conceptsOf(form, table)));
    return c;
  };
  // Loose hits count only for a doc the token misses outright, never in choseong mode: the typo allowance for a token
  // with no exact, alias or concept hit anywhere, and the jamo-start completion of the last token (still being typed).
  const loose = new Map<number, Loose[]>();
  q.tokens.forEach((t, i) => {
    if (t.cho) return;
    const maps: Loose[] = [];
    const anyHit = t.forms.some((f) => {
      const c = cOf(f);
      return c.size > 0 || all.some((p) => hit(p, f, false, c)[0] > 0);
    });
    if (!anyHit) maps.push(fuzzyDocs(t.forms[t.forms.length - 1]!, all, conceptJamo));
    if (i === q.tokens.length - 1) maps.push(prefixDocs(t.forms[0]!, all, vocab, cOf));
    loose.set(i, maps);
  });
  const foundTools = rank(tools, q, loose, cOf).slice(0, MAX_TOOLS).map((r) => r.p.doc);
  const foundGuides = rank(guides, q, loose, cOf).slice(0, MAX_GUIDES).map((r) => r.p.doc);
  return { tools: foundTools, guides: foundGuides, popular: foundTools.length || foundGuides.length ? [] : popular() };
}
