// Copies self-hosted third-party assets from node_modules into public/ (git-ignored).
// Runs as predev/prebuild. Paths are versioned where the asset is cacheable as immutable.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoframeOn } from './lib/autoframe.mjs';
import { bgRemoveOn } from './lib/bgremove.mjs';
import { publicEnv } from './lib/dist.mjs';

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

// MediaPipe tasks-vision (Apache-2.0; brief Step 4 §1), /id-photo/ face auto-framing only. The SIMD and
// no-SIMD wasm with their loader scripts (the module_internal variant is not shipped), and the face landmarker
// model from vendor-assets/ (committed, SHA-256 pinned; never fetched at build time). Nothing is copied when
// PUBLIC_ID_PHOTO_AUTOFRAME is off. src/generated/mediapipe.json always carries the paths and raw sizes that
// src/lib/face/assets.ts uses for its progress (Content-Length is unreliable under brotli).
export const MEDIAPIPE_VERSION = '1.0.1';
const MP_FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'];
if (version('@mediapipe/tasks-vision') !== MEDIAPIPE_VERSION) {
  throw new Error(`copy-vendor: @mediapipe/tasks-vision is ${version('@mediapipe/tasks-vision')}, expected ${MEDIAPIPE_VERSION}`);
}
const assetDir = join(root, 'vendor-assets', 'mediapipe');
const pin = readFileSync(join(assetDir, 'SHA256SUMS'), 'utf8').match(/^([0-9a-f]{64})\s+\*?face_landmarker\.task\r?$/m);
if (!pin) throw new Error('copy-vendor: vendor-assets/mediapipe/SHA256SUMS has no face_landmarker.task line');
const model = readFileSync(join(assetDir, 'face_landmarker.task'));
const modelSha = createHash('sha256').update(model).digest('hex');
if (modelSha !== pin[1]) throw new Error(`copy-vendor: face_landmarker.task SHA-256 ${modelSha} does not match the pin ${pin[1]}`);
const modelFile = `face_landmarker-${modelSha.slice(0, 8)}.task`;
const mpWasm = nm('@mediapipe', 'tasks-vision', 'wasm');
const mpSize = (f) => statSync(join(mpWasm, f)).size;
// Full file URLs (never a bare directory: smoke-assets checks every "/vendor/…" literal of the bundle).
const mpUrl = (f) => `/vendor/mediapipe/${MEDIAPIPE_VERSION}/${f}`;
const mpFile = (f) => ({ url: mpUrl(f), bytes: mpSize(f) });
const mediapipe = {
  version: MEDIAPIPE_VERSION,
  simd: { js: mpFile(MP_FILES[0]), wasm: mpFile(MP_FILES[1]) },
  nosimd: { js: mpFile(MP_FILES[2]), wasm: mpFile(MP_FILES[3]) },
  model: { url: `/vendor/mediapipe/models/${modelFile}`, bytes: model.length, sha256: modelSha },
};
mkdirSync(join(root, 'src', 'generated'), { recursive: true });
writeFileSync(join(root, 'src', 'generated', 'mediapipe.json'), `${JSON.stringify(mediapipe, null, 1)}
`);
rmSync(pub('vendor', 'mediapipe'), { recursive: true, force: true });
const autoframe = autoframeOn(publicEnv().PUBLIC_ID_PHOTO_AUTOFRAME);
if (autoframe) {
  for (const f of MP_FILES) copy(join(mpWasm, f), pub('vendor', 'mediapipe', MEDIAPIPE_VERSION, f));
  mkdirSync(pub('vendor', 'mediapipe', 'models'), { recursive: true });
  writeFileSync(pub('vendor', 'mediapipe', 'models', modelFile), model);
}

