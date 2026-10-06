// 전자서명·도장 이미지, photo tab (Sprint C, C1; brief "Flow"). States: empty -> loading -> work (or error).
// The photo never leaves the page: it is decoded here into a work copy (long edge 2,400 px on a PC, 1,600 px on a
// phone), handed once to the ink worker (src/lib/ink/ink.worker.ts), and each control change re-runs the key there
// with the options only (debounced 150 ms). The worker's cropped, sized RGBA is drawn on two previews (on a
// checkerboard and on white) and saved as PNG on 내려받기.
import { sizeOptions, type InkColor, type InkMode, type InkSize, type Rgba } from '../../lib/ink/key';
import type { InkRequest, InkResponse } from '../../lib/ink/worker-core';
import { decodeImage } from '../../lib/image/decode';
import { ERRORS, PhotoError, unsupportedMessage } from '../../lib/image/messages';
import { HEAD_BYTES, TAIL_BYTES, orientedSize, sniffImage } from '../../lib/image/sniff';
import { announce as live, clearAlert } from '../../lib/ui/announce';
import { detectDevice } from '../../lib/ui/device';
import { hideEngineError, showEngineError } from '../../lib/ui/engine-error';
import { track, type UsagePhase } from '../../lib/ui/usage';
import { COPY, areaMessage, dims, strengthLabel } from './copy';
import { checkDims, checkFileBytes, LIMITS } from './limits';
import { encodeWithRetry, saveBlob } from './png';

const DEBOUNCE_MS = 150;

const createInkWorker = (): Worker => new Worker(new URL('../../lib/ink/ink.worker.ts', import.meta.url), { type: 'module' });

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

type Phase = 'empty' | 'loading' | 'work' | 'error';
type Result = Extract<InkResponse, { type: 'result' }>;

/** Draws straight RGBA on a canvas at its own size (the CSS scales it down). */
function paint(canvas: HTMLCanvasElement, px: Rgba): void {
  canvas.width = px.width;
  canvas.height = px.height;
  canvas.getContext('2d')?.putImageData(new ImageData(px.data as Uint8ClampedArray<ArrayBuffer>, px.width, px.height), 0, 0);
}

/**
 * Loaded by entry.ts on the first interaction with the photo tab. `pending` is a photo that arrived (drop or
 * picker) while this module was loading.
 */
