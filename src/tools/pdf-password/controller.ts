// PDF 암호 해제·설정 UI controller (TOOLS4 T4). States: empty → opening → ask | stop → working → done.
// pdf.js (src/lib/pdf/inspect.ts) tells whether the file needs a password to open; qpdf runs in password.worker.ts.
// Policy (brief decision 13): unlock only with the password the person types, one attempt per press, no guessing, and
// no restriction removal (a file that opens without a password is never rewritten). A locked result is checked with
// pdf.js before it is offered: it must refuse to open without the password and open with it at the same page count.
// The password goes to the worker only: never to usage events, status text, logs or the URL.
import type { OpenedPdf } from '../../lib/pdf/inspect';
import type { PasswordRequest, PasswordResponse } from '../../lib/pdf/password.worker';
import { isOutOfMemory } from '../../lib/pdf/errors';
import { announce, clearAlert } from '../../lib/ui/announce';
import { detectDevice } from '../../lib/ui/device';
import { hideEngineError, showEngineError } from '../../lib/ui/engine-error';
import { isEngineLoadFailure, withEngineRetry } from '../../lib/ui/engine-load';
import { loadDynamicFont } from '../../lib/ui/font';
import { formatPages, formatSize } from '../../lib/ui/format';
import { bindPasswordToggle } from '../../lib/ui/password';
import { isPdfFile } from '../../lib/ui/pdf-pick';
import { track, type UsagePhase } from '../../lib/ui/usage';
import { PASSWORD_MESSAGES, fileLimitMessage, lockPasswordError } from './limits';
import { KEEP_NOTE, SIGNATURE_NOTE, decide, outputName, type Action, type FileKind } from './flow';

type State = 'empty' | 'opening' | 'ask' | 'stop' | 'working' | 'done';

const MESSAGES = {
  'not-pdf': 'PDF 파일이 아닙니다. PDF 파일을 골라 주세요.',
  'wrong-password': '비밀번호가 맞지 않습니다. 다시 입력해 주세요.',
  corrupt: '파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아 주세요.',
  oom: '이 기기에서 한 번에 처리할 수 있는 양을 넘었습니다. PC에서 다시 시도해 주세요.',
  unknown: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
} as const;

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

const loadInspect = () => withEngineRetry(() => import('../../lib/pdf/inspect'));
const createWorker = (): Worker => new Worker(new URL('../../lib/pdf/password.worker.ts', import.meta.url), { type: 'module' });

/** Thrown when a result fails the pdf.js check: no file is offered. */
class VerifyError extends Error {}

