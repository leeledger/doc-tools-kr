// Copies self-hosted third-party assets from node_modules into public/ (git-ignored).
// Runs as predev/prebuild. Paths are versioned where the asset is cacheable as immutable.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => join(root, 'node_modules', ...p);
const pub = (...p) => join(root, 'public', ...p);
const version = (pkg) => JSON.parse(readFileSync(nm(pkg, 'package.json'), 'utf8')).version;

function copy(from, to, opts = {}) {
  if (!existsSync(from)) throw new Error(`copy-vendor: missing ${from}`);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true, ...opts });
}

// Pretendard (OFL-1.1): dynamic-subset CSS + woff2 slices, same relative layout as the package.
// Copied byte-for-byte (official, unmodified files). Pages render with the preloaded UI subset
// ("Anolim UI Sans", scripts/gen-ui-font.mjs); these slices are the fallback for characters the
// UI subset lacks, and tool pages load this CSS on demand.
// Versioned path, because /fonts/* is served as immutable.
rmSync(pub('fonts', 'pretendard'), { recursive: true, force: true });
const fontDir = pub('fonts', 'pretendard', version('pretendard'));
const pv = nm('pretendard', 'dist', 'web', 'variable');
copy(join(pv, 'pretendardvariable-dynamic-subset.css'), join(fontDir, 'pretendardvariable-dynamic-subset.css'));
copy(join(pv, 'woff2-dynamic-subset'), join(fontDir, 'woff2-dynamic-subset'));

// pdf.js (Apache-2.0): worker, CMaps, standard fonts, image-decoder wasm.
// Not shipped:
// - wasm/quickjs-eval.* is the scripting sandbox; we never enable scripting.
// - standard_fonts/Liberation* are GPL-2.0 with a font exception, outside our license allowlist.
//   pdf.js then substitutes a system sans-serif for non-embedded Helvetica/Arial (thumbnails only).
const pdfjsVer = version('pdfjs-dist');
const pdfjsOut = pub('vendor', 'pdfjs', pdfjsVer);
rmSync(pub('vendor', 'pdfjs'), { recursive: true, force: true });
copy(nm('pdfjs-dist', 'build', 'pdf.worker.min.mjs'), join(pdfjsOut, 'pdf.worker.min.mjs'));
copy(nm('pdfjs-dist', 'cmaps'), join(pdfjsOut, 'cmaps'));
copy(nm('pdfjs-dist', 'standard_fonts'), join(pdfjsOut, 'standard_fonts'), { filter: (src) => !/liberation/i.test(src) });
if (existsSync(nm('pdfjs-dist', 'wasm'))) {
  copy(nm('pdfjs-dist', 'wasm'), join(pdfjsOut, 'wasm'), { filter: (src) => !/quickjs/i.test(src) });
}

// qpdf-wasm (qpdf 12.2.0 Apache-2.0, wrapper ISC): the wasm plus its Emscripten glue as an ES module.
// The glue is the original dist/qpdf.js followed by `export default Module;` (its UMD tail does
// nothing when `module` and `define` are undefined). The compress worker imports it at runtime with
// a /* @vite-ignore */ dynamic import, so Vite never bundles it. The directory name must match
// QPDF_VENDOR_DIR in src/lib/pdf/compress/wasm-browser.ts (unit-tested).
const QPDF_WRAPPER = '0.3.0';
const QPDF_VENDOR_DIR = '12.2.0-w0.3.0';
if (version('@neslinesli93/qpdf-wasm') !== QPDF_WRAPPER) {
  throw new Error(`copy-vendor: @neslinesli93/qpdf-wasm is ${version('@neslinesli93/qpdf-wasm')}, expected ${QPDF_WRAPPER}; update QPDF_VENDOR_DIR here and in wasm-browser.ts`);
}
const qpdfOut = pub('vendor', 'qpdf', QPDF_VENDOR_DIR);
rmSync(pub('vendor', 'qpdf'), { recursive: true, force: true });
copy(nm('@neslinesli93/qpdf-wasm', 'dist', 'qpdf.wasm'), join(qpdfOut, 'qpdf.wasm'));
const glue = readFileSync(nm('@neslinesli93/qpdf-wasm', 'dist', 'qpdf.js'), 'utf8');
if (!/^var Module = /m.test(glue)) throw new Error('copy-vendor: qpdf.js no longer defines `var Module`');
writeFileSync(join(qpdfOut, 'qpdf.mjs'), `${glue}\nexport default Module;\n`);

console.log(`copy-vendor: pretendard ${version('pretendard')}, pdfjs ${pdfjsVer}, qpdf ${QPDF_VENDOR_DIR}`);
