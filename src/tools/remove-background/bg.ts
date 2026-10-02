// 사진 배경 지우기 controller (Sprint C, C2; brief Flow). Loaded by entry.ts on the first interaction, never with the
// page. Named bg*, not controller*: gen-sw precaches controller chunks, and C2 adds nothing to the precache (Arch).
//
// pick -> checks + work copy (4,096 / 2,048 px) -> engine cached? -> (consent ->) download (progress, 취소)
//   -> inference worker (one per photo; terminated after its reply) -> area check -> 8-bit mask at work size
//   -> blur-fusion worker -> preview (투명 / 흰색 / 파란색, 원본과 비교) -> PNG / JPG
// The photo never leaves the page: its pixels go only to our own workers. The only requests are GETs of our own
// /vendor/ engine and model files, made after the user agreed (or from this tool's Cache Storage).
import {
  AssetError,
  browserDeps,
  canStore,
  deleteOldCaches,
  downloadBytes,
  isCached,
  loadManifest,
  loadParts,
  modelParts,
  ortBase,
  ortScript,
  runtimeParts,
  type Backend,
  type Progress,
} from '../../lib/bgremove/assets';
import { clearAttempt, markAttempt, workEdge } from '../../lib/bgremove/guard';
import type { RunRequest } from '../../lib/bgremove/infer-core';
import { fusionRadii, hasSubject, inputFromImage, resizeMask, SIZE, validMask } from '../../lib/bgremove/infer';
import { plainCutout } from '../../lib/bgremove/fusion';
import type { FusionRequest, FusionResponse } from '../../lib/bgremove/fusion.worker';
import { EngineError, pickBackend, runEngine, shouldFallBack, type WorkerLike } from '../../lib/bgremove/session';
import { sessionStore } from '../../lib/face/guard';
import { decodeImage } from '../../lib/image/decode';
import { ERRORS, PhotoError, unsupportedMessage } from '../../lib/image/messages';
import { HEAD_BYTES, TAIL_BYTES, orientedSize, sniffImage } from '../../lib/image/sniff';
import { announce as live, clearAlert } from '../../lib/ui/announce';
import { detectDevice } from '../../lib/ui/device';
import { hideEngineError } from '../../lib/ui/engine-error';
import { BG_COLORS, COPY, dims, fileName, saveLabel, type BgChoice, type SaveFormat } from './copy';
import { checkDims, checkFileBytes, LIMITS, LOW_DEVICE_MEMORY } from './limits';
import { move, view, type Phase } from './model';

const createInferWorker = (): WorkerLike => new Worker(new URL('../../lib/bgremove/infer.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
const createFusionWorker = (): Worker => new Worker(new URL('../../lib/bgremove/fusion.worker.ts', import.meta.url), { type: 'module' });

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

/** A 2d canvas of the given size (null when the device has no room for it). */
function canvas2d(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } | null {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  return g ? { c, g } : null;
}

function freeCanvas(c: HTMLCanvasElement | null): void {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

async function toBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      c.toBlob(resolve, type, quality);
    } catch {
      resolve(null);
    }
  });
}

let lastUrl: string | null = null;
function saveBlob(blob: Blob, name: string): void {
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = lastUrl;
  a.download = name;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
}