export function initPdfPassword(pending?: File[]): { open(files: File[]): void } | null {
  const found = document.getElementById('pp-tool');
  if (!found) return null;
  const root: HTMLElement = found;

  const input = must<HTMLInputElement>('pp-input');
  const drop = must<HTMLDivElement>('pp-drop');
  const notice = must<HTMLParagraphElement>('pp-notice');
  const card = must<HTMLDivElement>('pp-file');
  const nameEl = must<HTMLParagraphElement>('pp-name');
  const infoEl = must<HTMLParagraphElement>('pp-info');
  const stopBox = must<HTMLDivElement>('pp-stop');
  const stopText = must<HTMLParagraphElement>('pp-stop-text');
  const switchBtn = must<HTMLButtonElement>('pp-switch');
  const unlockForm = must<HTMLFormElement>('pp-unlock');
  const pwInput = must<HTMLInputElement>('pp-pw');
  const unlockError = must<HTMLParagraphElement>('pp-unlock-error');
  const lockForm = must<HTMLFormElement>('pp-lock');
  const newInput = must<HTMLInputElement>('pp-new');
  const againInput = must<HTMLInputElement>('pp-again');
  const lockError = must<HTMLParagraphElement>('pp-lock-error');
  const actions = must<HTMLDivElement>('pp-actions');
  const changeBtn = must<HTMLButtonElement>('pp-change');
  const progressBox = must<HTMLDivElement>('pp-progress');
  const progressText = must<HTMLParagraphElement>('pp-progress-text');
  const cancelBtn = must<HTMLButtonElement>('pp-cancel');
  const result = must<HTMLDivElement>('pp-result');
  const headline = must<HTMLParagraphElement>('pp-headline');
  const summary = must<HTMLParagraphElement>('pp-summary');
  const notes = must<HTMLUListElement>('pp-notes');
  const download = must<HTMLAnchorElement>('pp-download');
  const resetBtn = must<HTMLButtonElement>('pp-reset');
  const saveName = must<HTMLParagraphElement>('pp-save-name');
  const actionRadios = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="pp-action"]'));

  let state: State = 'empty';
  let file: File | null = null;
  let bytes: Uint8Array | null = null;
  let kind: FileKind | null = null;
  let pageCount = 0;
  // Incremented by every open, run, cancel and reset; work that finds a newer id stops.
  let runId = 0;
  let worker: Worker | null = null;
  let blobUrl: string | null = null;

  const status = (msg: string): void => announce('status', msg, root);
  const usageFail = (c: string, p: UsagePhase): void => track({ e: 'fail', t: 'pdf-password', c, p });
  const action = (): Action => (actionRadios.find((r) => r.checked)?.value === 'lock' ? 'lock' : 'unlock');

  const revokeBlob = (): void => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
    download.removeAttribute('href');
  };

  const stopWorker = (): void => {
    worker?.terminate();
    worker = null;
  };

  const clearPasswords = (): void => {
    for (const f of [pwInput, newInput, againInput]) {
      f.value = '';
      f.type = 'password';
    }
    for (const b of root.querySelectorAll<HTMLButtonElement>('.pw-toggle')) b.setAttribute('aria-pressed', 'false');
    unlockError.textContent = '';
    lockError.textContent = '';
  };

  function setState(next: State): void {
    state = next;
    root.dataset.state = next;
    root.dataset.action = action();
    const busy = next === 'working';
    if (busy) document.body.dataset.busy = 'pdf-password';
    else delete document.body.dataset.busy;
    for (const r of actionRadios) r.disabled = busy;
    drop.hidden = next !== 'empty';
    card.hidden = next === 'empty' || next === 'done' || busy;
    stopBox.hidden = next !== 'stop';
    unlockForm.hidden = !(next === 'ask' && action() === 'unlock');
    lockForm.hidden = !(next === 'ask' && action() === 'lock');
    actions.hidden = !(next === 'ask' || next === 'stop' || next === 'opening');
    progressBox.hidden = !busy;
    result.hidden = next !== 'done';
  }

  function clearFile(): void {
    file = null;
    bytes = null;
    kind = null;
    pageCount = 0;
    clearPasswords();
  }

  function fileError(msg: string): void {
    clearFile();
    setState('empty');
    announce('alert', msg, root);
    input.focus();
  }

  // ---------- opening ----------

  async function openFiles(picked: File[]): Promise<void> {
    const f = picked[0];
    if (!f || state === 'working') return;
    const id = ++runId;
    revokeBlob();
    clearFile();
    clearAlert(root);
    hideEngineError();
    notice.hidden = picked.length <= 1;
    notice.textContent = picked.length > 1 ? 'PDF 파일은 한 번에 하나만 처리할 수 있어 첫 번째 파일만 열었습니다.' : '';
    track({ e: 'pick', t: 'pdf-password' });
    loadDynamicFont();
    setState('empty');
    if (!(await isPdfFile(f))) {
      if (id !== runId) return;
      usageFail('not-pdf', 'parse');
      fileError(MESSAGES['not-pdf']);
      return;
    }
    const tooBig = fileLimitMessage(f.size, detectDevice());
    if (tooBig) {
      if (id !== runId) return;
      usageFail('too-big', 'parse');
      fileError(tooBig);
      return;
    }
    file = f;
    nameEl.textContent = f.name;
    nameEl.title = f.name;
    infoEl.textContent = `${formatSize(f.size)} · 여는 중…`;
    setState('opening');
    status(`${f.name} 파일을 여는 중입니다.`);
    let opened: OpenedPdf | null = null;
    try {
      const b = new Uint8Array(await f.arrayBuffer());
      if (id !== runId) return;
      const { openPdf } = await loadInspect();
      opened = await openPdf(b, undefined);
      if (id !== runId) return;
      bytes = b;
      // pdf.js getPermissions() is null for a file without encryption (no /Encrypt with /P).
      kind = !opened ? 'user' : (await opened.doc.getPermissions()) ? 'owner' : 'none';
      pageCount = opened?.doc.numPages ?? 0;
    } catch (err) {
      if (id !== runId) return;
      if (isEngineLoadFailure(err)) {
        usageFail('engine', 'load');
        clearFile();
        setState('empty');
        void showEngineError();
        return;
      }
      const oom = (err as { code?: string }).code === 'oom' || isOutOfMemory(err);
      usageFail(oom ? 'oom' : 'corrupt', 'parse');
      fileError(oom ? MESSAGES.oom : MESSAGES.corrupt);
      return;
    } finally {
      await opened?.close().catch(() => undefined);
    }
    infoEl.textContent = pageCount ? `${formatPages(pageCount)} · ${formatSize(f.size)}` : formatSize(f.size);
    evaluate(true);
  }

  /** Shows the form or the reason to stop for the open file and the chosen 할 일. */
  function evaluate(focus: boolean): void {
    if (!file || !kind) return;
    clearAlert(root);
    const d = decide(action(), kind);
    if (d.step === 'stop') {
      usageFail(d.code, 'parse');
      stopText.textContent = d.message;
      switchBtn.hidden = !d.offerUnlock;
      setState('stop');
      status(`${file.name}: ${d.message}`);
      if (focus) (d.offerUnlock ? switchBtn : changeBtn).focus();
      return;
    }
    setState('ask');
    const field = action() === 'unlock' ? pwInput : newInput;
    if (focus) field.focus();
    status(action() === 'unlock' ? `${file.name}: 열 때 쓰는 비밀번호를 입력한 뒤 암호 풀기를 누르세요.` : `${file.name}: 새 비밀번호를 두 번 입력한 뒤 암호 걸기를 누르세요.`);
  }

  // ---------- running ----------

  function submitUnlock(): void {
    if (state !== 'ask' || action() !== 'unlock') return;
    const pw = pwInput.value;
    if (!pw) {
      unlockError.textContent = PASSWORD_MESSAGES.empty;
      pwInput.focus();
      return;
    }
    unlockError.textContent = '';
    run('unlock', pw);
  }

  function submitLock(): void {
    if (state !== 'ask' || action() !== 'lock') return;
    const problem = lockPasswordError(newInput.value, againInput.value);
    if (problem) {
      lockError.textContent = PASSWORD_MESSAGES[problem];
      status(PASSWORD_MESSAGES[problem]);
      (problem === 'mismatch' ? againInput : newInput).focus();
      return;
    }
    lockError.textContent = '';
    run('lock', newInput.value);
  }

  /** One qpdf attempt (one press = one attempt: the state leaves 'ask' at once). */
  function run(act: Action, password: string): void {
    if (!bytes || !file) return;
    const id = ++runId;
    const source = file;
    const expectedPages = pageCount;
    track({ e: 'start', t: 'pdf-password', o: 'action', v: act });
    setState('working');
    progressText.textContent = act === 'lock' ? '암호를 거는 중…' : '암호를 푸는 중…';
    status(progressText.textContent);
    cancelBtn.focus();

    const w = createWorker();
    worker = w;
    // An `error` before the worker's first message means its script did not load (engine), not a file problem.
    let answered = false;
    w.onmessage = (ev: MessageEvent<PasswordResponse>) => {
      if (worker !== w || id !== runId) return;
      answered = true;
      const msg = ev.data;
      stopWorker();
      if (msg.type === 'done') void check(id, act, password, msg.bytes, msg.signed, expectedPages, source);
      else failed(act, msg.code);
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      if (worker !== w || id !== runId) return;
      stopWorker();
      failed(act, answered ? 'unknown' : 'engine');
    };
    const req: PasswordRequest = { type: act, buffer: bytes.slice().buffer, password };
    w.postMessage(req, [req.buffer]);
  }

  /** pdf.js checks the result before anything is offered (brief flow T4; never a falsely "locked" file). */
  async function check(id: number, act: Action, password: string, out: Uint8Array, signed: boolean, expectedPages: number, source: File): Promise<void> {
    try {
      const { openPdf } = await loadInspect();
      let pages = expectedPages;
      if (act === 'lock') {
        const without = await openPdf(out, undefined).catch(() => undefined);
        if (without !== null) {
          await without?.close().catch(() => undefined);
          throw new VerifyError('the locked file opened without its password');
        }
        const withPw = await openPdf(out, password);
        if (!withPw) throw new VerifyError('the locked file did not open with its password');
        const n = withPw.doc.numPages;
        await withPw.close().catch(() => undefined);
        if (n !== expectedPages) throw new VerifyError('page count changed');
      } else {
        const o = await openPdf(out, undefined);
        if (!o) throw new VerifyError('the unlocked file still asks for a password');
        pages = o.doc.numPages;
        const perms = await o.doc.getPermissions();
        await o.close().catch(() => undefined);
        if (perms) throw new VerifyError('the unlocked file is still encrypted');
      }
      if (id !== runId) return;
      finish(act, out, signed, pages, source);
    } catch (err) {
      if (id !== runId) return;
      if (isOutOfMemory(err)) failed(act, 'oom');
      else failed(act, 'engine');
    }
  }

  function failed(act: Action, code: string): void {
    usageFail(code, 'process');
    setState('ask');
    if (code === 'wrong-password' && act === 'unlock') {
      // The typed password stays so a typo can be fixed.
      unlockError.textContent = MESSAGES['wrong-password'];
      status(MESSAGES['wrong-password']);
      pwInput.select();
      pwInput.focus();
      return;
    }
    if (code === 'engine') {
      void showEngineError();
      return;
    }
    const known = code === 'corrupt' || code === 'oom' ? code : 'unknown';
    announce('alert', MESSAGES[known], root);
    (act === 'unlock' ? pwInput : newInput).focus();
  }

  function cancel(): void {
    if (state !== 'working') return;
    runId++;
    stopWorker();
    setState('ask');
    (action() === 'unlock' ? pwInput : newInput).focus();
    status('취소했습니다. 파일은 그대로 있습니다.');
  }

  function finish(act: Action, out: Uint8Array, signed: boolean, pages: number, source: File): void {
    revokeBlob();
    const blob = new Blob([out as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
    blobUrl = URL.createObjectURL(blob);
    track({ e: 'success', t: 'pdf-password' });
    download.href = blobUrl;
    download.download = outputName(source.name, act);
    headline.textContent = act === 'lock' ? '암호를 건 PDF가 준비되었습니다' : '암호를 푼 PDF가 준비되었습니다';
    summary.textContent = `${formatPages(pages)} · ${formatSize(blob.size)}${act === 'lock' ? ' · 열 때 비밀번호 필요' : ' · 비밀번호 없이 열림'}`;
    const lines = [...(signed ? [SIGNATURE_NOTE] : []), ...(act === 'lock' ? [KEEP_NOTE] : [])];
    notes.replaceChildren(
      ...lines.map((t) => {
        const li = document.createElement('li');
        li.textContent = t;
        return li;
      }),
    );
    notes.hidden = !lines.length;
    saveName.textContent = `저장될 이름: ${download.download}`;
    clearPasswords();
    setState('done');
    result.scrollIntoView({ block: 'start' });
    headline.focus({ preventScroll: true });
    status(`${headline.textContent}. ${summary.textContent}.${signed ? ` ${SIGNATURE_NOTE}` : ''}`);
  }

  function resetAll(focus = true): void {
    runId++;
    stopWorker();
    revokeBlob();
    clearFile();
    input.value = '';
    notice.hidden = true;
    notice.textContent = '';
    clearAlert(root);
    hideEngineError();
    setState('empty');
    if (focus) {
      input.focus();
      status('처음 상태로 돌아왔습니다.');
    }
  }

  // ---------- wiring ----------

  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    void openFiles(files);
  });
  root.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer?.types.includes('Files') || state === 'working') return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    drop.classList.add('over');
  });
  root.addEventListener('dragleave', (ev) => {
    if (!root.contains(ev.relatedTarget as Node | null)) drop.classList.remove('over');
  });
  root.addEventListener('drop', (ev) => {
    if (!ev.dataTransfer?.types.includes('Files')) return;
    ev.preventDefault();
    drop.classList.remove('over');
    void openFiles(Array.from(ev.dataTransfer?.files ?? []));
  });
  for (const r of actionRadios) {
    r.addEventListener('change', () => {
      root.dataset.action = action();
      clearPasswords();
      if (state === 'done') revokeBlob();
      if (state === 'ask' || state === 'stop' || state === 'done') evaluate(false);
    });
  }
  switchBtn.addEventListener('click', () => {
    const unlock = actionRadios.find((r) => r.value === 'unlock');
    if (!unlock) return;
    unlock.checked = true;
    clearPasswords();
    evaluate(true);
  });
  unlockForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submitUnlock();
  });
  lockForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submitLock();
  });
  bindPasswordToggle(must<HTMLButtonElement>('pp-pw-toggle'), pwInput);
  bindPasswordToggle(must<HTMLButtonElement>('pp-new-toggle'), newInput);
  bindPasswordToggle(must<HTMLButtonElement>('pp-again-toggle'), againInput);
  changeBtn.addEventListener('click', () => resetAll());
  cancelBtn.addEventListener('click', cancel);
  resetBtn.addEventListener('click', () => resetAll());
  window.addEventListener('pagehide', () => {
    runId++;
    stopWorker();
    revokeBlob();
    clearPasswords();
  });
  window.addEventListener('pageshow', (ev) => {
    // Coming back from the bfcache: the blob URL was revoked and any run stopped on pagehide.
    if (ev.persisted && state !== 'empty') resetAll(false);
  });
  download.addEventListener('click', () => track({ e: 'download', t: 'pdf-password' }));

  setState('empty');
  // A file picked or dropped while this module loaded.
  const first = pending ?? Array.from(input.files ?? []);
  input.value = '';
  if (first.length) void openFiles(first);
  return { open: (files) => void openFiles(files) };
}
