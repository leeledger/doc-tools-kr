// PDF 용량 줄이기 UI controller. States: empty → ready → working → done | kept | error.
// pdf.js (inspect, result check, previews, raster rendering) loads when the first file is picked.
// The worker (pdf-lib, qpdf, MozJPEG, resize) and all wasm load only when "PDF 용량 줄이기" is pressed.
import type { PdfErrorCode } from '../../lib/pdf/errors';
import type { CompressRequest, CompressResponse } from '../../lib/pdf/compress.worker';
import type { LevelName } from '../../lib/pdf/compress/levels';
import type { CompressReport, Phase } from '../../lib/pdf/compress/report';
import type { OpenedPdf, PdfJsDoc } from '../../lib/pdf/inspect';
import { detectDevice } from '../../lib/ui/device';
import { loadDynamicFont } from '../../lib/ui/font';
import { formatMB, formatPages } from '../../lib/ui/format';
import { checkResult, type TextDoc } from './check';
import { compressedFileName, reductionPercent, sizeChange } from './format';
import { checkFileBytes, checkPages, checkRun } from './limits';

type State = 'empty' | 'ready' | 'working' | 'done' | 'kept' | 'error';
type Choice = LevelName | 'raster';

const MESSAGES: Record<PdfErrorCode, string> = {
  'not-pdf': 'PDF 파일이 아닙니다. PDF 파일을 골라 주세요.',
  password: '이 파일은 비밀번호로 보호되어 있습니다. 비밀번호를 입력해 주세요.',
  'wrong-password': '비밀번호가 맞지 않습니다.',
  corrupt: '파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아주세요.',
  oom: '기기 메모리가 부족합니다. 더 작은 파일로 시도하거나 PC에서 이용해 주세요.',
  unknown: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
  verify: '결과 파일을 검증하지 못해 원본을 그대로 둡니다. 다른 단계로 다시 시도해 주세요.',
};

const PHASE_TEXT: Record<Phase, string> = {
  normalize: '구조 정리 중…',
  images: '이미지 줄이는 중…',
  optimize: '마무리 중…',
  verify: '결과 확인 중…',
};

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

