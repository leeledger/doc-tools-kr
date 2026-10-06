// PDF 합치기 UI controller. States: empty → listing → merging → done | error.
// pdf.js (inspect) is loaded on the first added file (or preloaded after the first interaction, Polish P.7);
// @cantoo/pdf-lib only inside the merge worker.
import type { PdfErrorCode } from '../../lib/pdf/errors';
import type { MergeReport } from '../../lib/pdf/mergePlus';
import type { MergeRequest, MergeResponse, WorkerFile } from '../../lib/pdf/merge.worker';
import { announce, clearAlert } from '../../lib/ui/announce';
import { startUsage, track, type UsagePhase } from '../../lib/ui/usage';
import { detectDevice } from '../../lib/ui/device';
import { hideEngineError, showEngineError } from '../../lib/ui/engine-error';
import { isEngineLoadFailure, withEngineRetry } from '../../lib/ui/engine-load';
import { loadDynamicFont } from '../../lib/ui/font';
import { baseName, formatPages, formatSize } from '../../lib/ui/format';
import { passwordToggle } from '../../lib/ui/password';
import { nonPdfMessage, splitPdfFiles } from '../../lib/ui/pdf-pick';
import { schedulePreload, warmWorker } from '../../lib/ui/preload';
import { startRowDrag } from '../../lib/ui/reorder';
import { mergedFileName } from './format';
import { MAX_FILES, checkAddBytes, checkFileCount, checkMerge } from './limits';

type State = 'empty' | 'listing' | 'merging' | 'done' | 'error';

interface Entry {
  id: number;
  file: File;
  pageCount: number | null;
  encrypted: 'none' | 'owner' | 'user';
  /** Held in memory only; cleared on remove and reset. */
  password?: string;
  locked: boolean;
  inspecting: boolean;
  /** The inspection could not run because the engine did not load; never a file error. */
  pending: boolean;
  error: PdfErrorCode | null;
  thumbnail: HTMLCanvasElement | null;
}

const MESSAGES: Record<PdfErrorCode, string> = {
  'not-pdf': 'PDF 파일이 아닙니다. PDF 파일만 합칠 수 있습니다.',
  password: '이 파일은 비밀번호로 보호되어 있습니다.',
  'wrong-password': '비밀번호가 맞지 않습니다.',
  corrupt: '파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아 주세요.',
  oom: '이 기기에서 한 번에 처리할 수 있는 양을 넘었습니다. 파일 수를 줄여 나눠서 합쳐 주세요.',
  unknown: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
  // Not sent by the merge worker (it maps a failed output check to corrupt); required by the type.
  verify: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
};

const PREPARING = '처리 도구를 준비하는 중입니다(처음 한 번만).';

