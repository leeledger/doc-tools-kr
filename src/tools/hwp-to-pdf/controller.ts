// HWP PDF 변환 UI controller (brief Step 5 "Flow"; SPIKE-HWP-DIRECT §6.1 "H": PDF 내려받기). States:
// empty → loading → convert | viewer-first | viewer-only | error; convert / viewer-first → exporting → back.
// The preview is always the lazy viewer (±2 / ±6 pages). 「PDF 내려받기」 builds the PDF in the page, one page
// at a time from the worker (export chunk: pdf-lib + fontkit + the writer), and saves it through an in-page
// <a download>. The page never navigates, swaps its title or opens a dialog, and the preview stays on screen.
// Loaded by ./boot after the first paint (or on the first interaction): this file, the sniff, the route and the
// prefetch. The worker starts when a file is picked; the
// viewer chunk (./lazy) and the document fonts load after that; the export chunk on idle or on the first click.
// Tokens: `docId` (one per opened document; stale worker messages are dropped) and `exportRun` (one per
// export; a cancel bumps it, so nothing of the canceled run lands).
import type { HwpErrorCode } from '../../lib/hwp/errors';
import type { HwpRequest, HwpResponse } from '../../lib/hwp/hwp.worker';
import type { PageInfo } from '../../lib/hwp/engine';
import { SNIFF_BYTES, sniffContainer } from '../../lib/hwp/sniff';
import { prefetchRhwpWasm } from '../../lib/hwp/wasm-browser';
import { announce as live, clearAlert, clearStatus } from '../../lib/ui/announce';
import { detectDevice, type Device } from '../../lib/ui/device';
import { hideEngineError, showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { loadDynamicFont } from '../../lib/ui/font';
import { formatSize } from '../../lib/ui/format';
import { schedulePreload, warmWorker } from '../../lib/ui/preload';
import type { BootStart } from './boot';
import { pdfName, triggerDownload } from './download';
import { LIMITS, overHardLimit, route, type Mode } from './limits';
import { COPY, ERRORS, tooLargeMessage, viewerFirstMessage, viewerOnlyMessage } from './messages';
import { loadHwpFonts, preloadFacesFor } from './fonts';
import { createWatchdog } from './watchdog';

type State = 'empty' | 'loading' | Mode | 'exporting' | 'error';
type Lazy = typeof import('./lazy');
type ExportChunk = typeof import('./export-chunk');
type Viewer = import('./lazy').Viewer;
type PageMsg = Extract<HwpResponse, { type: 'page' }>;
type Scanned = Extract<HwpResponse, { type: 'scanned' }>;
type Parsed = Extract<HwpResponse, { type: 'parsed' }>;

export const INFLIGHT_KEY = 'hwp-inflight';
const PROGRESS_INTERVAL_MS = 250;

const createWorker = (): Worker => new Worker(new URL('../../lib/hwp/hwp.worker.ts', import.meta.url), { type: 'module' });
const loadExportChunk = (): Promise<ExportChunk> => import('./export-chunk');
const isOom = (err: unknown): boolean => err instanceof RangeError || /out of memory|allocation|array buffer/i.test(err instanceof Error ? err.message : String(err));

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

/** True once when the previous page load left the in-flight flag behind (the tab was killed mid-work). */
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

/** Runs `fn` when the page is idle (the export chunk warm-up). */
function whenIdle(fn: () => void): void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 5000 });
  else setTimeout(fn, 1000);
}

