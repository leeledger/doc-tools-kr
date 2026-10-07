// Builds the "UI" Pretendard subset: every character used in src/ (pages, data, generated license
// texts) plus printable ASCII, cut from the variable font as static weight instances (400, 800; 700 retired, LCP round 2).
// Why: the full dynamic subset needs ~13 font files (~330 KB) for the landing page alone, which
// pushed mobile LCP past 3 s. The UI subset is one preloaded file (~100 KB) and renders the same.
// Characters outside it (for example Korean file names on tool pages) fall back to the official,
// unmodified dynamic subset ("Pretendard Variable"), which the tool loads on demand.
// Core + late (LCP fix after TOOLS4): the CORE faces carry the characters of every file outside src/tools/**
// and src/lib/** (plus CORE_PATHS), i.e. everything that can render before interaction; core 400 and 800 are
// preloaded on every page. Characters used only by tool controllers and libs (status lines, errors) go to
// small LATE faces: same family and weights, disjoint unicode-range, never preloaded, fetched by the browser
// only when such text appears. Why: the preloaded bytes are the LCP lever every page shares, and each new
// controller string used to grow them (TOOLS4 pushed /photo-compress/ and /pdf-merge/ over 2,000 ms).
// check-dist proves every character of the built HTML is in the core range.
// OFL 1.1: this subset is a Modified Version, so it must not use the Reserved Font Name
// "Pretendard". Its name table and CSS family are renamed to "Anolim UI Sans"; the copyright and
// license records stay, and /licenses/ carries the full OFL text.
import fontverter from 'fontverter';
import subsetFont from 'subset-font';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renameFont, reservedNameProblems } from './font-rename.mjs';
import { uiCharSets } from './lib/ui-font-chars.mjs';

const UI_FAMILY = 'Anolim UI Sans';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const outDir = join(src, 'generated');

const { core, late } = uiCharSets(src);
/** Face file stem → its sorted code points (late is skipped when empty). */
const sets = [['anolim-ui', core]];
if (late.length) sets.push(['anolim-ui-late', late]);
const font = readFileSync(join(root, 'node_modules', 'pretendard', 'dist', 'web', 'variable', 'woff2', 'PretendardVariable.woff2'));

// Static instances (Polish P.12): WebKit ignores the variation axis of a variable face, so every weight the
// CSS uses gets its own fully instanced face (no fvar). check-dist rejects any other weight in the CSS.
// No 600: every face the page uses is fetched before LCP, and a fourth file put home LCP over 2,000 ms (G2 ci-green).
// No 700 (LCP round 2): the 700 face was the one non-preloaded request before LCP on every tool page (buttons, h2,
// summaries); Lighthouse with it blocked took /photo-compress/ from 2,119 to 1,813 ms. 700 text (CSS and UA bold)
// now matches the preloaded 800 face.
const UI_WEIGHTS = [400, 800];
// Only the OpenType features browsers apply by default (HarfBuzz's horizontal defaults). The CSS enables no
// other feature, so rendering is unchanged, and the alternates (ss01…, case, sups, aalt) no longer ship:
// about 20 % smaller per instance, which keeps the faces inside the font budget.
const KEEP_FEATURES = ['abvm', 'blwm', 'ccmp', 'locl', 'mark', 'mkmk', 'rlig', 'calt', 'clig', 'curs', 'dist', 'kern', 'liga', 'rclt'];

// unicode-range as merged runs, so the browser knows exactly which characters this face covers.
const hex = (n) => n.toString(16);
const unicodeRange = (sorted) => {
  const ranges = [];
  for (const cp of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && cp === last[1] + 1) last[1] = cp;
    else ranges.push([cp, cp]);
  }
  return ranges.map(([a, b]) => (a === b ? `U+${hex(a)}` : `U+${hex(a)}-${hex(b)}`)).join(', ');
};

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (/^anolim-ui(-late)?(-\d+)?\.(woff2|css)$/.test(f)) rmSync(join(outDir, f));
const faces = [];
const sizes = [];
for (const [stem, sorted] of sets) {
  const text = String.fromCodePoint(...sorted);
  const range = unicodeRange(sorted);
  for (const weight of UI_WEIGHTS) {
    let subset;
    try {
      subset = await subsetFont(font, text, { targetFormat: 'truetype', variationAxes: { wght: weight }, keepFeatures: KEEP_FEATURES });
    } catch (err) {
      // Never fall back to the variable face silently (brief P.12 flag).
      throw new Error(`gen-ui-font: instancing ${stem} wght=${weight} failed: ${err instanceof Error ? err.message : err}`);
    }
    const renamed = renameFont(subset, 'Pretendard', UI_FAMILY);
    // Every record on every platform, plus a raw byte scan of the name table (OFL Reserved Font Name).
    const leaked = reservedNameProblems(renamed, 'Pretendard');
    if (leaked.length) throw new Error(`gen-ui-font: reserved name "Pretendard" left in the ${stem} ${weight} instance: ${leaked.join('; ')}`);
    const woff2 = await fontverter.convert(Buffer.from(renamed), 'woff2', 'truetype');
    const file = `${stem}-${weight}.woff2`;
    writeFileSync(join(outDir, file), woff2);
    sizes.push(`${file} ${(woff2.length / 1024).toFixed(1)} KiB`);
    faces.push(`@font-face {
  font-family: '${UI_FAMILY}';
  font-style: normal;
  font-display: swap;
  font-weight: ${weight};
  src: url('./${file}') format('woff2');
  unicode-range: ${range};
}`);
  }
}
writeFileSync(
  join(outDir, 'anolim-ui.css'),
  `/* Generated by scripts/gen-ui-font.mjs. "${UI_FAMILY}" is a subset of Pretendard, (c) 2021 Kil Hyung-jin,
   with Reserved Font Name Pretendard, SIL Open Font License 1.1 (see /licenses/). Static instances at
   ${UI_WEIGHTS.join(', ')} (no variation axes). */
${faces.join('\n')}
`,
);
console.log(`gen-ui-font: core ${core.length} characters, late ${late.length}, ${sizes.join(', ')}, font name "${UI_FAMILY}"`);