/** Loaded by entry.ts. `pending`: a photo that arrived while this module was loading. */
export function initBgTool(pending?: File): { open(file: File): void } | null {
  const found = document.getElementById('bg-tool');
  if (!found) return null;
  const root: HTMLElement = found;
  const input = must<HTMLInputElement>('bg-input');
  const drop = must<HTMLElement>('bg-drop');
  const consent = must<HTMLElement>('bg-consent');
  const consentText = must<HTMLElement>('bg-consent-text');
  const lowDevice = must<HTMLElement>('bg-low-device');
  const startBtn = must<HTMLButtonElement>('bg-start');
  const consentCancel = must<HTMLButtonElement>('bg-consent-cancel');
  const progress = must<HTMLElement>('bg-progress');
  const progressText = must<HTMLElement>('bg-progress-text');
  const bar = must<HTMLProgressElement>('bg-bar');
  const cancelBtn = must<HTMLButtonElement>('bg-cancel');
  const note = must<HTMLElement>('bg-note');
  const errorBox = must<HTMLElement>('bg-error');
  const retryBtn = must<HTMLButtonElement>('bg-retry');
  const nosubject = must<HTMLElement>('bg-nosubject');
  const result = must<HTMLElement>('bg-result');
  const title = must<HTMLElement>('bg-done-title');
  const stage = must<HTMLElement>('bg-stage');
  const view$ = must<HTMLCanvasElement>('bg-canvas');
  const compareBtn = must<HTMLButtonElement>('bg-compare');
  const formatBox = must<HTMLElement>('bg-format');
  const downloadBtn = must<HTMLButtonElement>('bg-download');
  const saveName = must<HTMLElement>('bg-save-name');
  const newBtn = must<HTMLButtonElement>('bg-new');

  const deps = browserDeps();
  const storage = sessionStore();
  let phase: Phase = 'empty';
  /** Bumped by every new photo and by 취소: replies for an older run are dropped. */
  let run = 0;
  let bitmap: ImageBitmap | null = null;
  let backend: Backend = 'wasm';
  let abort: AbortController | null = null;
  let cancelEngine: (() => void) | null = null;
  /** Model bytes kept in the page only when they cannot be cached (needed for the next photo or the fallback). */
  let keptModel: Uint8Array | null = null;
  /** The finished cut-out (straight RGBA at work size). */
  let cut: ImageData | null = null;
  let comparing = false;

  const say = (m: string): void => live('status', m, root);

  function setPhase(p: Phase): void {
    phase = move(phase, p);
    root.dataset.state = phase;
    const v = view(phase);
    drop.hidden = !v.drop;
    consent.hidden = !v.consent;
    progress.hidden = !v.progress;
    cancelBtn.hidden = !v.cancel;
    result.hidden = !v.result;
    nosubject.hidden = !v.nosubject;
    if (!v.bytes) bar.removeAttribute('value');
  }

  function showError(m: string, retry: boolean): void {
    errorBox.textContent = m;
    errorBox.hidden = false;
    retryBtn.hidden = !retry;
    live('alert', m, root);
  }

  function hideError(): void {
    errorBox.hidden = true;
    errorBox.textContent = '';
    retryBtn.hidden = true;
    clearAlert(root);
  }

  function busy(text: string): void {
    progressText.textContent = text;
    say(text);
  }

  function onBytes(p: Progress, base: number, total: number): void {
    const loaded = base + p.loaded;
    bar.max = total;
    bar.value = loaded;
    progressText.textContent = COPY.downloading(loaded, total);
  }

  /** Drops everything of the current photo (workers, buffers, canvases). */
  function release(): void {
    run++;
    abort?.abort();
    abort = null;
    cancelEngine?.();
    cancelEngine = null;
    // A run stopped on purpose (취소, a new photo, leaving the page) is not a crash.
    clearAttempt(storage);
    bitmap?.close();
    bitmap = null;
    cut = null;
    comparing = false;
    compareBtn.setAttribute('aria-pressed', 'false');
    freeCanvas(view$);
    downloadBtn.disabled = true;
    saveName.textContent = '';
  }

  function toEmpty(): void {
    release();
    hideError();
    input.value = '';
    note.hidden = true;
    setPhase('empty');
  }

  const fail = (my: number, m: string, retry = false): void => {
    if (my !== run) return;
    clearAttempt(storage);
    setPhase('error');
    showError(m, retry);
  };

  function workPixels(bm: ImageBitmap): ImageData | null {
    const k = canvas2d(bm.width, bm.height);
    if (!k) return null;
    k.g.drawImage(bm, 0, 0);
    const d = k.g.getImageData(0, 0, bm.width, bm.height);
    freeCanvas(k.c);
    return d;
  }

  /**
   * The cut-out at work size: blur-fusion in its worker, which gets the pixels and the alpha transferred (no copy
   * stays here). When it fails (accepted degrade) both are made again and the photo's own colours are used.
   */
  async function cutOut(bm: ImageBitmap, mask: Float32Array): Promise<ImageData | null> {
    const px = workPixels(bm);
    if (!px) return null;
    const { width, height } = px;
    const alpha = resizeMask(mask, SIZE, SIZE, width, height);
    const { r1, r2 } = fusionRadii(Math.max(width, height));
    const req: FusionRequest = { rgba: px.data.buffer as ArrayBuffer, alpha: alpha.buffer as ArrayBuffer, width, height, r1, r2 };
    let out: ArrayBuffer | null = null;
    try {
      const w = createFusionWorker();
      out = await new Promise<ArrayBuffer | null>((resolve) => {
        w.onmessage = (e: MessageEvent<FusionResponse>) => resolve(e.data.ok ? e.data.rgba : null);
        w.onerror = (e) => {
          e.preventDefault();
          resolve(null);
        };
        w.postMessage(req, [req.rgba, req.alpha]);
      });
      w.terminate();
    } catch {
      out = null;
    }
    if (out) return new ImageData(new Uint8ClampedArray(out), width, height);
    const again = workPixels(bm);
    if (!again) return null;
    return new ImageData(plainCutout(again.data, resizeMask(mask, SIZE, SIZE, width, height)) as Uint8ClampedArray<ArrayBuffer>, width, height);
  }

  /** Reads the engine and model (cache or network) for `be` and runs one photo; falls back to WASM once. */
  async function process(my: number, be: Backend, input: Float32Array): Promise<void> {
    const store = await canStore(deps);
    if (my !== run) return;
    note.hidden = store;
    if (!store) note.textContent = COPY.noStore;
    await deleteOldCaches(deps);
    abort = new AbortController();
    const signal = abort.signal;
    let wasm: Uint8Array;
    let model: Uint8Array;
    try {
      const manifest = await loadManifest(deps, signal, store);
      const rt = runtimeParts(be);
      const rtBytes = rt.reduce((a, p) => a + p.bytes, 0);
      const mParts = modelParts(manifest);
      const total = rtBytes + (keptModel ? 0 : manifest.bytes);
      setPhase('downloading');
      onBytes({ loaded: 0, total }, 0, total);
      say(COPY.downloading(0, total));
      wasm = await loadParts(rt, { deps, signal, store, onProgress: (p) => onBytes(p, 0, total) });
      model = keptModel ?? (await loadParts(mParts, { deps, signal, store, onProgress: (p) => onBytes(p, rtBytes, total) }));
      if (!store) keptModel = model;
    } catch (err) {
      if (signal.aborted || my !== run) return;
      return fail(my, err instanceof AssetError && err.code === 'corrupt' ? COPY.corrupt : COPY.network, true);
    }
    if (my !== run) return;
    abort = null;
    setPhase('loading-engine');
    busy(COPY.preparing);
    markAttempt(storage);
    // The worker gets the bytes; a kept model is copied so the page still has it afterwards.
    const req: RunRequest = {
      type: 'run',
      backend: be,
      ortUrl: ortScript(be),
      ortBase: new URL(ortBase(be), location.href).href,
      wasm: wasm.buffer as ArrayBuffer,
      model: (keptModel ? keptModel.slice() : model).buffer as ArrayBuffer,
      input: input.slice().buffer,
      maxThreads: LIMITS[detectDevice()].maxThreads,
    };
    const engine = runEngine(req, createInferWorker, () => {
      if (my !== run) return;
      setPhase('working');
      busy(COPY.working);
    });
    cancelEngine = engine.cancel;
    let mask: Float32Array;
    try {
      const r = await engine.result;
      mask = r.mask;
      backend = r.backend;
    } catch (err) {
      cancelEngine = null;
      if (my !== run) return;
      if (shouldFallBack(err)) {
        // WebGPU did not work here: once more on the plain WASM engine.
        busy(COPY.fallback);
        return process(my, 'wasm', input);
      }
      return fail(my, err instanceof EngineError && err.stage === 'crash' ? COPY.crashed : COPY.engine, err instanceof EngineError && err.stage === 'crash');
    }
    cancelEngine = null;
    if (my !== run) return;
    await finish(my, mask);
  }

  async function finish(my: number, mask: Float32Array): Promise<void> {
    if (!bitmap) return;
    if (!validMask(mask)) return fail(my, COPY.engine);
    if (!hasSubject(mask)) {
      clearAttempt(storage);
      setPhase('nosubject');
      say(COPY.nosubject);
      return;
    }
    setPhase('working');
    busy(COPY.finishing);
    const out = await cutOut(bitmap, mask);
    if (my !== run) return;
    if (!out) return fail(my, COPY.crashed, true);
    clearAttempt(storage);
    cut = out;
    paintResult();
    setPhase('done');
    downloadBtn.disabled = false;
    updateSave();
    title.focus();
    say(COPY.doneSay(out.width, out.height));
  }

  function paintResult(): void {
    if (!cut) return;
    view$.width = cut.width;
    view$.height = cut.height;
    const g = view$.getContext('2d');
    if (!g) return;
    if (comparing && bitmap) {
      g.drawImage(bitmap, 0, 0);
      view$.setAttribute('aria-label', '원본 사진');
    } else {
      g.putImageData(cut, 0, 0);
      view$.setAttribute('aria-label', `배경을 지운 결과 미리보기, ${bgLabel(choice())} 배경`);
    }
  }

  const bgLabel = (b: BgChoice): string => (b === 'transparent' ? '투명' : b === 'white' ? '흰색' : '파란색');
  const choice = (): BgChoice => (root.querySelector<HTMLInputElement>('input[name="bg-bg"]:checked')?.value ?? 'transparent') as BgChoice;
  const format = (): SaveFormat => (root.querySelector<HTMLInputElement>('input[name="bg-format"]:checked')?.value === 'png' ? 'png' : 'jpeg');

  function updateSave(): void {
    const b = choice();
    stage.dataset.bg = comparing ? 'none' : b;
    formatBox.hidden = b === 'transparent';
    downloadBtn.textContent = saveLabel(b, format());
    if (cut) saveName.textContent = `저장될 이름: ${fileName(b, format())} · ${dims(cut.width, cut.height)}`;
    paintResult();
  }

  /** The picture to save at `scale` (1, or 0.5 for the retry): the cut-out, on a solid colour when one is chosen. */
  async function encode(scale: number): Promise<Blob | null> {
    if (!cut) return null;
    const b = choice();
    const f = format();
    const full = canvas2d(cut.width, cut.height);
    if (!full) return null;
    full.g.putImageData(cut, 0, 0);
    const w = Math.max(1, Math.round(cut.width * scale));
    const h = Math.max(1, Math.round(cut.height * scale));
    const out = canvas2d(w, h);
    if (!out) {
      freeCanvas(full.c);
      return null;
    }
    if (b !== 'transparent') {
      out.g.fillStyle = BG_COLORS[b];
      out.g.fillRect(0, 0, w, h);
    }
    out.g.imageSmoothingQuality = 'high';
    out.g.drawImage(full.c, 0, 0, w, h);
    freeCanvas(full.c);
    const blob = b === 'transparent' || f === 'png' ? await toBlob(out.c, 'image/png') : await toBlob(out.c, 'image/jpeg', 0.92);
    freeCanvas(out.c);
    return blob;
  }

  async function openFile(file: File): Promise<void> {
    release();
    hideError();
    hideEngineError();
    note.hidden = true;
    const my = run;
    const device = detectDevice();
    const bytesErr = checkFileBytes(file.size, device);
    if (bytesErr) return fail(my, bytesErr);
    if (file.size === 0) return fail(my, ERRORS.empty);
    let sniff;
    try {
      const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
      const tail = new Uint8Array(await file.slice(Math.max(0, file.size - TAIL_BYTES)).arrayBuffer());
      sniff = sniffImage(head, { tail, size: file.size });
    } catch {
      return fail(my, ERRORS.corrupt);
    }
    if (sniff.format === 'unknown') return fail(my, ERRORS['not-image']);
    if (sniff.format === 'tiff') return fail(my, unsupportedMessage(sniff.format));
    if (sniff.animated) return fail(my, COPY.animated);
    if (sniff.truncated) return fail(my, ERRORS.truncated);
    const size = orientedSize(sniff);
    if (size) {
      const d = checkDims(size.width, size.height, device);
      if (d) return fail(my, d);
    }
    setPhase('opening');
    busy(COPY.opening);
    let d;
    try {
      d = await decodeImage(file, sniff, { maxLongEdge: workEdge(storage, LIMITS[device].workEdge) });
    } catch (err) {
      const code = err instanceof PhotoError ? err.code : 'corrupt';
      return fail(my, code === 'heic' ? ERRORS.heic : code === 'oom' ? ERRORS.oom : ERRORS.corrupt);
    }
    if (my !== run) return d.close();
    const d2 = checkDims(d.sourceWidth, d.sourceHeight, device);
    if (d2) {
      d.close();
      return fail(my, d2);
    }
    bitmap = d.src;
    backend = await pickBackend();
    if (my !== run) return;
    if (keptModel || (await isCached(deps, backend))) return void start(my);
    if (my !== run) return;
    consentText.textContent = COPY.consent(downloadBytes(backend));
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    lowDevice.hidden = !(typeof mem === 'number' && mem < LOW_DEVICE_MEMORY);
    setPhase('consent');
    say(`${COPY.consent(downloadBytes(backend))} ${lowDevice.hidden ? '' : COPY.lowDevice}`.trim());
    startBtn.focus();
  }

  function start(my: number): void {
    if (!bitmap || my !== run) return;
    const input = inputFromImage(bitmap);
    if (!input) return fail(my, COPY.crashed, true);
    void process(my, backend, input);
  }

  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) void openFile(f);
  });
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer?.files?.[0];
    if (f) void openFile(f);
  });

  startBtn.addEventListener('click', () => start(run));
  consentCancel.addEventListener('click', () => {
    toEmpty();
    input.focus();
  });
  cancelBtn.addEventListener('click', () => {
    toEmpty();
    say(COPY.cancelled);
    input.focus();
  });
  retryBtn.addEventListener('click', () => {
    hideError();
    if (!bitmap) return toEmpty();
    run++;
    start(run);
  });
  for (const el of root.querySelectorAll<HTMLInputElement>('input[name="bg-bg"], input[name="bg-format"]')) el.addEventListener('change', updateSave);
  compareBtn.addEventListener('click', () => {
    comparing = !comparing;
    compareBtn.setAttribute('aria-pressed', String(comparing));
    updateSave();
  });
  downloadBtn.addEventListener('click', async () => {
    if (!cut) return;
    downloadBtn.disabled = true;
    // canvas.toBlob can give nothing when the device is short of room: once more at half size, then an error.
    const blob = (await encode(1)) ?? (await encode(0.5));
    downloadBtn.disabled = !cut;
    if (!blob) return showError(COPY.encode, false);
    const name = fileName(choice(), format());
    saveBlob(blob, name);
    say(COPY.saved(name));
  });
  for (const b of [newBtn, ...root.querySelectorAll<HTMLButtonElement>('[data-new]')]) {
    b.addEventListener('click', () => {
      toEmpty();
      input.focus();
    });
  }
  window.addEventListener('pagehide', () => {
    release();
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = null;
  });

  setPhase('empty');
  const first = pending ?? input.files?.[0];
  if (first) void openFile(first);
  return { open: (file) => void openFile(file) };
}
