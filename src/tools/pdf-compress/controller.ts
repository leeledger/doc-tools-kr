// PDF 용량 줄이기 UI controller. States: empty → ready → working → done | kept | error.
// pdf.js (inspect, result check, previews, raster rendering) loads when the first file is picked, or after the
// first interaction (Polish P.7 preload). The worker (pdf-lib, qpdf, MozJPEG, resize) and all wasm load when
// "PDF 용량 줄이기" is pressed, or warm up during the preload.
import type { PdfErrorCode } from '../../lib/pdf/errors';
import type { CompressRequest, CompressResponse, TargetOutcome } from '../../lib/pdf/compress.worker';
import { TARGET_SEARCH, type LevelName } from '../../lib/pdf/compress/levels';
import type { CompressReport } from '../../lib/pdf/compress/report';
import type { OpenedPdf, PdfJsDoc } from '../../lib/pdf/inspect';
import { announce, clearAlert } from '../../lib/ui/announce';
import { detectDevice } from '../../lib/ui/device';
import { hideEngineError, showEngineErrorIn } from '../../lib/ui/engine-error';
import { isEngineLoadFailure, withEngineRetry } from '../../lib/ui/engine-load';
import { loadDynamicFont } from '../../lib/ui/font';
import { formatSize } from '../../lib/ui/format';
import { pendingHandoff, sweepDue } from '../../lib/ui/handoff-marker';
import { hideNextSteps, showNextStepsIn } from '../../lib/ui/next-steps';
import { bindPasswordToggle } from '../../lib/ui/password';
import { splitPdfFiles } from '../../lib/ui/pdf-pick';
import { schedulePreload, warmWorker } from '../../lib/ui/preload';
import { startUsage, track, type UsagePhase } from '../../lib/ui/usage';
import { bucketMB } from '../../../scripts/lib/usage.mjs';
import { checkResult, type TextDoc } from './check';
import { reductionPercent, sizeChange } from './format';
import { checkFileBytes, checkPages, checkRun } from './limits';
import type { Messages } from './messages.ko';
import { parseTargetMb, targetBytes, targetLabel } from './target';
import { bindQuickLinks, readUrl, writeUrl } from '../../lib/ui/quicklinks';
import type { DeepState } from '../../lib/ui/deeplink';

type State = 'empty' | 'ready' | 'working' | 'done' | 'kept' | 'error';
type Choice = LevelName | 'raster';
type Mode = 'level' | 'target';

const PREVIEW_WIDTH = 240;

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** pdf.js document → the checker's interface (raw text; the checker strips whitespace). */
function textDoc(doc: PdfJsDoc): TextDoc {
  return {
    numPages: doc.numPages,
    async pageText(i) {
      const page = await doc.getPage(i + 1);
      const tc = await page.getTextContent();
      page.cleanup();
      return tc.items.map((it) => ('str' in it ? it.str : '')).join('');
    },
  };
}

const createCompressWorker = (): Worker => new Worker(new URL('../../lib/pdf/compress.worker.ts', import.meta.url), { type: 'module' });
const loadInspect = () => withEngineRetry(() => import('../../lib/pdf/inspect'));
const loadRasterRender = () => withEngineRetry(() => import('../../lib/pdf/raster-render'));

