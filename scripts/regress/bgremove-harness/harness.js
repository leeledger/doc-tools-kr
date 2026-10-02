// regress:bgremove harness page (served by Vite from scripts/regress/bgremove.mjs; never part of dist/). Runs the
// production modules of /remove-background/: the asset loader (SHA-256 checks against the build pins and the model
// manifest), decode, the model input, the inference worker (one per image, as the page does) and blur-fusion. The
// runner only compares the numbers.
import { browserDeps, loadManifest, loadParts, modelParts, ortBase, ortScript, runtimeParts } from '../../../src/lib/bgremove/assets.ts';
import { blurFusion } from '../../../src/lib/bgremove/fusion.ts';
import { inputFromImage } from '../../../src/lib/bgremove/infer.ts';
import { pickBackend, runEngine } from '../../../src/lib/bgremove/session.ts';
import { decodeImage } from '../../../src/lib/image/decode.ts';
import { sniffImage } from '../../../src/lib/image/sniff.ts';

let engine = null;

/** Loads the runtime and the model once (no Cache Storage: store false). */
async function setup(want) {
  const backend = want === 'auto' ? await pickBackend() : want;
  const deps = browserDeps();
  const signal = new AbortController().signal;
  const manifest = await loadManifest(deps, signal, false);
  const wasm = await loadParts(runtimeParts(backend), { deps, signal, store: false });
  const model = await loadParts(modelParts(manifest), { deps, signal, store: false });
  engine = { backend, wasm, model };
  return { backend, coi: crossOriginIsolated, exportId: manifest.exportId, modelBytes: model.length };
}

/** One image through the page's path; returns the 512×512 mask as an array and the timings. */
async function runImage(url) {
  const blob = await (await fetch(url)).blob();
  const head = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
  const d = await decodeImage(blob, sniffImage(head, { size: blob.size }), { maxLongEdge: 4096 });
  const input = inputFromImage(d.src);
  d.close();
  const t0 = performance.now();
  const req = {
    type: 'run',
    backend: engine.backend,
    ortUrl: ortScript(engine.backend),
    ortBase: new URL(ortBase(engine.backend), location.href).href,
    wasm: engine.wasm.slice().buffer,
    model: engine.model.slice().buffer,
    input: input.buffer,
    maxThreads: 8,
  };
  const worker = () => new Worker(new URL('../../../src/lib/bgremove/infer.worker.ts', import.meta.url), { type: 'module' });
  const r = await runEngine(req, worker).result;
  return { mask: Array.from(r.mask), createMs: r.createMs, runMs: r.runMs, totalMs: performance.now() - t0, backend: r.backend };
}

/** Blur-fusion time on a synthetic work copy of `w`×`h` (brief budget: ≤ 1.5 s at 4 MP). */
function fusionMs(w, h) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const alpha = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      rgba.set([(x * 7) & 255, (y * 5) & 255, 128, 255], i * 4);
      const d = Math.hypot(x - w / 2, y - h / 2) / (Math.min(w, h) / 3);
      alpha[i] = Math.max(0, Math.min(255, Math.round((1.2 - d) * 5 * 255)));
    }
  }
  const s = Math.max(w, h) / 1600;
  const t0 = performance.now();
  blurFusion(rgba, alpha, w, h, Math.max(1, Math.round(45 * s)), Math.max(1, Math.round(4 * s)));
  return performance.now() - t0;
}

window.harness = { setup, runImage, fusionMs };