export function initCompressTool(): void {
  const root = document.getElementById('compress-tool');
  if (!root) return;

  const input = must<HTMLInputElement>('cmp-input');
  const drop = must<HTMLDivElement>('cmp-drop');
  const notice = must<HTMLParagraphElement>('cmp-notice');
  const card = must<HTMLDivElement>('cmp-file');
  const thumb = must<HTMLDivElement>('cmp-thumb');
  const nameEl = must<HTMLParagraphElement>('cmp-name');
  const infoEl = must<HTMLParagraphElement>('cmp-info');
  const ownerNote = must<HTMLParagraphElement>('cmp-owner');
  const pwForm = must<HTMLFormElement>('cmp-pw');
  const pwInput = must<HTMLInputElement>('cmp-pw-input');
  const pwError = must<HTMLParagraphElement>('cmp-pw-error');
  const controls = must<HTMLDivElement>('cmp-controls');
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
  const previews = must<HTMLDivElement>('cmp-previews');
  const signedBox = must<HTMLDivElement>('cmp-signed');
  const notes = must<HTMLUListElement>('cmp-notes');
  const download = must<HTMLAnchorElement>('cmp-download');
  const kept = must<HTMLDivElement>('cmp-kept');
  const keptText = must<HTMLDivElement>('cmp-kept-text');
  const strongBtn = must<HTMLButtonElement>('cmp-strong');
  const errorBox = must<HTMLParagraphElement>('cmp-error');
  const status = must<HTMLParagraphElement>('cmp-status');
  const radios = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="cmp-level"]'));

  let state: State = 'empty';
  let file: File | null = null;
  /** The input bytes, kept for re-runs at another level. */
  let bytes: Uint8Array | null = null;
  let pageCount: number | null = null;
  let encrypted: 'none' | 'owner' | 'user' = 'none';
  /** Held in memory only; cleared on reset and when another file is picked. */
  let password: string | undefined;
  let inspecting = false;
  /** Incremented by every file pick, run start, cancel and reset; stale async work checks it and stops. */
  let runId = 0;
  let worker: Worker | null = null;
  let blobUrl: string | null = null;
  /** Resolves the raster loop's wait for a page acknowledgement (also when the worker is stopped). */
  let pendingAck: (() => void) | null = null;

  const announce = (msg: string): void => {
    status.textContent = '';
    requestAnimationFrame(() => {
      status.textContent = msg;
    });
  };
  const showNotice = (msg: string | null): void => {
    notice.hidden = !msg;
    notice.textContent = msg ?? '';
  };
  const revokeBlob = (): void => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
    download.href = '#';
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

  function blocker(): string | null {
    if (!file) return null;
    if (inspecting) return '파일을 확인하는 중입니다.';
    if (pageCount === null) return '비밀번호를 입력하면 줄일 수 있습니다.';
    const pages = checkPages(pageCount, choice() === 'raster', detectDevice());
    return pages.level === 'ok' ? null : pages.message;
  }

  function updateRun(): void {
    const why = blocker();
    runBtn.disabled = why !== null || state === 'working';
    hint.textContent = why ?? '';
  }

  function setState(next: State): void {
    state = next;
    root!.dataset.state = next;
    const usable = file !== null && pageCount !== null;
    drop.hidden = next === 'working' || next === 'done' || next === 'kept';
    card.hidden = !file || next === 'done' || next === 'kept';
    controls.hidden = !file || next === 'working' || next === 'done' || next === 'kept' || (next === 'error' && !usable);
    progressBox.hidden = next !== 'working';
    result.hidden = next !== 'done';
    kept.hidden = next !== 'kept';
    if (next !== 'error') {
      errorBox.hidden = true;
      errorBox.textContent = '';
    }
    confirmBox.hidden = true;
    for (const r of radios) r.disabled = next === 'working';
    updateRun();
  }

  // ---------- file card ----------

  function renderCard(canvas: HTMLCanvasElement | null): void {
    if (!file) return;
    nameEl.textContent = file.name;
    infoEl.textContent = [pageCount !== null ? formatPages(pageCount) : null, formatMB(file.size)].filter(Boolean).join(' · ');
    thumb.replaceChildren(canvas ?? el('span', 'thumb-ph', pageCount === null && !inspecting ? '잠김' : inspecting ? '확인 중' : 'PDF'));
    ownerNote.hidden = encrypted !== 'owner';
    pwForm.hidden = inspecting || pageCount !== null;
  }

  function clearFile(): void {
    file = null;
    bytes = null;
    pageCount = null;
    encrypted = 'none';
    password = undefined;
    inspecting = false;
    pwInput.value = '';
    pwError.textContent = '';
    thumb.replaceChildren();
  }

  async function pickFile(f: File): Promise<void> {
    if (state === 'working') return;
    const size = checkFileBytes(f.size, detectDevice());
    if (size.level !== 'ok') {
      showNotice(size.message);
      announce(size.message);
      return;
    }
    const run = ++runId;
    stopWorker();
    revokeBlob();
    clearFile();
    showNotice(null);
    loadDynamicFont();
    file = f;
    inspecting = true;
    setState('ready');
    renderCard(null);
    announce(`${f.name} 파일을 확인하는 중입니다.`);
    try {
      const b = new Uint8Array(await f.arrayBuffer());
      if (run !== runId) return;
      bytes = b;
      const { inspect } = await import('../../lib/pdf/inspect');
      const r = await inspect(b);
      if (run !== runId) return;
      inspecting = false;
      pageCount = r.pageCount;
      encrypted = r.encrypted;
      setState('ready');
      renderCard(r.thumbnail);
      if (pageCount === null) {
        announce(`${f.name}: 이 파일은 비밀번호로 보호되어 있습니다.`);
        pwInput.focus();
      } else {
        announce(`${f.name}, ${formatPages(pageCount)}. 압축 단계를 고른 뒤 PDF 용량 줄이기를 누르세요.`);
      }
    } catch (err) {
      if (run !== runId) return;
      const code = (err as { code?: PdfErrorCode }).code;
      clearFile();
      showError(code === 'not-pdf' ? 'not-pdf' : code === 'oom' ? 'oom' : 'corrupt');
      input.focus();
    }
  }

  async function unlock(): Promise<void> {
    if (!file || !bytes || pageCount !== null || inspecting) return;
    const pw = pwInput.value;
    if (!pw) {
      pwError.textContent = '비밀번호를 입력해 주세요.';
      pwInput.focus();
      return;
    }
    const run = runId;
    inspecting = true;
    updateRun();
    try {
      const { inspect } = await import('../../lib/pdf/inspect');
      const r = await inspect(bytes, pw);
      if (run !== runId) return;
      inspecting = false;
      password = pw;
      pageCount = r.pageCount;
      encrypted = 'user';
      pwError.textContent = '';
      setState('ready');
      renderCard(r.thumbnail);
      announce(`${file.name}의 잠금을 풀었습니다. ${formatPages(pageCount ?? 0)}.`);
      radios.find((x) => x.checked)?.focus();
    } catch (err) {
      if (run !== runId) return;
      inspecting = false;
      const code = (err as { code?: PdfErrorCode }).code;
      if (code === 'wrong-password') {
        pwError.textContent = MESSAGES['wrong-password'];
        announce(MESSAGES['wrong-password']);
        pwInput.value = '';
        pwInput.focus();
        updateRun();
      } else {
        clearFile();
        showError(code === 'oom' ? 'oom' : 'corrupt');
      }
    }
  }

  // ---------- running ----------

  function requestRun(): void {
    if (state === 'working' || !file || !bytes || blocker() !== null) return;
    const check = checkRun(bytes.length, pageCount!, choice() === 'raster', detectDevice());
    if (check.level === 'hard') {
      showNotice(check.message);
      announce(check.message);
      return;
    }
    if (check.level === 'soft') {
      confirmText.textContent = check.message;
      confirmBox.hidden = false;
      confirmYes.focus();
      announce(check.message);
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
    const w = new Worker(new URL('../../lib/pdf/compress.worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    w.onmessage = (ev: MessageEvent<CompressResponse>) => {
      if (worker !== w || run !== runId) return;
      onMessage(ev.data);
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      if (worker !== w || run !== runId) return;
      fail('unknown');
    };
    return w;
  }

  async function start(): Promise<void> {
    if (!file || !bytes || pageCount === null) return;
    const run = ++runId;
    const level = choice();
    revokeBlob();
    showNotice(null);
    setState('working');
    cancelBtn.focus();
    if (level === 'raster') {
      setProgress('쪽을 이미지로 바꾸는 중…', 0, pageCount);
      announce('쪽을 이미지로 바꾸는 중입니다.');
      await runRaster(run, bytes, pageCount);
    } else {
      setProgress(PHASE_TEXT.normalize);
      announce('용량을 줄이는 중입니다.');
      runLevel(run, level, bytes, pageCount);
    }
  }

  function runLevel(run: number, level: LevelName, input: Uint8Array, pages: number): void {
    const w = newWorker(run, (msg) => {
      if (msg.type === 'progress') {
        setProgress(PHASE_TEXT[msg.phase], msg.phase === 'images' ? msg.done : undefined, msg.phase === 'images' ? msg.total : undefined);
      } else if (msg.type === 'done') {
        stopWorker();
        void finish(run, msg.bytes, msg.report);
      } else if (msg.type === 'error') {
        stopWorker();
        fail(msg.code);
      }
    });
    const copy = input.slice();
    const req: CompressRequest = { type: 'compress', bytes: copy.buffer, level, expectedPages: pages, ...(password ? { password } : {}) };
    w.postMessage(req, [copy.buffer]);
  }

  async function runRaster(run: number, input: Uint8Array, pages: number): Promise<void> {
    const w = newWorker(run, (msg) => {
      if (msg.type === 'raster-ack') {
        pendingAck?.();
        pendingAck = null;
      } else if (msg.type === 'done') {
        stopWorker();
        void finish(run, msg.bytes, msg.report);
      } else if (msg.type === 'error') {
        stopWorker();
        fail(msg.code);
      }
    });
    let opened: OpenedPdf | null = null;
    try {
      const { openPdf } = await import('../../lib/pdf/inspect');
      const { renderRasterPage } = await import('../../lib/pdf/raster-render');
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
        setProgress('쪽을 이미지로 바꾸는 중…', i, pages);
      }
      w.postMessage({ type: 'raster-end', inBytes: input.length } satisfies CompressRequest);
    } catch (err) {
      if (run !== runId) return;
      stopWorker();
      fail((err as { code?: PdfErrorCode }).code === 'oom' ? 'oom' : 'unknown');
    } finally {
      await opened?.close();
    }
  }

  async function finish(run: number, out: Uint8Array | null, report: CompressReport): Promise<void> {
    if (run !== runId || !file || !bytes) return;
    if (report.keptOriginal || !out) {
      showKept(report);
      return;
    }
    setProgress(PHASE_TEXT.verify);
    const { openPdf, renderPageCanvas } = await import('../../lib/pdf/inspect');
    let orig: OpenedPdf | null = null;
    let res: OpenedPdf | null = null;
    let canvases: (HTMLCanvasElement | null)[] = [];
    let aspect = 1 / Math.SQRT2;
    let ok = false;
    try {
      orig = await openPdf(bytes, password);
      res = await openPdf(out);
      if (orig && res) {
        ok = await checkResult(textDoc(orig.doc), textDoc(res.doc), report.level !== 'raster');
        if (ok) {
          const unit = (await orig.doc.getPage(1)).getViewport({ scale: 1 });
          aspect = unit.width / unit.height;
          canvases = [await renderPageCanvas(orig.doc, 1, PREVIEW_WIDTH), await renderPageCanvas(res.doc, 1, PREVIEW_WIDTH)];
        }
      }
    } catch {
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
    showDone(out, report, aspect, canvases);
  }

  function showDone(out: Uint8Array, report: CompressReport, aspect: number, canvases: (HTMLCanvasElement | null)[]): void {
    revokeBlob();
    const blob = new Blob([out as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
    blobUrl = URL.createObjectURL(blob);
    download.href = blobUrl;
    download.download = compressedFileName(file!.name, report.level === 'raster');
    headline.textContent = sizeChange(report.inBytes, blob.size);
    summary.textContent = `${reductionPercent(report.inBytes, blob.size)} % 줄었습니다 · ${formatPages(report.pages)}`;
    previews.replaceChildren(
      ...['원본', '결과'].map((label, i) => {
        const fig = el('figure', 'pv');
        const box = el('div', 'pv-box');
        box.style.aspectRatio = String(aspect);
        const c = canvases[i];
        if (c) {
          c.style.width = '100%';
          c.style.height = 'auto';
          box.append(c);
        }
        fig.append(box, el('figcaption', undefined, label));
        return fig;
      }),
    );
    signedBox.hidden = !report.signed;
    const n: string[] = [];
    if (encrypted === 'user') n.push('줄인 파일에는 비밀번호가 걸려 있지 않습니다.');
    notes.replaceChildren(...n.map((t) => el('li', undefined, t)));
    setState('done');
    revealThenFocus(result, download);
    const extra = [report.signed ? signedBox.textContent?.trim() : '', ...n].filter(Boolean).join(' ');
    announce(`용량을 줄였습니다. ${headline.textContent}, ${summary.textContent}. ${extra}`.trim());
  }

  function showKept(report: CompressReport): void {
    const lines: string[] = [];
    if (report.level === 'raster') {
      lines.push('이미지로 바꾸면 오히려 커져서 원본을 그대로 둡니다. 이 파일에는 이 방법이 맞지 않습니다.');
    } else {
      lines.push('이미 최적화된 파일입니다. 줄일 수 있는 이미지가 없어 원본을 그대로 둡니다.');
      if ((report.skipped.jpx ?? 0) > 0) lines.push('이 파일의 이미지는 JPEG2000 형식이라 아직 줄이지 못합니다.');
      if ((report.skipped.ccitt ?? 0) + (report.skipped.jbig2 ?? 0) > 0) lines.push('흑백 스캔 이미지는 이미 작게 저장되어 있습니다.');
    }
    keptText.replaceChildren(...lines.map((t) => el('p', undefined, t)));
    strongBtn.hidden = !((report.level === 'high' || report.level === 'recommended') && report.imagesSeen > report.imagesReplaced);
    setState('kept');
    revealThenFocus(kept, strongBtn.hidden ? must<HTMLButtonElement>('cmp-kept-again') : strongBtn);
    announce(lines.join(' '));
  }

  /** Brings the whole panel into view below the sticky header (scroll-margin-top), then focuses without scrolling again. */
  function revealThenFocus(panel: HTMLElement, target: HTMLElement): void {
    panel.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  }

  function showError(code: PdfErrorCode): void {
    setState('error');
    errorBox.textContent = MESSAGES[code];
    errorBox.hidden = false;
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
      pwError.textContent = code === 'password' ? MESSAGES.password : MESSAGES['wrong-password'];
      pwInput.focus();
      return;
    }
    showError(code);
    (runBtn.disabled ? input : runBtn).focus();
  }

  function cancel(): void {
    if (state !== 'working') return;
    runId++;
    stopWorker();
    setState('ready');
    runBtn.focus();
    announce('줄이기를 취소했습니다. 파일과 압축 단계는 그대로 있습니다.');
  }

  function backToReady(): void {
    runId++;
    stopWorker();
    revokeBlob();
    setState('ready');
    (radios.find((r) => r.checked && !r.closest('details:not([open])')) ?? runBtn).focus();
  }

  function resetAll(): void {
    runId++;
    stopWorker();
    revokeBlob();
    clearFile();
    input.value = '';
    showNotice(null);
    notes.replaceChildren();
    previews.replaceChildren();
    setChoice('recommended');
    more.open = false;
    setState('empty');
    input.focus();
    announce('처음 상태로 돌아왔습니다.');
  }

  // ---------- wiring ----------

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
  for (const r of radios) {
    r.addEventListener('change', () => {
      confirmBox.hidden = true;
      showNotice(null);
      updateRun();
    });
  }
  more.addEventListener('toggle', () => {
    // A closed "더 줄여야 하나요?" never hides the selected option.
    if (!more.open && choice() === 'raster') {
      setChoice('recommended');
      updateRun();
      announce('권장 단계로 돌아왔습니다.');
    }
  });
  runBtn.addEventListener('click', requestRun);
  confirmYes.addEventListener('click', () => void start());
  confirmNo.addEventListener('click', () => {
    confirmBox.hidden = true;
    runBtn.focus();
  });
  cancelBtn.addEventListener('click', cancel);
  for (const id of ['cmp-again', 'cmp-kept-again']) must<HTMLButtonElement>(id).addEventListener('click', backToReady);
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

  setState('empty');
}