/** `m`: the page's catalog (KO on the Korean page; EN0). */
export function initCompressTool(m: Messages): void {
  const found = document.getElementById('compress-tool');
  if (!found) return;
  const root: HTMLElement = found;

  const input = must<HTMLInputElement>('cmp-input');
  const pick = must<HTMLLabelElement>('cmp-pick');
  const drop = must<HTMLDivElement>('cmp-drop');
  const notice = must<HTMLParagraphElement>('cmp-notice');
  // The 이어서 하기 group is optional (EN1: the English page has none until EN2).
  const nextSlot = document.getElementById('cmp-next');
  const card = must<HTMLDivElement>('cmp-file');
  const thumb = must<HTMLDivElement>('cmp-thumb');
  const nameEl = must<HTMLParagraphElement>('cmp-name');
  const infoEl = must<HTMLParagraphElement>('cmp-info');
  const ownerNote = must<HTMLParagraphElement>('cmp-owner');
  const pwForm = must<HTMLFormElement>('cmp-pw');
  const pwInput = must<HTMLInputElement>('cmp-pw-input');
  const pwError = must<HTMLParagraphElement>('cmp-pw-error');
  const controls = must<HTMLDivElement>('cmp-controls');
  const targetBox = must<HTMLDivElement>('cmp-target-box');
  const targetCustom = must<HTMLDivElement>('cmp-target-custom');
  const targetInput = must<HTMLInputElement>('cmp-target-mb');
  const targetError = must<HTMLParagraphElement>('cmp-target-error');
  const levelsBox = must<HTMLFieldSetElement>('cmp-levels');
  const more = must<HTMLDetailsElement>('cmp-more');
  const runBtn = must<HTMLButtonElement>('cmp-run');
  const hint = must<HTMLParagraphElement>('cmp-hint');
  const confirmBox = must<HTMLDivElement>('cmp-confirm');
  const confirmText = must<HTMLParagraphElement>('cmp-confirm-text');
  const confirmYes = must<HTMLButtonElement>('cmp-confirm-yes');
  const confirmNo = must<HTMLButtonElement>('cmp-confirm-no');
  const progressBox = must<HTMLDivElement>('cmp-progress');
  const progressText = must<HTMLParagraphElement>('cmp-progress-text');
  const progressBar = must<HTMLProgressElement>('cmp-progress-bar');
  const cancelBtn = must<HTMLButtonElement>('cmp-cancel');
  const result = must<HTMLDivElement>('cmp-result');
  const headline = must<HTMLParagraphElement>('cmp-headline');
  const summary = must<HTMLParagraphElement>('cmp-summary');
  const chip = must<HTMLParagraphElement>('cmp-chip');
  const saveName = must<HTMLParagraphElement>('cmp-save-name');
  const missBox = must<HTMLDivElement>('cmp-miss');
  const previews = must<HTMLDivElement>('cmp-previews');
  const signedBox = must<HTMLDivElement>('cmp-signed');
  const notes = must<HTMLUListElement>('cmp-notes');
  const download = must<HTMLAnchorElement>('cmp-download');
  const againBtn = must<HTMLButtonElement>('cmp-again');
  const kept = must<HTMLDivElement>('cmp-kept');
  const keptText = must<HTMLDivElement>('cmp-kept-text');
  const keptAgain = must<HTMLButtonElement>('cmp-kept-again');
  const strongBtn = must<HTMLButtonElement>('cmp-strong');
  const radios = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="cmp-level"]'));
  const modeRadios = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="cmp-mode"]'));
  const targetRadios = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="cmp-target"]'));

  let state: State = 'empty';
  let file: File | null = null;
  /** The input bytes, kept for re-runs at another level. */
  let bytes: Uint8Array | null = null;
  let pageCount: number | null = null;
  let encrypted: 'none' | 'owner' | 'user' = 'none';
  /** Held in memory only; cleared on reset and when another file is picked. */
  let password: string | undefined;
  let inspecting = false;
  /** The inspection could not run because the engine did not load (never a file error). */
  let pending = false;
  /** Incremented by every file pick, run start, cancel and reset; stale async work checks it and stops. */
  let runId = 0;
  let worker: Worker | null = null;
  let blobUrl: string | null = null;
  /** Resolves the raster loop's wait for a page acknowledgement (also when the worker is stopped). */
  let pendingAck: (() => void) | null = null;

  const status = (msg: string): void => announce('status', msg, root);

  const preload = schedulePreload(
    async () => {
      const mod = await loadInspect();
      await mod.preloadPdfJs();
      await warmWorker(createCompressWorker);
    },
    { root, immediate: [pick, input], dropZone: drop },
  );

  /**
   * Waits for a running preload (the same promise: nothing is fetched twice), saying so once. `claim`: the
   * real engine load starts here, so a preload that has not started yet is dropped.
   */
  async function afterPreload(claim = false): Promise<void> {
    const p = claim ? preload.claim() : preload.pending();
    if (!p) return;
    status(m.preparing);
    await p;
  }

  const showNotice = (msg: string | null): void => {
    notice.hidden = !msg;
    notice.textContent = msg ?? '';
  };
  const revokeBlob = (): void => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
    download.removeAttribute('href');
  };
  const stopWorker = (): void => {
    worker?.terminate();
    worker = null;
    pendingAck?.();
    pendingAck = null;
  };
  const choice = (): Choice => (radios.find((r) => r.checked)?.value ?? 'recommended') as Choice;
  const setChoice = (c: Choice): void => {
    for (const r of radios) r.checked = r.value === c;
  };
  const mode = (): Mode => (modeRadios.find((r) => r.checked)?.value === 'target' ? 'target' : 'level');
  /** Target MB from the chips or the free input; null while the free input is invalid. */
  const targetMb = (): number | null => {
    const v = targetRadios.find((r) => r.checked)?.value ?? '10';
    return v === 'custom' ? parseTargetMb(targetInput.value) : Number(v);
  };
  /** Target mode runs the search unless 이미지로 변환 was chosen (raster is never part of the search). */
  const searching = (): boolean => mode() === 'target' && choice() !== 'raster';

  // ---------- deep links (Growth G.5, G.6) ----------

  /** ?target=<MB>: 목표 용량 mode with that chip, or 직접 입력 with the value. False while a run is working. */
  function applyDeep(s: DeepState): boolean {
    if (s.target === undefined || state === 'working') return false;
    for (const r of modeRadios) r.checked = r.value === 'target';
    const chip = targetRadios.find((r) => r.value === String(s.target));
    for (const r of targetRadios) r.checked = chip ? r === chip : r.value === 'custom';
    if (!chip) targetInput.value = String(s.target);
    confirmBox.hidden = true;
    updateMode();
    updateRun();
    return true;
  }

  /** The option in the address bar: the target MB in 목표 용량 mode, else nothing. */
  function syncUrl(): void {
    const mb = mode() === 'target' ? targetMb() : null;
    writeUrl('pdf-compress', mb === null ? null : { target: mb });
  }

  function blocker(): string | null {
    if (!file) return null;
    if (pending) return m.blockPending;
    if (inspecting) return m.blockInspecting;
    if (pageCount === null) return m.blockPassword;
    if (mode() === 'target' && targetMb() === null) return m.targetRange;
    const pages = checkPages(pageCount, choice() === 'raster', detectDevice(), m.limits);
    return pages.level === 'ok' ? null : pages.message;
  }

  function updateRun(): void {
    const why = blocker();
    runBtn.disabled = why !== null || state === 'working';
    hint.textContent = why ?? '';
  }

  function updateMode(): void {
    const target = mode() === 'target';
    root.dataset.mode = target ? 'target' : 'level';
    targetBox.hidden = !target;
    levelsBox.hidden = target;
    const custom = targetRadios.find((r) => r.checked)?.value === 'custom';
    targetCustom.hidden = !custom;
    const invalid = custom && targetInput.value.trim() !== '' && targetMb() === null;
    targetInput.setAttribute('aria-invalid', String(invalid));
    targetError.textContent = invalid ? m.targetRange : '';
    const again = target ? m.againTarget : m.againLevel;
    againBtn.textContent = again;
    keptAgain.textContent = again;
  }

  function setState(next: State): void {
    state = next;
    root.dataset.state = next;
    if (next === 'working') document.body.dataset.busy = 'compress';
    else delete document.body.dataset.busy;
    const usable = file !== null && pageCount !== null;
    drop.hidden = next === 'working' || next === 'done' || next === 'kept';
    card.hidden = !file || next === 'done' || next === 'kept';
    controls.hidden = !file || next === 'working' || next === 'done' || next === 'kept' || (next === 'error' && !usable);
    progressBox.hidden = next !== 'working';
    result.hidden = next !== 'done';
    if (next !== 'done' && nextSlot) hideNextSteps(nextSlot);
    kept.hidden = next !== 'kept';
    confirmBox.hidden = true;
    for (const r of [...radios, ...modeRadios, ...targetRadios]) r.disabled = next === 'working';
    updateRun();
  }

  // ---------- file card ----------

  function renderCard(canvas: HTMLCanvasElement | null): void {
    if (!file) return;
    nameEl.textContent = file.name;
    infoEl.textContent = [pageCount !== null ? m.pages(pageCount) : null, formatSize(file.size)].filter(Boolean).join(' · ');
    const ph = pending ? m.thumbPending : pageCount === null && !inspecting ? m.thumbLocked : inspecting ? m.thumbInspecting : m.thumbPdf;
    thumb.replaceChildren(canvas ?? el('span', 'thumb-ph', ph));
    ownerNote.hidden = encrypted !== 'owner';
    pwForm.hidden = inspecting || pending || pageCount !== null;
  }

  function clearFile(): void {
    file = null;
    bytes = null;
    pageCount = null;
    encrypted = 'none';
    password = undefined;
    inspecting = false;
    pending = false;
    pwInput.value = '';
    pwInput.type = 'password';
    pwError.textContent = '';
    thumb.replaceChildren();
  }

  /** The engine did not load: nothing is marked; the page-level panel offers 새로고침. */
  function engineFailure(phase: 'load' | 'process'): void {
    usageFail('engine', phase);
    void showEngineErrorIn(m.engine);
  }

  /** One failure for the usage statistics (user-caused ones included). */
  function usageFail(c: string, p: UsagePhase): void {
    track({ e: 'fail', t: 'pdf-compress', c, p });
  }

  async function pickFile(f: File): Promise<void> {
    if (state === 'working') return;
    clearAlert(root);
    track({ e: 'pick', t: 'pdf-compress' });
    if (!(await splitPdfFiles([f])).pdfs.length) {
      usageFail('not-pdf', 'parse');
      announce('alert', m.nonPdf([f.name]), root);
      return;
    }
    const size = checkFileBytes(f.size, detectDevice(), m.limits);
    if (size.level !== 'ok') {
      usageFail('too-large', 'parse');
      showNotice(size.message);
      status(size.message);
      return;
    }
    const run = ++runId;
    stopWorker();
    revokeBlob();
    clearFile();
    showNotice(null);
    hideEngineError();
    loadDynamicFont();
    file = f;
    inspecting = true;
    setState('ready');
    renderCard(null);
    status(m.checking(f.name));
    try {
      const b = new Uint8Array(await f.arrayBuffer());
      if (run !== runId) return;
      bytes = b;
      await afterPreload();
      const { inspect } = await loadInspect();
      const r = await inspect(b);
      if (run !== runId) return;
      inspecting = false;
      pageCount = r.pageCount;
      encrypted = r.encrypted;
      setState('ready');
      renderCard(r.thumbnail);
      if (pageCount === null) {
        status(m.locked(f.name));
        pwInput.focus();
      } else {
        status(m.ready(f.name, m.pages(pageCount)));
      }
    } catch (err) {
      if (run !== runId) return;
      if (isEngineLoadFailure(err)) {
        // The file stays (un-marked, 대기); it is never called damaged.
        inspecting = false;
        pending = true;
        setState('ready');
        renderCard(null);
        engineFailure('load');
        return;
      }
      const code = (err as { code?: PdfErrorCode }).code;
      clearFile();
      showError(code === 'not-pdf' ? 'not-pdf' : code === 'oom' ? 'oom' : 'corrupt', 'parse');
      input.focus();
    }
  }

  async function unlock(): Promise<void> {
    if (!file || !bytes || pageCount !== null || inspecting) return;
    const pw = pwInput.value;
    if (!pw) {
      pwError.textContent = m.pwEmpty;
      pwInput.focus();
      return;
    }
    const run = runId;
    inspecting = true;
    updateRun();
    try {
      const { inspect } = await loadInspect();
      const r = await inspect(bytes, pw);
      if (run !== runId) return;
      inspecting = false;
      password = pw;
      pageCount = r.pageCount;
      encrypted = 'user';
      pwError.textContent = '';
      setState('ready');
      renderCard(r.thumbnail);
      status(m.unlocked(file.name, m.pages(pageCount ?? 0)));
      (mode() === 'target' ? modeRadios.find((x) => x.checked) : radios.find((x) => x.checked))?.focus();
    } catch (err) {
      if (run !== runId) return;
      inspecting = false;
      const code = (err as { code?: PdfErrorCode }).code;
      if (code === 'wrong-password') {
        usageFail('wrong-password', 'parse');
        pwError.textContent = m.errors['wrong-password'];
        status(m.errors['wrong-password']);
        pwInput.value = '';
        pwInput.focus();
        updateRun();
      } else if (isEngineLoadFailure(err)) {
        updateRun();
        engineFailure('load');
      } else {
        clearFile();
        showError(code === 'oom' ? 'oom' : 'corrupt', 'parse');
      }
    }
  }

  // ---------- running ----------

  function requestRun(): void {
    if (state === 'working' || !file || !bytes || blocker() !== null) return;
    if (searching()) {
      const mb = targetMb()!;
      // Already under the target: nothing runs.
      if (bytes.length <= targetBytes(mb)) {
        showAlreadyUnder(mb);
        return;
      }
    }
    const check = checkRun(bytes.length, pageCount!, choice() === 'raster', detectDevice(), m.limits);
    if (check.level === 'hard') {
      showNotice(check.message);
      status(check.message);
      return;
    }
    if (check.level === 'soft') {
      confirmText.textContent = check.message;
      confirmBox.hidden = false;
      confirmYes.focus();
      status(check.message);
      return;
    }
    void start();
  }

  function setProgress(text: string, done?: number, total?: number): void {
    progressText.textContent = total ? `${text} (${done}/${total})` : text;
    if (total) {
      progressBar.max = total;
      progressBar.value = done ?? 0;
    } else progressBar.removeAttribute('value');
  }

  function newWorker(run: number, onMessage: (msg: CompressResponse) => void): Worker {
    const w = createCompressWorker();
    worker = w;
    // An `error` before the worker's first message means its script did not load (engine), not the file.
    let answered = false;
    w.onmessage = (ev: MessageEvent<CompressResponse>) => {
      if (worker !== w || run !== runId) return;
      answered = true;
      const msg = ev.data;
      if (msg.type === 'error' && msg.code === 'engine') engineStop(run);
      else onMessage(msg);
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      if (worker !== w || run !== runId) return;
      if (!answered) engineStop(run);
      else fail('unknown');
    };
    return w;
  }

  /** The worker, a codec, qpdf or a chunk did not load: back to ready, nothing marked, the engine panel. */
  function engineStop(run: number): void {
    if (run !== runId) return;
    runId++;
    stopWorker();
    setState('ready');
    engineFailure('process');
  }

  async function start(): Promise<void> {
    if (!file || !bytes || pageCount === null) return;
    const run = ++runId;
    const level = choice();
    if (searching()) track({ e: 'start', t: 'pdf-compress', o: 'target-mb', v: bucketMB(targetMb()!) });
    else if (level !== 'raster') track({ e: 'start', t: 'pdf-compress', o: 'level', v: level });
    else track({ e: 'start', t: 'pdf-compress' });
    revokeBlob();
    showNotice(null);
    clearAlert(root);
    hideEngineError();
    setState('working');
    cancelBtn.focus();
    await afterPreload(true);
    if (run !== runId) return;
    if (level === 'raster') {
      setProgress(m.rasterProgress, 0, pageCount);
      status(m.rasterStatus);
      await runRaster(run, bytes, pageCount);
    } else if (searching()) {
      setProgress(m.target.progress(1, TARGET_SEARCH.length));
      status(m.targetStatus);
      runTarget(run, bytes, pageCount, targetBytes(targetMb()!));
    } else {
      setProgress(m.phases.normalize);
      status(m.levelStatus);
      runLevel(run, level, bytes, pageCount);
    }
  }

  function onDone(run: number, msg: Extract<CompressResponse, { type: 'done' }>): void {
    stopWorker();
    void finish(run, msg.bytes, msg.report, msg.target);
  }

  function runLevel(run: number, level: LevelName, input: Uint8Array, pages: number): void {
    const w = newWorker(run, (msg) => {
      if (msg.type === 'progress') {
        setProgress(m.phases[msg.phase], msg.phase === 'images' ? msg.done : undefined, msg.phase === 'images' ? msg.total : undefined);
      } else if (msg.type === 'done') {
        onDone(run, msg);
      } else if (msg.type === 'error') {
        stopWorker();
        fail(msg.code === 'engine' ? 'unknown' : msg.code);
      }
    });
    const copy = input.slice();
    const req: CompressRequest = { type: 'compress', bytes: copy.buffer, level, expectedPages: pages, ...(password ? { password } : {}) };
    w.postMessage(req, [copy.buffer]);
  }

  function runTarget(run: number, input: Uint8Array, pages: number, target: number): void {
    let rungText = m.target.progress(1, TARGET_SEARCH.length);
    const w = newWorker(run, (msg) => {
      if (msg.type === 'target-progress') {
        rungText = m.target.progress(msg.rung, msg.of);
        setProgress(rungText);
        progressBar.max = msg.of;
        progressBar.value = msg.rung - 1;
      } else if (msg.type === 'progress' && msg.phase === 'images' && msg.total > 0) {
        progressText.textContent = m.targetImages(rungText, msg.done, msg.total);
      } else if (msg.type === 'done') {
        onDone(run, msg);
      } else if (msg.type === 'error') {
        stopWorker();
        fail(msg.code === 'engine' ? 'unknown' : msg.code);
      }
    });
    const copy = input.slice();
    const req: CompressRequest = { type: 'compress-target', bytes: copy.buffer, targetBytes: target, expectedPages: pages, ...(password ? { password } : {}) };
    w.postMessage(req, [copy.buffer]);
  }

  async function runRaster(run: number, input: Uint8Array, pages: number): Promise<void> {
    const w = newWorker(run, (msg) => {
      if (msg.type === 'raster-ack') {
        pendingAck?.();
        pendingAck = null;
      } else if (msg.type === 'done') {
        onDone(run, msg);
      } else if (msg.type === 'error') {
        stopWorker();
        fail(msg.code === 'engine' ? 'unknown' : msg.code);
      }
    });
    let opened: OpenedPdf | null = null;
    try {
      const { openPdf } = await loadInspect();
      const { renderRasterPage } = await loadRasterRender();
      opened = await openPdf(input, password);
      if (run !== runId) return;
      if (!opened) {
        // A password is needed but none is held; the state machine should prevent this.
        fail('unknown');
        return;
      }
      w.postMessage({ type: 'raster-begin', pageCount: pages } satisfies CompressRequest);
      for (let i = 1; i <= pages; i++) {
        if (run !== runId) return;
        const page = await renderRasterPage(opened.doc, i);
        if (run !== runId) return;
        const acked = new Promise<void>((resolve) => (pendingAck = resolve));
        const req: CompressRequest = { type: 'raster-page', rgba: page.rgba.buffer as ArrayBuffer, width: page.width, height: page.height, ptW: page.ptW, ptH: page.ptH };
        w.postMessage(req, [req.rgba]);
        // Back-pressure: page i + 1 is rendered only after page i is encoded (at most two pages in memory).
        await acked;
        if (run !== runId) return;
        setProgress(m.rasterProgress, i, pages);
      }
      w.postMessage({ type: 'raster-end', inBytes: input.length } satisfies CompressRequest);
    } catch (err) {
      if (run !== runId) return;
      if (isEngineLoadFailure(err)) {
        engineStop(run);
        return;
      }
      stopWorker();
      fail((err as { code?: PdfErrorCode }).code === 'oom' ? 'oom' : 'unknown');
    } finally {
      await opened?.close();
    }
  }

  async function finish(run: number, out: Uint8Array | null, report: CompressReport, target?: TargetOutcome): Promise<void> {
    if (run !== runId || !file || !bytes) return;
    if (report.keptOriginal || !out) {
      showKept(report);
      return;
    }
    setProgress(m.phases.verify);
    let orig: OpenedPdf | null = null;
    let res: OpenedPdf | null = null;
    let canvases: (HTMLCanvasElement | null)[] = [];
    let aspect = 1 / Math.SQRT2;
    let ok = false;
    try {
      const { openPdf, renderPageThumb } = await loadInspect();
      orig = await openPdf(bytes, password);
      res = await openPdf(out);
      if (orig && res) {
        ok = await checkResult(textDoc(orig.doc), textDoc(res.doc), report.level !== 'raster');
        if (ok) {
          const unit = (await orig.doc.getPage(1)).getViewport({ scale: 1 });
          aspect = unit.width / unit.height;
          canvases = [await renderPageThumb(orig.doc, 0, PREVIEW_WIDTH), await renderPageThumb(res.doc, 0, PREVIEW_WIDTH)];
        }
      }
    } catch (err) {
      // pdf.js itself did not load: the result is not the problem, and it is not verified.
      if (isEngineLoadFailure(err)) {
        engineStop(run);
        return;
      }
      ok = false;
    } finally {
      await orig?.close();
      await res?.close();
    }
    if (run !== runId) return;
    if (!ok) {
      fail('verify');
      return;
    }
    showDone(out, report, aspect, canvases, target);
  }

  function showDone(out: Uint8Array, report: CompressReport, aspect: number, canvases: (HTMLCanvasElement | null)[], target?: TargetOutcome): void {
    revokeBlob();
    const blob = new Blob([out as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
    blobUrl = URL.createObjectURL(blob);
    track({ e: 'success', t: 'pdf-compress' });
    download.href = blobUrl;
    download.download = m.fileName(file!.name, report.level === 'raster');
    headline.textContent = sizeChange(report.inBytes, blob.size);
    summary.textContent = m.reduced(reductionPercent(report.inBytes, blob.size), m.pages(report.pages));
    saveName.textContent = m.saveName(download.download);
    // 목표 용량: the chip on a hit, the explicit warning on a miss (also for 이미지로 변환 in target mode).
    const mb = mode() === 'target' ? targetMb() : null;
    const outcome = target?.outcome ?? (mb !== null ? (blob.size <= targetBytes(mb) ? 'hit' : 'miss') : null);
    const label = mb !== null ? targetLabel(mb) : '';
    chip.hidden = outcome !== 'hit';
    chip.textContent = outcome === 'hit' ? m.target.chip(label) : '';
    missBox.hidden = outcome !== 'miss';
    missBox.textContent = outcome === 'miss' ? m.target.miss(label, formatSize(blob.size), report.level === 'raster') : '';
    previews.replaceChildren(
      ...[m.previewOriginal, m.previewResult].map((caption, i) => {
        const fig = el('figure', 'pv');
        const box = el('div', 'pv-box');
        box.style.aspectRatio = String(aspect);
        const c = canvases[i];
        if (c) {
          c.style.width = '100%';
          c.style.height = 'auto';
          box.append(c);
        }
        fig.append(box, el('figcaption', undefined, caption));
        return fig;
      }),
    );
    signedBox.hidden = !report.signed;
    const n: string[] = [];
    if (encrypted === 'user') n.push(m.noteUnlocked);
    if (report.ownerRestrictionRemoved) n.push(m.noteOwner);
    notes.replaceChildren(...n.map((t) => el('li', undefined, t)));
    setState('done');
    if (nextSlot) showNextStepsIn(m.next, nextSlot, 'pdf-compress', [{ blob, name: download.download }]);
    reveal(result, headline);
    const extra = [chip.hidden ? '' : chip.textContent, missBox.hidden ? '' : missBox.textContent, report.signed ? signedBox.textContent?.trim() : '', ...n]
      .filter(Boolean)
      .join(' ');
    status(m.done(headline.textContent, summary.textContent, extra));
  }

  function showKept(report: CompressReport): void {
    track({ e: 'success', t: 'pdf-compress' });
    const lines: string[] = [];
    if (report.level === 'raster') {
      lines.push(m.keptRaster);
    } else {
      lines.push(m.keptOptimized);
      if ((report.skipped.jpx ?? 0) > 0) lines.push(m.keptJpx);
      if ((report.skipped.ccitt ?? 0) + (report.skipped.jbig2 ?? 0) > 0) lines.push(m.keptBilevel);
    }
    const strongable = mode() === 'level' && (report.level === 'high' || report.level === 'recommended') && report.imagesSeen > report.imagesReplaced;
    showKeptLines(lines, strongable);
  }

  /** 목표 용량 and the input already fits: a kept-style panel, no run and no download. */
  function showAlreadyUnder(mb: number): void {
    revokeBlob();
    showKeptLines([m.target.already(targetLabel(mb), formatSize(bytes!.length))], false);
  }

  function showKeptLines(lines: string[], strongable: boolean): void {
    keptText.replaceChildren(...lines.map((t) => el('p', undefined, t)));
    strongBtn.hidden = !strongable;
    setState('kept');
    reveal(kept, keptText);
    status(lines.join(' '));
  }

  /** Scrolls the panel to the top (below the sticky header: html scroll-padding-top) and focuses its headline. */
  function reveal(panel: HTMLElement, target: HTMLElement): void {
    panel.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  }

  function showError(code: PdfErrorCode, phase: UsagePhase): void {
    usageFail(code, phase);
    setState('error');
    announce('alert', m.errors[code], root);
  }

  function fail(code: PdfErrorCode): void {
    runId++;
    stopWorker();
    if (code === 'password' || code === 'wrong-password') {
      // pdf.js accepted the password, qpdf did not: ask again.
      password = undefined;
      pageCount = null;
      setState('ready');
      renderCard(null);
      // `password`: qpdf needs one though none was given; `wrong-password`: the one given was refused.
      usageFail(code, 'process');
      pwError.textContent = code === 'password' ? m.errors.password : m.errors['wrong-password'];
      pwInput.focus();
      return;
    }
    showError(code, code === 'verify' ? 'save' : 'process');
    (runBtn.disabled ? input : runBtn).focus();
  }

  function cancel(): void {
    if (state !== 'working') return;
    runId++;
    stopWorker();
    setState('ready');
    runBtn.focus();
    status(m.cancelled);
  }

  function backToReady(): void {
    runId++;
    stopWorker();
    revokeBlob();
    setState('ready');
    const focusable = mode() === 'target' ? targetRadios : radios;
    (focusable.find((r) => r.checked && !r.closest('details:not([open])')) ?? runBtn).focus();
  }

  function resetAll(): void {
    runId++;
    stopWorker();
    revokeBlob();
    clearFile();
    input.value = '';
    showNotice(null);
    clearAlert(root);
    hideEngineError();
    notes.replaceChildren();
    previews.replaceChildren();
    setChoice('recommended');
    more.open = false;
    setState('empty');
    input.focus();
    status(m.reset);
  }

  // ---------- wiring ----------

  bindPasswordToggle(must<HTMLButtonElement>('cmp-pw-toggle'), pwInput);
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    input.value = '';
    if (f) void pickFile(f);
  });
  drop.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer?.types.includes('Files')) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (ev) => {
    ev.preventDefault();
    drop.classList.remove('over');
    const f = ev.dataTransfer?.files?.[0];
    if (f) void pickFile(f);
  });
  pwForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void unlock();
  });
  for (const r of [...radios, ...modeRadios, ...targetRadios]) {
    r.addEventListener('change', () => {
      confirmBox.hidden = true;
      showNotice(null);
      updateMode();
      updateRun();
      if (r.name === 'cmp-target' && r.value === 'custom' && r.checked) targetInput.focus();
      syncUrl();
    });
  }
  targetInput.addEventListener('input', () => {
    updateMode();
    updateRun();
    syncUrl();
  });
  bindQuickLinks('pdf-compress', applyDeep, root);
  more.addEventListener('toggle', () => {
    // A closed "더 줄여야 하나요?" never hides the selected option.
    if (!more.open && choice() === 'raster') {
      setChoice('recommended');
      updateRun();
      status(m.backToRecommended);
    }
  });
  runBtn.addEventListener('click', requestRun);
  confirmYes.addEventListener('click', () => void start());
  confirmNo.addEventListener('click', () => {
    confirmBox.hidden = true;
    runBtn.focus();
  });
  cancelBtn.addEventListener('click', cancel);
  for (const b of [againBtn, keptAgain]) b.addEventListener('click', backToReady);
  for (const id of ['cmp-reset', 'cmp-kept-reset']) must<HTMLButtonElement>(id).addEventListener('click', resetAll);
  strongBtn.addEventListener('click', () => {
    backToReady();
    setChoice('strong');
    requestRun();
  });
  window.addEventListener('pagehide', () => {
    runId++;
    stopWorker();
    revokeBlob();
  });
  window.addEventListener('pageshow', (ev) => {
    // Back from the bfcache: the blob URL was revoked on pagehide.
    if (ev.persisted && (state === 'done' || state === 'working')) backToReady();
  });

  download.addEventListener('click', () => track({ e: 'download', t: 'pdf-compress' }));
  startUsage('pdf-compress');
  // A deep link applies before the first render of the form (the options are hidden until a file is picked).
  const deep = readUrl('pdf-compress');
  if (deep) applyDeep(deep);
  updateMode();
  setState('empty');
  // A result handed over by another tool (이어서 하기): opened as if picked.
  if (pendingHandoff('pdf-compress')) {
    void import('../../lib/ui/handoff')
      .then(({ receiveHandoff }) => receiveHandoff('pdf-compress', root, (f) => pickFile(f), { notice }))
      .catch(() => engineFailure('load'));
  } else if (sweepDue()) {
    // A file stored earlier may never have been taken: delete it once it is older than 10 minutes.
    void import('../../lib/ui/handoff').then(({ sweepLingering }) => sweepLingering()).catch(() => undefined);
  }
}
