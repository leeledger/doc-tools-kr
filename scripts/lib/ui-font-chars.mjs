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
    .replace(/\bTOPICS\s*=\s*\[[^\]]*\]/g, '');
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
];
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
        const t = readFileSync(p, 'utf8');
        const rel = relative(src, p).split(sep).join('/');
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
