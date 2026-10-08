// PDF JPG 변환 UI controller (TOOLS4 T3). States: empty → opening → locked → ready → working → done.
// Loaded by entry.ts on the first interaction; pdf.js (src/lib/pdf/inspect.ts) loads when a file is chosen. Pages are
// drawn one at a time on the main thread (pdf.js renders through its own worker): white fill, render, JPEG q0.92, then
// the canvas is freed. Several pages go into a streaming stored ZIP (output.ts).
import type { PdfErrorCode } from '../../lib/pdf/errors';
import type { OpenedPdf } from '../../lib/pdf/inspect';
import { isOutOfMemory } from '../../lib/pdf/errors';
import { setJfifDpi } from '../../lib/image/jfif';
import { parseRange, type PageRangeError } from '../../lib/pdf/page-range';
import { announce, clearAlert } from '../../lib/ui/announce';
import { detectDevice, type Device } from '../../lib/ui/device';
import { hideEngineError, showEngineError } from '../../lib/ui/engine-error';
import { isEngineLoadFailure, withEngineRetry } from '../../lib/ui/engine-load';
import { loadDynamicFont } from '../../lib/ui/font';
import { formatPages, formatSize } from '../../lib/ui/format';
import { bindPasswordToggle } from '../../lib/ui/password';
import { isPdfFile } from '../../lib/ui/pdf-pick';
import { track, type UsagePhase } from '../../lib/ui/usage';
import { StoredZip } from '../../lib/zip/stored';
import { CanvasError, TaskSlot, restrictionNote, runErrorCode } from './guards';
import { DEFAULT_PPI, LIMITS, PPI, fileLimitMessage, runLimitMessage, type PpiLevel } from './limits';
import { jpgName, zipName } from './output';
import { pageScale } from './scale';

type State = 'empty' | 'opening' | 'locked' | 'ready' | 'working' | 'done';

const JPEG_QUALITY = 0.92;

const MESSAGES = {
  'not-pdf': 'PDF 파일이 아닙니다. PDF 파일을 골라 주세요.',
  password: '이 파일은 비밀번호로 보호되어 있습니다. 비밀번호를 입력해 주세요.',
  'wrong-password': '비밀번호가 맞지 않습니다. 다시 입력해 주세요.',
  corrupt: '파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아 주세요.',
  canvas: '이 기기에서 쪽을 사진으로 그리지 못했습니다. 선명도를 낮추거나 PC에서 다시 시도해 주세요.',
  oom: '이 기기에서 한 번에 처리할 수 있는 양을 넘었습니다. 변환할 쪽을 나누거나 선명도를 낮춰 다시 시도해 주세요.',
  unknown: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
} as const;

const RANGE_MESSAGES: Record<Exclude<PageRangeError, 'empty'>, (pages: number) => string> = {
  'out-of-range': (n) => `이 파일은 ${formatPages(n)}까지 있습니다. 1부터 ${n.toLocaleString('ko-KR')} 사이의 쪽 번호를 입력해 주세요.`,
  reversed: () => '쪽 범위는 작은 번호부터 「3-5」처럼 입력해 주세요.',
  junk: () => '쪽 번호는 「1-3, 5」처럼 숫자, 「-」, 쉼표로 입력해 주세요.',
};

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

const loadInspect = () => withEngineRetry(() => import('../../lib/pdf/inspect'));

const toJpeg = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => canvas.toBlob((b) => (b && b.size > 0 ? resolve(b) : reject(new CanvasError('toBlob'))), 'image/jpeg', JPEG_QUALITY));

/** Lets the page paint and the cancel button respond between pages. */
const nextTask = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const isCancelled = (err: unknown): boolean => (err as { name?: string } | null)?.name === 'RenderingCancelledException';

