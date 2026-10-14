// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
/*! 본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다. */
// HWPX HWP 변환 controller (HWPX2HWP brief "Flow"). No preview, no fonts, no rendering: pick → convert → result
// card. States: empty → checking → engine → converting → done | error; 다른 파일 바꾸기 / 취소 / a new pick → empty
// (worker terminated, run token bumped, so a stale worker message never lands).
// Size (hardBytes) and sniff run on the main thread; an HWP 5 / HWP 3 file is redirected (already-hwp). The HWPX
// goes to the shared HWP worker (one more message, export-hwp), which answers with the HWP bytes only after they
// reopen within the page tolerance (REQ1014-B D10). Losses rhwp reports are shown above the button, never hidden.
// REQ1014-B: a file that is not a HWPX gets ../hwp-shared/not-hwp's line and next step (D2); the links after
// already-hwp / export / unverified hand the picked file to the viewer or HWP PDF 변환 (D7); a watchdog timeout
// while the engine loads is retried once with a new worker (D9; stage start | engine | parse | export).
// Imported by ../hwp-shared/boot.ts after the first paint or on the first interaction.
import type { HwpErrorCode, HwpErrorDetail } from '../../lib/hwp/errors';
import type { HwpRequest, HwpResponse } from '../../lib/hwp/hwp.worker';
import { SNIFF_BYTES, sniffContainer } from '../../lib/hwp/sniff';
import { prefetchRhwpWasm } from '../../lib/hwp/wasm-browser';
import { announce as live, clearAlert, clearStatus } from '../../lib/ui/announce';
import { detectDevice, type Device } from '../../lib/ui/device';
import { hideEngineError, showEngineError } from '../../lib/ui/engine-error';
import { formatSize } from '../../lib/ui/format';
import { preloadSkipped } from '../../lib/ui/preload';
import { track, type UsagePhase } from '../../lib/ui/usage';
import type { BootStart } from '../hwp-shared/boot';
import { triggerDownload, withExt } from '../hwp-shared/download';
import { LIMITS, overHardLimit } from '../hwp-shared/limits';
import { COPY, ERRORS, tooLargeMessage } from '../hwp-shared/messages';
import { createWatchdog } from '../hwp-shared/watchdog';
import { HX_COPY, LOSS_OTHER } from './copy';

type State = 'empty' | 'checking' | 'engine' | 'converting' | 'done' | 'error';
type Code = Exclude<HwpErrorCode, 'too-large'>;
/** Where the worker is (D9): open sent, engine downloading, parsing, export-hwp sent. */
export type Stage = 'start' | 'engine' | 'parse' | 'export';
type NotHwpModule = typeof import('../hwp-shared/not-hwp');

/** What a watchdog timeout does (D9): one silent retry while the engine loads, else the timeout with its phase. */
export function onTimeoutPlan(stage: Stage, retried: boolean): 'retry' | UsagePhase {
  if ((stage === 'start' || stage === 'engine') && !retried) return 'retry';
  return stage === 'start' || stage === 'engine' ? 'load' : stage === 'parse' ? 'parse' : 'process';
}

/** The usage code of an unverified result (D10 detail). */
export const unverifiedCode = (detail: HwpErrorDetail | undefined): string => (detail === 'reopen' ? 'unverified-reopen' : detail === 'bytes' ? 'unverified-bytes' : 'unverified');

const TOOL = 'hwpx-to-hwp';
/** The type of the downloaded file (an in-page blob: URL; WebKit downloads it like any other type). */
const HWP_TYPE = 'application/x-hwp';
const HWPX_EXT = /\.hwpx$/i;
/** Codes after which the page offers the viewer and HWP PDF 변환 instead. */
const WITH_LINKS: readonly Code[] = ['already-hwp', 'export', 'unverified'];
const PROGRESS_INTERVAL_MS = 250;

