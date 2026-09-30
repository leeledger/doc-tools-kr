// Prebuild (brief Step 5 §1, "Fonts"): the document faces of HWP PDF 변환.
// - Copies the @fontsource woff2 slices of weights 400 and 700 (byte-identical, as shipped) to
//   public/fonts/hwp/<pkg>@<version>/ (versioned, served as immutable; git-ignored).
// - Copies the committed fallback subset (scripts/fonts/anolim-hwp-fallback.woff2, see gen-hwp-fallback.mjs).
// - Writes one CSS file public/fonts/hwp/hwp-fonts.<hash>.css that renames the families in CSS only
//   ("Anolim HWP Serif/Sans/Myeongjo/Gothic/Fallback"), font-display: block. The font files are untouched, so
//   the OFL Reserved Font Name rules are not engaged.
// - Writes src/generated/hwp-fonts.json ({css}) for the tool page.
// Pretendard ("Pretendard Variable") is not copied: the tool reuses the existing dynamic subset.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = join(root, 'public', 'fonts', 'hwp');

export const HWP_FAMILIES = [
  { pkg: 'noto-serif-kr', family: 'Anolim HWP Serif' },
  { pkg: 'noto-sans-kr', family: 'Anolim HWP Sans' },
  { pkg: 'nanum-myeongjo', family: 'Anolim HWP Myeongjo' },
  { pkg: 'nanum-gothic', family: 'Anolim HWP Gothic' },
];
export const WEIGHTS = [400, 700];
export const FALLBACK_FAMILY = 'Anolim HWP Fallback';
export const FALLBACK_RANGE = 'U+119E, U+2027, U+318D, U+329E';
/** Folder name of the fallback face: source family and version (Noto Sans CJK KR 2.004). */
export const FALLBACK_DIR = 'fallback@noto-sans-cjk-kr-2.004';

/** The @font-face blocks of a fontsource CSS file: {file, weight, range}. */
export function parseFontsource(css) {
  const faces = [];
  for (const block of css.split('@font-face').slice(1)) {
    const file = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)?.[1];
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim();
    if (!file || !weight) throw new Error(`gen-hwp-fonts: unreadable @font-face block: ${block.slice(0, 120)}`);
    faces.push({ file, weight: Number(weight), range: range ?? null });
  }
  return faces;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  rmSync(outRoot, { recursive: true, force: true });
  const css = [];
  let files = 0;
  let maxSlice = 0;
  for (const { pkg, family } of HWP_FAMILIES) {
    const pkgDir = join(root, 'node_modules', '@fontsource', pkg);
    const version = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
    const dir = `${pkg}@${version}`;
    mkdirSync(join(outRoot, dir), { recursive: true });
    for (const weight of WEIGHTS) {
      const faces = parseFontsource(readFileSync(join(pkgDir, `${weight}.css`), 'utf8'));
      if (!faces.length) throw new Error(`gen-hwp-fonts: ${pkg} has no ${weight} faces`);
      for (const f of faces) {
        const from = join(pkgDir, 'files', f.file);
        copyFileSync(from, join(outRoot, dir, f.file));
        maxSlice = Math.max(maxSlice, readFileSync(from).length);
        files++;
        css.push(
          `@font-face{font-family:${family};font-display:block;font-weight:${weight};src:url(${dir}/${f.file})${f.range ? `;unicode-range:${f.range}` : ''}}`,
        );
      }
    }
  }
  mkdirSync(join(outRoot, FALLBACK_DIR), { recursive: true });
  copyFileSync(join(root, 'scripts', 'fonts', 'anolim-hwp-fallback.woff2'), join(outRoot, FALLBACK_DIR, 'anolim-hwp-fallback.woff2'));
  files++;
  css.push(
    `@font-face{font-family:${FALLBACK_FAMILY};font-display:block;font-weight:100 900;src:url(${FALLBACK_DIR}/anolim-hwp-fallback.woff2);unicode-range:${FALLBACK_RANGE}}`,
  );
  // Faces sharing a unicode-range sit next to each other (the four families use the same Google Fonts slicing),
  // so gzip encodes each long range list about once: ~30.4 KB gzip instead of 143 KB. URLs are relative to the
  // CSS file (same folder tree) and family names unquoted (valid CSS identifiers) to save bytes.
  const rangeOf = (line) => line.match(/unicode-range:([^}]+)\}/)?.[1] ?? '';
  css.sort((a, b) => (rangeOf(a) < rangeOf(b) ? -1 : rangeOf(a) > rangeOf(b) ? 1 : a < b ? -1 : a > b ? 1 : 0));
  const text = `/* scripts/gen-hwp-fonts.mjs: Noto Serif KR, Noto Sans KR, Nanum Myeongjo, Nanum Gothic, Noto Sans CJK KR subset (SIL OFL 1.1; /licenses/) */\n${css.join('\n')}\n`;
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 10);
  const name = `hwp-fonts.${hash}.css`;
  writeFileSync(join(outRoot, name), text);
  const gen = join(root, 'src', 'generated');
  mkdirSync(gen, { recursive: true });
  writeFileSync(join(gen, 'hwp-fonts.json'), `${JSON.stringify({ css: `/fonts/hwp/${name}` })}\n`);
  console.log(`gen-hwp-fonts: ${files} font files, largest slice ${(maxSlice / 1024).toFixed(1)} KiB, /fonts/hwp/${name} ${(text.length / 1024).toFixed(1)} KiB`);
}
