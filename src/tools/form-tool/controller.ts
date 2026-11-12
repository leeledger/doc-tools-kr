// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// 양식 만들기 controller (FORM1020 Flow, D4–D8; generic since LOAN1022 L-D4): one form tool page (위임장 만들기,
// 차용증 만들기 …) = a spec, an id prefix, its copy, its HWP kill switch and its usage/next-step id (FormToolConfig).
// States: empty → building → ready | error; any edit after a build marks the result stale (downloads hidden until
// 「… 만들기」 again); 모두 지우기 → empty.
// 「… 만들기」 / 「빈 양식으로 받기」: values normalized here (lib/form/values; the worker does it again) → the shared HWP
// worker builds the form from its spec (message form-build) → every page rendered (SVG + runs kept for the PDF) and shown
// in the lazy viewer → export-hwp (the existing reload gate) → HWP blob. A failed HWP gate leaves the PDF available, and a
// failed PDF leaves the HWP: each button has its own error line. 「PDF로 받기」 writes the PDF from the kept pages with the
// existing exporter (fonts fetched then). Typed text is never stored, sent, put in the URL or in a file name (D7): the
// files are always `${spec.fileBase}.hwp` / `.pdf`, and the usage events carry only blank|filled and hwp|pdf.
// QUOTE1112: choice fields are radios (the checked one is the value); `hooks` lets a page add its own parts without
// growing this shared chunk: the spec to build (a filled build of such a page reports its spec id, never a value),
// input, a check before a filled build, reset and a seal picture for the build (/quotation/: ../quotation/*.ts).
import type { PageInfo } from '../../lib/hwp/engine';
import type { HwpErrorCode } from '../../lib/hwp/errors';
import type { HwpRequest, HwpResponse } from '../../lib/hwp/hwp.worker';
import { prefetchRhwpWasm } from '../../lib/hwp/wasm-browser';
import { groupDigits } from '../../lib/form/digits';
import { blankValues, fieldProblem, normalizeAmount, normalizeValues, type FieldProblem } from '../../lib/form/values';
import type { FormSealMsg } from '../../lib/form/seal';
import type { FormSpec, FormValues } from '../../lib/form/spec';
import { announce as live, clearAlert, clearStatus } from '../../lib/ui/announce';
import { hideEngineError, showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { hideNextSteps, showNextSteps, type NextSource } from '../../lib/ui/next-steps';
import { preloadSkipped } from '../../lib/ui/preload';
import { track, type FormToolId, type UsagePhase } from '../../lib/ui/usage';
import { triggerDownload, withExt } from '../hwp-shared/download';
import { loadHwpFonts, preloadFacesFor } from '../hwp-shared/fonts';
import { createWatchdog } from '../hwp-shared/watchdog';

export type BuildKind = 'filled' | 'blank';
type State = 'empty' | 'building' | 'ready' | 'error';
type PageMsg = Extract<HwpResponse, { type: 'page' }>;
type Lazy = typeof import('../hwp-shared/lazy');
type Viewer = import('../hwp-shared/lazy').Viewer;

const HWP_TYPE = 'application/x-hwp';

const createWorker = (): Worker => new Worker(new URL('../../lib/hwp/hwp.worker.ts', import.meta.url), { type: 'module' });

function mustId<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

/** In-tool lines of one form tool (late copy, 해요체; each tool's copy.ts). */
export interface FormCopy {
  engine: (pct: number) => string;
  building: string;
  ready: string;
  readyBlank: string;
  readyPdfOnly: string;
  stale: string;
  pdfBuilding: string;
  downloaded: (name: string) => string;
  rasterPage: string;
  failed: string;
  oom: string;
  timeout: string;
  retry: string;
  hwpExport: string;
  hwpUnverified: string;
  pdfFailed: string;
  pageFailed: string;
}

/** QUOTE1112: a page's own parts of the form tool (all optional). */
export interface FormHooks {
  /** Any input in the form (after the result was marked stale). */
  input?(target: EventTarget | null): void;
  /** Before a filled build, after the field checks: false blocks it (the hook shows its own error and focus). */
  check?(): boolean;
  /** 모두 지우기, after the fields were cleared. */
  reset?(): void;
  /** The seal picture of the next filled build, as the worker takes it (a fresh buffer: it is transferred). */
  seal?(): FormSealMsg | undefined;
  /** The spec to build now (several specs share one field list); a filled build then reports its id (FORM_DOCS). */
  spec?(): FormSpec;
}

/** What a page's hooks may use: the fields as typed (radios: the checked value). */
export interface FormHookContext {
  read(): Record<string, string>;
}

export interface FormToolConfig {
  spec: FormSpec;
  /** The element id prefix of the page (src/components/FormTool.astro): `${prefix}-tool`, `${prefix}-form` … */
  prefix: string;
  copy: FormCopy;
  /** The HWP download (the spec module's kill switch). */
  hwp: boolean;
  /** The usage statistics and 이어서 하기 id of the page. */
  tool: FormToolId & NextSource;
  /** Date fields that start at today (the reset puts today back). */
  today: readonly string[];
  /** The field error lines of amount and number fields (LOAN1022 L-D3; a spec without them needs none). */
  problems?: Readonly<Record<FieldProblem, string>>;
  /** QUOTE1112: the page's own parts, made once the controller runs. */
  hooks?: (ctx: FormHookContext) => FormHooks;
}

export interface FormStart {
  /** The action pressed before the controller ran (./entry). */
  action?: BuildKind;
  /** Today as YYYY-MM-DD. */
  today: () => string;
}

export function initFormTool(cfg: FormToolConfig, start: FormStart): void {
  const { copy: COPY, hwp: FORM_HWP, tool: TOOL } = cfg;
  /** The spec of the last build (the files' names). */
  let hwpName = '';
  let pdfName = '';
  const must = <T extends HTMLElement>(id: string): T => mustId<T>(`${cfg.prefix}-${id}`);
  const root = must<HTMLDivElement>('tool');
  const form = must<HTMLFormElement>('form');
  const makeBtn = must<HTMLButtonElement>('make');
  const blankBtn = must<HTMLButtonElement>('blank');
  const resetBtn = must<HTMLButtonElement>('reset');
  const progressBox = must<HTMLDivElement>('progress');
  const progressText = must<HTMLParagraphElement>('progress-text');
  const progressBar = must<HTMLProgressElement>('progress-bar');
  const errorBox = must<HTMLDivElement>('error');
  const errorText = must<HTMLParagraphElement>('error-text');
  const retryBtn = must<HTMLButtonElement>('retry');
  const result = must<HTMLDivElement>('result');
  const stale = must<HTMLParagraphElement>('stale');
  const downloads = must<HTMLDivElement>('downloads');
  const hwpBtn = document.getElementById(`${cfg.prefix}-hwp`) as HTMLButtonElement | null;
  const pdfBtn = must<HTMLButtonElement>('pdf');
  const hwpError = must<HTMLParagraphElement>('hwp-error');
  const pdfError = must<HTMLParagraphElement>('pdf-error');
  const done = must<HTMLParagraphElement>('done');
  const nextSlot = must<HTMLDivElement>('next');
  const preview = must<HTMLDivElement>('preview');
  const inputs = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-field]'));
  const fieldOf = (el: HTMLInputElement | HTMLTextAreaElement) => cfg.spec.fields.find((f) => f.id === el.dataset.field);
  /** Amount, number and quantity inputs: checked on 「… 만들기」 (fieldProblem), with an error line each. */
  const checked = inputs.flatMap((el) => {
    const f = fieldOf(el);
    const error = document.getElementById(`${cfg.prefix}-${el.dataset.field}-error`);
    return f && error && (f.kind === 'amount' || f.kind === 'number' || f.kind === 'quantity') ? [{ el, f, error, echo: f.kind === 'amount' ? document.getElementById(`${cfg.prefix}-${f.id}-echo`) : null }] : [];
  });
  const isRadio = (el: HTMLInputElement | HTMLTextAreaElement): el is HTMLInputElement => el.type === 'radio';

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

  function send(msg: HwpRequest, transfer: Transferable[] = []): void {
    if (!worker) return;
    watchdog.kick();
    worker.postMessage(msg, transfer);
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
    retryBtn.textContent = COPY.retry;
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
    showError(code === 'oom' ? COPY.oom : code === 'timeout' ? COPY.timeout : COPY.failed);
  }

  function onTimeout(): void {
    if (phase === 'hwp') {
      // The pages are kept: the PDF still works; only the HWP is missing.
      hwpFailed('timeout');
      return;
    }
    fail('timeout', 'process');
  }

  /** Reads the fields as typed (the page never sends or stores them); a radio group gives its checked value. */
  function readInputs(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const el of inputs) if (!isRadio(el) || el.checked) out[el.dataset.field!] = el.value;
    return out;
  }
  const hooks: FormHooks = cfg.hooks?.({ read: readInputs }) ?? {};

  // ---------- build ----------

  /** Shows (or clears) one field's error line. */
  function setProblem(c: (typeof checked)[number], problem: FieldProblem | null): void {
    c.error.textContent = problem && cfg.problems ? cfg.problems[problem] : '';
    if (problem) c.el.setAttribute('aria-invalid', 'true');
    else c.el.removeAttribute('aria-invalid');
  }

  /** The amount echo: 「10,000,000원」 for what is typed so far (digits and 원 only), else nothing. */
  function echo(c: (typeof checked)[number]): void {
    if (!c.echo) return;
    const d = normalizeAmount(c.el.value);
    c.echo.textContent = d ? `${groupDigits(d)}원` : '';
  }

  /** LOAN1022 L-D3: what was typed in an amount or number field is never dropped silently: a problem blocks the build. */
  function fieldsOk(): boolean {
    let first: HTMLElement | null = null;
    for (const c of checked) {
      const problem = fieldProblem(c.f, c.el.value);
      setProblem(c, problem);
      if (problem) first ??= c.el;
    }
    first?.focus();
    return !first;
  }

  function build(k: BuildKind): void {
    if (state === 'building') return;
    if (k === 'filled' && (!fieldsOk() || hooks.check?.() === false)) return;
    const spec = hooks.spec?.() ?? cfg.spec;
    const values: FormValues = k === 'blank' ? blankValues(spec) : normalizeValues(spec, readInputs());
    // The seal goes into a filled build only (the blank form is for writing by hand).
    const seal = k === 'filled' ? hooks.seal?.() : undefined;
    hwpName = withExt(spec.fileBase, '.hwp');
    pdfName = withExt(spec.fileBase, '.pdf');
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
    progress(COPY.building, null);
    // QUOTE1112 Q11: a filled build of a several-spec tool names the spec (FORM_DOCS); a blank one stays build = blank.
    track(hooks.spec && k === 'filled' ? { e: 'start', t: TOOL, o: 'doc', v: spec.id as 'quotation' | 'transaction-statement' } : { e: 'start', t: TOOL, o: 'build', v: k });
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
          progress(COPY.engine(Math.round(r * 100)), r);
        } else progress(COPY.building, null);
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
    send({ type: 'form-build', specId: spec.id, values, seal }, seal ? [seal.bytes] : []);
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
    viewer = lazy.createViewer({ root: preview, infos, request: (i) => requestPage(i), pageFailedText: COPY.pageFailed });
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
    hwpError.textContent = code === 'unverified' ? COPY.hwpUnverified : COPY.hwpExport;
    showResult();
  }

  function showResult(): void {
    setState('ready');
    track({ e: 'success', t: TOOL });
    const line = kind === 'blank' ? COPY.readyBlank : FORM_HWP && hwpUrl ? COPY.ready : COPY.readyPdfOnly;
    announce([line, hwpError.textContent].filter(Boolean).join(' '));
    // Top of the result under the sticky header (scroll-padding-top), as id-copy does: a bare focus() lets WebKit
    // centre a result taller than the screen that starts below it, which put 받기 under the header (SEARCH1031 CI).
    result.scrollIntoView({ block: 'start' });
    result.focus({ preventScroll: true });
    if (editedWhileBuilding) markStale();
  }

  // ---------- downloads ----------

  function saveHwp(): void {
    if (state !== 'ready' || isStale || !hwpUrl) return;
    triggerDownload(hwpUrl, hwpName);
    track({ e: 'download', t: TOOL, o: 'format', v: 'hwp' });
    done.textContent = COPY.downloaded(hwpName);
    announce(done.textContent);
  }

  async function savePdf(): Promise<void> {
    if (state !== 'ready' || isStale || pdfBusy) return;
    if (pdfUrl) {
      triggerDownload(pdfUrl, pdfName);
      track({ e: 'download', t: TOOL, o: 'format', v: 'pdf' });
      done.textContent = COPY.downloaded(pdfName);
      announce(done.textContent);
      return;
    }
    const id = run;
    pdfBusy = true;
    pdfBtn.setAttribute('aria-busy', 'true');
    pdfError.textContent = '';
    announce(COPY.pdfBuilding);
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
      triggerDownload(pdfUrl, pdfName);
      track({ e: 'download', t: TOOL, o: 'format', v: 'pdf' });
      done.textContent = [COPY.downloaded(pdfName), stats.fallbackPages ? COPY.rasterPage : ''].filter(Boolean).join(' ');
      announce(done.textContent);
      showNextSteps(nextSlot, TOOL, [{ blob, name: pdfName }]);
    } catch {
      if (id !== run) return;
      usageFail('pdf', 'save');
      pdfError.textContent = COPY.pdfFailed;
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
    stale.textContent = COPY.stale;
    stale.hidden = false;
  }

  function reset(): void {
    run++;
    stopWorker();
    dropResult();
    for (const el of inputs) {
      // A radio group goes back to its default option (the one checked in the page); the radios keep their values.
      if (isRadio(el)) el.checked = el.defaultChecked;
      else el.value = cfg.today.includes(el.dataset.field!) ? start.today() : '';
    }
    for (const c of checked) {
      setProblem(c, null);
      echo(c);
    }
    hooks.reset?.();
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
  form.addEventListener('input', (ev) => {
    markStale();
    hooks.input?.(ev.target);
    const c = checked.find((x) => x.el === ev.target);
    if (!c) return;
    if (c.el.hasAttribute('aria-invalid')) setProblem(c, null);
    echo(c);
  });
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
  // An amount typed before the controller ran gets its echo now (and the page's parts their state).
  for (const c of checked) echo(c);
  hooks.input?.(null);
  setState('empty');
  if (start.action) {
    prefetch();
    build(start.action);
  }
}