export function initHwpTool(start: BootStart = {}): void {
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
  const eqNote = must<HTMLParagraphElement>('hw-eq-note');
  const note = must<HTMLParagraphElement>('hw-note');
  const done = must<HTMLDivElement>('hw-done');
  const doneText = must<HTMLParagraphElement>('hw-done-text');
  const again = must<HTMLAnchorElement>('hw-again');
  const preview = must<HTMLDivElement>('hw-preview');

  let state: State = 'empty';
  /** The routed mode of the open document (the state an export returns to). */
  let base: Mode = 'convert';
  let docId = 0;
  let exportRun = 0;
  let abort: AbortController | null = null;
  let worker: Worker | null = null;
  let viewer: Viewer | null = null;
  let lazy: Lazy | null = null;
  let infos: PageInfo[] = [];
  let equations = 0;
  let file: File | null = null;
  let device: Device = detectDevice();
  let lastProgress = 0;
  let outstanding = 0;
  let resultUrl: string | null = null;
  /** Pages awaited by the first-page wait or the export; a cancel or a reset answers them with null. */
  const waiters = new Map<number, (m: PageMsg | null) => void>();
  const releaseWaiters = (): void => {
    const all = [...waiters.values()];
    waiters.clear();
    for (const w of all) w(null);
  };
  const watchdog = createWatchdog(() => fail('timeout'));

  const announce = (msg: string): void => live('status', msg, root);
  const preload = schedulePreload(() => warmWorker(createWorker), { root, immediate: [pick, input], dropZone: root });
  const prefetch = (): void => {
    if (!preload.skipped) void prefetchRhwpWasm();
  };

  function setState(next: State): void {
    state = next;
    root.dataset.state = next;
    if (next === 'loading' || next === 'exporting') document.body.dataset.busy = 'hwp';
    else delete document.body.dataset.busy;
    const exporting = next === 'exporting';
    const mode: State = exporting ? base : next;
    drop.hidden = next !== 'empty' && next !== 'error';
    progressBox.hidden = next !== 'loading' && !exporting;
    result.hidden = !(mode === 'convert' || mode === 'viewer-first' || mode === 'viewer-only');
    saveBtn.hidden = mode !== 'convert';
    forceBtn.hidden = mode !== 'viewer-first';
    for (const b of [saveBtn, forceBtn, resetBtn]) {
      if (exporting) b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
    }
    note.hidden = mode !== 'convert';
    eqNote.hidden = !(mode === 'convert' && equations > 0);
    banner.hidden = !(mode === 'viewer-first' || mode === 'viewer-only');
    if (exporting || (next !== 'convert' && next !== 'viewer-first')) done.hidden = true;
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
    outstanding = 0;
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
    if (!worker) {
      // The worker is gone (pagehide) while a document is still on screen: say so instead of waiting forever.
      // fail() releases every page waiter, so the first-page wait and the export end with it.
      if (state !== 'empty' && state !== 'error') fail('engine');
      return;
    }
    watchdog.kick();
    worker.postMessage(msg, transfer);
  }

  function dropResult(): void {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    again.removeAttribute('href');
    doneText.textContent = '';
    done.hidden = true;
  }

  function stopExport(): void {
    exportRun++;
    abort?.abort();
    abort = null;
  }

  function clearDocument(): void {
    stopExport();
    dropResult();
    viewer?.destroy();
    viewer = null;
    infos = [];
    equations = 0;
    banner.textContent = '';
    fileName.textContent = '';
  }

  /** Terminates the worker, revokes the PDF URL, clears the pages and the in-flight flag. */
  function reset(focus = true): void {
    docId++;
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
    stopWorker();
    clearDocument();
    setInflight(null);
    setState('error');
    void showEngineError();
  }

  // ---------- pages ----------

  function onPage(msg: PageMsg): void {
    outstanding = Math.max(0, outstanding - 1);
    if (!outstanding) watchdog.stop();
    const w = waiters.get(msg.i);
    if (w) {
      waiters.delete(msg.i);
      w(msg);
    }
    // The viewer takes every page it wants (it drops the others), also the ones the export asked for.
    viewer?.insert(msg.i, msg.svg, msg.runs, msg.failed);
  }

  function request(i: number): void {
    outstanding++;
    send({ type: 'render', i });
  }

  function awaitPage(i: number): Promise<PageMsg | null> {
    return new Promise((resolve) => {
      waiters.set(i, resolve);
      request(i);
    });
  }

  async function onParsed(msg: Parsed, feats: Scanned, id: number): Promise<void> {
    const routed = route({ device, fileBytes: file?.size ?? 0, pages: msg.pages, wasmBytes: msg.wasmBytes, imageBytes: feats.imageBytes, textboxes: feats.textboxes });
    try {
      lazy ??= await withEngineRetry(() => import('./lazy'));
    } catch {
      if (id === docId) fail('engine');
      return;
    }
    if (id !== docId) return;
    infos = msg.pageInfos;
    equations = feats.equations;
    base = routed.mode;
    fileName.textContent = `${file?.name ?? ''} · ${msg.pages.toLocaleString('ko-KR')}쪽`;
    progress(COPY.firstPage(msg.pages), null, true);
    viewer = lazy.createViewer({ root: preview, infos, request, pageFailedText: COPY.pageFailed });
    const first = await awaitPage(0);
    if (id !== docId || !first) return;
    const page0 = preview.querySelector('[data-page="0"]');
    if (page0) void preloadFacesFor(page0);
    if (base !== 'convert') banner.textContent = base === 'viewer-first' ? viewerFirstMessage(routed.reasons) : viewerOnlyMessage(device, routed.reasons);
    setInflight(null);
    setState(base);
    announce([COPY.ready(msg.pages), base === 'convert' ? '' : banner.textContent, base === 'convert' && equations ? COPY.equations : ''].filter(Boolean).join(' '));
    fileName.focus();
    if (base !== 'viewer-only' && !preload.skipped) whenIdle(() => void loadExportChunk().catch(() => undefined));
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
        // The viewer chunk and the document font CSS load while the engine does.
        void import('./lazy').then((m) => (lazy ??= m)).catch(() => undefined);
        void loadHwpFonts();
      } else if (msg.type === 'parsed') {
        watchdog.stop();
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

  // ---------- export ----------

  async function exportDocument(button: HTMLButtonElement): Promise<void> {
    if ((state !== 'convert' && state !== 'viewer-first') || !file || !infos.length) return;
    const id = docId;
    const run = ++exportRun;
    const ctl = new AbortController();
    abort = ctl;
    const current = (): boolean => id === docId && run === exportRun;
    const n = infos.length;
    const name = pdfName(file.name);
    // Building the PDF of a heavy file is where a phone may kill the tab: flag it (cleared on every exit).
    setInflight(file.size);
    setState('exporting');
    lastProgress = 0;
    progress(COPY.exporting(0, n), 0, true);
    let chunk: ExportChunk;
    try {
      chunk = await withEngineRetry(loadExportChunk);
    } catch {
      if (current()) fail('engine');
      return;
    }
    if (!current()) return;
    try {
      const { blob, stats } = await chunk.exportPdf({
        infos,
        getPage: async (i) => {
          const m = await awaitPage(i);
          if (!m) throw new DOMException('page request released', 'AbortError');
          return m;
        },
        // A page finishing after 취소 must not overwrite the "취소했습니다" line.
        onProgress: (i, total) => {
          if (current()) progress(COPY.exporting(i, total), i / total, i === total);
        },
        signal: ctl.signal,
      });
      if (!current()) return;
      abort = null;
      setInflight(null);
      dropResult();
      resultUrl = URL.createObjectURL(blob);
      triggerDownload(resultUrl, name);
      again.href = resultUrl;
      again.download = name;
      const line = COPY.done(name, n, formatSize(blob.size));
      doneText.textContent = stats.failedPages ? `${line}. ${COPY.failedPages(stats.failedPages)}` : line;
      setState(base);
      done.hidden = false;
      announce(doneText.textContent);
      button.focus();
    } catch (err) {
      if (!current()) return;
      abort = null;
      if ((err as { name?: unknown } | null)?.name === 'AbortError') return;
      fail(isOom(err) ? 'oom' : 'corrupt');
    }
  }

  function cancel(): void {
    if (state !== 'exporting') {
      reset();
      return;
    }
    // Back to the document; the worker still holds it and the viewer keeps its pages.
    stopExport();
    releaseWaiters();
    setInflight(null);
    setState(base);
    announce(COPY.canceled);
    (base === 'viewer-first' ? forceBtn : saveBtn).focus();
  }

  // ---------- wiring ----------

  const busy = (): boolean => state === 'loading' || state === 'exporting';
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) void open(f);
  });
  // The engine download overlaps the file dialog (SPIKE-HWP-DIRECT §6.7).
  for (const el of [pick, input] as HTMLElement[]) {
    el.addEventListener('pointerdown', prefetch);
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') prefetch();
    });
  }
  root.addEventListener('dragenter', prefetch);
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
  resetBtn.addEventListener('click', () => {
    if (state !== 'exporting') reset();
  });
  saveBtn.addEventListener('click', () => void exportDocument(saveBtn));
  forceBtn.addEventListener('click', () => void exportDocument(forceBtn));
  window.addEventListener('pagehide', () => {
    docId++;
    stopExport();
    stopWorker();
  });
  window.addEventListener('pageshow', (ev) => {
    // Back from the bfcache: pagehide ended the worker and the export, so the document is gone. Start over.
    if (ev.persisted && state !== 'empty' && state !== 'error') reset(false);
  });

  if (takeInflight()) {
    notice.textContent = COPY.inflight;
    notice.hidden = false;
  }
  setState('empty');
  // What the page script saw before this controller ran (./boot).
  if (start.prefetch) {
    void preload.start();
    prefetch();
  }
  if (start.file) void open(start.file);
}