export function initStampTool(pending?: File): { open(file: File): void } | null {
  const found = document.getElementById('ss-photo');
  if (!found) return null;
  const root: HTMLElement = found;
  const input = must<HTMLInputElement>('ss-input');
  const drop = must<HTMLElement>('ss-drop');
  const errorBox = must<HTMLElement>('ss-error');
  const retryBtn = must<HTMLButtonElement>('ss-retry');
  const loading = must<HTMLElement>('ss-loading');
  const loadingText = must<HTMLElement>('ss-loading-text');
  const work = must<HTMLElement>('ss-work');
  const previews = must<HTMLElement>('ss-previews');
  const onChecker = must<HTMLCanvasElement>('ss-on-checker');
  const onWhite = must<HTMLCanvasElement>('ss-on-white');
  const strength = must<HTMLInputElement>('ss-strength');
  const strengthOut = must<HTMLOutputElement>('ss-strength-out');
  const noPad = must<HTMLInputElement>('ss-nopad');
  const downloadBtn = must<HTMLButtonElement>('ss-download');
  const saveName = must<HTMLElement>('ss-save-name');
  const newBtn = must<HTMLButtonElement>('ss-new');
  const sizeInputs = [...root.querySelectorAll<HTMLInputElement>('input[name="ss-size"]')];

  let bitmap: ImageBitmap | null = null;
  let worker: Worker | null = null;
  let loaded = false;
  /** Bumped by every new photo: replies for an older photo are dropped. */
  let photoRun = 0;
  /** The latest control run: older results are dropped. */
  let runId = 0;
  let current: { px: Rgba; fileName: string } | null = null;
  /** The usage statistics take the first outcome of each photo (later runs only follow the controls). */
  let outcomeSent = false;
  const usageFail = (c: string, p: UsagePhase): void => track({ e: 'fail', t: 'stamp-signature', c, p });
  const outcome = (ok: boolean, code: string): void => {
    if (outcomeSent) return;
    outcomeSent = true;
    if (ok) track({ e: 'success', t: 'stamp-signature' });
    else usageFail(code, 'process');
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waiting = new Map<number, (r: Result | null) => void>();

  const say = (msg: string): void => live('status', msg, root);

  function setPhase(p: Phase): void {
    root.dataset.state = p;
    loading.hidden = p !== 'loading';
    work.hidden = p !== 'work';
    drop.hidden = p !== 'empty' && p !== 'error';
  }

  function showError(msg: string, retry = false): void {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    retryBtn.hidden = !retry;
    live('alert', msg, root);
  }

  function hideError(): void {
    errorBox.hidden = true;
    errorBox.textContent = '';
    retryBtn.hidden = true;
    clearAlert(root);
  }

  const checked = (name: string): string => root.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? '';

  function options(size?: InkSize): Extract<InkRequest, { type: 'run' }>['opts'] {
    const s = checked('ss-size');
    return {
      mode: (checked('ss-mode') || 'auto') as InkMode,
      strength: Number(strength.value) || 0,
      color: (checked('ss-color') || 'original') as InkColor,
      size: size !== undefined ? size : s === '' || s === '0' ? null : (Number(s) as InkSize),
      noPad: noPad.checked,
    };
  }

  function stopWorker(): void {
    worker?.terminate();
    worker = null;
    loaded = false;
    for (const resolve of waiting.values()) resolve(null);
    waiting.clear();
  }

  function release(): void {
    photoRun++;
    clearTimeout(timer);
    stopWorker();
    bitmap?.close();
    bitmap = null;
    current = null;
    downloadBtn.disabled = true;
    saveName.textContent = '';
  }

  /** A new photo starts from the defaults (자동, 보통, 사진 속 색, 원본 크기, with margin). */
  function resetControls(): void {
    for (const el of work.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')) {
      el.checked = el.defaultChecked;
      el.disabled = false;
    }
    strength.value = strength.defaultValue;
    strengthOut.value = strengthLabel(Number(strength.value));
  }

  function toEmpty(): void {
    release();
    resetControls();
    input.value = '';
    hideError();
    setPhase('empty');
  }

  /** Work-copy pixels of the open photo (read again from the bitmap for 다시 시도). */
  function pixels(): ImageData | null {
    if (!bitmap) return null;
    const c = document.createElement('canvas');
    c.width = bitmap.width;
    c.height = bitmap.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(bitmap, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height);
    c.width = 0;
    c.height = 0;
    return data;
  }

  function startWorker(): void {
    const my = photoRun;
    track({ e: 'start', t: 'stamp-signature' });
    const data = pixels();
    if (!data) return crashed();
    let w: Worker;
    try {
      w = createInkWorker();
    } catch {
      return void engineFailed();
    }
    worker = w;
    w.onerror = (ev) => {
      ev.preventDefault();
      if (my !== photoRun || worker !== w) return;
      // Before `loaded` the worker script itself did not arrive (offline, a new deploy): an engine failure.
      if (loaded) crashed();
      else void engineFailed();
    };
    w.onmessage = (ev: MessageEvent<InkResponse>) => {
      if (my !== photoRun || worker !== w) return;
      const m = ev.data;
      if (m.type === 'loaded') {
        loaded = true;
        run();
      } else if (m.type === 'error') crashed();
      else onResult(m);
    };
    const req: InkRequest = { type: 'load', pixels: data.data.buffer as ArrayBuffer, width: data.width, height: data.height };
    w.postMessage(req, [req.pixels]);
  }

  function run(): void {
    if (!worker || !loaded) return;
    clearTimeout(timer);
    runId++;
    root.dataset.busy = 'true';
    worker.postMessage({ type: 'run', run: runId, opts: options() } satisfies InkRequest);
  }

  /** One extra run at another size (the export retry); resolves with its result, or null. */
  function runAt(size: InkSize): Promise<Result | null> {
    if (!worker || !loaded) return Promise.resolve(null);
    const id = ++runId;
    return new Promise((resolve) => {
      waiting.set(id, resolve);
      worker!.postMessage({ type: 'run', run: id, opts: options(size) } satisfies InkRequest);
    });
  }

  const schedule = (): void => {
    clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
  };

  function onResult(m: Result): void {
    const wait = waiting.get(m.run);
    if (wait) {
      waiting.delete(m.run);
      wait(m);
      return;
    }
    if (m.run !== runId) return;
    delete root.dataset.busy;
    setPhase('work');
    const msg = areaMessage(m.status);
    if (msg || !m.out || !m.rect) {
      current = null;
      previews.hidden = true;
      downloadBtn.disabled = true;
      saveName.textContent = '';
      outcome(false, m.status === 'allpaper' ? 'allpaper' : 'noink');
      showError(msg ?? COPY.noink);
      return;
    }
    outcome(true, '');
    hideError();
    const px: Rgba = { data: new Uint8ClampedArray(m.out.pixels), width: m.out.width, height: m.out.height };
    current = { px, fileName: m.fileName };
    // A 크기 bigger than the crop is disabled (downscale only); a disabled choice falls back to 원본 크기, which
    // is what the worker made for it anyway.
    const enabled = new Map(sizeOptions(m.rect).map((o) => [String(o.size ?? 0), o.enabled]));
    for (const el of sizeInputs) {
      el.disabled = !enabled.get(el.value);
      if (el.disabled && el.checked) sizeInputs.find((x) => x.value === '0')!.checked = true;
    }
    paint(onChecker, px);
    paint(onWhite, px);
    previews.hidden = false;
    downloadBtn.disabled = false;
    saveName.textContent = `저장될 이름: ${m.fileName} · ${dims(px.width, px.height)}`;
    say(COPY.ready(px.width, px.height));
  }

  function crashed(): void {
    usageFail('crash', 'process');
    stopWorker();
    delete root.dataset.busy;
    if (!bitmap) return toEmpty();
    setPhase('work');
    previews.hidden = true;
    downloadBtn.disabled = true;
    showError(COPY.crashed, true);
  }

  async function engineFailed(): Promise<void> {
    usageFail('engine', 'load');
    release();
    setPhase('empty');
    await showEngineError();
  }

  async function openFile(file: File): Promise<void> {
    release();
    // Every photo starts from the defaults, also one picked after an error or a crash (Arch ruling, C1 review).
    resetControls();
    hideError();
    hideEngineError();
    const my = photoRun;
    const device = detectDevice();
    outcomeSent = false;
    track({ e: 'pick', t: 'stamp-signature' });
    const fail = (code: string, msg: string): void => {
      if (my !== photoRun) return;
      usageFail(code, 'parse');
      setPhase('error');
      showError(msg);
    };
    const bytesErr = checkFileBytes(file.size, device);
    if (bytesErr) return fail('too-large', bytesErr);
    if (file.size === 0) return fail('empty', ERRORS.empty);
    let sniff;
    try {
      const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
      const tail = new Uint8Array(await file.slice(Math.max(0, file.size - TAIL_BYTES)).arrayBuffer());
      sniff = sniffImage(head, { tail, size: file.size });
    } catch {
      return fail('corrupt', ERRORS.corrupt);
    }
    if (sniff.format === 'unknown') return fail('not-image', ERRORS['not-image']);
    if (sniff.format === 'tiff') return fail('unsupported', unsupportedMessage(sniff.format));
    if (sniff.animated) return fail('animated', COPY.animated);
    if (sniff.truncated) return fail('truncated', ERRORS.truncated);
    const size = orientedSize(sniff);
    if (size) {
      const d = checkDims(size.width, size.height, device);
      if (d) return fail('dims', d);
    }
    setPhase('loading');
    loadingText.textContent = COPY.opening;
    say(COPY.opening);
    let d;
    try {
      d = await decodeImage(file, sniff, { maxLongEdge: LIMITS[device].workEdge });
    } catch (err) {
      const code = err instanceof PhotoError ? err.code : 'corrupt';
      const known = code === 'heic' || code === 'oom' ? code : 'corrupt';
      return fail(known, ERRORS[known]);
    }
    if (my !== photoRun) return d.close();
    const d2 = checkDims(d.sourceWidth, d.sourceHeight, device);
    if (d2) {
      d.close();
      return fail('dims', d2);
    }
    bitmap = d.src;
    loadingText.textContent = COPY.keying;
    say(COPY.keying);
    startWorker();
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

  for (const el of root.querySelectorAll<HTMLInputElement>('input[name="ss-mode"], input[name="ss-color"], input[name="ss-size"]')) {
    el.addEventListener('change', schedule);
  }
  noPad.addEventListener('change', schedule);
  strength.addEventListener('input', () => {
    strengthOut.value = strengthLabel(Number(strength.value));
    schedule();
  });

  retryBtn.addEventListener('click', () => {
    hideError();
    setPhase('loading');
    loadingText.textContent = COPY.keying;
    say(COPY.keying);
    startWorker();
  });

  downloadBtn.addEventListener('click', async () => {
    if (!current) return;
    const { px, fileName } = current;
    downloadBtn.disabled = true;
    const blob = await encodeWithRetry(px, async (size) => {
      const r = await runAt(size);
      return r?.out ? { data: new Uint8ClampedArray(r.out.pixels), width: r.out.width, height: r.out.height } : null;
    });
    downloadBtn.disabled = !current;
    if (!blob) {
      usageFail('encode', 'save');
      return showError(COPY.encode);
    }
    saveBlob(blob, fileName);
    track({ e: 'download', t: 'stamp-signature' });
    say(COPY.saved(fileName));
  });

  newBtn.addEventListener('click', () => {
    toEmpty();
    input.focus();
  });

  strengthOut.value = strengthLabel(Number(strength.value));
  setPhase('empty');
  const first = pending ?? input.files?.[0];
  if (first) void openFile(first);
  return { open: (file) => void openFile(file) };
}
