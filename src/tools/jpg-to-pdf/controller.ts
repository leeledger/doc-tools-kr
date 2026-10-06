// 사진 PDF 변환 UI controller (TOOLS4 T2). States: empty → listing → building → done | error.
// Loaded by entry.ts on the first interaction. Each added photo is checked from its header (sniff) and decoded small
// for its thumbnail, one at a time; @cantoo/pdf-lib runs only in the worker (src/lib/pdf/images.worker.ts) when
// 「PDF 만들기」 is pressed (the /pdf-merge/ pattern: progress messages, cancel = terminate).
import type { ImagesErrorCode, ImagesRequest, ImagesResponse } from '../../lib/pdf/images.worker';
import { decodeImage } from '../../lib/image/decode';
import { ERRORS, photoErrorCode, unsupportedMessage } from '../../lib/image/messages';
import { canDrawOffscreen } from '../../lib/image/raster';
import { HEAD_BYTES, TAIL_BYTES, sniffImage } from '../../lib/image/sniff';
import { announce, clearAlert } from '../../lib/ui/announce';
import { detectDevice } from '../../lib/ui/device';
import { hideEngineError, showEngineError } from '../../lib/ui/engine-error';
import { loadDynamicFont } from '../../lib/ui/font';
import { formatPages, formatSize, safeFileName } from '../../lib/ui/format';
import { startRowDrag } from '../../lib/ui/reorder';
import { track, type UsagePhase } from '../../lib/ui/usage';
import { ACCEPTED_FORMATS, type SizeOption } from './embed';
import { rotatedSize, type LayoutOptions, type Orient, type PageMode, type Rotation } from './layout';
import { LIMITS, REDUCE_EDGE, planAdd } from './limits';

type State = 'empty' | 'listing' | 'building' | 'done' | 'error';
type RowError = 'heic' | 'not-image' | 'corrupt' | 'truncated' | 'empty';

interface Entry {
  id: number;
  file: File;
  rotation: Rotation;
  checking: boolean;
  error: RowError | null;
  /** Row message for the error (the format name for an unsupported one). */
  message: string;
  /** Small unrotated thumbnail; the row draws it turned by `rotation`. */
  thumb: HTMLCanvasElement | null;
}

const THUMB_EDGE = 128;

const RUN_MESSAGES: Record<'oom' | 'unknown', string> = {
  oom: '이 기기에서 한 번에 처리할 수 있는 양을 넘었습니다. 사진 수를 줄이거나 사진 크기에서 「줄이기」를 골라 다시 만들어 주세요.',
  unknown: ERRORS.unknown,
};

