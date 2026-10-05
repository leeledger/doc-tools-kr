// 사진 배경 지우기 controller (Sprint C, C2; brief Flow). Loaded by entry.ts on the first interaction, never with the
// page. Named bg*, not controller*: gen-sw precaches controller chunks, and C2 adds nothing to the precache (Arch).
//
// pick -> checks + work copy (4,096 / 2,048 px) -> engine running? / cached? -> (consent ->) download (progress, 취소)
//   -> engine worker (one session kept between photos; disposed after 2 min idle, 60 s hidden, pagehide, a crash,
//      or after every photo on low-memory devices: Arch round 2) -> area check -> 8-bit mask at work size
//   -> blur-fusion worker -> preview (투명 / 흰색 / 파란색, 원본과 비교) -> PNG / JPG
// On this path the photo never leaves the page: its pixels go only to our own workers. The only requests are GETs of
// our own /vendor/ engine and model files, made after the user agreed (or from this tool's Cache Storage).
//
// C2-cloud (brief handoff/ARCHITECT-BRIEF-C2-CLOUD.md §4; only with __BG_CLOUD__): pick -> ready -> 배경 지우기 (the
// press is the consent) -> a <= 1024 px JPEG copy POSTed to /api/remove-bg (lib/bgremove/cloud.ts, loaded after the
// pick) -> its alpha, scaled up -> the same blur-fusion and result as above. "사진을 보내지 않고 기기에서 처리"
// (remembered in localStorage, lib/bgremove/mode.ts) enters the path above; so does a full monthly quota, with a notice.
import {
  AssetError,
  browserDeps,
  canStore,
  checkModel,
  deleteOldCaches,
  downloadBytes,
  isCached,
  loadManifest,
  loadParts,
  modelParts,
  ortBase,
  ortScript,
  runtimeBytes,
  runtimeParts,
  type Backend,
  type Progress,
} from '../../lib/bgremove/assets';
import { clearAttempt, markAttempt, workEdge } from '../../lib/bgremove/guard';
import { OPT_LEVEL, type InitRequest } from '../../lib/bgremove/infer-core';
import type { Mask } from '../../lib/bgremove/cloud';
import { fusionRadii, hasSubject, pilResizeRgba, resizeMask, SIZE, toInput, validMask } from '../../lib/bgremove/infer';
import { chooseDevice, deviceChosen } from '../../lib/bgremove/mode';
import { plainCutout } from '../../lib/bgremove/fusion';
import type { FusionRequest, FusionResponse } from '../../lib/bgremove/fusion.worker';
import { disposeTimers, EngineError, keepEngine, pickBackend, shouldFallBack, startEngine, type EngineHandle, type WorkerLike } from '../../lib/bgremove/session';
import { sessionStore } from '../../lib/face/guard';
import { decodeImage } from '../../lib/image/decode';
import { ERRORS, PhotoError, unsupportedMessage } from '../../lib/image/messages';
import { HEAD_BYTES, TAIL_BYTES, orientedSize, sniffImage } from '../../lib/image/sniff';
import { announce as live, clearAlert } from '../../lib/ui/announce';
import { detectDevice } from '../../lib/ui/device';
import { hideEngineError } from '../../lib/ui/engine-error';
import { BG_COLORS, CLOUD, COPY, dims, fileName, saveLabel, type BgChoice, type SaveFormat } from './copy';
import { checkDims, checkFileBytes, LIMITS, LOW_DEVICE_MEMORY } from './limits';
import { move, view, type Phase } from './model';

