// HWP PDF 변환 UI controller (brief Step 5 "Flow", §3.2). States: empty → loading → convert | viewer-first |
// viewer-only | error; viewer-first → rendering → convert (그래도 PDF로 저장, cancelable back to viewer-first).
// Initial JS: this file, the sniff and the route. The guidance data comes with the lazy chunk (it is shown
// only once a document is ready; the help section is server-rendered from the same data). The worker (rhwp
// glue, scan) starts when a file is picked; the viewer / post-processing / print chunk (./lazy) and the
// document fonts load after that.
// Two tokens: `docId` (one per opened document; stale worker messages are dropped) and `renderRun` (one per
// full render; a cancel bumps it, so no page of the canceled run is awaited or appended by it).
import type { HwpErrorCode } from '../../lib/hwp/errors';
import type { HwpRequest, HwpResponse } from '../../lib/hwp/hwp.worker';
import type { PageInfo } from '../../lib/hwp/engine';
import { SNIFF_BYTES, sniffContainer } from '../../lib/hwp/sniff';
import { announce as live, clearAlert, clearStatus } from '../../lib/ui/announce';
import { detectDevice, type Device } from '../../lib/ui/device';
import { hideEngineError, showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { loadDynamicFont } from '../../lib/ui/font';
import { safeFileName } from '../../lib/ui/format';
import { schedulePreload, warmWorker } from '../../lib/ui/preload';
import { LIMITS, overHardLimit, route, type Mode, type RouteResult } from './limits';
import { COPY, ERRORS, tooLargeMessage, viewerFirstMessage, viewerOnlyMessage } from './messages';
import { fontsSettled, hwpFontsReady, loadHwpFonts, preloadFacesFor } from './fonts';
import { createWatchdog } from './watchdog';

type State = 'empty' | 'loading' | Mode | 'rendering' | 'error';
type Lazy = typeof import('./lazy');
type Viewer = import('./lazy').Viewer;
type PageMsg = Extract<HwpResponse, { type: 'page' }>;
type Scanned = Extract<HwpResponse, { type: 'scanned' }>;
type Parsed = Extract<HwpResponse, { type: 'parsed' }>;

export const INFLIGHT_KEY = 'hwp-inflight';
const PROGRESS_INTERVAL_MS = 250;

const createWorker = (): Worker => new Worker(new URL('../../lib/hwp/hwp.worker.ts', import.meta.url), { type: 'module' });
const stem = (name: string): string => name.replace(/\.[^./\\]+$/, '');
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

/** True once when the previous page load left the in-flight flag behind (the tab was killed mid-parse). */
function takeInflight(): boolean {
  try {
    const had = sessionStorage.getItem(INFLIGHT_KEY) !== null;
    sessionStorage.removeItem(INFLIGHT_KEY);
    return had;
  } catch {
    return false;
  }
}

function setInflight(bytes: number | null): void {
  try {
    if (bytes === null) sessionStorage.removeItem(INFLIGHT_KEY);
    else sessionStorage.setItem(INFLIGHT_KEY, JSON.stringify({ bytes }));
  } catch {
    // Storage blocked: the tab-kill notice is best effort.
  }
}

function list(steps: string[]): HTMLOListElement {
  const ol = document.createElement('ol');
  for (const s of steps) {
    const li = document.createElement('li');
    li.textContent = s;
    ol.append(li);
  }
  return ol;
}

function para(cls: string, text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = cls;
  p.textContent = text;
  return p;
}

export function initHwpTool(): void {
  const found = document.getElementById('hwp-tool');
  if (!found) return;
  const root: HTMLElement = found;
  const input = must<HTMLInputElement>('hw-input');
  const pick = must<HTMLLabelElement>('hw-pick');
  const drop = must<HTMLDivElement>('hw-drop');
  const notice = must<HTMLParagraphElement>('hw-notice');
  const progressBox = must<HTMLDivElement>('hw-progress');
  const progressText = must<HTMLParagraphElement>('hw-progress-text');
  const progressBar = must<HTMLProgressElement>('hw-progress-bar');
  const cancelBtn = must<HTMLButtonElement>('hw-cancel');
  const errorBox = must<HTMLParagraphElement>('hw-error');
  const result = must<HTMLDivElement>('hw-result');
  const fileName = must<HTMLParagraphElement>('hw-file-name');
  const banner = must<HTMLParagraphElement>('hw-banner');
  const saveBtn = must<HTMLButtonElement>('hw-save');
  const forceBtn = must<HTMLButtonElement>('hw-force');
  const resetBtn = must<HTMLButtonElement>('hw-reset');
  const note = must<HTMLParagraphElement>('hw-note');
  const guide = must<HTMLDivElement>('hw-guide');
  const after = must<HTMLDivElement>('hw-after');
  const preview = must<HTMLDivElement>('hwp-print-root');

  let state: State = 'empty';
  let docId = 0;
  let renderRun = 0;
  let worker: Worker | null = null;
  let viewer: Viewer | null = null;
  let lazy: Lazy | null = null;
  let infos: PageInfo[] = [];
  let routed: RouteResult | null = null;
  let file: File | null = null;
  let device: Device = detectDevice();
  let lastProgress = 0;
  /** Pages the full render awaits; a cancel or a reset answers them with null so the render unwinds. */
  const waiters = new Map<number, (m: PageMsg | null) => void>();
  const releaseWaiters = (): void => {
    const all = [...waiters.values()];
    waiters.clear();
    for (const w of all) w(null);
  };
  const pending = new Set<number>();
  const watchdog = createWatchdog(() => fail('timeout'));

  const announce = (msg: string): void => live('status', msg, root);
  const preload = schedulePreload(() => warmWorker(createWorker), { root, immediate: [pick, input], dropZone: root });

  function setState(next: State): void {
    state = next;
    root.dataset.state = next;
    if (next === 'loading' || next === 'rendering') document.body.dataset.busy = 'hwp';
    else delete document.body.dataset.busy;
    const shown = next === 'convert' || next === 'viewer-first' || next === 'viewer-only' || next === 'rendering';
    drop.hidden = next !== 'empty' && next !== 'error';
    progressBox.hidden = next !== 'loading' && next !== 'rendering';
    result.hidden = !shown;
    saveBtn.hidden = next !== 'convert';
    forceBtn.hidden = next !== 'viewer-first';
    resetBtn.hidden = next === 'rendering';
    note.hidden = next !== 'convert';
    guide.hidden = next !== 'convert';
    banner.hidden = !(next === 'viewer-first' || next === 'viewer-only' || next === 'rendering');
    if (next !== 'convert') after.hidden = true;
    // Print CSS: only a finished document prints; viewer-only prints a one-line notice (brief §3.2).
    // A converted document prints only once the save button is on (fonts settled, images downscaled);
    // Ctrl/Cmd+P before that prints a one-line notice (Richard, Step 5 round 2, Should Fix 4).
    setPrintReady(false);
    document.body.classList.toggle('hwp-viewer-only', next === 'viewer-only');
    document.body.classList.toggle('hwp-not-ready', next === 'viewer-first' || next === 'rendering' || (next === 'loading' && infos.length > 0));
  }

  function setPrintReady(ready: boolean): void {
    document.body.classList.toggle('hwp-printable', state === 'convert' && ready);
    document.body.classList.toggle('hwp-preparing', state === 'convert' && !ready);
  }

  function progress(text: string, value: number | null, force = false): void {
    const now = performance.now();
    if (!force && now - lastProgress < PROGRESS_INTERVAL_MS) return;
    lastProgress = now;
    progressText.textContent = text;
    if (value === null) progressBar.removeAttribute('value');
    else progressBar.value = value;
    announce(text);
  }

  function stopWorker(): void {
    watchdog.stop();
    pending.clear();
    releaseWaiters();
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      worker = null;
    }
  }

  function send(msg: HwpRequest, transfer: Transferable[] = []): void {
    if (!worker) return;
    watchdog.kick();
    worker.postMessage(msg, transfer);
  }

  function clearDocument(): void {
    preview.classList.remove('hw-building');
    viewer?.destroy();
    viewer = null;
    lazy?.removePageStyle();
    infos = [];
    routed = null;
    banner.textContent = '';
    fileName.textContent = '';
    guide.replaceChildren();
  }

  /** Terminates the worker, revokes every blob URL, clears the pages, the @page style and the in-flight flag. */
  function reset(focus = true): void {
    docId++;
    renderRun++;
    stopWorker();
    clearDocument();
    setInflight(null);
    errorBox.hidden = true;
    errorBox.textContent = '';
    clearAlert(root);
    clearStatus(root);
    hideEngineError();
    input.value = '';
    file = null;
    setState('empty');
    if (focus) pick.focus();
  }

  function showError(text: string): void {
    docId++;
    renderRun++;
    stopWorker();
    clearDocument();
    setInflight(null);
    setState('error');
    clearStatus(root);
    errorBox.textContent = text;
    errorBox.hidden = false;
    errorBox.focus();
  }

  function fail(code: Exclude<HwpErrorCode, 'too-large'>): void {
    if (code !== 'engine') {
      showError(ERRORS[code]);
      return;
    }
    docId++;
    renderRun++;
    stopWorker();
    clearDocument();
    setInflight(null);
    setState('error');
    void showEngineError();
  }

  function renderGuide(lz: Lazy): void {
    const [lead, ...rest] = lz.orderedGuides(lz.detectBrowser({ ua: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints }));
    const card = document.createElement('div');
    card.className = 'hw-guide-lead';
    card.append(para('hw-guide-title', `${lead.title}에서 저장하는 방법`), list(lead.steps));
    const more = document.createElement('details');
    more.className = 'more';
    const sum = document.createElement('summary');
    sum.textContent = '다른 브라우저에서 저장하는 방법';
    more.append(sum);
    for (const g of rest) more.append(para('hw-guide-title', g.title), list(g.steps));
    guide.replaceChildren(card, more);
  }

  // ---------- pages ----------

  function onPage(msg: PageMsg): void {
    pending.delete(msg.i);
    void loadHwpFonts();
    const w = waiters.get(msg.i);
    if (w) {
      waiters.delete(msg.i);
      w(msg);
    } else viewer?.insert(msg.i, msg.svg, msg.runs, msg.failed);
    if (!pending.size) watchdog.stop();
  }

  /** Lazy viewer request (the viewer marks the slot pending; the answer goes to viewer.insert). */
  function request(i: number): void {
    if (pending.has(i)) return;
    pending.add(i);
    send({ type: 'render', i });
  }

  function awaitPage(i: number): Promise<PageMsg | null> {
    return new Promise((resolve) => {
      waiters.set(i, resolve);
      pending.add(i);
      send({ type: 'render', i });
    });
  }

  async function onParsed(msg: Parsed, feats: Scanned, id: number): Promise<void> {
    routed = route({
      device,
      fileBytes: file?.size ?? 0,
      pages: msg.pages,
      wasmBytes: msg.wasmBytes,
      imageBytes: feats.imageBytes,
      equations: feats.equations,
      textboxes: feats.textboxes,
    });
    try {
      lazy ??= await withEngineRetry(() => import('./lazy'));
    } catch {
      if (id === docId) fail('engine');
      return;
    }
    if (id !== docId) return;
    watchdog.stop();
    infos = msg.pageInfos;
    fileName.textContent = `${file?.name ?? ''} · ${msg.pages.toLocaleString('ko-KR')}쪽`;
    const mode = routed.mode;
    viewer = lazy.createViewer({ root: preview, infos, lazy: mode !== 'convert', request, pageFailedText: COPY.pageFailed });
    if (mode === 'convert') {
      renderRun++;
      await fullRender(id, renderRun, false);
      return;
    }
    banner.textContent = mode === 'viewer-first' ? viewerFirstMessage(routed.reasons) : viewerOnlyMessage(device, routed.reasons);
    setInflight(null);
    setState(mode);
    announce(`${COPY.ready(msg.pages)} ${banner.textContent}`);
    fileName.focus();
  }

  /**
   * Renders every page in order (convert, or 그래도 PDF로 저장), frees the engine and prepares printing.
   * The preview is hidden while pages arrive: with ~860 unicode-range faces, every font slice that lands
   * re-lays out all the text already shown, so a visible build is quadratic (adm28: 20 s instead of 5 s).
   * Downscaling needs layout, so it runs once the pages are shown and the fonts are in.
   */
  async function fullRender(id: number, run: number, forced: boolean): Promise<void> {
    const v = viewer;
    const lz = lazy;
    if (!v || !lz) return;
    const live = (): boolean => id === docId && run === renderRun;
    const n = infos.length;
    v.setLazy(false);
    // 그래도 PDF로 저장 on a heavy routed file is where a phone kills the tab: flag it again (cleared below,
    // and on cancel, reset and error). Richard, Step 5 round 2, Should Fix 2.
    if (forced) setInflight(file?.size ?? 0);
    setState(forced ? 'rendering' : 'loading');
    progress(COPY.pages(0, n), 0, true);
    preview.classList.add('hw-building');
    try {
      for (let i = 0; i < n; i++) {
        if (!v.isRendered(i)) {
          const msg = await awaitPage(i);
          if (!live() || !msg) return;
          v.insert(i, msg.svg, msg.runs, msg.failed);
        }
        progress(COPY.pages(i + 1, n), (i + 1) / n, i === n - 1);
        await tick();
        if (!live()) return;
      }
      await preloadFacesFor(preview);
      if (!live()) return;
    } finally {
      preview.classList.remove('hw-building');
    }
    // Free the WASM before print doubles the peak.
    send({ type: 'close' });
    stopWorker();
    lz.installPageStyle(infos);
    renderGuide(lz);
    setState('convert');
    saveBtn.disabled = true;
    announce(`${COPY.ready(n)} ${COPY.fonts}`);
    await hwpFontsReady();
    for (let i = 0; i < n && live(); i++) await v.downscale(i);
    await fontsSettled();
    if (!live()) return;
    setInflight(null);
    saveBtn.disabled = false;
    setPrintReady(true);
    announce(COPY.ready(n));
    if (forced) await save();
    else fileName.focus();
  }

  // ---------- open ----------

  async function open(f: File): Promise<void> {
    reset(false);
    const id = docId;
    file = f;
    device = detectDevice();
    loadDynamicFont();
    if (overHardLimit(device, f.size)) {
      showError(tooLargeMessage(device, f.size, LIMITS[device].hardBytes));
      return;
    }
    let head: Uint8Array;
    try {
      head = new Uint8Array(await f.slice(0, SNIFF_BYTES).arrayBuffer());
    } catch {
      showError(ERRORS.corrupt);
      return;
    }
    if (id !== docId) return;
    const kind = sniffContainer(head);
    if (kind === 'unsupported' || kind === 'unknown') {
      fail(kind === 'unsupported' ? 'unsupported' : 'not-hwp');
      return;
    }
    setState('loading');
    lastProgress = 0;
    progress(COPY.opening, null, true);
    setInflight(f.size);
    const warming = preload.claim();
    if (warming) await warming;
    let buffer: ArrayBuffer;
    try {
      buffer = await f.arrayBuffer();
    } catch {
      if (id === docId) showError(ERRORS.corrupt);
      return;
    }
    if (id !== docId) return;
    let w: Worker;
    try {
      w = createWorker();
    } catch {
      fail('engine');
      return;
    }
    worker = w;
    let heard = false;
    let feats: Scanned | null = null;
    w.onmessage = (ev: MessageEvent<HwpResponse>) => {
      if (id !== docId) return;
      heard = true;
      const msg = ev.data;
      if (msg.type === 'page') {
        onPage(msg);
        return;
      }
      watchdog.kick();
      if (msg.type === 'progress') {
        if (msg.phase === 'engine') {
          const r = msg.loaded / Math.max(1, msg.total);
          progress(COPY.engine(Math.round(r * 100)), r, r >= 1);
        } else progress(COPY.opening, null, true);
      } else if (msg.type === 'scanned') {
        feats = msg;
        // Start the viewer chunk while the engine loads.
        void import('./lazy').then((m) => (lazy ??= m)).catch(() => undefined);
      } else if (msg.type === 'parsed') {
        if (feats) void onParsed(msg, feats, id);
      } else if (msg.type === 'error') fail(msg.code === 'too-large' ? 'corrupt' : msg.code);
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      if (id !== docId) return;
      // A worker that never answered did not load (offline, a stale deploy): an engine error. One that
      // crashed after answering ran out of memory.
      fail(heard ? 'oom' : 'engine');
    };
    w.onmessageerror = () => {
      if (id === docId) fail('oom');
    };
    send({ type: 'open', bytes: buffer, inflateCap: LIMITS[device].inflateCap }, [buffer]);
  }

  async function save(): Promise<void> {
    if (!lazy || state !== 'convert' || saveBtn.disabled) return;
    after.hidden = true;
    saveBtn.focus();
    await lazy.printDocument(safeFileName(stem(file?.name ?? ''), ''), () => {
      after.hidden = false;
      saveBtn.focus();
    });
  }

  function cancel(): void {
    if (state !== 'rendering') {
      reset();
      return;
    }
    // Back to viewer-first; the worker still holds the document and the lazy window takes over again.
    renderRun++;
    releaseWaiters();
    pending.clear();
    watchdog.stop();
    setInflight(null);
    setState('viewer-first');
    viewer?.setLazy(true);
    announce(COPY.canceled);
    forceBtn.focus();
  }

  // ---------- wiring ----------

  const busy = (): boolean => state === 'loading' || state === 'rendering';
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) void open(f);
  });
  root.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer?.types.includes('Files') || busy()) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    drop.classList.add('over');
  });
  root.addEventListener('dragleave', () => drop.classList.remove('over'));
  root.addEventListener('drop', (ev) => {
    if (busy()) return;
    ev.preventDefault();
    drop.classList.remove('over');
    const f = ev.dataTransfer?.files?.[0];
    if (f) void open(f);
  });
  cancelBtn.addEventListener('click', cancel);
  resetBtn.addEventListener('click', () => reset());
  saveBtn.addEventListener('click', () => void save());
  forceBtn.addEventListener('click', () => {
    if (state !== 'viewer-first') return;
    renderRun++;
    lastProgress = 0;
    void fullRender(docId, renderRun, true);
  });
  window.addEventListener('pagehide', () => {
    docId++;
    renderRun++;
    stopWorker();
  });

  if (takeInflight()) {
    notice.textContent = COPY.inflight;
    notice.hidden = false;
  }
  setState('empty');
}