const ICONS = {
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  remove: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
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

/** File name without its last extension. */
const stem = (name: string): string => name.replace(/\.[^./\\]+$/, '');

const createWorker = (): Worker => new Worker(new URL('../../lib/pdf/images.worker.ts', import.meta.url), { type: 'module' });

/** The thumbnail turned by `rotation`, as a new canvas. */
function turned(src: HTMLCanvasElement, rotation: Rotation): HTMLCanvasElement {
  const { w, h } = rotatedSize(src.width, src.height, rotation);
  const c = el('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) {
    g.translate(w / 2, h / 2);
    g.rotate((rotation * Math.PI) / 180);
    g.drawImage(src, -src.width / 2, -src.height / 2);
  }
  return c;
}

export function initJpgToPdf(pending?: File[]): { add(files: File[]): void } | null {
  const found = document.getElementById('jp-tool');
  if (!found) return null;
  const root: HTMLElement = found;

  const input = must<HTMLInputElement>('jp-input');
  const addInput = must<HTMLInputElement>('jp-add');
  const drop = must<HTMLDivElement>('jp-drop');
  const unsupported = must<HTMLParagraphElement>('jp-unsupported');
  const notice = must<HTMLParagraphElement>('jp-notice');
  const list = must<HTMLOListElement>('jp-list');
  const controls = must<HTMLDivElement>('jp-controls');
  const actions = must<HTMLDivElement>('jp-actions');
  const removeBad = must<HTMLButtonElement>('jp-remove-bad');
  const runBtn = must<HTMLButtonElement>('jp-run');
  const hint = must<HTMLParagraphElement>('jp-hint');
  const orientGroup = must<HTMLFieldSetElement>('jp-orient-group');
  const marginGroup = must<HTMLFieldSetElement>('jp-margin-group');
  const progressBox = must<HTMLDivElement>('jp-progress');
  const progressText = must<HTMLParagraphElement>('jp-progress-text');
  const progressBar = must<HTMLProgressElement>('jp-progress-bar');
  const cancelBtn = must<HTMLButtonElement>('jp-cancel');
  const result = must<HTMLDivElement>('jp-result');
  const headline = must<HTMLParagraphElement>('jp-headline');
  const summary = must<HTMLParagraphElement>('jp-summary');
  const saveName = must<HTMLParagraphElement>('jp-save-name');
  const download = must<HTMLAnchorElement>('jp-download');
  const resetBtn = must<HTMLButtonElement>('jp-reset');

  let state: State = 'empty';
  let entries: Entry[] = [];
  let nextId = 1;
  let worker: Worker | null = null;
  // Incremented by every run start, cancel and reset; a run that finds a newer id stops.
  let runId = 0;
  let blobUrl: string | null = null;
  // Photos are checked one at a time to bound memory.
  let checkQueue: Promise<void> = Promise.resolve();
  let dragging = false;
  let renderHeld = false;

  const status = (msg: string): void => announce('status', msg, root);
  const usageFail = (c: string, p: UsagePhase): void => track({ e: 'fail', t: 'jpg-to-pdf', c, p });

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

  const radio = (name: string): string => root.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? '';
  const pageMode = (): PageMode => (radio('jp-page') === 'fit' ? 'fit' : 'a4');
  const errorRows = (): Entry[] => entries.filter((e) => e.error !== null);

  function blocker(): string | null {
    if (!entries.length) return null;
    if (entries.some((e) => e.checking)) return '사진을 확인하는 중입니다.';
    if (entries.some((e) => e.error)) return '문제가 있는 사진을 목록에서 빼면 PDF를 만들 수 있습니다.';
    return null;
  }

  function setState(next: State): void {
    state = next;
    root.dataset.state = next;
    const has = entries.length > 0;
    const busy = next === 'building';
    if (busy) document.body.dataset.busy = 'jpg-to-pdf';
    else delete document.body.dataset.busy;
    drop.hidden = has || next === 'done' || busy;
    list.hidden = !has || next === 'done';
    controls.hidden = !has || busy || next === 'done';
    actions.hidden = !has || busy || next === 'done';
    progressBox.hidden = !busy;
    result.hidden = next !== 'done';
    list.querySelectorAll('button').forEach((b) => {
      b.disabled = busy;
    });
    if (!busy) renderList();
    updateRun();
  }

  function updateRun(): void {
    const why = blocker();
    runBtn.textContent = entries.length ? `사진 ${entries.length.toLocaleString('ko-KR')}장으로 PDF 만들기` : 'PDF 만들기';
    runBtn.disabled = why !== null || !entries.length || state === 'building';
    hint.textContent = why ?? '';
    removeBad.hidden = errorRows().length < 2;
  }

  function syncOptions(): void {
    const a4 = pageMode() === 'a4';
    orientGroup.hidden = !a4;
    marginGroup.hidden = !a4;
  }

  // ---------- list ----------

  function renderList(): void {
    if (dragging) {
      renderHeld = true;
      return;
    }
    const focusedId = (document.activeElement as HTMLElement | null)?.closest('li')?.dataset.id;
    const focusedRole = (document.activeElement as HTMLElement | null)?.dataset.role;
    list.replaceChildren(...entries.map((e, i) => renderItem(e, i)));
    if (focusedId && focusedRole) list.querySelector<HTMLElement>(`li[data-id="${focusedId}"] [data-role="${focusedRole}"]`)?.focus();
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

    const handle = el('span', 'drag-handle');
    handle.setAttribute('aria-hidden', 'true');
    handle.tabIndex = -1;
    handle.textContent = '⋮⋮';
    handle.addEventListener('pointerdown', (ev) => beginDrag(ev, li, e.id));

    const thumb = el('div', 'thumb');
    thumb.setAttribute('aria-hidden', 'true');
    if (e.thumb) thumb.append(turned(e.thumb, e.rotation));
    else thumb.append(el('span', 'thumb-ph', e.checking ? '확인 중' : '사진'));

    const meta = el('div', 'meta');
    const nameEl = el('p', 'name', name);
    nameEl.title = name;
    const info = el('p', 'info');
    if (e.error) {
      const s = el('span', 'state-ico err');
      s.append(svgIcon(ICONS.error), el('span', 'visually-hidden', '오류'));
      info.append(s, ' ');
    }
    info.append([`${i + 1}쪽`, formatSize(e.file.size), e.rotation ? `${e.rotation}° 돌림` : ''].filter(Boolean).join(' · '));
    meta.append(nameEl, info);

    const act = el('div', 'actions');
    const up = iconButton('up', `${name} 위로 이동`, ICONS.up, () => reorder(e.id, i - 1, 'up'));
    up.disabled = i === 0;
    const down = iconButton('down', `${name} 아래로 이동`, ICONS.down, () => reorder(e.id, i + 1, 'down'));
    down.disabled = i === entries.length - 1;
    const rot = iconButton('rotate', `${name} 오른쪽으로 돌리기`, ICONS.rotate, () => rotate(e.id));
    rot.disabled = e.error !== null;
    const del = iconButton('remove', `${name} 삭제`, ICONS.remove, () => remove(e.id), 'danger');
    act.append(up, down, rot, del);

    li.append(handle, thumb, meta, act);
    if (e.error) li.append(el('p', 'row-note file-error', e.message));
    return li;
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
      const li = list.querySelector<HTMLElement>(`li[data-id="${id}"]`);
      const same = li?.querySelector<HTMLButtonElement>(`[data-role="${focusRole}"]`);
      const other = li?.querySelector<HTMLButtonElement>(`[data-role="${focusRole === 'up' ? 'down' : 'up'}"]`);
      (same && !same.disabled ? same : other)?.focus();
    }
    status(`${item!.file.name}: ${entries.length}장 중 ${j + 1}번째로 옮겼습니다.`);
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
      if (to !== null) reorder(id, to);
      else if (held) renderList();
    });
  }

  function rotate(id: number): void {
    const e = entries.find((x) => x.id === id);
    if (!e || e.error) return;
    e.rotation = ((e.rotation + 90) % 360) as Rotation;
    goListing();
    status(`${e.file.name}: 오른쪽으로 ${e.rotation}° 돌렸습니다.`);
  }

  function remove(id: number): void {
    const i = entries.findIndex((e) => e.id === id);
    if (i < 0) return;
    const [gone] = entries.splice(i, 1);
    showNotice(null);
    if (!entries.length) {
      setState('empty');
      input.focus();
    } else {
      goListing();
      const next = entries[Math.min(i, entries.length - 1)]!;
      list.querySelector<HTMLElement>(`li[data-id="${next.id}"] [data-role="remove"]`)?.focus();
    }
    status(`${gone!.file.name} 사진을 목록에서 뺐습니다. ${entries.length}장 남았습니다.`);
  }

  function removeProblemPhotos(): void {
    const bad = errorRows();
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
    status(`문제 사진 ${bad.length}장을 목록에서 뺐습니다. ${entries.length}장 남았습니다.`);
  }

  function goListing(): void {
    setState(entries.length ? 'listing' : 'empty');
  }

  // ---------- adding & checking ----------

  function addFiles(picked: File[]): void {
    if (!picked.length || state === 'building') return;
    if (state === 'done') resetAll(false);
    clearAlert(root);
    track({ e: 'pick', t: 'jpg-to-pdf' });
    loadDynamicFont();
    const plan = planAdd(
      picked.map((f) => f.size),
      entries.length,
      entries.reduce((a, e) => a + e.file.size, 0),
      detectDevice(),
    );
    for (const c of plan.codes) usageFail(c, 'parse');
    showNotice(plan.messages.length ? plan.messages.join(' ') : null);
    const accepted = plan.accepted.map(
      (i): Entry => ({ id: nextId++, file: picked[i]!, rotation: 0, checking: true, error: null, message: '', thumb: null }),
    );
    if (!accepted.length) {
      status(plan.messages.join(' '));
      return;
    }
    entries.push(...accepted);
    goListing();
    status(`사진 ${accepted.length}장을 추가했습니다. 모두 ${entries.length}장입니다.`);
    for (const e of accepted) checkQueue = checkQueue.then(() => checkEntry(e)).catch(() => undefined);
  }

  function markError(e: Entry, code: RowError, message: string, usageCode: string = code): void {
    e.error = code;
    e.message = message;
    usageFail(usageCode, 'parse');
  }

  async function checkEntry(e: Entry): Promise<void> {
    if (!entries.includes(e)) return;
    const f = e.file;
    try {
      if (f.size === 0) markError(e, 'empty', ERRORS.empty);
      else {
        const head = new Uint8Array(await f.slice(0, HEAD_BYTES).arrayBuffer());
        const tail = new Uint8Array(await f.slice(Math.max(0, f.size - TAIL_BYTES)).arrayBuffer());
        const s = sniffImage(head, { tail, size: f.size });
        if (!ACCEPTED_FORMATS.includes(s.format)) markError(e, 'not-image', s.format === 'unknown' ? ERRORS['not-image'] : unsupportedMessage(s.format));
        else if (s.truncated) markError(e, 'truncated', ERRORS.truncated, 'corrupt');
        else {
          const d = await decodeImage(f, s, { maxLongEdge: THUMB_EDGE });
          try {
            const c = el('canvas');
            c.width = d.width;
            c.height = d.height;
            c.getContext('2d')?.drawImage(d.src, 0, 0);
            e.thumb = c;
          } finally {
            d.close();
          }
        }
      }
    } catch (err) {
      if (photoErrorCode(err) === 'heic') markError(e, 'heic', ERRORS.heic);
      else markError(e, 'corrupt', ERRORS.corrupt);
    } finally {
      e.checking = false;
    }
    if (entries.includes(e) && state !== 'building') {
      renderList();
      updateRun();
      if (e.error) status(`${f.name}: ${e.message}`);
    }
  }

  // ---------- building ----------

  function options(): { layout: LayoutOptions; size: SizeOption } {
    return {
      layout: {
        page: pageMode(),
        orient: (radio('jp-orient') === 'portrait' ? 'portrait' : 'auto') as Orient,
        marginMm: radio('jp-margin') === '10' ? 10 : 0,
      },
      size: radio('jp-size') === 'reduce' ? 'reduce' : 'original',
    };
  }

  function run(): void {
    if (blocker() !== null || !entries.length || state === 'building') return;
    const id = ++runId;
    showNotice(null);
    clearAlert(root);
    const snapshot = entries.slice();
    const opts = options();
    const device = LIMITS[detectDevice()];
    track({ e: 'start', t: 'jpg-to-pdf', o: 'page', v: opts.layout.page });
    setState('building');
    progressBar.max = snapshot.length;
    progressBar.value = 0;
    progressText.textContent = `PDF를 만드는 중… (0/${snapshot.length})`;
    status('PDF를 만드는 중입니다.');
    cancelBtn.focus();

    let w: Worker;
    try {
      w = createWorker();
    } catch {
      engineStop();
      return;
    }
    worker = w;
    // An `error` before the worker's first message means its script did not load (engine), not a photo problem.
    let answered = false;
    w.onmessage = (ev: MessageEvent<ImagesResponse>) => {
      if (worker !== w || id !== runId) return;
      answered = true;
      const msg = ev.data;
      if (msg.type === 'progress') {
        progressBar.value = msg.done;
        progressText.textContent = `PDF를 만드는 중… (${msg.done}/${msg.total})`;
      } else if (msg.type === 'done') {
        stopWorker();
        finish(msg.bytes, msg.pages, snapshot);
      } else {
        stopWorker();
        if (msg.code === 'engine') engineStop();
        else fail(msg.code, msg.index === undefined ? undefined : snapshot[msg.index]);
      }
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      if (worker !== w) return;
      stopWorker();
      if (!answered) engineStop();
      else fail('unknown');
    };
    const req: ImagesRequest = {
      type: 'build',
      items: snapshot.map((e) => ({ file: e.file, rotation: e.rotation })),
      layout: opts.layout,
      size: opts.size,
      maxEdge: opts.size === 'reduce' ? Math.min(REDUCE_EDGE, device.maxEdge) : device.maxEdge,
    };
    w.postMessage(req);
  }

  /** The worker did not load: back to the list, nothing marked, the engine panel. */
  function engineStop(): void {
    runId++;
    stopWorker();
    goListing();
    usageFail('engine', 'process');
    void showEngineError();
  }

  function cancel(): void {
    if (state !== 'building') return;
    runId++;
    stopWorker();
    goListing();
    runBtn.focus();
    status('PDF 만들기를 취소했습니다. 사진 목록은 그대로 있습니다.');
  }

  function finish(bytes: Uint8Array, pages: number, snapshot: Entry[]): void {
    revokeBlob();
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
    blobUrl = URL.createObjectURL(blob);
    track({ e: 'success', t: 'jpg-to-pdf' });
    download.href = blobUrl;
    download.download = safeFileName(stem(snapshot[0]!.file.name), '.pdf');
    summary.textContent = `${formatPages(pages)} · ${formatSize(blob.size)}`;
    saveName.textContent = `저장될 이름: ${download.download}`;
    setState('done');
    result.scrollIntoView({ block: 'start' });
    headline.focus({ preventScroll: true });
    status(`PDF를 만들었습니다. ${summary.textContent}.`);
  }

  function fail(code: Exclude<ImagesErrorCode, 'engine'>, entry?: Entry): void {
    usageFail(code, 'process');
    let msg: string;
    if (entry && (code === 'heic' || code === 'not-image' || code === 'corrupt')) {
      entry.error = code;
      entry.message = code === 'heic' ? ERRORS.heic : code === 'not-image' ? ERRORS['not-image'] : ERRORS.corrupt;
      msg = `${entry.file.name}: ${entry.message}`;
    } else msg = RUN_MESSAGES[code === 'oom' ? 'oom' : 'unknown'];
    setState('error');
    announce('alert', msg, root);
    runBtn.focus();
  }

  function resetAll(focus = true): void {
    runId++;
    stopWorker();
    revokeBlob();
    entries = [];
    input.value = '';
    addInput.value = '';
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

  if (!canDrawOffscreen()) {
    unsupported.hidden = false;
    for (const inp of [input, addInput]) inp.disabled = true;
    usageFail('canvas', 'load');
    return null;
  }

  for (const inp of [input, addInput]) {
    inp.addEventListener('change', () => {
      const files = Array.from(inp.files ?? []);
      inp.value = '';
      addFiles(files);
    });
  }
  root.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer?.types.includes('Files') || state === 'building') return;
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
    addFiles(Array.from(ev.dataTransfer?.files ?? []));
  });
  for (const r of root.querySelectorAll<HTMLInputElement>('input[name="jp-page"]')) r.addEventListener('change', syncOptions);
  runBtn.addEventListener('click', run);
  removeBad.addEventListener('click', removeProblemPhotos);
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
  download.addEventListener('click', () => track({ e: 'download', t: 'jpg-to-pdf' }));

  syncOptions();
  setState('empty');
  // Photos picked or dropped while this module loaded.
  const first = pending ?? Array.from(input.files ?? []);
  input.value = '';
  if (first.length) addFiles(first);
  return { add: addFiles };
}
