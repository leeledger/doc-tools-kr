// Prebuild (brief Step 5 §1, "Fonts"): the document faces of HWP PDF 변환.
// - Copies the @fontsource woff2 slices of weights 400 and 700 (byte-identical, as shipped) to
//   public/fonts/hwp/<pkg>@<version>/ (versioned, served as immutable; git-ignored).
// - Copies the committed fallback subset (scripts/fonts/anolim-hwp-fallback.woff2, see gen-hwp-fallback.mjs).
// - Writes one CSS file public/fonts/hwp/hwp-fonts.<hash>.css that renames the families in CSS only
//   ("Anolim HWP Serif/Sans/Myeongjo/Gothic/Fallback"), font-display: block. The font files are untouched, so
//   the OFL Reserved Font Name rules are not engaged.
// - Writes src/generated/hwp-fonts.json ({css}) for the tool page.
// Pretendard ("Pretendard Variable") is not copied for the preview: the tool reuses the existing dynamic subset.
// HWP direct (SPIKE-HWP-DIRECT §6.5), the PDF fonts:
// - Copies the .woff sibling of every copied .woff2 slice (@cantoo/fontkit subsets WOFF correctly, WOFF2 not).
// - Copies the static Pretendard Regular/Bold woff dynamic subset (the preview's "Pretendard Variable" default
//   instance is not the 400/700 the browser picks, and fontkit subsetting copies default-instance outlines).
// - Copies the extended fallback faces (scripts/fonts/fb-*, gen-hwp-fallback.mjs) and declares them in the CSS
//   after the sorted lines, in reverse order (CSS tries overlapping unicode-ranges last-defined first).
// - Writes public/fonts/hwp/hwp-pdf-faces.<hash>.json ({family, weight, url, range} in resolution order, packed:
//   see unpackFaces in src/lib/hwp/pdf/faces.ts) and
//   src/generated/hwp-pdf-faces.json ({json}) for the PDF writer (fetched on the first export, not bundled).
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
export const PRETENDARD_FAMILY = 'Pretendard Variable';
const hash10 = (data) => createHash('sha256').update(data).digest('hex').slice(0, 10);

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
  /** The PDF face list: {family, weight, url, range}, in resolution order. */
  const pdf = [];
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
        const woff = f.file.replace(/\.woff2$/, '.woff');
        copyFileSync(join(pkgDir, 'files', woff), join(outRoot, dir, woff));
        pdf.push({ family, weight, url: `/fonts/hwp/${dir}/${woff}`, range: f.range });
        maxSlice = Math.max(maxSlice, readFileSync(from).length);
        files += 2;
        css.push(
          `@font-face{font-family:${family};font-display:block;font-weight:${weight};src:url(${dir}/${f.file})${f.range ? `;unicode-range:${f.range}` : ''}}`,
        );
      }
    }
  }
  // Pretendard static Regular/Bold (PDF only).
  const pretDir = join(root, 'node_modules', 'pretendard');
  const pretVersion = JSON.parse(readFileSync(join(pretDir, 'package.json'), 'utf8')).version;
  const pretOut = `pretendard-static@${pretVersion}`;
  mkdirSync(join(outRoot, pretOut), { recursive: true });
  const pretCss = readFileSync(join(pretDir, 'dist', 'web', 'static', 'pretendard-dynamic-subset.css'), 'utf8');
  for (const block of pretCss.split('@font-face').slice(1)) {
    const weight = Number(block.match(/font-weight:\s*(\d+)/)?.[1]);
    const file = block.match(/url\(\.\/woff-dynamic-subset\/([^)]+\.woff)\)/)?.[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim() ?? null;
    if (!WEIGHTS.includes(weight)) continue;
    if (!file) throw new Error(`gen-hwp-fonts: unreadable Pretendard block: ${block.slice(0, 120)}`);
    copyFileSync(join(pretDir, 'dist', 'web', 'static', 'woff-dynamic-subset', file), join(outRoot, pretOut, file));
    pdf.push({ family: PRETENDARD_FAMILY, weight, url: `/fonts/hwp/${pretOut}/${file}`, range });
    files++;
  }
  mkdirSync(join(outRoot, FALLBACK_DIR), { recursive: true });
  for (const ext of ['woff2', 'woff']) copyFileSync(join(root, 'scripts', 'fonts', `anolim-hwp-fallback.${ext}`), join(outRoot, FALLBACK_DIR, `anolim-hwp-fallback.${ext}`));
  files += 2;
  css.push(
    `@font-face{font-family:${FALLBACK_FAMILY};font-display:block;font-weight:100 900;src:url(${FALLBACK_DIR}/anolim-hwp-fallback.woff2);unicode-range:${FALLBACK_RANGE}}`,
  );
  pdf.push({ family: FALLBACK_FAMILY, weight: 400, url: `/fonts/hwp/${FALLBACK_DIR}/anolim-hwp-fallback.woff`, range: FALLBACK_RANGE });
  // Extended fallback faces, in a folder versioned by their content.
  const ext = JSON.parse(readFileSync(join(root, 'scripts', 'fonts', 'fallback-ext.json'), 'utf8'));
  const extBytes = ext.flatMap((f) => ['woff2', 'woff'].map((e) => readFileSync(join(root, 'scripts', 'fonts', `${f.file}.${e}`))));
  const extDir = `fallback-ext@${hash10(Buffer.concat(extBytes)).slice(0, 8)}`;
  mkdirSync(join(outRoot, extDir), { recursive: true });
  const extCss = [];
  for (const f of ext) {
    for (const e of ['woff2', 'woff']) copyFileSync(join(root, 'scripts', 'fonts', `${f.file}.${e}`), join(outRoot, extDir, `${f.file}.${e}`));
    files += 2;
    extCss.push(`@font-face{font-family:${FALLBACK_FAMILY};font-display:block;font-weight:100 900;src:url(${extDir}/${f.file}.woff2);unicode-range:${f.range}}`);
    pdf.push({ family: FALLBACK_FAMILY, weight: 400, url: `/fonts/hwp/${extDir}/${f.file}.woff`, range: f.range });
  }
  // Faces sharing a unicode-range sit next to each other (the four families use the same Google Fonts slicing),
  // so gzip encodes each long range list about once: ~30.4 KB gzip instead of 143 KB. URLs are relative to the
  // CSS file (same folder tree) and family names unquoted (valid CSS identifiers) to save bytes.
  const rangeOf = (line) => line.match(/unicode-range:([^}]+)\}/)?.[1] ?? '';
  css.sort((a, b) => (rangeOf(a) < rangeOf(b) ? -1 : rangeOf(a) > rangeOf(b) ? 1 : a < b ? -1 : a > b ? 1 : 0));
  css.push(...extCss.reverse());
  const text = `/* scripts/gen-hwp-fonts.mjs: Noto Serif KR, Noto Sans KR, Nanum Myeongjo, Nanum Gothic, Noto Sans CJK KR, Noto Sans Math, Noto Sans Symbols 2, Noto Sans subsets (SIL OFL 1.1; /licenses/) */\n${css.join('\n')}\n`;
  const hash = hash10(text);
  const name = `hwp-fonts.${hash}.css`;
  writeFileSync(join(outRoot, name), text);
  const gen = join(root, 'src', 'generated');
  mkdirSync(gen, { recursive: true });
  writeFileSync(join(gen, 'hwp-fonts.json'), `${JSON.stringify({ css: `/fonts/hwp/${name}` })}\n`);
  // Packed (the flat list is 168 KB gzip): unique families, folders and unicode-ranges by index.
  const index = (arr) => (v) => (arr.includes(v) ? arr.indexOf(v) : arr.push(v) - 1);
  const packed = { families: [], dirs: [], ranges: [], faces: [] };
  const [fam, dirOf, rangeIdx] = [index(packed.families), index(packed.dirs), index(packed.ranges)];
  for (const f of pdf) {
    const slash = f.url.lastIndexOf('/');
    packed.faces.push([fam(f.family), f.weight, dirOf(f.url.slice(0, slash + 1)), f.url.slice(slash + 1), f.range === null ? -1 : rangeIdx(f.range)]);
  }
  const faces = `${JSON.stringify(packed)}\n`;
  const facesName = `hwp-pdf-faces.${hash10(faces)}.json`;
  writeFileSync(join(outRoot, facesName), faces);
  writeFileSync(join(gen, 'hwp-pdf-faces.json'), `${JSON.stringify({ json: `/fonts/hwp/${facesName}` })}\n`);
  console.log(`gen-hwp-fonts: ${files} font files, largest slice ${(maxSlice / 1024).toFixed(1)} KiB, /fonts/hwp/${name} ${(text.length / 1024).toFixed(1)} KiB, /fonts/hwp/${facesName} ${pdf.length} PDF faces`);
}
