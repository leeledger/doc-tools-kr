// PDF 합치기 UI controller. States: empty → listing → merging → done | error.
// pdf.js (inspect) is loaded on the first added file; @cantoo/pdf-lib only inside the merge worker.
import type { PdfErrorCode } from '../../lib/pdf/errors';
import type { MergeReport } from '../../lib/pdf/mergePlus';
import type { MergeRequest, MergeResponse, WorkerFile } from '../../lib/pdf/merge.worker';
import { version as pretendardVersion } from 'pretendard/package.json';
import { baseName, formatMB, formatPages, mergedFileName } from './format';
import { MAX_FILES, checkAddBytes, checkFileCount, checkMerge, detectDevice } from './limits';

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
  error: PdfErrorCode | null;
  thumbnail: HTMLCanvasElement | null;
}

const MESSAGES: Record<PdfErrorCode, string> = {
  'not-pdf': 'PDF 파일이 아닙니다. PDF 파일만 합칠 수 있습니다.',
  password: '이 파일은 비밀번호로 보호되어 있습니다.',
  'wrong-password': '비밀번호가 맞지 않습니다.',
  corrupt: '파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아주세요.',
  oom: '기기 메모리가 부족합니다. 파일 수를 줄여 나눠서 합쳐 주세요.',
  unknown: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** File names can contain characters outside the preloaded UI font subset; load the full dynamic subset once. */
function loadDynamicFont(): void {
  if (document.getElementById('font-dynamic')) return;
  const link = document.createElement('link');
  link.id = 'font-dynamic';
  link.rel = 'stylesheet';
  link.href = `/fonts/pretendard/${pretendardVersion}/pretendardvariable-dynamic-subset.css`;
  document.head.append(link);
}

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

export function initMergeTool(): void {
  const root = document.getElementById('merge-tool');
  if (!root) return;

  const input = must<HTMLInputElement>('merge-input');
  const pick = must<HTMLLabelElement>('merge-pick');
  const drop = must<HTMLDivElement>('merge-drop');
  const notice = must<HTMLParagraphElement>('merge-notice');
  const list = must<HTMLOListElement>('merge-list');
  const controls = must<HTMLDivElement>('merge-controls');
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
  const summary = must<HTMLParagraphElement>('merge-summary');
  const notes = must<HTMLUListElement>('merge-notes');
  const download = must<HTMLAnchorElement>('merge-download');
  const resetBtn = must<HTMLButtonElement>('merge-reset');
  const errorBox = must<HTMLParagraphElement>('merge-error');
  const status = must<HTMLParagraphElement>('merge-status');

  let state: State = 'empty';
  let entries: Entry[] = [];
  let nextId = 1;
  let worker: Worker | null = null;
  // Incremented by every merge start, cancel and reset; a run that finds a newer id stops.
  let runId = 0;
  let blobUrl: string | null = null;
  // Files are inspected one at a time to bound memory.
  let inspectQueue: Promise<void> = Promise.resolve();

  const announce = (msg: string): void => {
    // Clearing first makes screen readers repeat an identical message.
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
  };

  const totalBytes = (): number => entries.reduce((a, e) => a + e.file.size, 0);
  const totalPages = (): number => entries.reduce((a, e) => a + (e.pageCount ?? 0), 0);

  function blocker(): string | null {
    if (entries.length < 2) return entries.length === 1 ? '파일을 하나 더 추가하면 합칠 수 있습니다.' : null;
    if (entries.some((e) => e.inspecting)) return '파일을 확인하는 중입니다.';
    if (entries.some((e) => e.error)) return '문제가 있는 파일을 목록에서 삭제하면 합칠 수 있습니다.';
    if (entries.some((e) => e.locked)) return '비밀번호가 걸린 파일의 비밀번호를 입력하면 합칠 수 있습니다.';
    return null;
  }

  function setState(next: State): void {
    state = next;
    root!.dataset.state = next;
    const hasFiles = entries.length > 0;
    const busy = next === 'merging';
    drop.hidden = next === 'done' || busy;
    pick.textContent = hasFiles ? '파일 추가' : 'PDF 파일 선택';
    list.hidden = !hasFiles || next === 'done';
    controls.hidden = !hasFiles || busy || next === 'done';
    progressBox.hidden = !busy;
    result.hidden = next !== 'done';
    if (next !== 'error') {
      errorBox.hidden = true;
      errorBox.textContent = '';
    }
    confirmBox.hidden = true;
    list.querySelectorAll('button, input').forEach((b) => {
      (b as HTMLButtonElement | HTMLInputElement).disabled = busy;
    });
    if (!busy) renderList();
    updateRun();
  }

  function updateRun(): void {
    const why = blocker();
    runBtn.disabled = why !== null || state === 'merging';
    hint.textContent = why ?? '';
  }

  // ---------- file list ----------

  function renderList(): void {
    const focusedId = (document.activeElement as HTMLElement | null)?.closest('li')?.dataset.id;
    const focusedRole = (document.activeElement as HTMLElement | null)?.dataset.role;
    list.replaceChildren(...entries.map((e, i) => renderItem(e, i)));
    if (focusedId && focusedRole) {
      list.querySelector<HTMLElement>(`li[data-id="${focusedId}"] [data-role="${focusedRole}"]`)?.focus();
    }
  }

  function renderItem(e: Entry, i: number): HTMLLIElement {
    const li = el('li', 'file-item');
    li.dataset.id = String(e.id);
    const name = e.file.name;

    const thumb = el('div', 'thumb');
    if (e.thumbnail) thumb.append(e.thumbnail);
    else thumb.append(el('span', 'thumb-ph', e.locked ? '잠김' : e.inspecting ? '확인 중' : 'PDF'));
    thumb.setAttribute('aria-hidden', 'true');

    const meta = el('div', 'meta');
    meta.append(el('p', 'name', name));
    const info = [e.pageCount !== null ? formatPages(e.pageCount) : null, formatMB(e.file.size)].filter(Boolean).join(' · ');
    meta.append(el('p', 'info', info));
    if (e.encrypted === 'owner' && !e.error) {
      meta.append(el('p', 'note', '보안 설정(편집 제한)이 해제된 사본이 만들어집니다'));
    }
    if (e.error) meta.append(el('p', 'file-error', MESSAGES[e.error]));

    const actions = el('div', 'actions');
    const up = el('button', 'btn small ghost', '위로');
    up.type = 'button';
    up.dataset.role = 'up';
    up.setAttribute('aria-label', `${name} 위로 이동`);
    up.disabled = i === 0;
    up.addEventListener('click', () => move(e.id, -1));
    const down = el('button', 'btn small ghost', '아래로');
    down.type = 'button';
    down.dataset.role = 'down';
    down.setAttribute('aria-label', `${name} 아래로 이동`);
    down.disabled = i === entries.length - 1;
    down.addEventListener('click', () => move(e.id, 1));
    const del = el('button', 'btn small ghost danger', '삭제');
    del.type = 'button';
    del.dataset.role = 'remove';
    del.setAttribute('aria-label', `${name} 삭제`);
    del.addEventListener('click', () => remove(e.id));
    actions.append(up, down, del);

    li.append(thumb, meta);
    if (e.locked && !e.error) li.append(renderPasswordForm(e));
    li.append(actions);
    return li;
  }

  function renderPasswordForm(e: Entry): HTMLFormElement {
    const form = el('form', 'pw');
    form.noValidate = true;
    const fieldId = `pw-${e.id}`;
    const label = el('label', 'pw-label', '이 파일은 비밀번호로 보호되어 있습니다');
    label.htmlFor = fieldId;
    const row = el('div', 'row');
    const pw = el('input', 'pw-input');
    pw.type = 'password';
    pw.id = fieldId;
    pw.autocomplete = 'off';
    pw.dataset.role = 'password';
    pw.setAttribute('aria-describedby', `${fieldId}-err`);
    const ok = el('button', 'btn small primary', '확인');
    ok.type = 'submit';
    ok.dataset.role = 'unlock';
    ok.setAttribute('aria-label', `${e.file.name} 비밀번호 확인`);
    row.append(pw, ok);
    const err = el('p', 'pw-error');
    err.id = `${fieldId}-err`;
    form.append(label, row, err);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      void unlock(e.id, pw.value, err, pw);
    });
    return form;
  }

  function move(id: number, delta: -1 | 1): void {
    const i = entries.findIndex((e) => e.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= entries.length) return;
    const [item] = entries.splice(i, 1);
    entries.splice(j, 0, item!);
    goListing();
    // Focus follows the moved item; if its button is now disabled (top/bottom), use the other one.
    const li = list.querySelector<HTMLElement>(`li[data-id="${id}"]`);
    const same = li?.querySelector<HTMLButtonElement>(`[data-role="${delta < 0 ? 'up' : 'down'}"]`);
    const other = li?.querySelector<HTMLButtonElement>(`[data-role="${delta < 0 ? 'down' : 'up'}"]`);
    (same && !same.disabled ? same : other)?.focus();
    announce(`${item!.file.name}: ${entries.length}개 중 ${j + 1}번째로 옮겼습니다.`);
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
    announce(`${gone!.file.name} 파일을 목록에서 뺐습니다. ${entries.length}개 남았습니다.`);
  }

  function goListing(): void {
    setState(entries.length ? 'listing' : 'empty');
  }

  // ---------- adding & inspecting ----------

  async function addFiles(files: File[]): Promise<void> {
    if (!files.length || state === 'merging') return;
    if (state === 'done') resetAll(false);
    loadDynamicFont();
    const device = detectDevice();
    const messages: string[] = [];
    const count = checkFileCount(entries.length, files.length);
    if (count.level !== 'ok') {
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
        error: null,
        thumbnail: null,
      });
    }
    if (rejectedForSize) {
      const r = checkAddBytes(Number.POSITIVE_INFINITY, device);
      if (r.level !== 'ok') messages.push(r.message);
    }
    showNotice(messages.length ? messages.join(' ') : null);
    if (!accepted.length) {
      if (messages.length) announce(messages.join(' '));
      return;
    }
    entries.push(...accepted);
    goListing();
    announce(`파일 ${accepted.length}개를 추가했습니다. 모두 ${entries.length}개입니다.`);
    for (const e of accepted) {
      inspectQueue = inspectQueue.then(() => inspectEntry(e)).catch(() => undefined);
    }
    await inspectQueue;
  }

  async function inspectEntry(e: Entry, password?: string): Promise<void> {
    if (!entries.includes(e)) return;
    try {
      const bytes = new Uint8Array(await e.file.arrayBuffer());
      const { inspect } = await import('../../lib/pdf/inspect');
      const r = await inspect(bytes, password);
      e.encrypted = r.encrypted;
      e.pageCount = r.pageCount;
      e.thumbnail = r.thumbnail;
      e.locked = r.pageCount === null;
      e.error = null;
    } catch (err) {
      const code = (err as { code?: PdfErrorCode }).code;
      if (code === 'wrong-password') throw err;
      e.error = code === 'not-pdf' ? 'not-pdf' : code === 'oom' ? 'oom' : 'corrupt';
    } finally {
      e.inspecting = false;
    }
    if (entries.includes(e) && state !== 'merging') {
      renderList();
      updateRun();
      if (e.error) announce(`${e.file.name}: ${MESSAGES[e.error]}`);
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
      errEl.textContent = MESSAGES['wrong-password'];
      announce(`${e.file.name}: ${MESSAGES['wrong-password']}`);
      field.value = '';
      field.focus();
      updateRun();
      return;
    }
    if (!e.locked && !e.error) {
      e.password = pw;
      announce(`${e.file.name}의 잠금을 풀었습니다.`);
      list.querySelector<HTMLElement>(`li[data-id="${e.id}"] [data-role="remove"]`)?.focus();
    }
  }

  // ---------- merging ----------

  function requestMerge(): void {
    if (blocker() !== null || state === 'merging') return;
    const check = checkMerge(totalBytes(), totalPages(), detectDevice());
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
    void runMerge();
  }

  async function runMerge(): Promise<void> {
    const run = ++runId;
    confirmBox.hidden = true;
    showNotice(null);
    const snapshot = entries.slice();
    setState('merging');
    progressBar.max = snapshot.length;
    progressBar.value = 0;
    progressText.textContent = `합치는 중… (0/${snapshot.length})`;
    announce('합치는 중입니다.');
    cancelBtn.focus();

    let files: WorkerFile[];
    try {
      files = await Promise.all(
        snapshot.map(async (e) => ({ buffer: await e.file.arrayBuffer(), password: e.password, title: baseName(e.file.name) })),
      );
    } catch {
      if (run === runId) fail('unknown');
      return;
    }
    if (run !== runId || state !== 'merging') return; // cancelled or restarted while reading

    const w = new Worker(new URL('../../lib/pdf/merge.worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    w.onmessage = (ev: MessageEvent<MergeResponse>) => {
      if (worker !== w) return;
      const msg = ev.data;
      if (msg.type === 'progress') {
        progressBar.value = msg.done;
        progressText.textContent = `합치는 중… (${msg.done}/${msg.total})`;
      } else if (msg.type === 'done') {
        stopWorker();
        finish(msg.bytes, msg.report, snapshot);
      } else {
        stopWorker();
        fail(msg.code, msg.fileIndex === undefined ? undefined : snapshot[msg.fileIndex]);
      }
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      if (worker !== w) return;
      stopWorker();
      fail('unknown');
    };
    const req: MergeRequest = { type: 'merge', files, addFileBookmarks: bookmarks.checked };
    w.postMessage(
      req,
      files.map((f) => f.buffer),
    );
  }

  function cancel(): void {
    if (state !== 'merging') return;
    runId++;
    stopWorker();
    goListing();
    runBtn.focus();
    announce('합치기를 취소했습니다. 파일 목록은 그대로 있습니다.');
  }

  function finish(bytes: Uint8Array, report: MergeReport, snapshot: Entry[]): void {
    revokeBlob();
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
    blobUrl = URL.createObjectURL(blob);
    download.href = blobUrl;
    download.download = mergedFileName(snapshot[0]!.file.name, snapshot.length);
    summary.textContent = `${formatPages(report.pageCount)} · ${formatMB(blob.size)}`;
    const n: string[] = [];
    if (snapshot.some((e) => e.encrypted === 'user')) n.push('합친 파일에는 비밀번호가 걸려 있지 않습니다.');
    if (report.renamedFields > 0) {
      n.push(`같은 이름의 입력 칸 ${report.renamedFields}개의 이름을 바꿔 모두 입력할 수 있게 했습니다.`);
    }
    notes.replaceChildren(...n.map((t) => el('li', undefined, t)));
    setState('done');
    download.focus();
    announce(`합치기를 마쳤습니다. ${summary.textContent}. ${n.join(' ')}`.trim());
  }

  function fail(code: PdfErrorCode, entry?: Entry): void {
    if (entry && (code === 'corrupt' || code === 'not-pdf')) entry.error = code;
    if (entry && (code === 'password' || code === 'wrong-password')) {
      entry.locked = true;
      entry.password = undefined;
    }
    const msg = entry ? `${entry.file.name}: ${MESSAGES[code]}` : MESSAGES[code];
    setState('error');
    errorBox.textContent = msg;
    errorBox.hidden = false;
    runBtn.focus();
  }

  function resetAll(focus = true): void {
    runId++;
    stopWorker();
    revokeBlob();
    for (const e of entries) e.password = undefined;
    entries = [];
    input.value = '';
    showNotice(null);
    notes.replaceChildren();
    setState('empty');
    if (focus) {
      input.focus();
      announce('처음 상태로 돌아왔습니다.');
    }
  }

  // ---------- wiring ----------

  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    void addFiles(files);
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
    void addFiles(Array.from(ev.dataTransfer?.files ?? []));
  });

  runBtn.addEventListener('click', requestMerge);
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

  setState('empty');
}
