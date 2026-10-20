// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// 위임장 만들기 controller (FORM1020 Flow, D4–D8). States: empty → building → ready | error; any edit after a build
// marks the result stale (downloads hidden until 「위임장 만들기」 again); 모두 지우기 → empty.
// 「위임장 만들기」 / 「빈 양식으로 받기」: values normalized here (./values; the worker does it again) → the shared HWP
// worker builds the form from its spec (message form-build) → every page rendered (SVG + runs kept for the PDF) and shown
// in the lazy viewer → export-hwp (the existing reload gate) → HWP blob. A failed HWP gate leaves the PDF available, and a
// failed PDF leaves the HWP: each button has its own error line. 「PDF로 받기」 writes the PDF from the kept pages with the
// existing exporter (fonts fetched then). Typed text is never stored, sent, put in the URL or in a file name (D7): the
// files are always 위임장.hwp / 위임장.pdf, and the usage events carry only blank|filled and hwp|pdf.
import type { PageInfo } from '../../lib/hwp/engine';
import type { HwpErrorCode } from '../../lib/hwp/errors';
import type { HwpRequest, HwpResponse } from '../../lib/hwp/hwp.worker';
import { prefetchRhwpWasm } from '../../lib/hwp/wasm-browser';
import { blankValues, normalizeValues } from '../../lib/form/values';
import type { FormValues } from '../../lib/form/spec';
import { announce as live, clearAlert, clearStatus } from '../../lib/ui/announce';
import { hideEngineError, showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { hideNextSteps, showNextSteps } from '../../lib/ui/next-steps';
import { preloadSkipped } from '../../lib/ui/preload';
import { track, type UsagePhase } from '../../lib/ui/usage';
import { FORM_HWP, POWER_OF_ATTORNEY as SPEC } from '../../data/forms/power-of-attorney';
import { triggerDownload, withExt } from '../hwp-shared/download';
import { loadHwpFonts, preloadFacesFor } from '../hwp-shared/fonts';
import { createWatchdog } from '../hwp-shared/watchdog';
import { PA_COPY } from './copy';

export type BuildKind = 'filled' | 'blank';
type State = 'empty' | 'building' | 'ready' | 'error';
type PageMsg = Extract<HwpResponse, { type: 'page' }>;
type Lazy = typeof import('../hwp-shared/lazy');
type Viewer = import('../hwp-shared/lazy').Viewer;

const TOOL = 'power-of-attorney';
const HWP_TYPE = 'application/x-hwp';
const HWP_NAME = withExt(SPEC.fileBase, '.hwp');
const PDF_NAME = withExt(SPEC.fileBase, '.pdf');

const createWorker = (): Worker => new Worker(new URL('../../lib/hwp/hwp.worker.ts', import.meta.url), { type: 'module' });

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

export interface PaStart {
  /** The action pressed before the controller ran (./entry). */
  action?: BuildKind;
  /** Today as YYYY-MM-DD (the reset puts it back in the date field). */
  today: () => string;
}

export function initPowerOfAttorney(start: PaStart): void {
  const root = must<HTMLDivElement>('pa-tool');
  const form = must<HTMLFormElement>('pa-form');
  const makeBtn = must<HTMLButtonElement>('pa-make');
  const blankBtn = must<HTMLButtonElement>('pa-blank');
  const resetBtn = must<HTMLButtonElement>('pa-reset');
  const progressBox = must<HTMLDivElement>('pa-progress');
  const progressText = must<HTMLParagraphElement>('pa-progress-text');
  const progressBar = must<HTMLProgressElement>('pa-progress-bar');
  const errorBox = must<HTMLDivElement>('pa-error');
  const errorText = must<HTMLParagraphElement>('pa-error-text');
  const retryBtn = must<HTMLButtonElement>('pa-retry');
  const result = must<HTMLDivElement>('pa-result');
  const stale = must<HTMLParagraphElement>('pa-stale');
  const downloads = must<HTMLDivElement>('pa-downloads');
  const hwpBtn = document.getElementById('pa-hwp') as HTMLButtonElement | null;
  const pdfBtn = must<HTMLButtonElement>('pa-pdf');
  const hwpError = must<HTMLParagraphElement>('pa-hwp-error');
  const pdfError = must<HTMLParagraphElement>('pa-pdf-error');
  const done = must<HTMLParagraphElement>('pa-done');
  const nextSlot = must<HTMLDivElement>('pa-next');
  const preview = must<HTMLDivElement>('pa-preview');
  const inputs = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-field]'));

  let state: State = 'empty';
  let run = 0;
  let kind: BuildKind = 'filled';
  let worker: Worker | null = null;
  let lazy: Lazy | null = null;
  let viewer: Viewer | null = null;
  let infos: PageInfo[] = [];
  let pages: (PageMsg | undefined)[] = [];
  const requested = new Set<number>();
  let hwpUrl: string | null = null;
  let pdfUrl: string | null = null;
  let pdfBusy = false;
  let isStale = false;
  /** A field changed while the build ran: the result is stale as soon as it shows. */
  let editedWhileBuilding = false;
  /** Where the worker is: building (form-build sent), pages (rendering), hwp (export-hwp sent). */
  let phase: 'build' | 'pages' | 'hwp' = 'build';
  const watchdog = createWatchdog(() => onTimeout());
  const announce = (msg: string): void => live('status', msg, root);

  function setState(next: State): void {
    state = next;
    root.dataset.state = next;
    if (next === 'building') document.body.dataset.busy = 'form';
    else delete document.body.dataset.busy;
    progressBox.hidden = next !== 'building';
    result.hidden = next !== 'ready';
    errorBox.hidden = next !== 'error';
    for (const b of [makeBtn, blankBtn, resetBtn]) {
      if (next === 'building') b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
    }
  }

  function progress(text: string, value: number | null): void {
    progressText.textContent = text;
    if (value === null) progressBar.removeAttribute('value');
    else progressBar.value = value;
    announce(text);
  }

  function stopWorker(): void {
    watchdog.stop();
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
    worker = null;
  }

  function send(msg: HwpRequest): void {
    if (!worker) return;
    watchdog.kick();
    worker.postMessage(msg);
  }

  /** The result of the last build is gone: URLs revoked, viewer and kept pages dropped, lines cleared. */
  function dropResult(): void {
    if (hwpUrl) URL.revokeObjectURL(hwpUrl);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    hwpUrl = pdfUrl = null;
    pdfBusy = false;
    viewer?.destroy();
    viewer = null;
    infos = [];
    pages = [];
    requested.clear();
    isStale = false;
    stale.hidden = true;
    stale.textContent = '';
    downloads.hidden = false;
    hwpError.textContent = '';
    pdfError.textContent = '';
    done.textContent = '';
    pdfBtn.removeAttribute('aria-busy');
    if (hwpBtn) hwpBtn.hidden = !FORM_HWP;
    hideNextSteps(nextSlot);
    preview.replaceChildren();
  }

  function usageFail(c: string, p: UsagePhase): void {
    track({ e: 'fail', t: TOOL, c, p });
  }

  function showError(text: string): void {
    run++;
    stopWorker();
    dropResult();
    setState('error');
    clearStatus(root);
    errorText.textContent = text;
    retryBtn.textContent = PA_COPY.retry;
    errorBox.focus();
  }

  function fail(code: HwpErrorCode, p: UsagePhase): void {
    usageFail(code, p);
    if (code === 'engine') {
      run++;
      stopWorker();
      dropResult();
      setState('empty');
      void showEngineError();
      return;
    }
    showError(code === 'oom' ? PA_COPY.oom : code === 'timeout' ? PA_COPY.timeout : PA_COPY.failed);
  }

  function onTimeout(): void {
    if (phase === 'hwp') {
      // The pages are kept: the PDF still works; only the HWP is missing.
      hwpFailed('timeout');
      return;
    }
    fail('timeout', 'process');
  }

  /** Reads the fields as typed (the page never sends or stores them). */
  function readInputs(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const el of inputs) out[el.dataset.field!] = el.value;
    return out;
  }

  // ---------- build ----------

  function build(k: BuildKind): void {
    if (state === 'building') return;
    const values: FormValues = k === 'blank' ? blankValues(SPEC) : normalizeValues(SPEC, readInputs());
    kind = k;
    editedWhileBuilding = false;
    run++;
    const id = run;
    stopWorker();
    dropResult();
    errorBox.hidden = true;
    clearAlert(root);
    hideEngineError();
    phase = 'build';
    setState('building');
    progress(PA_COPY.building, null);
    track({ e: 'start', t: TOOL, o: 'build', v: k });
    // The document faces and the viewer chunk load while the engine does.
    void loadHwpFonts();
    void import('../hwp-shared/lazy').then((m) => (lazy ??= m)).catch(() => undefined);
    let w: Worker;
    try {
      w = createWorker();
    } catch {
      fail('engine', 'load');
      return;
    }
    worker = w;
    let heard = false;
    w.onmessage = (ev: MessageEvent<HwpResponse>) => {
      if (id !== run) return;
      heard = true;
      const msg = ev.data;
      if (msg.type === 'progress') {
        watchdog.kick();
        if (msg.phase === 'engine') {
          const r = msg.loaded / Math.max(1, msg.total);
          progress(PA_COPY.engine(Math.round(r * 100)), r);
        } else progress(PA_COPY.building, null);
      } else if (msg.type === 'parsed') {
        void onParsed(msg.pageInfos, id);
      } else if (msg.type === 'page') {
        onPage(msg, id);
      } else if (msg.type === 'hwp') {
        onHwp(msg.bytes);
      } else if (msg.type === 'error') {
        if (phase === 'hwp') hwpFailed(msg.code);
        else fail(msg.code === 'engine' || msg.code === 'oom' || msg.code === 'timeout' ? msg.code : 'export', msg.code === 'engine' ? 'load' : 'process');
      }
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      if (id !== run) return;
      // A worker that never answered did not load (offline, a stale deploy); one that crashed later ran out of memory.
      if (phase === 'hwp') hwpFailed('oom');
      else fail(heard ? 'oom' : 'engine', heard ? 'process' : 'load');
    };
    w.onmessageerror = () => {
      if (id === run) fail('oom', 'process');
    };
    send({ type: 'form-build', specId: SPEC.id, values });
  }

  async function onParsed(pageInfos: PageInfo[], id: number): Promise<void> {
    watchdog.stop();
    phase = 'pages';
    infos = pageInfos;
    pages = new Array(infos.length);
    try {
      lazy ??= await withEngineRetry(() => import('../hwp-shared/lazy'));
    } catch {
      if (id === run) fail('engine', 'load');
      return;
    }
    if (id !== run) return;
    viewer = lazy.createViewer({ root: preview, infos, request: (i) => requestPage(i), pageFailedText: PA_COPY.pageFailed });
    // Every page is rendered once and kept: the PDF is written from these (D4).
    for (let i = 0; i < infos.length; i++) requestPage(i);
  }

  function requestPage(i: number): void {
    const kept = pages[i];
    if (kept) {
      viewer?.insert(i, kept.svg, kept.runs, kept.failed);
      return;
    }
    if (requested.has(i)) return;
    requested.add(i);
    send({ type: 'render', i });
  }

  function onPage(msg: PageMsg, id: number): void {
    pages[msg.i] = msg;
    viewer?.insert(msg.i, msg.svg, msg.runs, msg.failed);
    if (msg.i === 0) {
      const el = preview.querySelector('[data-page="0"]');
      if (el) void preloadFacesFor(el);
    }
    if (pages.filter(Boolean).length < infos.length || id !== run) return;
    if (FORM_HWP) {
      phase = 'hwp';
      send({ type: 'export-hwp' });
    } else {
      stopWorker();
      showResult();
    }
  }

  function onHwp(bytes: ArrayBuffer): void {
    stopWorker();
    hwpUrl = URL.createObjectURL(new Blob([bytes], { type: HWP_TYPE }));
    showResult();
  }

  /** The HWP gate failed (or the worker died exporting): the PDF still works from the kept pages. */
  function hwpFailed(code: HwpErrorCode): void {
    stopWorker();
    usageFail(code === 'unverified' ? 'unverified' : code, 'save');
    if (hwpBtn) hwpBtn.hidden = true;
    hwpError.textContent = code === 'unverified' ? PA_COPY.hwpUnverified : PA_COPY.hwpExport;
    showResult();
  }

  function showResult(): void {
    setState('ready');
    track({ e: 'success', t: TOOL });
    const line = kind === 'blank' ? PA_COPY.readyBlank : FORM_HWP && hwpUrl ? PA_COPY.ready : PA_COPY.readyPdfOnly;
    announce([line, hwpError.textContent].filter(Boolean).join(' '));
    result.focus();
    if (editedWhileBuilding) markStale();
  }

  // ---------- downloads ----------

  function saveHwp(): void {
    if (state !== 'ready' || isStale || !hwpUrl) return;
    triggerDownload(hwpUrl, HWP_NAME);
    track({ e: 'download', t: TOOL, o: 'format', v: 'hwp' });
    done.textContent = PA_COPY.downloaded(HWP_NAME);
    announce(done.textContent);
  }

  async function savePdf(): Promise<void> {
    if (state !== 'ready' || isStale || pdfBusy) return;
    if (pdfUrl) {
      triggerDownload(pdfUrl, PDF_NAME);
      track({ e: 'download', t: TOOL, o: 'format', v: 'pdf' });
      done.textContent = PA_COPY.downloaded(PDF_NAME);
      announce(done.textContent);
      return;
    }
    const id = run;
    pdfBusy = true;
    pdfBtn.setAttribute('aria-busy', 'true');
    pdfError.textContent = '';
    announce(PA_COPY.pdfBuilding);
    try {
      const chunk = await withEngineRetry(() => import('../hwp-shared/export-chunk'));
      const { blob, stats } = await chunk.exportPdf({
        infos,
        getPage: async (i) => {
          const p = pages[i];
          if (!p) throw new Error('page missing');
          return p;
        },
      });
      if (id !== run || isStale) return;
      pdfUrl = URL.createObjectURL(blob);
      triggerDownload(pdfUrl, PDF_NAME);
      track({ e: 'download', t: TOOL, o: 'format', v: 'pdf' });
      done.textContent = [PA_COPY.downloaded(PDF_NAME), stats.fallbackPages ? PA_COPY.rasterPage : ''].filter(Boolean).join(' ');
      announce(done.textContent);
      showNextSteps(nextSlot, TOOL, [{ blob, name: PDF_NAME }]);
    } catch {
      if (id !== run) return;
      usageFail('pdf', 'save');
      pdfError.textContent = PA_COPY.pdfFailed;
    } finally {
      if (id === run) {
        pdfBusy = false;
        pdfBtn.removeAttribute('aria-busy');
      }
    }
  }

  // ---------- stale, reset ----------

  function markStale(): void {
    if (state === 'building') editedWhileBuilding = true;
    if (state !== 'ready' || isStale) return;
    isStale = true;
    downloads.hidden = true;
    hwpError.textContent = '';
    pdfError.textContent = '';
    done.textContent = '';
    hideNextSteps(nextSlot);
    stale.textContent = PA_COPY.stale;
    stale.hidden = false;
  }

  function reset(): void {
    run++;
    stopWorker();
    dropResult();
    for (const el of inputs) el.value = el.dataset.field === 'date' ? start.today() : '';
    clearAlert(root);
    clearStatus(root);
    hideEngineError();
    setState('empty');
    inputs[0]?.focus();
  }

  // ---------- wiring ----------

  let prefetched = false;
  const prefetch = (): void => {
    if (prefetched) return;
    prefetched = true;
    if (!preloadSkipped((navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection)) void prefetchRhwpWasm();
  };
  form.addEventListener('focusin', prefetch);
  form.addEventListener('input', markStale);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    build('filled');
  });
  blankBtn.addEventListener('click', () => build('blank'));
  resetBtn.addEventListener('click', () => {
    if (state !== 'building') reset();
  });
  retryBtn.addEventListener('click', () => build(kind));
  hwpBtn?.addEventListener('click', saveHwp);
  pdfBtn.addEventListener('click', () => void savePdf());
  window.addEventListener('pagehide', () => {
    if (state !== 'building') return;
    run++;
    stopWorker();
  });
  window.addEventListener('pageshow', (ev) => {
    // Back from the bfcache: pagehide ended the build. Start over (the fields keep what was typed).
    if (ev.persisted && state === 'building') {
      dropResult();
      setState('empty');
    }
  });

  if (hwpBtn) hwpBtn.hidden = !FORM_HWP;
  setState('empty');
  if (start.action) {
    prefetch();
    build(start.action);
  }
}
