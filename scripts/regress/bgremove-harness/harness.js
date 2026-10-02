// regress:bgremove harness page (served by Vite from scripts/regress/bgremove.mjs; never part of dist/). Runs the
// production modules of /remove-background/: the asset loader (SHA-256 checks against the build pins and the model
// manifest), decode, the model input, the engine worker (one session for every image, as the page keeps it) and
// blur-fusion. The runner only compares the numbers.
import { browserDeps, loadManifest, loadParts, modelParts, ortBase, ortScript, runtimeParts } from '../../../src/lib/bgremove/assets.ts';
import { blurFusion } from '../../../src/lib/bgremove/fusion.ts';
import { inputFromImage } from '../../../src/lib/bgremove/infer.ts';
import { pickBackend, startEngine } from '../../../src/lib/bgremove/session.ts';
import { decodeImage } from '../../../src/lib/image/decode.ts';
import { sniffImage } from '../../../src/lib/image/sniff.ts';

let engine = null;

/** Loads the runtime and the model (no Cache Storage) and starts the engine once; returns the session-create time. */
async function setup(want, optLevel) {
  const backend = want === 'auto' ? await pickBackend() : want;
  const deps = browserDeps();
  const signal = new AbortController().signal;
  const manifest = await loadManifest(deps, signal, false);
  const wasm = await loadParts(runtimeParts(backend), { deps, signal, store: false });
  const model = await loadParts(modelParts(manifest), { deps, signal, store: false });
  const worker = () => new Worker(new URL('../../../src/lib/bgremove/infer.worker.ts', import.meta.url), { type: 'module' });
  const req = {
    type: 'init',
    backend,
    ortUrl: ortScript(backend),
    ortBase: new URL(ortBase(backend), location.href).href,
    wasm: wasm.buffer,
    model: model.buffer,
    maxThreads: 8,
    ...(optLevel ? { optLevel } : {}),
  };
  engine = await startEngine(req, worker).ready;
  return { backend, coi: crossOriginIsolated, exportId: manifest.exportId, createMs: engine.createMs };
}

/** One image through the page's path; returns the 512×512 mask as an array and the timings. */
async function runImage(url) {
  const blob = await (await fetch(url)).blob();
  const head = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
  const d = await decodeImage(blob, sniffImage(head, { size: blob.size }), { maxLongEdge: 4096 });
  const t0 = performance.now();
  const input = inputFromImage(d.src);
  d.close();
  const t1 = performance.now();
  const r = await engine.run(input);
  return { mask: Array.from(r.mask), inputMs: t1 - t0, runMs: r.runMs, totalMs: performance.now() - t0, backend: engine.backend };
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