// 배경 지우기 (Sprint C, C2; brief build order 1). onnxruntime-web (MIT), pinned exact, and our own BiRefNet_lite 512
// fp16 export from vendor-assets/ (committed, SHA-256 per part in its manifest.json; never fetched at build time:
// provenance = our commit). Shipped only: the native-WebGPU build (ort.webgpu.min.mjs + its asyncify glue, the
// 25.5 MiB asyncify wasm split into 2 parts for the 24 MiB file limit) and the plain WASM build (ort.wasm.min.mjs +
// glue + wasm). No ort.all* / JSEP / JSPI / WebGL file (JSEP gave a 0.64 mask error in the spike). Nothing is copied
// when PUBLIC_BG_REMOVE is off. src/generated/bgremove.json always carries the URLs, sizes and SHA-256s
// (src/lib/bgremove/assets.ts verifies the runtime parts against them and the model parts against the manifest).
export const ORT_VERSION = '1.30.0';
export const BIREFNET_EXPORT = 'aa62cd87-ce158794';
if (version('onnxruntime-web') !== ORT_VERSION) throw new Error(`copy-vendor: onnxruntime-web is ${version('onnxruntime-web')}, expected ${ORT_VERSION}`);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const ortDist = nm('onnxruntime-web', 'dist');
const ortUrl = (f) => `/vendor/onnxruntime-web/${ORT_VERSION}/${f}`;
const asyncify = readFileSync(join(ortDist, 'ort-wasm-simd-threaded.asyncify.wasm'));
const half = Math.ceil(asyncify.length / 2);
const asyncParts = [asyncify.subarray(0, half), asyncify.subarray(half)].map((b, i) => ({ name: `ort-wasm-simd-threaded.asyncify.wasm.part${i}`, data: b }));
const plainWasm = readFileSync(join(ortDist, 'ort-wasm-simd-threaded.wasm'));
const ORT_COPY = ['ort.webgpu.min.mjs', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs'];
const fileOf = (name, data) => ({ url: ortUrl(name), bytes: data.length, sha256: sha256(data) });
const modelDir = join(root, 'vendor-assets', 'birefnet-lite-512', BIREFNET_EXPORT);
const modelManifest = JSON.parse(readFileSync(join(modelDir, 'manifest.json'), 'utf8'));
if (modelManifest.exportId !== BIREFNET_EXPORT) throw new Error(`copy-vendor: model manifest exportId ${modelManifest.exportId}, expected ${BIREFNET_EXPORT}`);
const modelBytes = [];
for (const p of modelManifest.parts) {
  const b = readFileSync(join(modelDir, p.name));
  if (b.length !== p.bytes || sha256(b) !== p.sha256) throw new Error(`copy-vendor: ${p.name} does not match its manifest entry (bytes/SHA-256)`);
  modelBytes.push(b);
}
if (sha256(Buffer.concat(modelBytes)) !== modelManifest.sha256Total) throw new Error('copy-vendor: the model parts do not add up to sha256Total');
const modelBase = `/vendor/birefnet-lite-512/${BIREFNET_EXPORT}/`;
const bgremove = {
  ortVersion: ORT_VERSION,
  webgpu: {
    mjs: ortUrl('ort.webgpu.min.mjs'),
    wasm: { bytes: asyncify.length, sha256: sha256(asyncify), parts: asyncParts.map((p) => fileOf(p.name, p.data)) },
  },
  wasm: {
    mjs: ortUrl('ort.wasm.min.mjs'),
    wasm: { bytes: plainWasm.length, sha256: sha256(plainWasm), parts: [fileOf('ort-wasm-simd-threaded.wasm', plainWasm)] },
  },
  // Part URLs are the manifest's directory + part name (no bare directory literal: smoke-assets checks each one).
  model: { exportId: BIREFNET_EXPORT, hfRevision: modelManifest.hfRevision, manifest: `${modelBase}manifest.json`, bytes: modelManifest.bytes },
};
writeFileSync(join(root, 'src', 'generated', 'bgremove.json'), `${JSON.stringify(bgremove, null, 1)}\n`);
rmSync(pub('vendor', 'onnxruntime-web'), { recursive: true, force: true });
rmSync(pub('vendor', 'birefnet-lite-512'), { recursive: true, force: true });
const bgOn = bgRemoveOn(publicEnv().PUBLIC_BG_REMOVE);
if (bgOn) {
  const out = pub('vendor', 'onnxruntime-web', ORT_VERSION);
  for (const f of ORT_COPY) copy(join(ortDist, f), join(out, f));
  for (const p of asyncParts) writeFileSync(join(out, p.name), p.data);
  writeFileSync(join(out, 'ort-wasm-simd-threaded.wasm'), plainWasm);
  const mOut = pub('vendor', 'birefnet-lite-512', BIREFNET_EXPORT);
  mkdirSync(mOut, { recursive: true });
  modelManifest.parts.forEach((p, i) => writeFileSync(join(mOut, p.name), modelBytes[i]));
  copy(join(modelDir, 'manifest.json'), join(mOut, 'manifest.json'));
}
console.log(`copy-vendor: onnxruntime-web ${bgOn ? `${ORT_VERSION} + birefnet ${BIREFNET_EXPORT}` : 'skipped (PUBLIC_BG_REMOVE off)'}`);
console.log(`copy-vendor: mediapipe ${autoframe ? `${MEDIAPIPE_VERSION} + ${modelFile}` : 'skipped (PUBLIC_ID_PHOTO_AUTOFRAME off)'}`);
console.log(`copy-vendor: pretendard ${version('pretendard')}, pdfjs ${pdfjsVer}, qpdf ${QPDF_VENDOR_DIR}`);