// Row icons (24-unit, stroked like the tool icons).
const ICONS = {
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  remove: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function svgIcon(paths: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ico');
  svg.innerHTML = paths;
  return svg;
}

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

const createMergeWorker = (): Worker => new Worker(new URL('../../lib/pdf/merge.worker.ts', import.meta.url), { type: 'module' });
const loadInspect = () => withEngineRetry(() => import('../../lib/pdf/inspect'));

export function initMergeTool(): void {
  const found = document.getElementById('merge-tool');
  if (!found) return;
  const root: HTMLElement = found;

  const input = must<HTMLInputElement>('merge-input');
  const addInput = must<HTMLInputElement>('merge-add');
  const pick = must<HTMLLabelElement>('merge-pick');
  const addLabel = must<HTMLLabelElement>('merge-add-label');
  const drop = must<HTMLDivElement>('merge-drop');
  const notice = must<HTMLParagraphElement>('merge-notice');
  const list = must<HTMLOListElement>('merge-list');
  const controls = must<HTMLDivElement>('merge-controls');
  const actions = must<HTMLDivElement>('merge-actions');
  const removeBad = must<HTMLButtonElement>('merge-remove-bad');
  const bookmarks = must<HTMLInputElement>('merge-bookmarks');
  const runBtn = must<HTMLButtonElement>('merge-run');
  const hint = must<HTMLParagraphElement>('merge-hint');
  const confirmBox = must<HTMLDivElement>('merge-confirm');
  const confirmText = must<HTMLParagraphElement>('merge-confirm-text');
  const confirmYes = must<HTMLButtonElement>('merge-confirm-yes');
  const confirmNo = must<HTMLButtonElement>('merge-confirm-no');
  const progressBox = must<HTMLDivElement>('merge-progress');
  const progressText = must<HTMLParagraphElement>('merge-progress-text');
  const progressBar = must<HTMLProgressElement>('merge-progress-bar');
  const cancelBtn = must<HTMLButtonElement>('merge-cancel');
  const result = must<HTMLDivElement>('merge-result');
  const headline = must<HTMLParagraphElement>('merge-headline');
  const summary = must<HTMLParagraphElement>('merge-summary');
  const saveName = must<HTMLParagraphElement>('merge-save-name');
  const notes = must<HTMLUListElement>('merge-notes');
  const download = must<HTMLAnchorElement>('merge-download');
  const resetBtn = must<HTMLButtonElement>('merge-reset');

  let state: State = 'empty';
  let entries: Entry[] = [];
  let nextId = 1;
  let worker: Worker | null = null;
  // Incremented by every merge start, cancel and reset; a run that finds a newer id stops.
  let runId = 0;
  let blobUrl: string | null = null;
  // Files are inspected one at a time to bound memory.
  let inspectQueue: Promise<void> = Promise.resolve();
  let engineShown = false;
  // A row drag holds re-renders: replacing the list would detach the dragged row and its pointer capture.
  let dragging = false;
  let renderHeld = false;

  const status = (msg: string): void => announce('status', msg, root);

  const preload = schedulePreload(
    async () => {
      const m = await loadInspect();
      await m.preloadPdfJs();
      await warmWorker(createMergeWorker);
    },
    { root, immediate: [pick, input, addLabel, addInput], dropZone: root },
  );

  /**
   * Waits for a running preload (the same promise: nothing is fetched twice), saying so once. `claim`: the
   * real engine load starts here, so a preload that has not started yet is dropped.
   */
  async function afterPreload(claim = false): Promise<void> {
    const p = claim ? preload.claim() : preload.pending();
    if (!p) return;
    status(PREPARING);
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
  };

  const totalBytes = (): number => entries.reduce((a, e) => a + e.file.size, 0);
  const totalPages = (): number => entries.reduce((a, e) => a + (e.pageCount ?? 0), 0);
  const errorCards = (): Entry[] => entries.filter((e) => e.error !== null);

  function blocker(): string | null {
    if (entries.length < 2) return entries.length === 1 ? '파일을 하나 더 추가하면 합칠 수 있습니다.' : null;
    if (entries.some((e) => e.pending)) return '처리 도구를 불러오지 못해 파일을 확인하지 못했습니다.';
    if (entries.some((e) => e.inspecting)) return '파일을 확인하는 중입니다.';
    if (entries.some((e) => e.error)) return '문제가 있는 파일을 목록에서 삭제하면 합칠 수 있습니다.';
    if (entries.some((e) => e.locked)) return '비밀번호가 걸린 파일의 비밀번호를 입력하면 합칠 수 있습니다.';
    return null;
  }

  function setState(next: State): void {
    state = next;
    root.dataset.state = next;
    const hasFiles = entries.length > 0;
    const busy = next === 'merging';
    if (busy) document.body.dataset.busy = 'merge';
    else delete document.body.dataset.busy;
    drop.hidden = hasFiles || next === 'done' || busy;
    list.hidden = !hasFiles || next === 'done';
    controls.hidden = !hasFiles || busy || next === 'done';
    actions.hidden = !hasFiles || busy || next === 'done';
    progressBox.hidden = !busy;
    result.hidden = next !== 'done';
    confirmBox.hidden = true;
    list.querySelectorAll('button, input').forEach((b) => {
      (b as HTMLButtonElement | HTMLInputElement).disabled = busy;
    });
    if (!busy) renderList();
    updateRun();
  }

  function updateRun(): void {
    const why = blocker();
    runBtn.textContent = `PDF ${entries.length}개 합치기`;
    runBtn.disabled = why !== null || state === 'merging';
    hint.textContent = why ?? '';
    removeBad.hidden = errorCards().length < 2;
  }

  // ---------- file list ----------

  function renderList(): void {
    if (dragging) {
      renderHeld = true;
      return;
    }
    const focusedId = (document.activeElement as HTMLElement | null)?.closest('li')?.dataset.id;
    const focusedRole = (document.activeElement as HTMLElement | null)?.dataset.role;
    list.replaceChildren(...entries.map((e, i) => renderItem(e, i)));
    if (focusedId && focusedRole) {
      list.querySelector<HTMLElement>(`li[data-id="${focusedId}"] [data-role="${focusedRole}"]`)?.focus();
    }
  }

  function iconButton(role: string, label: string, icon: string, onClick: () => void, cls = ''): HTMLButtonElement {
    const b = el('button', `btn small ghost icon-btn ${cls}`.trim());
    b.type = 'button';
    b.dataset.role = role;
    b.setAttribute('aria-label', label);
    b.append(svgIcon(icon));
    b.addEventListener('click', onClick);
    return b;
  }

  function renderItem(e: Entry, i: number): HTMLLIElement {
    const li = el('li', 'file-item');
    li.dataset.id = String(e.id);
    const name = e.file.name;

    // Pointer-only drag handle; the keyboard uses the ↑↓ buttons.
    const handle = el('span', 'drag-handle');
    handle.setAttribute('aria-hidden', 'true');
    handle.tabIndex = -1;
    handle.textContent = '⋮⋮';
    handle.addEventListener('pointerdown', (ev) => beginDrag(ev, li, e.id));

    const thumb = el('div', 'thumb');
    if (e.thumbnail) thumb.append(e.thumbnail);
    else thumb.append(el('span', 'thumb-ph', e.locked ? '잠김' : e.inspecting ? '확인 중' : e.pending ? '대기' : 'PDF'));
    thumb.setAttribute('aria-hidden', 'true');

    const meta = el('div', 'meta');
    const nameEl = el('p', 'name', name);
    nameEl.title = name;
    meta.append(nameEl);
    const info = el('p', 'info');
    if (e.locked && !e.error) {
      const s = el('span', 'state-ico');
      s.append(svgIcon(ICONS.lock), el('span', 'visually-hidden', '잠김'));
      info.append(s, ' ');
    } else if (e.error) {
      const s = el('span', 'state-ico err');
      s.append(svgIcon(ICONS.error), el('span', 'visually-hidden', '오류'));
      info.append(s, ' ');
    }
    info.append([e.pageCount !== null ? formatPages(e.pageCount) : null, formatSize(e.file.size)].filter(Boolean).join(' · '));
    meta.append(info);

    const act = el('div', 'actions');
    const up = iconButton('up', `${name} 위로 이동`, ICONS.up, () => reorder(e.id, i - 1, 'up'));
    up.disabled = i === 0;
    const down = iconButton('down', `${name} 아래로 이동`, ICONS.down, () => reorder(e.id, i + 1, 'down'));
    down.disabled = i === entries.length - 1;
    const del = iconButton('remove', `${name} 삭제`, ICONS.remove, () => remove(e.id), 'danger');
    act.append(up, down, del);

    li.append(handle, thumb, meta, act);
    // Password and error content expands the row below.
    if (e.encrypted === 'owner' && !e.error) li.append(el('p', 'row-note', '보안 설정(편집 제한)이 해제된 사본이 만들어집니다'));
    if (e.error) li.append(el('p', 'row-note file-error', MESSAGES[e.error]));
    if (e.locked && !e.error) li.append(renderPasswordForm(e));
    return li;
  }

  function renderPasswordForm(e: Entry): HTMLFormElement {
    const form = el('form', 'pw row-note');
    form.noValidate = true;
    const fieldId = `pw-${e.id}`;
    const stateLine = el('p', 'pw-state', '이 파일은 비밀번호로 보호되어 있습니다.');
    stateLine.id = `${fieldId}-state`;
    const label = el('label', 'pw-label', '비밀번호');
    label.htmlFor = fieldId;
    const row = el('div', 'row pw-row');
    const pw = el('input', 'pw-input');
    pw.type = 'password';
    pw.id = fieldId;
    pw.autocomplete = 'off';
    pw.dataset.role = 'password';
    pw.setAttribute('aria-describedby', `${fieldId}-state ${fieldId}-err`);
    const ok = el('button', 'btn small primary', '확인');
    ok.type = 'submit';
    ok.dataset.role = 'unlock';
    ok.setAttribute('aria-label', `${e.file.name} 비밀번호 확인`);
    row.append(pw, passwordToggle(pw), ok);
    const err = el('p', 'pw-error');
    err.id = `${fieldId}-err`;
    form.append(stateLine, label, row, err);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      void unlock(e.id, pw.value, err, pw);
    });
    return form;
  }

  /** The one reorder path: the ↑↓ buttons and a drag drop both end here (same announcement). */
  function reorder(id: number, to: number, focusRole?: 'up' | 'down'): void {
    const i = entries.findIndex((e) => e.id === id);
    const j = Math.max(0, Math.min(entries.length - 1, to));
    if (i < 0 || i === j) return;
    const [item] = entries.splice(i, 1);
    entries.splice(j, 0, item!);
    goListing();
    if (focusRole) {
      // Focus follows the moved item; if its button is now disabled (top/bottom), use the other one.
      const li = list.querySelector<HTMLElement>(`li[data-id="${id}"]`);
      const same = li?.querySelector<HTMLButtonElement>(`[data-role="${focusRole}"]`);
      const other = li?.querySelector<HTMLButtonElement>(`[data-role="${focusRole === 'up' ? 'down' : 'up'}"]`);
      (same && !same.disabled ? same : other)?.focus();
    }
    status(`${item!.file.name}: ${entries.length}개 중 ${j + 1}번째로 옮겼습니다.`);
  }

  function beginDrag(ev: PointerEvent, li: HTMLLIElement, id: number): void {
    if (state !== 'listing' || ev.button > 0 || entries.length < 2) return;
    ev.preventDefault();
    dragging = true;
    renderHeld = false;
    startRowDrag(ev, li, list, (to) => {
      dragging = false;
      const held = renderHeld;
      renderHeld = false;
      // reorder() re-renders; otherwise catch up once with what changed during the drag (e.g. an inspection).
      if (to !== null) reorder(id, to);
      else if (held) renderList();
    });
  }

  function remove(id: number): void {
    const i = entries.findIndex((e) => e.id === id);
    if (i < 0) return;
    const [gone] = entries.splice(i, 1);
    gone!.password = undefined;
    showNotice(null);
    if (!entries.length) {
      setState('empty');
      input.focus();
    } else {
      goListing();
      const next = entries[Math.min(i, entries.length - 1)]!;
      list.querySelector<HTMLElement>(`li[data-id="${next.id}"] [data-role="remove"]`)?.focus();
    }
    status(`${gone!.file.name} 파일을 목록에서 뺐습니다. ${entries.length}개 남았습니다.`);
  }

  function removeProblemFiles(): void {
    const bad = errorCards();
    if (bad.length < 2) return;
    entries = entries.filter((e) => e.error === null);
    showNotice(null);
    if (!entries.length) {
      setState('empty');
      input.focus();
    } else {
      goListing();
      (runBtn.disabled ? addInput : runBtn).focus();
    }
    status(`문제 파일 ${bad.length}개를 목록에서 뺐습니다. ${entries.length}개 남았습니다.`);
  }

  function goListing(): void {
    setState(entries.length ? 'listing' : 'empty');
  }

  // ---------- engine ----------

  /** The engine did not load: files stay un-marked (대기), the page-level panel offers 새로고침. */
  /** One failure for the usage statistics (user-caused ones included). */
  function usageFail(c: string, p: UsagePhase): void {
    track({ e: 'fail', t: 'pdf-merge', c, p });
  }

  function engineFailure(phase: 'load' | 'process'): void {
    usageFail('engine', phase);
    if (engineShown) return;
    engineShown = true;
    void showEngineError();
  }

  // ---------- adding & inspecting ----------

  async function addFiles(picked: File[]): Promise<void> {
    if (!picked.length || state === 'merging') return;
    if (state === 'done') resetAll(false);
    clearAlert(root);
    const { pdfs, rejected } = await splitPdfFiles(picked);
    track({ e: 'pick', t: 'pdf-merge' });
    if (rejected.length) usageFail('not-pdf', 'parse');
    let files = pdfs;
    loadDynamicFont();
    const device = detectDevice();
    const messages: string[] = [];
    const count = checkFileCount(entries.length, files.length);
    if (count.level !== 'ok') {
      usageFail('too-many', 'parse');
      messages.push(count.message);
      files = files.slice(0, Math.max(0, MAX_FILES - entries.length));
    }
    const accepted: Entry[] = [];
    let bytes = totalBytes();
    let rejectedForSize = false;
    for (const file of files) {
      if (checkAddBytes(bytes + file.size, device).level !== 'ok') {
        rejectedForSize = true;
        continue;
      }
      bytes += file.size;
      accepted.push({
        id: nextId++,
        file,
        pageCount: null,
        encrypted: 'none',
        locked: false,
        inspecting: true,
        pending: false,
        error: null,
        thumbnail: null,
      });
    }
    if (rejectedForSize) {
      usageFail('too-large', 'parse');
      const r = checkAddBytes(Number.POSITIVE_INFINITY, device);
      if (r.level !== 'ok') messages.push(r.message);
    }
    showNotice(messages.length ? messages.join(' ') : null);
    if (rejected.length) announce('alert', nonPdfMessage(rejected.map((f) => f.name)), root);
    if (!accepted.length) {
      if (messages.length && !rejected.length) status(messages.join(' '));
      return;
    }
    // Files an earlier engine failure left un-inspected get another try with the new ones.
    const retry = entries.filter((e) => e.pending);
    for (const e of retry) {
      e.pending = false;
      e.inspecting = true;
    }
    entries.push(...accepted);
    goListing();
    if (!rejected.length) status(`파일 ${accepted.length}개를 추가했습니다. 모두 ${entries.length}개입니다.`);
    for (const e of [...retry, ...accepted]) {
      inspectQueue = inspectQueue.then(() => inspectEntry(e)).catch(() => undefined);
    }
    await inspectQueue;
  }

  async function inspectEntry(e: Entry, password?: string): Promise<void> {
    if (!entries.includes(e)) return;
    try {
      const bytes = new Uint8Array(await e.file.arrayBuffer());
      await afterPreload();
      const { inspect } = await loadInspect();
      const r = await inspect(bytes, password);
      e.encrypted = r.encrypted;
      e.pageCount = r.pageCount;
      e.thumbnail = r.thumbnail;
      e.locked = r.pageCount === null;
      e.error = null;
      e.pending = false;
    } catch (err) {
      const code = (err as { code?: PdfErrorCode }).code;
      if (code === 'wrong-password') throw err;
      if (isEngineLoadFailure(err)) {
        e.pending = true;
        engineFailure('load');
      } else {
        e.error = code === 'not-pdf' ? 'not-pdf' : code === 'oom' ? 'oom' : 'corrupt';
        usageFail(e.error, 'parse');
      }
    } finally {
      e.inspecting = false;
    }
    if (entries.includes(e) && state !== 'merging') {
      renderList();
      updateRun();
      if (e.error) status(`${e.file.name}: ${MESSAGES[e.error]}`);
    }
  }

  async function unlock(id: number, pw: string, errEl: HTMLElement, field: HTMLInputElement): Promise<void> {
    const e = entries.find((x) => x.id === id);
    if (!e) return;
    if (!pw) {
      errEl.textContent = '비밀번호를 입력해 주세요.';
      field.focus();
      return;
    }
    try {
      e.inspecting = true;
      await inspectEntry(e, pw);
    } catch {
      e.inspecting = false;
      usageFail('wrong-password', 'parse');
      errEl.textContent = MESSAGES['wrong-password'];
      status(`${e.file.name}: ${MESSAGES['wrong-password']}`);
      field.value = '';
      field.focus();
      updateRun();
      return;
    }
    if (!e.locked && !e.error && !e.pending) {
      e.password = pw;
      status(`${e.file.name}의 잠금을 풀었습니다.`);
      list.querySelector<HTMLElement>(`li[data-id="${e.id}"] [data-role="remove"]`)?.focus();
    }
  }

  // ---------- merging ----------

  function requestMerge(): void {
    if (blocker() !== null || state === 'merging') return;
    const check = checkMerge(totalBytes(), totalPages(), detectDevice());
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
    void runMerge();
  }

  async function runMerge(): Promise<void> {
    const run = ++runId;
    confirmBox.hidden = true;
    showNotice(null);
    clearAlert(root);
    const snapshot = entries.slice();
    track({ e: 'start', t: 'pdf-merge' });
    setState('merging');
    progressBar.max = snapshot.length;
    progressBar.value = 0;
    progressText.textContent = `합치는 중… (0/${snapshot.length})`;
    status('합치는 중입니다.');
    cancelBtn.focus();

    let files: WorkerFile[];
    try {
      files = await Promise.all(
        snapshot.map(async (e) => ({ buffer: await e.file.arrayBuffer(), password: e.password, title: baseName(e.file.name) })),
      );
      await afterPreload(true);
    } catch {
      if (run === runId) fail('unknown');
      return;
    }
    if (run !== runId || state !== 'merging') return; // cancelled or restarted while reading

    const w = createMergeWorker();
    worker = w;
    // An `error` before the worker's first message means its script did not load (engine), not a file problem.
    let answered = false;
    w.onmessage = (ev: MessageEvent<MergeResponse>) => {
      if (worker !== w) return;
      answered = true;
      const msg = ev.data;
      if (msg.type === 'progress') {
        progressBar.value = msg.done;
        progressText.textContent = `합치는 중… (${msg.done}/${msg.total})`;
      } else if (msg.type === 'done') {
        stopWorker();
        finish(msg.bytes, msg.report, snapshot);
      } else if (msg.type === 'error') {
        stopWorker();
        if (msg.code === 'engine') engineStop();
        else fail(msg.code, msg.fileIndex === undefined ? undefined : snapshot[msg.fileIndex]);
      }
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      if (worker !== w) return;
      stopWorker();
      if (!answered) engineStop();
      else fail('unknown');
    };
    const req: MergeRequest = { type: 'merge', files, addFileBookmarks: bookmarks.checked };
    w.postMessage(
      req,
      files.map((f) => f.buffer),
    );
  }

  /** The merge engine did not load: back to the list, nothing marked, the engine panel. */
  function engineStop(): void {
    runId++;
    stopWorker();
    goListing();
    engineShown = false;
    engineFailure('process');
  }

  function cancel(): void {
    if (state !== 'merging') return;
    runId++;
    stopWorker();
    goListing();
    runBtn.focus();
    status('합치기를 취소했습니다. 파일 목록은 그대로 있습니다.');
  }

  function finish(bytes: Uint8Array, report: MergeReport, snapshot: Entry[]): void {
    revokeBlob();
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
    blobUrl = URL.createObjectURL(blob);
    track({ e: 'success', t: 'pdf-merge' });
    download.href = blobUrl;
    download.download = mergedFileName(snapshot[0]!.file.name, snapshot.length);
    summary.textContent = `${formatPages(report.pageCount)} · ${formatSize(blob.size)}`;
    saveName.textContent = `저장될 이름: ${download.download}`;
    const n: string[] = [];
    if (snapshot.some((e) => e.encrypted === 'user')) n.push('합친 파일에는 비밀번호가 걸려 있지 않습니다.');
    if (report.renamedFields > 0) {
      n.push(`같은 이름의 입력 칸 ${report.renamedFields}개의 이름을 바꿔 모두 입력할 수 있게 했습니다.`);
    }
    notes.replaceChildren(...n.map((t) => el('li', undefined, t)));
    setState('done');
    result.scrollIntoView({ block: 'start' });
    headline.focus({ preventScroll: true });
    status(`합치기를 마쳤습니다. ${summary.textContent}. ${n.join(' ')}`.trim());
  }

  function fail(code: PdfErrorCode, entry?: Entry): void {
    if (entry && (code === 'corrupt' || code === 'not-pdf')) entry.error = code;
    if (entry && (code === 'password' || code === 'wrong-password')) {
      entry.locked = true;
      entry.password = undefined;
    }
    usageFail(code, code === 'verify' ? 'save' : 'process');
    const msg = entry ? `${entry.file.name}: ${MESSAGES[code]}` : MESSAGES[code];
    setState('error');
    announce('alert', msg, root);
    runBtn.focus();
  }

  function resetAll(focus = true): void {
    runId++;
    stopWorker();
    revokeBlob();
    for (const e of entries) e.password = undefined;
    entries = [];
    input.value = '';
    addInput.value = '';
    showNotice(null);
    clearAlert(root);
    hideEngineError();
    engineShown = false;
    notes.replaceChildren();
    setState('empty');
    if (focus) {
      input.focus();
      status('처음 상태로 돌아왔습니다.');
    }
  }

  // ---------- wiring ----------

  for (const inp of [input, addInput]) {
    inp.addEventListener('change', () => {
      const files = Array.from(inp.files ?? []);
      inp.value = '';
      void addFiles(files);
    });
  }

  // The whole tool is a drop target (the drop zone is hidden once files are listed).
  root.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer?.types.includes('Files') || state === 'merging') return;
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
    void addFiles(Array.from(ev.dataTransfer?.files ?? []));
  });

  runBtn.addEventListener('click', requestMerge);
  removeBad.addEventListener('click', removeProblemFiles);
  confirmYes.addEventListener('click', () => void runMerge());
  confirmNo.addEventListener('click', () => {
    confirmBox.hidden = true;
    runBtn.focus();
  });
  cancelBtn.addEventListener('click', cancel);
  resetBtn.addEventListener('click', () => resetAll());
  window.addEventListener('pagehide', () => {
    stopWorker();
    revokeBlob();
  });
  window.addEventListener('pageshow', (ev) => {
    // Coming back from the bfcache: the blob URL was revoked on pagehide.
    if (ev.persisted && state === 'done') resetAll(false);
  });
  download.addEventListener('click', () => track({ e: 'download', t: 'pdf-merge' }));

  startUsage('pdf-merge');
  setState('empty');
}