export function initPdfToJpg(pending?: File[]): { open(files: File[]): void } | null {
  const found = document.getElementById('pj-tool');
  if (!found) return null;
  const root: HTMLElement = found;

  const input = must<HTMLInputElement>('pj-input');
  const drop = must<HTMLDivElement>('pj-drop');
  const notice = must<HTMLParagraphElement>('pj-notice');
  const card = must<HTMLDivElement>('pj-file');
  const nameEl = must<HTMLParagraphElement>('pj-name');
  const infoEl = must<HTMLParagraphElement>('pj-info');
  const pwForm = must<HTMLFormElement>('pj-pw');
  const pwInput = must<HTMLInputElement>('pj-pw-input');
  const pwError = must<HTMLParagraphElement>('pj-pw-error');
  const controls = must<HTMLDivElement>('pj-controls');
  const rangeInput = must<HTMLInputElement>('pj-range');
  const rangeHint = must<HTMLParagraphElement>('pj-range-hint');
  const rangeError = must<HTMLParagraphElement>('pj-range-error');
  const hint = must<HTMLParagraphElement>('pj-hint');
  const actions = must<HTMLDivElement>('pj-actions');
  const runBtn = must<HTMLButtonElement>('pj-run');
  const changeBtn = must<HTMLButtonElement>('pj-change');
  const progressBox = must<HTMLDivElement>('pj-progress');
  const progressText = must<HTMLParagraphElement>('pj-progress-text');
  const progressBar = must<HTMLProgressElement>('pj-progress-bar');
  const cancelBtn = must<HTMLButtonElement>('pj-cancel');
  const result = must<HTMLDivElement>('pj-result');
  const headline = must<HTMLParagraphElement>('pj-headline');
  const summary = must<HTMLParagraphElement>('pj-summary');
  const notes = must<HTMLUListElement>('pj-notes');
  const download = must<HTMLAnchorElement>('pj-download');
  const againBtn = must<HTMLButtonElement>('pj-again');
  const resetBtn = must<HTMLButtonElement>('pj-reset');
  const saveName = must<HTMLParagraphElement>('pj-save-name');
  const ppiRadios = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="pj-ppi"]'));

  let state: State = 'empty';
  let file: File | null = null;
  let bytes: Uint8Array | null = null;
  let opened: OpenedPdf | null = null;
  let pageCount = 0;
  // Incremented by every open, run, cancel and reset; work that finds a newer id stops.
  let runId = 0;
  const renderTask = new TaskSlot();
  // True while a typed password is being tried, so a second Enter does not start a second attempt.
  let unlocking = false;
  // The copy/print-limits line for the open file (null when it has none).
  let restricted: string | null = null;
  let blobUrl: string | null = null;

  const status = (msg: string): void => announce('status', msg, root);
  const usageFail = (c: string, p: UsagePhase): void => track({ e: 'fail', t: 'pdf-to-jpg', c, p });
  const ppi = (): PpiLevel => (ppiRadios.find((r) => r.checked)?.value as PpiLevel | undefined) ?? DEFAULT_PPI;

  const showNotice = (msg: string | null): void => {
    notice.hidden = !msg;
    notice.textContent = msg ?? '';
  };

  const revokeBlob = (): void => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
    download.removeAttribute('href');
  };

  const setRangeError = (msg: string): void => {
    rangeError.textContent = msg;
    if (msg) rangeInput.setAttribute('aria-invalid', 'true');
    else rangeInput.removeAttribute('aria-invalid');
  };

  function setState(next: State): void {
    state = next;
    root.dataset.state = next;
    const busy = next === 'working';
    if (busy) document.body.dataset.busy = 'pdf-to-jpg';
    else delete document.body.dataset.busy;
    drop.hidden = next !== 'empty';
    card.hidden = next === 'empty' || next === 'done';
    pwForm.hidden = next !== 'locked';
    controls.hidden = next !== 'ready';
    actions.hidden = next === 'empty' || busy || next === 'done';
    runBtn.hidden = next !== 'ready';
    progressBox.hidden = !busy;
    result.hidden = next !== 'done';
    updateHints();
  }

  /** The run button and the hints follow the range and the 선명도. */
  function updateHints(): void {
    if (state !== 'ready') return;
    const text = rangeInput.value.trim();
    const parsed = text ? parseRange(text, pageCount) : null;
    const count = parsed ? (parsed.ok ? parsed.pages.length : 0) : pageCount;
    rangeHint.textContent = `비워 두면 모든 쪽(${formatPages(pageCount)})을 변환합니다.`;
    runBtn.textContent = count ? `${formatPages(count)}을 JPG로 변환` : 'JPG로 변환';
    runBtn.disabled = false;
    // A4 portrait at the chosen 선명도, as the plain-words example.
    const s = pageScale(595.28, 841.89, PPI[ppi()], LIMITS[detectDevice()].caps);
    hint.textContent = `A4 한 쪽이 ${s.width.toLocaleString('ko-KR')}×${s.height.toLocaleString('ko-KR')}픽셀 사진이 됩니다.${count > 1 ? ' 여러 쪽은 ZIP 파일 하나로 받습니다.' : ''}`;
  }

  async function closeDoc(): Promise<void> {
    const o = opened;
    opened = null;
    await o?.close().catch(() => undefined);
  }

  function clearFile(): void {
    void closeDoc();
    file = null;
    bytes = null;
    pageCount = 0;
    restricted = null;
    pwInput.value = '';
    pwInput.type = 'password';
    pwError.textContent = '';
    rangeInput.value = '';
    setRangeError('');
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
    showNotice(picked.length > 1 ? 'PDF 파일은 한 번에 하나만 변환할 수 있어 첫 번째 파일만 열었습니다.' : null);
    track({ e: 'pick', t: 'pdf-to-jpg' });
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
    try {
      const b = new Uint8Array(await f.arrayBuffer());
      if (id !== runId) return;
      bytes = b;
    } catch {
      if (id !== runId) return;
      usageFail('corrupt', 'parse');
      fileError(MESSAGES.corrupt);
      return;
    }
    await openWith(id);
  }

  /** Opens `bytes` with pdf.js, with the typed password when there is one. */
  async function openWith(id: number, password?: string): Promise<void> {
    if (!bytes || !file) return;
    try {
      const { openPdf } = await loadInspect();
      const o = await openPdf(bytes, password);
      if (id !== runId) {
        await o?.close();
        return;
      }
      if (!o) {
        infoEl.textContent = formatSize(file.size);
        setState('locked');
        pwInput.focus();
        status(`${file.name}: ${MESSAGES.password}`);
        return;
      }
      await closeDoc();
      opened = o;
      pageCount = o.doc.numPages;
      restricted = restrictionNote(await o.doc.getPermissions().catch(() => null));
      if (id !== runId) return;
      if (restricted) showNotice(notice.hidden ? restricted : `${notice.textContent} ${restricted}`);
      pwInput.value = '';
      pwError.textContent = '';
      infoEl.textContent = `${formatPages(pageCount)} · ${formatSize(file.size)}`;
      setState('ready');
      if (password) rangeInput.focus();
      status(`${file.name}, ${formatPages(pageCount)}. 변환할 쪽과 선명도를 고른 뒤 JPG로 변환을 누르세요.`);
    } catch (err) {
      if (id !== runId) return;
      if (isEngineLoadFailure(err)) {
        usageFail('engine', 'load');
        clearFile();
        setState('empty');
        void showEngineError();
        return;
      }
      const code = (err as { code?: PdfErrorCode }).code;
      if (code === 'wrong-password') {
        usageFail('wrong-password', 'parse');
        pwError.textContent = MESSAGES['wrong-password'];
        status(MESSAGES['wrong-password']);
        pwInput.select();
        pwInput.focus();
        return;
      }
      const oom = code === 'oom' || isOutOfMemory(err);
      usageFail(oom ? 'oom' : 'corrupt', 'parse');
      fileError(oom ? MESSAGES.oom : MESSAGES.corrupt);
    }
  }

  function unlock(): void {
    if (state !== 'locked' || unlocking) return;
    const pw = pwInput.value;
    if (!pw) {
      pwError.textContent = '비밀번호를 입력해 주세요.';
      pwInput.focus();
      return;
    }
    pwError.textContent = '';
    unlocking = true;
    void openWith(runId, pw).finally(() => {
      unlocking = false;
    });
  }

  // ---------- converting ----------

  async function run(): Promise<void> {
    if (state !== 'ready' || !opened || !file) return;
    const text = rangeInput.value.trim();
    const parsed = text ? parseRange(text, pageCount) : null;
    if (parsed && !parsed.ok) {
      const msg = parsed.error === 'empty' ? RANGE_MESSAGES.junk(pageCount) : RANGE_MESSAGES[parsed.error](pageCount);
      setRangeError(msg);
      status(msg);
      rangeInput.focus();
      return;
    }
    const pages = parsed ? parsed.pages : Array.from({ length: pageCount }, (_, i) => i + 1);
    const level = ppi();
    const device: Device = detectDevice();
    const over = runLimitMessage(pages.length, level, device);
    if (over) {
      usageFail('too-many', 'parse');
      setRangeError(over);
      status(over);
      rangeInput.focus();
      return;
    }
    setRangeError('');
    clearAlert(root);
    showNotice(restricted);
    const id = ++runId;
    const doc = opened.doc;
    const source = file;
    track({ e: 'start', t: 'pdf-to-jpg', o: 'ppi', v: level });
    setState('working');
    progressBar.max = pages.length;
    progressBar.value = 0;
    progressText.textContent = `JPG로 바꾸는 중… (0/${pages.length})`;
    status('JPG로 바꾸는 중입니다.');
    cancelBtn.focus();

    const zip = pages.length > 1 ? new StoredZip() : null;
    let single: Uint8Array | null = null;
    const clamped: { page: number; width: number; height: number }[] = [];
    try {
      for (const [k, p] of pages.entries()) {
        const page = await doc.getPage(p);
        if (id !== runId) {
          page.cleanup();
          return;
        }
        const unit = page.getViewport({ scale: 1 });
        const s = pageScale(unit.width, unit.height, PPI[level], LIMITS[device].caps);
        const canvas = document.createElement('canvas');
        canvas.width = s.width;
        canvas.height = s.height;
        let jpeg: Blob;
        let task: { cancel(): void; promise: Promise<void> } | null = null;
        try {
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new CanvasError('2d context unavailable');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, s.width, s.height);
          task = page.render({ canvas, canvasContext: ctx, viewport: page.getViewport({ scale: s.scale }) });
          renderTask.set(task);
          await task.promise;
          jpeg = await toJpeg(canvas);
        } finally {
          if (task) renderTask.release(task);
          page.cleanup();
          canvas.width = 0;
          canvas.height = 0;
        }
        // The JFIF header carries the pixels per inch actually drawn, so Word/HWP insert the page at its paper size.
        const stamped = setJfifDpi(new Uint8Array(await jpeg.arrayBuffer()), Math.round(s.scale * 72));
        if (id !== runId) return;
        if (zip) zip.add(jpgName(source.name, p, pageCount), stamped);
        else single = stamped;
        if (s.clamped) clamped.push({ page: p, width: s.width, height: s.height });
        progressBar.value = k + 1;
        progressText.textContent = `JPG로 바꾸는 중… (${k + 1}/${pages.length})`;
        await nextTask();
      }
      const out = zip ? await zip.finish() : new Blob([single as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' });
      if (id !== runId) return;
      finish(out, pages, clamped, source);
    } catch (err) {
      if (id !== runId || isCancelled(err)) return;
      const code = runErrorCode(err, isOutOfMemory);
      usageFail(code, 'process');
      setState('ready');
      announce('alert', MESSAGES[code], root);
      runBtn.focus();
    }
  }

  function cancel(): void {
    if (state !== 'working') return;
    runId++;
    renderTask.cancel();
    setState('ready');
    runBtn.focus();
    status('변환을 취소했습니다. 파일은 그대로 있습니다.');
  }

  function finish(out: Blob, pages: number[], clamped: { page: number; width: number; height: number }[], source: File): void {
    revokeBlob();
    blobUrl = URL.createObjectURL(out);
    track({ e: 'success', t: 'pdf-to-jpg' });
    download.href = blobUrl;
    const many = pages.length > 1;
    download.download = many ? zipName(source.name) : jpgName(source.name, pages[0]!, pageCount);
    headline.textContent = many ? `JPG 사진 ${pages.length.toLocaleString('ko-KR')}장이 ZIP 파일로 준비되었습니다` : 'JPG 사진이 준비되었습니다';
    summary.textContent = many ? `${formatPages(pages.length)} · ZIP · ${formatSize(out.size)}` : `${pages[0]!.toLocaleString('ko-KR')}쪽 · JPG · ${formatSize(out.size)}`;
    const shown = clamped.slice(0, 5).map((c) => `${formatPages(c.page)}은 ${c.width.toLocaleString('ko-KR')}×${c.height.toLocaleString('ko-KR')}픽셀로 줄여 저장했습니다.`);
    if (clamped.length > 5) shown.push(`그 밖에 ${(clamped.length - 5).toLocaleString('ko-KR')}쪽도 이 기기에서 그릴 수 있는 크기로 줄여 저장했습니다.`);
    notes.replaceChildren(
      ...shown.map((t) => {
        const li = document.createElement('li');
        li.textContent = t;
        return li;
      }),
    );
    notes.hidden = !shown.length;
    saveName.textContent = `저장될 이름: ${download.download}`;
    setState('done');
    result.scrollIntoView({ block: 'start' });
    headline.focus({ preventScroll: true });
    status(`${headline.textContent}. ${summary.textContent}.`);
  }

  function again(): void {
    if (state !== 'done') return;
    revokeBlob();
    setState('ready');
    rangeInput.focus();
  }

  function resetAll(focus = true): void {
    runId++;
    renderTask.cancel();
    revokeBlob();
    clearFile();
    input.value = '';
    showNotice(null);
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
  pwForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    unlock();
  });
  bindPasswordToggle(must<HTMLButtonElement>('pj-pw-toggle'), pwInput);
  rangeInput.addEventListener('input', () => {
    setRangeError('');
    updateHints();
  });
  rangeInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      void run();
    }
  });
  for (const r of ppiRadios) r.addEventListener('change', updateHints);
  runBtn.addEventListener('click', () => void run());
  changeBtn.addEventListener('click', () => resetAll());
  cancelBtn.addEventListener('click', cancel);
  againBtn.addEventListener('click', again);
  resetBtn.addEventListener('click', () => resetAll());
  window.addEventListener('pagehide', () => {
    runId++;
    renderTask.cancel();
    revokeBlob();
  });
  window.addEventListener('pageshow', (ev) => {
    // Coming back from the bfcache: the blob URL was revoked and any run stopped on pagehide.
    if (ev.persisted && (state === 'done' || state === 'working')) resetAll(false);
  });
  download.addEventListener('click', () => track({ e: 'download', t: 'pdf-to-jpg' }));

  setState('empty');
  // A file picked or dropped while this module loaded.
  const first = pending ?? Array.from(input.files ?? []);
  input.value = '';
  if (first.length) void openFiles(first);
  return { open: (files) => void openFiles(files) };
}
