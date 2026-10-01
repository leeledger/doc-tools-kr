// One-time dev script (brief Step 5 §1, "Fallback face"; SPIKE-HWP-DIRECT §6.5): cuts the "Anolim HWP Fallback"
// faces, as .woff2 (preview) and .woff (PDF fonts: @cantoo/fontkit subsets WOFF correctly, WOFF2 not).
// 1. The base face from Noto Sans CJK KR Regular 2.004 (SIL OFL 1.1, Adobe/Google) for the four code points none
//    of the bundled HWP faces map: U+329E (circled ideograph seal), U+318D (araea), U+119E (jungseong araea),
//    U+2027 (hyphenation point). Probe (harfbuzzjs cmap, 2026-09-30): Noto Serif KR / Noto Sans KR 400 lack
//    U+119E and U+2027; Nanum Myeongjo / Nanum Gothic and Pretendard also lack U+329E; Noto Sans CJK KR has all.
// 2. The extended faces (HWP direct): symbol blocks the four families lack. The 40-file spike found them in 30
//    files (∼ ․ ═ ･ ｢｣ ▪ ▸ ➔ ➂ ∙ ⋅ ∅ ∎ ▢ ⎯ ㊲ 〫 ˝ ̊; adm16 alone 73,172 ═ leaders); the old print path hid them
//    through OS fonts. One face per source, tried in EXT order; a face is cut into slices of at most MAX_SLICE
//    (both formats), because each fallback file has a 60 KB budget.
// GSUB is kept (layout closure on), so the jamo glyph variants come along. No source declares a Reserved Font
// Name; the family is set in CSS only, the name tables are left as they are.
// Usage: node scripts/gen-hwp-fallback.mjs <dir with NotoSansCJKkr-Regular.otf, NotoSansMath-Regular.ttf,
//        NotoSansSymbols2-Regular.ttf, NotoSans-Regular.ttf>
// Sources: https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf and
//          https://notofonts.github.io (Noto Sans Math, Noto Sans Symbols 2, Noto Sans). SHA-256s in BUILD-LOG.
// Output: scripts/fonts/anolim-hwp-fallback.woff (the .woff2 is from Step 5), scripts/fonts/fb-<id>[-n].{woff2,woff} and
//         scripts/fonts/fallback-ext.json (committed; gen-hwp-fonts.mjs copies them into public/).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const FALLBACK_CODEPOINTS = [0x329e, 0x318d, 0x119e, 0x2027];
export const MAX_SLICE = 58 * 1024;

/** The extended faces: source file and inclusive code point ranges (SPIKE-HWP-DIRECT §6.5 table; the math face
 * also takes the math symbol blocks and Noto Sans the super/subscripts after the full corpus run found ₁ ₂ ⦁ in adm31, kr19, kr29). */
export const EXT = [
  { id: 'cjk', src: 'NotoSansCJKkr-Regular.otf', ranges: [[0x119e, 0x119e], [0x318d, 0x318d], [0x2000, 0x206f], [0x2190, 0x21ff], [0x2200, 0x22ff], [0x2300, 0x23ff], [0x2460, 0x24ff], [0x2500, 0x259f], [0x25a0, 0x25ff], [0x2600, 0x26ff], [0x2700, 0x27bf], [0x3000, 0x303f], [0x3200, 0x32ff], [0xff00, 0xffef]] },
  { id: 'math', src: 'NotoSansMath-Regular.ttf', ranges: [[0x2190, 0x21ff], [0x2200, 0x22ff], [0x2300, 0x23ff], [0x25a0, 0x25ff], [0x0300, 0x036f], [0x27c0, 0x27ef], [0x2980, 0x29ff], [0x2a00, 0x2aff]] },
  { id: 'sym2', src: 'NotoSansSymbols2-Regular.ttf', ranges: [[0x2190, 0x21ff], [0x25a0, 0x25ff], [0x2600, 0x26ff], [0x2700, 0x27bf], [0x2b00, 0x2bff]] },
  { id: 'sans', src: 'NotoSans-Regular.ttf', ranges: [[0x2000, 0x206f], [0x02b0, 0x036f], [0x2070, 0x209f]] },
];

export const rangeCss = (r) => r.map(([a, b]) => (a === b ? `U+${a.toString(16).toUpperCase()}` : `U+${a.toString(16).toUpperCase()}-${b.toString(16).toUpperCase()}`)).join(', ');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { default: subsetFont } = await import('subset-font');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: node scripts/gen-hwp-fallback.mjs <dir with the four Noto sources>');
  const outDir = join(root, 'scripts', 'fonts');
  mkdirSync(outDir, { recursive: true });
  // The base .woff2 ships at a versioned URL since Step 5 and stays byte-identical; only its .woff sibling is new.
  for (const f of readdirSync(outDir)) if (/^(fb-|fallback-ext)|^anolim-hwp-fallback\.woff$/.test(f)) rmSync(join(outDir, f));
  const sources = new Map();
  const source = (name) => {
    if (!sources.has(name)) {
      const bytes = readFileSync(join(dir, name));
      console.log(`gen-hwp-fallback: ${name} SHA-256 ${createHash('sha256').update(bytes).digest('hex')}`);
      sources.set(name, bytes);
    }
    return sources.get(name);
  };
  const text = (ranges) => {
    let s = '';
    for (const [a, b] of ranges) for (let c = a; c <= b; c++) s += String.fromCodePoint(c);
    return s;
  };
  const cut = async (src, ranges) => ({ woff2: await subsetFont(src, text(ranges), { targetFormat: 'woff2' }), woff: await subsetFont(src, text(ranges), { targetFormat: 'woff' }) });
  const write = (name, out) => {
    writeFileSync(join(outDir, `${name}.woff2`), out.woff2);
    writeFileSync(join(outDir, `${name}.woff`), out.woff);
    console.log(`gen-hwp-fallback: ${name} woff2 ${(out.woff2.length / 1024).toFixed(1)} KiB, woff ${(out.woff.length / 1024).toFixed(1)} KiB`);
  };

  const base = await cut(source('NotoSansCJKkr-Regular.otf'), FALLBACK_CODEPOINTS.map((c) => [c, c]));
  writeFileSync(join(outDir, 'anolim-hwp-fallback.woff'), base.woff);

  // Greedy slicing in range order: a range joins the current slice while both formats stay under MAX_SLICE.
  const faces = [];
  for (const f of EXT) {
    const src = source(f.src);
    const slices = [];
    let cur = [];
    let last = null;
    for (const r of f.ranges) {
      const next = await cut(src, [...cur, r]);
      if (cur.length && Math.max(next.woff.length, next.woff2.length) > MAX_SLICE) {
        slices.push({ ranges: cur, out: last });
        cur = [r];
        last = await cut(src, cur);
      } else {
        cur = [...cur, r];
        last = next;
      }
    }
    if (cur.length) slices.push({ ranges: cur, out: last });
    slices.forEach((s, i) => {
      const name = slices.length > 1 ? `fb-${f.id}-${i + 1}` : `fb-${f.id}`;
      if (Math.max(s.out.woff.length, s.out.woff2.length) > MAX_SLICE) throw new Error(`${name}: one range is over ${MAX_SLICE} bytes`);
      write(name, s.out);
      faces.push({ file: name, range: rangeCss(s.ranges) });
    });
  }
  writeFileSync(join(outDir, 'fallback-ext.json'), `${JSON.stringify(faces, null, 1)}\n`);
  console.log(`gen-hwp-fallback: ${faces.length} extended faces → scripts/fonts/fallback-ext.json`);
}
