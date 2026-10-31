// The character sets of the UI font (scripts/gen-ui-font.mjs), split into core and late (LCP fix after TOOLS4).
// Core: every file outside src/tools/** and src/lib/** (plus CORE_PATHS), printable ASCII and the forced
// punctuation; the two preloaded faces carry it. Late: characters only src/tools/** and src/lib/** use (status
// lines, errors), in faces the browser fetches when such text appears.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Source text without its comments: a character that only appears in a comment never renders, so it does not
 * need a glyph (Step 4: every tool's Korean code comments were growing the preloaded faces). Conservative:
 * block comments that start a line, whole-line `//` comments, `// ` after code, and HTML comments. Strings
 * such as "https://" are untouched (no space before the slashes).
 */
export function stripComments(s) {
  return s
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/[ \t]\/\/ .*$/gm, '')
    // Growth G (UI font budget): data that is never shown either: the official preset quotes (the audit trail)
    // and the tools' copywriting keywords (TOOLS4: also an official head band's bandQuote, part of its quote).
    .replace(/\b(?:quote|bandQuote):\s*'(?:[^'\\\n]|\\.)*'/g, '')
    .replace(/\bkeywords:\s*\[[^\]]*\]/g, '')
    // G2 A1: the guide topic names render only on /guide/, in the system font (src/pages/guide/index.astro).
    .replace(/\bTOPICS\s*=\s*\[[^\]]*\]/g, '')
    // REV2/REV3: the 인화·사진관 and affiliate link blocks and the guides' affiliate line render in the system font
    // (.out-links, .guide-page; src/data/print-links.ts, src/data/affiliate.ts: every visible string is in the constants below).
    // PRINT1023 B: the 인화용 모아찍기 block (.idp-sheet, system font; src/data/print-sheet.ts SHEET_COPY) too.
    // LP1028 L13: the LinkPrice groups (LP_COPY, LP_LINKS) too.
    .replace(/\b(?:PRINT_COPY|AFF_COPY|SHEET_COPY|LP_COPY)\s*=\s*\{[^}]*\}/g, '')
    .replace(/\b(?:AFF_LINKS|LP_LINKS)\b[^=\n]*=\s*\[[^\]]*\]/g, '')
    // FORM1020: a form's document text (src/lib/form/spec.ts keys doc, docLabel, docSection, docTemplate, docBlank,
    // docZero; LOAN1022) is drawn only in the document's own faces (the HWP, the PDF and their preview), never in the
    // UI font. RESIGN1027 R10: a preset's `fill` is document text and, once pressed, text in the input like anything
    // typed (the font stack falls back per glyph), so it is left out too.
    .replace(/\b(?:doc|docLabel|docSection|docTemplate|docBlank|docZero|fill):\s*'(?:[^'\\\n]|\\.)*'/g, '')
    .replace(/\bCOUPANG_DISCLOSURE\s*=\s*'(?:[^'\\\n]|\\.)*'/g, '')
    // CONTENT1021: the fact-check unit pattern (src/data/guide-facts.ts) lists syllables that are never shown.
    .replace(/\bconst UNIT\s*=\s*String\.raw`[^`]*`/g, '');
}

/** Late scope: controllers and libs, whose text appears only after interaction. */
const LATE_DIRS = ['tools', 'lib'];
/**
 * Files under src/tools/** or src/lib/** whose text is rendered into static HTML at build time (paths relative
 * to src/, forward slashes). check-dist's coverage check names any page character outside the core range; the
 * fix is an entry here, never a weaker check.
 */
export const CORE_PATHS = [
  // /pdf-compress/ renders the level descriptions and target chips into its page.
  'tools/pdf-compress/level-copy.ts',
  // /remove-background/ is a page under src/tools (flag-gated route) and renders its copy module.
  'tools/remove-background/page.astro',
  'tools/remove-background/copy.ts',
  // /english-address/ (ADDREN1016) is a flag-gated page under src/tools too; its controller copy stays late.
  'tools/english-address/page.astro',
  // IDCAM1022: /id-photo-camera/ too (PUBLIC_ID_CAMERA); its controller copy stays late.
  'tools/id-photo-camera/page.astro',
];
/** The English catalogs, components and pages (paths relative to src/): in neither the core nor the late set. */
export const EN_DIRS = ['i18n/', 'pages/en/'];
/**
 * ADS1020 D9-D10: /about/ and /contact/ render their text in the system font (.site-info in src/styles/app.css), like the
 * guide prose, so their pages and the /about/ milestone data are in neither set (paths relative to src/). SEARCH1031 D11:
 * the site search box, its module and /search/ (.site-search, .search-page) too.
 */
export const SYSTEM_FONT_PATHS = ['pages/about/', 'pages/contact/', 'data/about.ts', 'components/SiteSearch.astro', 'lib/search/', 'pages/search/'];
/**
 * LOAN1022 L-D3: files whose text is document text only (drawn in the HWP/PDF faces, never in the UI font): in neither
 * set (paths relative to src/). The 금액 한글 digits and places (일 … 구, 십 백 천, 만 억 조).
 */
export const DOC_TEXT_PATHS = ['lib/form/amount.ts'];
/** Punctuation used in generated UI strings (progress, separators, quotes). */
const FORCED = '…·—–‘’“”©';

const codepoints = (texts) => {
  const set = new Set();
  for (const ch of texts.join('')) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x20) set.add(cp);
  }
  return set;
};

/**
 * Sorted code points of the core and late faces for the source tree at `src`; `all` is their union (the single
 * set the UI font had before the split).
 * @returns {{ core: number[], late: number[], all: number[] }}
 */
export function uiCharSets(src) {
  const coreTexts = [];
  const lateTexts = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(astro|ts|json|css)$/.test(e.name)) {
        const rel = relative(src, p).split(sep).join('/');
        // EN1 (brief EN decision 4): English text renders in the system font (html[lang="en"]), so neither set needs it.
        if (EN_DIRS.some((d) => rel.startsWith(d))) continue;
        if (SYSTEM_FONT_PATHS.some((d) => rel.startsWith(d))) continue;
        if (DOC_TEXT_PATHS.includes(rel)) continue;
        const t = readFileSync(p, 'utf8');
        const late = LATE_DIRS.includes(rel.split('/')[0]) && !CORE_PATHS.includes(rel);
        (late ? lateTexts : coreTexts).push(e.name.endsWith('.json') ? t : stripComments(t));
      }
    }
  };
  walk(src);
  const core = codepoints(coreTexts);
  for (let cp = 0x20; cp < 0x7f; cp++) core.add(cp);
  for (const ch of FORCED) core.add(ch.codePointAt(0));
  const late = [...codepoints(lateTexts)].filter((cp) => !core.has(cp));
  const byCp = (a, b) => a - b;
  return { core: [...core].sort(byCp), late: late.sort(byCp), all: [...core, ...late].sort(byCp) };
}