const createInferWorker = (): WorkerLike => new Worker(new URL('../../lib/bgremove/infer.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
const createFusionWorker = (): Worker => new Worker(new URL('../../lib/bgremove/fusion.worker.ts', import.meta.url), { type: 'module' });
type CloudModule = typeof import('../../lib/bgremove/cloud');
/** After this long without an answer the line says the photo is being worked on (fetch reports no upload progress). */
const SENT_AFTER_MS = 1500;

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
  const consentExtra = must<HTMLElement>('bg-consent-extra');
  const fallbackLine = must<HTMLElement>('bg-fallback');
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
  // C2-cloud elements: only in a build with the cloud path on.
  const ready = document.getElementById('bg-ready');
  const deviceRetry = document.getElementById('bg-device-retry');
  const modeLine = document.getElementById('bg-mode');

  const deps = browserDeps();
  const storage = sessionStore();
  let phase: Phase = 'empty';
  /** Bumped by every new photo and by 취소: replies for an older run are dropped. */
  let run = 0;
  let bitmap: ImageBitmap | null = null;
  let backend: Backend = 'wasm';
  /** Set by a WebGPU failure: the rest of this page visit uses WASM. */
  let gpuFailed = false;
  let abort: AbortController | null = null;
  let cancelEngine: (() => void) | null = null;
  /** The live engine (session in its worker), kept between photos unless `keep` is false. */
  let engine: EngineHandle | null = null;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const keep = keepEngine({ deviceMemory: nav.deviceMemory, userAgent: nav.userAgent, platform: nav.platform, maxTouchPoints: nav.maxTouchPoints });
  /** Model bytes kept in the page only when they cannot be cached (needed for the next photo or the fallback). */
  let keptModel: Uint8Array | null = null;
  /** The finished cut-out (straight RGBA at work size). */
  let cut: ImageData | null = null;
  let comparing = false;
  /** The work copy's pixels between the model input and the fusion worker (transferred there). */
  let photoPx: ImageData | null = null;
  /** C2-cloud: which path the current photo took (what 다시 시도 repeats). */
  let via: 'cloud' | 'device' = 'device';
  let cloudModule: Promise<CloudModule> | null = null;

  const say = (m: string): void => live('status', m, root);

  /** Terminates the engine worker (frees the session and all engine memory). */
  function disposeEngine(): void {
    timers.stop();
    engine?.dispose();
    engine = null;
  }
  /** Idle (2 min) and hidden (60 s) disposal, never during an engine start or a run (session.ts disposeTimers). */
  const timers = disposeTimers(() => {
    engine?.dispose();
    engine = null;
  });


  function setPhase(p: Phase): void {
    phase = move(phase, p);
    root.dataset.state = phase;
    const v = view(phase);
    drop.hidden = !v.drop;
    if (ready) ready.hidden = !v.ready;
    consent.hidden = !v.consent;
    progress.hidden = !v.progress;
    cancelBtn.hidden = !v.cancel;
    result.hidden = !v.result;
    nosubject.hidden = !v.nosubject;
    if (!v.bytes) bar.removeAttribute('value');
  }

  function showError(m: string, retry: boolean, device = false): void {
    errorBox.textContent = m;
    errorBox.hidden = false;
    retryBtn.hidden = !retry;
    if (deviceRetry) deviceRetry.hidden = !device;
    live('alert', m, root);
  }

  function hideError(): void {
    errorBox.hidden = true;
    errorBox.textContent = '';
    retryBtn.hidden = true;
    if (deviceRetry) deviceRetry.hidden = true;
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
    photoPx = null;
    fallbackLine.hidden = true;
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
  async function cutOut(bm: ImageBitmap, m: Mask, read: ImageData | null): Promise<ImageData | null> {
    const px = read ?? workPixels(bm);
    if (!px) return null;
    const { width, height } = px;
    const alpha = resizeMask(m.mask, m.width, m.height, width, height);
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
    return new ImageData(plainCutout(again.data, resizeMask(m.mask, m.width, m.height, width, height)) as Uint8ClampedArray<ArrayBuffer>, width, height);
  }

  /** A running engine for `be`: the live one, or loaded (cache or network) and started; null when handled (error, 취소). */
  async function engineFor(my: number, be: Backend): Promise<EngineHandle | null> {
    if (engine && !engine.disposed && engine.backend === be) return engine;
    disposeEngine();
    const store = await canStore(deps);
    if (my !== run) return null;
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
      const total = rtBytes + (keptModel ? 0 : manifest.bytes);
      setPhase('downloading');
      onBytes({ loaded: 0, total }, 0, total);
      say(COPY.downloading(0, total));
      wasm = await loadParts(rt, { deps, signal, store, onProgress: (p) => onBytes(p, 0, total) });
      model = keptModel ?? (await loadParts(modelParts(manifest), { deps, signal, store, onProgress: (p) => onBytes(p, rtBytes, total) }));
      // The joined model must be the build's (exportId, bytes, total SHA-256): otherwise the 손상 path.
      if (!keptModel) await checkModel(model, deps);
      if (!store) keptModel = model;
    } catch (err) {
      if (signal.aborted || my !== run) return null;
      fail(my, err instanceof AssetError && err.code === 'corrupt' ? COPY.corrupt : COPY.network, true);
      return null;
    }
    if (my !== run) return null;
    abort = null;
    setPhase('loading-engine');
    busy(COPY.preparing);
    // The worker gets the bytes; a kept model is copied so the page still has it afterwards.
    const req: InitRequest = {
      type: 'init',
      backend: be,
      ortUrl: ortScript(be),
      ortBase: new URL(ortBase(be), location.href).href,
      wasm: wasm.buffer as ArrayBuffer,
      model: (keptModel ? keptModel.slice() : model).buffer as ArrayBuffer,
      maxThreads: LIMITS[detectDevice()].maxThreads,
      optLevel: OPT_LEVEL,
    };
    const started = startEngine(req, createInferWorker, () => {
      // The worker died between photos (a crash): forget it; the next photo starts a new one.
      engine = null;
    });
    cancelEngine = started.cancel;
    try {
      const e = await started.ready;
      cancelEngine = null;
      if (my !== run) {
        e.dispose();
        return null;
      }
      engine = e;
      return e;
    } catch (err) {
      cancelEngine = null;
      if (my !== run) return null;
      throw err;
    }
  }

  /** One photo: the engine (started if needed), the run, the cut-out. Falls back to WASM once. */
  async function process(my: number, be: Backend, input: Float32Array): Promise<void> {
    markAttempt(storage);
    let mask: Float32Array;
    timers.begin();
    try {
      const e = await engineFor(my, be);
      if (!e) return;
      setPhase('working');
      busy(COPY.working);
      // The input is transferred; a copy stays here for the fallback.
      const r = await e.run(input.slice());
      if (my !== run) return;
      mask = r.mask;
      backend = e.backend;
    } catch (err) {
      if (my !== run) return;
      disposeEngine();
      if (shouldFallBack(err)) {
        // WebGPU did not work here: once more on the plain WASM engine.
        gpuFailed = true;
        // Stated in the consent panel already (no second question); said again here, in a line progress never overwrites.
        fallbackLine.textContent = COPY.fallbackNote(runtimeBytes('wasm'));
        fallbackLine.hidden = false;
        say(fallbackLine.textContent);
        return process(my, 'wasm', input);
      }
      return fail(my, err instanceof EngineError && err.stage === 'crash' ? COPY.crashed : COPY.engine, err instanceof EngineError && err.stage === 'crash');
    } finally {
      timers.done();
    }
    // Low-memory devices drop the engine after every photo; elsewhere the idle timer (re-armed above) does it.
    if (!keep) disposeEngine();
    await finish(my, { mask, width: SIZE, height: SIZE }, COPY.finishing);
  }

  /** The mask (the model's 512 one, or the cloud answer's alpha) -> the cut-out at work size, or nosubject. */
  async function finish(my: number, m: Mask, refining: string): Promise<void> {
    if (!bitmap) return;
    if (!validMask(m.mask)) return fail(my, COPY.engine);
    if (!hasSubject(m.mask)) {
      clearAttempt(storage);
      setPhase('nosubject');
      say(COPY.nosubject);
      return;
    }
    setPhase('working');
    busy(refining);
    const read = photoPx;
    photoPx = null;
    const out = await cutOut(bitmap, m, read);
    if (my !== run) return;
    if (!out) return fail(my, COPY.crashed, true);
    clearAttempt(storage);
    cut = out;
    paintResult();
    // A notice from before the run (the cloud quota line, when the engine was ready and no 받고 시작 cleared it)
    // never stays next to the result.
    hideError();
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
    if (__BG_CLOUD__ && !deviceChosen()) {
      // The cloud client is fetched now, while the user reads the panel (brief §4: loaded after the pick).
      loadCloud().catch(() => undefined);
      via = 'cloud';
      setPhase('ready');
      say(CLOUD.ready);
      document.getElementById('bg-send')?.focus();
      return;
    }
    return onDevice(my);
  }

  function loadCloud(): Promise<CloudModule> {
    cloudModule ??= import('../../lib/bgremove/cloud').catch((err: unknown) => {
      cloudModule = null;
      throw err;
    });
    return cloudModule;
  }

  /** The C2 path for the open photo: a live or cached engine starts at once, otherwise the consent panel. */
  async function onDevice(my: number): Promise<void> {
    if (!bitmap || my !== run) return;
    via = 'device';
    // A live engine is used as it is; after a WebGPU failure this page stays on WASM.
    backend = engine && !engine.disposed ? engine.backend : gpuFailed ? 'wasm' : await pickBackend();
    if (my !== run) return;
    if ((engine && !engine.disposed) || keptModel || (await isCached(deps, backend))) return void start(my);
    if (my !== run) return;
    consentText.textContent = COPY.consent(downloadBytes(backend));
    consentExtra.textContent = backend === 'webgpu' ? COPY.consentExtra(runtimeBytes('wasm')) : '';
    consentExtra.hidden = backend !== 'webgpu';
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    lowDevice.hidden = !(typeof mem === 'number' && mem < LOW_DEVICE_MEMORY);
    setPhase('consent');
    say([consentText.textContent, consentExtra.textContent, lowDevice.hidden ? '' : COPY.lowDevice].filter(Boolean).join(' '));
    startBtn.focus();
  }

  function start(my: number): void {
    if (!bitmap || my !== run) return;
    // The work copy's pixels are read once: the model input is made from them now, and the same buffer goes to the
    // fusion worker afterwards (C2 round 2: one 4 × w × h buffer instead of two).
    photoPx = workPixels(bitmap);
    const input = photoPx ? toInput(pilResizeRgba(photoPx.data, photoPx.width, photoPx.height, SIZE, SIZE)) : null;
    if (!input) return fail(my, COPY.crashed, true);
    void process(my, backend, input);
  }

  /** C2-cloud: one press of 배경 지우기 = one request. Errors offer 다시 시도 and 기기에서 처리; nothing is retried here. */
  async function sendCloud(my: number): Promise<void> {
    const bm = bitmap;
    if (!bm || my !== run) return;
    via = 'cloud';
    hideError();
    setPhase('sending');
    busy(CLOUD.sending);
    abort = new AbortController();
    const signal = abort.signal;
    const later = setTimeout(() => {
      if (my === run && phase === 'sending') busy(CLOUD.working);
    }, SENT_AFTER_MS);
    try {
      let mod: CloudModule;
      try {
        mod = await loadCloud();
      } catch {
        return cloudFail(my, 'failed');
      }
      const copy = await mod.makeCopy(bm, (w, h) => {
        const k = canvas2d(w, h);
        return k && { canvas: k.c, g: k.g };
      });
      if (my !== run) return;
      if (!copy) return cloudFail(my, 'failed');
      const r = await mod.requestCutout(copy.bytes, signal);
      if (my !== run) return;
      abort = null;
      if (!r.ok) return r.why === 'aborted' ? undefined : cloudFail(my, r.why);
      setPhase('working');
      busy(CLOUD.refining);
      const m = await mod.decodeAlpha(r.blob, copy);
      if (my !== run) return;
      if (!m) return cloudFail(my, 'failed');
      await finish(my, m, CLOUD.refining);
    } finally {
      clearTimeout(later);
    }
  }

  function cloudFail(my: number, why: 'busy' | 'quota' | 'failed'): void {
    if (my !== run) return;
    abort = null;
    if (why === 'quota') {
      // Brief §4: the month's free quota is used up -> the on-device path, with a notice (not remembered). The
      // notice goes on 받고 시작 or, when the engine is ready, once the result shows (finish).
      showError(CLOUD.quota, false);
      void onDevice(my);
      return;
    }
    setPhase('error');
    showError(why === 'busy' ? CLOUD.busy : CLOUD.failed, true, true);
  }

  /** "사진을 보내지 않고 기기에서 처리": remembered on this device; the open photo goes the C2 way. */
  function toDevice(): void {
    chooseDevice(true);
    if (modeLine) modeLine.hidden = false;
    hideError();
    if (!bitmap) return toEmpty();
    run++;
    void onDevice(run);
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

  startBtn.addEventListener('click', () => {
    hideError();
    start(run);
  });
  consentCancel.addEventListener('click', () => {
    toEmpty();
    input.focus();
  });
  cancelBtn.addEventListener('click', () => {
    const sending = phase === 'sending';
    toEmpty();
    say(__BG_CLOUD__ && sending ? CLOUD.sendCancelled : COPY.cancelled);
    input.focus();
  });
  retryBtn.addEventListener('click', () => {
    hideError();
    if (!bitmap) return toEmpty();
    run++;
    if (__BG_CLOUD__ && via === 'cloud') void sendCloud(run);
    else start(run);
  });
  if (__BG_CLOUD__) {
    document.getElementById('bg-send')?.addEventListener('click', () => void sendCloud(run));
    document.getElementById('bg-device')?.addEventListener('click', toDevice);
    deviceRetry?.addEventListener('click', toDevice);
    document.getElementById('bg-ready-cancel')?.addEventListener('click', () => {
      toEmpty();
      input.focus();
    });
    if (modeLine) modeLine.hidden = !deviceChosen();
    document.getElementById('bg-mode-back')?.addEventListener('click', () => {
      chooseDevice(false);
      if (modeLine) modeLine.hidden = true;
      input.focus();
    });
  }
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
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') timers.hidden();
    else timers.visible();
  });
  window.addEventListener('pagehide', () => {
    release();
    disposeEngine();
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = null;
  });

  setPhase('empty');
  const first = pending ?? input.files?.[0];
  if (first) void openFile(first);
  return { open: (file) => void openFile(file) };
}