const createWorker = (): Worker => new Worker(new URL('../../lib/hwp/hwp.worker.ts', import.meta.url), { type: 'module' });

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

export function initHwpxTool(start: BootStart = {}): void {
  const found = document.getElementById('hwp-tool');
  if (!found) return;
  const root: HTMLElement = found;
  const input = must<HTMLInputElement>('hx-input');
  const pick = must<HTMLLabelElement>('hx-pick');
  const drop = must<HTMLDivElement>('hx-drop');
  const progressBox = must<HTMLDivElement>('hx-progress');
  const progressText = must<HTMLParagraphElement>('hx-progress-text');
  const progressBar = must<HTMLProgressElement>('hx-progress-bar');
  const cancelBtn = must<HTMLButtonElement>('hx-cancel');
  const errorBox = must<HTMLParagraphElement>('hx-error');
  const errorLinks = must<HTMLParagraphElement>('hx-error-links');
  const result = must<HTMLDivElement>('hx-result');
  const fileName = must<HTMLParagraphElement>('hx-file-name');
  const lossBox = must<HTMLDivElement>('hx-loss');
  const lossText = must<HTMLParagraphElement>('hx-loss-text');
  const lossList = must<HTMLUListElement>('hx-loss-list');
  const shiftLine = must<HTMLParagraphElement>('hx-shift');
  const actionsBox = document.getElementById('hx-error-actions');
  const saveBtn = must<HTMLButtonElement>('hx-save');
  const resetBtn = must<HTMLButtonElement>('hx-reset');
  const done = must<HTMLDivElement>('hx-done');
  const doneText = must<HTMLParagraphElement>('hx-done-text');

  let state: State = 'empty';
  let run = 0;
  let worker: Worker | null = null;
  let device: Device = detectDevice();
  let resultUrl: string | null = null;
  let resultName = '';
  let lastProgress = 0;
  /** The picked file, kept until reset: the retry re-reads it, the links and buttons hand it on. */
  let file: File | null = null;
  let stage: Stage = 'start';
  let retried = false;
  let disposeActions: (() => void) | null = null;
  const watchdog = createWatchdog(onTimeout);
  const announce = (msg: string): void => live('status', msg, root);
  const prefetch = (): void => {
    if (!preloadSkipped((navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection)) void prefetchRhwpWasm();
  };

  function setState(next: State): void {
    state = next;
    root.dataset.state = next;
    const busy = next === 'checking' || next === 'engine' || next === 'converting';
    if (busy) document.body.dataset.busy = 'hwp';
    else delete document.body.dataset.busy;
    drop.hidden = next !== 'empty' && next !== 'error';
    progressBox.hidden = !busy;
    result.hidden = next !== 'done';
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

  function dropResult(): void {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    resultName = '';
    fileName.textContent = '';
    lossText.textContent = '';
    lossList.replaceChildren();
    shiftLine.textContent = '';
    shiftLine.hidden = true;
    lossBox.hidden = true;
    doneText.textContent = '';
    done.hidden = true;
  }

  /** Back to the picker: worker terminated, result URL revoked, messages cleared; stale messages are dropped. */
  function reset(focus = true): void {
    run++;
    stopWorker();
    dropResult();
    errorBox.hidden = true;
    errorBox.textContent = '';
    errorLinks.hidden = true;
    disposeActions?.();
    disposeActions = null;
    clearAlert(root);
    clearStatus(root);
    hideEngineError();
    input.value = '';
    file = null;
    setState('empty');
    // The hidden file input is the focusable picker (its label shows the focus ring); a label cannot take focus.
    if (focus) input.focus();
  }

  function usageFail(c: string, p: UsagePhase): void {
    track({ e: 'fail', t: TOOL, c, p });
  }

  function showError(text: string, links = false): void {
    run++;
    stopWorker();
    dropResult();
    setState('error');
    clearStatus(root);
    errorBox.textContent = text;
    errorBox.hidden = false;
    errorLinks.hidden = !links;
    errorBox.focus();
  }

  function fail(code: Code, text: string = code === 'engine' ? '' : ERRORS[code], logged: { c?: string; p?: UsagePhase } = {}): void {
    const phase: UsagePhase = logged.p ?? (code === 'engine' ? 'load' : state === 'converting' ? 'process' : 'parse');
    usageFail(logged.c ?? code, phase);
    if (code !== 'engine') {
      showError(text, WITH_LINKS.includes(code));
      return;
    }
    run++;
    stopWorker();
    dropResult();
    setState('error');
    void showEngineError();
  }

  /** D9: a stall while the engine loads is retried once (a stalled download); later stalls are a timeout. */
  function onTimeout(): void {
    const plan = onTimeoutPlan(stage, retried);
    if (plan !== 'retry') {
      fail('timeout', ERRORS.timeout, { p: plan });
      return;
    }
    retried = true;
    stopWorker();
    if (file) void startWorker(file, run);
  }

  /** D2: ../hwp-shared/not-hwp names the file and offers the next step. `said`: the container the worker refused. */
  async function notHwp(f: File, said: 'zip' | null, id: number): Promise<void> {
    stopWorker();
    let mod: NotHwpModule | null = null;
    let help: Awaited<ReturnType<NotHwpModule['notHwpHelp']>> | null = null;
    try {
      mod = await import('../hwp-shared/not-hwp');
      help = await mod.notHwpHelp(f, TOOL, said);
    } catch {
      // The chunk did not load: the generic line.
    }
    if (id !== run) return;
    usageFail(help?.code ?? 'not-hwp', 'parse');
    showError(help?.text ?? HX_COPY.notHwpx);
    if (mod && help && actionsBox) disposeActions = mod.showActions(actionsBox, f, TOOL, help, (m) => live('alert', m, root));
  }

  function onHwp(msg: Extract<HwpResponse, { type: 'hwp' }>, source: File): void {
    // The worker has freed everything; the bytes are ours now.
    stopWorker();
    const blob = new Blob([msg.bytes], { type: HWP_TYPE });
    resultUrl = URL.createObjectURL(blob);
    resultName = withExt(source.name, '.hwp', HWPX_EXT);
    fileName.textContent = HX_COPY.result(resultName, formatSize(blob.size));
    if (msg.losses > 0) {
      lossText.textContent = HX_COPY.losses(msg.losses);
      const li = document.createElement('li');
      li.textContent = HX_COPY.lossItem(LOSS_OTHER, msg.losses);
      lossList.replaceChildren(li);
      lossBox.hidden = false;
    }
    if (msg.pageShift) {
      shiftLine.textContent = HX_COPY.pageShift;
      shiftLine.hidden = false;
      lossBox.hidden = false;
    }
    setState('done');
    track({ e: 'success', t: TOOL });
    announce([HX_COPY.ready(resultName), msg.losses > 0 ? lossText.textContent : '', msg.pageShift ? HX_COPY.pageShift : ''].filter(Boolean).join(' '));
    fileName.focus();
  }

  async function convert(f: File): Promise<void> {
    reset(false);
    const id = run;
    file = f;
    retried = false;
    device = detectDevice();
    track({ e: 'pick', t: TOOL });
    if (overHardLimit(device, f.size)) {
      usageFail('too-large', 'parse');
      showError(tooLargeMessage(device, f.size, LIMITS[device].hardBytes));
      return;
    }
    let head: Uint8Array;
    try {
      head = new Uint8Array(await f.slice(0, SNIFF_BYTES).arrayBuffer());
    } catch {
      if (id === run) fail('corrupt');
      return;
    }
    if (id !== run) return;
    const kind = sniffContainer(head);
    if (kind === 'cfb' || kind === 'hwp3') {
      fail('already-hwp');
      return;
    }
    if (kind === 'unsupported') {
      fail('unsupported');
      return;
    }
    if (kind !== 'zip') {
      void notHwp(f, null, id);
      return;
    }
    setState('checking');
    lastProgress = 0;
    progress(HX_COPY.checking, null, true);
    await startWorker(f, id);
  }

  /** Reads the file (again on the D9 retry: the first buffer was transferred), starts a worker and sends open. */
  async function startWorker(f: File, id: number): Promise<void> {
    stage = 'start';
    let buffer: ArrayBuffer;
    try {
      buffer = await f.arrayBuffer();
    } catch {
      if (id === run) fail('corrupt');
      return;
    }
    if (id !== run) return;
    let w: Worker;
    try {
      w = createWorker();
    } catch {
      fail('engine');
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
          stage = 'engine';
          if (state === 'checking') setState('engine');
          const r = msg.loaded / Math.max(1, msg.total);
          progress(COPY.engine(Math.round(r * 100)), r, r >= 1);
        } else {
          stage = 'parse';
          progress(HX_COPY.checking, null, true);
        }
      } else if (msg.type === 'scanned') {
        watchdog.kick();
      } else if (msg.type === 'parsed') {
        stage = 'export';
        setState('converting');
        progress(HX_COPY.converting, null, true);
        track({ e: 'start', t: TOOL });
        send({ type: 'export-hwp' });
      } else if (msg.type === 'hwp') {
        onHwp(msg, f);
      } else if (msg.type === 'error') {
        if (msg.code === 'not-hwp') void notHwp(f, 'zip', id);
        else if (msg.code === 'unverified') fail('unverified', undefined, { c: unverifiedCode(msg.detail) });
        else fail(msg.code === 'too-large' ? 'corrupt' : msg.code);
      }
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      if (id !== run) return;
      // A worker that never answered did not load (offline, a stale deploy); one that crashed later ran out of memory.
      fail(heard ? 'oom' : 'engine');
    };
    w.onmessageerror = () => {
      if (id === run) fail('oom');
    };
    send({ type: 'open', bytes: buffer, inflateCap: LIMITS[device].inflateCap }, [buffer]);
  }

  function save(): void {
    if (state !== 'done' || !resultUrl) return;
    triggerDownload(resultUrl, resultName);
    track({ e: 'download', t: TOOL });
    doneText.textContent = HX_COPY.downloaded(resultName);
    done.hidden = false;
    announce(doneText.textContent);
  }

  // ---------- wiring ----------

  const busy = (): boolean => state === 'checking' || state === 'engine' || state === 'converting';
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) void convert(f);
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
    if (f) void convert(f);
  });
  cancelBtn.addEventListener('click', () => reset());
  resetBtn.addEventListener('click', () => reset());
  saveBtn.addEventListener('click', save);
  // D7: the links hand the picked file over (no second pick); a failed store follows the href.
  errorLinks.addEventListener('click', (ev) => {
    const a = ev.target instanceof Element ? ev.target.closest<HTMLAnchorElement>('a[data-to]') : null;
    const to = a?.dataset.to;
    if (!a || !file || (to !== 'hwp-viewer' && to !== 'hwp-to-pdf')) return;
    ev.preventDefault();
    const f = file;
    void import('../hwp-shared/not-hwp')
      .then(({ handTo }) => handTo(to, TOOL, f, f.type || 'application/octet-stream'))
      .catch(() => false)
      .then((ok) => {
        if (!ok) window.location.assign(a.href);
      });
  });
  window.addEventListener('pagehide', () => {
    run++;
    stopWorker();
  });
  window.addEventListener('pageshow', (ev) => {
    // Back from the bfcache: pagehide ended the worker, so a conversion in progress is gone. Start over.
    if (ev.persisted && busy()) reset(false);
  });

  setState('empty');
  // What the page script saw before this controller ran (../hwp-shared/boot).
  if (start.prefetch) prefetch();
  if (start.file) void convert(start.file);
}
