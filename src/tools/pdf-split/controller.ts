// PDF 나누기·쪽 편집 UI controller (TOOLS5 U2). States: empty → opening → locked → ready → working → done.
// Loaded by entry.ts on the first interaction; pdf.js (src/lib/pdf/inspect.ts) loads when a file is chosen and stays open
// for the page pictures (drawn lazily when a row is near the screen, at most 2 at a time). Saving runs the PDF 합치기
// worker (pdf-lib, mergePlus `pages` / `rotate`) once per output PDF, one after another; several PDFs go into a
// streaming stored ZIP. Pure decisions live in plan.ts.
import type { PdfErrorCode, WorkerErrorCode } from '../../lib/pdf/errors';
import type { OpenedPdf } from '../../lib/pdf/inspect';
import type { MergeReport } from '../../lib/pdf/mergePlus';
import type { MergeRequest, MergeResponse } from '../../lib/pdf/merge.worker';
import type { PageRangeError } from '../../lib/pdf/page-range';
import { isOutOfMemory } from '../../lib/pdf/errors';
import { announce, clearAlert } from '../../lib/ui/announce';
import { detectDevice } from '../../lib/ui/device';
import { hideEngineError, showEngineError } from '../../lib/ui/engine-error';
import { isEngineLoadFailure, withEngineRetry } from '../../lib/ui/engine-load';
import { loadDynamicFont } from '../../lib/ui/font';
import { formatPages, formatSize } from '../../lib/ui/format';
import { bindPasswordToggle } from '../../lib/ui/password';
import { isPdfFile } from '../../lib/ui/pdf-pick';
import { startRowDrag } from '../../lib/ui/reorder';
import { track, type UsagePhase } from '../../lib/ui/usage';
import { dedupeNames } from '../../lib/zip/names';
import { StoredZip } from '../../lib/zip/stored';
import { LIMITS, fileLimitMessage, partsLimitMessage, softLimitMessage } from './limits';
import {
  SAVE_MODES,
  editName,
  editPlan,
  everyN,
  extractName,
  extractPlan,
  initialState,
  keptPages,
  move,
  parseParts,
  parseSize,
  partName,
  splitPlans,
  splitZipName,
  turn,
  type PageState,
  type PartPlan,
  type SaveMode,
} from './plan';

type State = 'empty' | 'opening' | 'locked' | 'ready' | 'working' | 'done';

const MESSAGES = {
  'not-pdf': 'PDF 파일이 아닙니다. PDF 파일을 골라 주세요.',
  password: '이 파일은 비밀번호로 보호되어 있습니다. 비밀번호를 입력해 주세요.',
  'wrong-password': '비밀번호가 맞지 않습니다. 다시 입력해 주세요.',
  corrupt: '파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아 주세요.',
  oom: '이 기기에서 한 번에 처리할 수 있는 양을 넘었습니다. 쪽을 나눠 여러 번 저장하거나 PC에서 다시 시도해 주세요.',
  unknown: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
} as const;

const RANGE_MESSAGES: Record<PageRangeError, (pages: number) => string> = {
  empty: () => '나눌 범위를 한 줄에 하나씩 「1-3」처럼 입력해 주세요.',
  'out-of-range': (n) => `남은 쪽은 ${formatPages(n)}까지입니다. 1부터 ${n.toLocaleString('ko-KR')} 사이의 쪽 번호를 입력해 주세요.`,
  reversed: () => '쪽 범위는 작은 번호부터 「3-5」처럼 입력해 주세요.',
  junk: () => '쪽 번호는 「1-3」이나 「1-3, 5」처럼 숫자, 「-」, 쉼표로 입력해 주세요.',
};

const OWNER_NOTE = '보안 설정(편집 제한)이 해제된 사본이 만들어집니다.';
const MANY_NOTE = '쪽이 많아 쪽 그림 없이 쪽 번호로 보여 드립니다.';
const SIGNATURE_NOTE = '전자서명이 들어 있는 문서입니다. 편집해 새로 저장하면 전자서명이 더 이상 유효하지 않습니다. 발급받은 증명서는 원본을 제출하세요.';
const NO_PASSWORD_NOTE = '저장한 PDF에는 비밀번호가 걸려 있지 않습니다.';

/** Page pictures: at most this many CSS px on the long edge (≤ 160 device px at 2× screens). */
const THUMB_PX = 64;
const THUMBS_IN_FLIGHT = 2;

const ICONS = {
  rotate: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  remove: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  restore: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
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

const loadInspect = () => withEngineRetry(() => import('../../lib/pdf/inspect'));
const createMergeWorker = (): Worker => new Worker(new URL('../../lib/pdf/merge.worker.ts', import.meta.url), { type: 'module' });

/** A failed worker run: `engine` when the worker script never answered. */
class RunFailure extends Error {
  constructor(readonly code: WorkerErrorCode) {
    super(code);
  }
}

export function initPdfSplit(pending?: File[]): { open(files: File[]): void } | null {
  const found = document.getElementById('ps-tool');
  if (!found) return null;
  const root: HTMLElement = found;

  const input = must<HTMLInputElement>('ps-input');
  const drop = must<HTMLDivElement>('ps-drop');
  const notice = must<HTMLParagraphElement>('ps-notice');
  const card = must<HTMLDivElement>('ps-file');
  const nameEl = must<HTMLParagraphElement>('ps-name');
  const infoEl = must<HTMLParagraphElement>('ps-info');
  const pwForm = must<HTMLFormElement>('ps-pw');
  const pwInput = must<HTMLInputElement>('ps-pw-input');
  const pwError = must<HTMLParagraphElement>('ps-pw-error');
  const bulk = must<HTMLDivElement>('ps-bulk');
  const allBtn = must<HTMLButtonElement>('ps-all');
  const rotateSel = must<HTMLButtonElement>('ps-rotate-sel');
  const removeSel = must<HTMLButtonElement>('ps-remove-sel');
  const list = must<HTMLOListElement>('ps-list');
  const controls = must<HTMLDivElement>('ps-controls');
  const rangesBox = must<HTMLDivElement>('ps-ranges-box');
  const rangesInput = must<HTMLTextAreaElement>('ps-ranges');
  const rangesError = must<HTMLParagraphElement>('ps-ranges-error');
  const everyBox = must<HTMLDivElement>('ps-every-box');
  const everyInput = must<HTMLInputElement>('ps-every');
  const everyError = must<HTMLParagraphElement>('ps-every-error');
  const confirmBox = must<HTMLDivElement>('ps-confirm');
  const confirmText = must<HTMLParagraphElement>('ps-confirm-text');
  const confirmYes = must<HTMLButtonElement>('ps-confirm-yes');
  const confirmNo = must<HTMLButtonElement>('ps-confirm-no');
  const hint = must<HTMLParagraphElement>('ps-hint');
  const actions = must<HTMLDivElement>('ps-actions');
  const runBtn = must<HTMLButtonElement>('ps-run');
  const changeBtn = must<HTMLButtonElement>('ps-change');
  const progressBox = must<HTMLDivElement>('ps-progress');
  const progressText = must<HTMLParagraphElement>('ps-progress-text');
  const progressBar = must<HTMLProgressElement>('ps-progress-bar');
  const cancelBtn = must<HTMLButtonElement>('ps-cancel');
  const result = must<HTMLDivElement>('ps-result');
  const headline = must<HTMLParagraphElement>('ps-headline');
  const summary = must<HTMLParagraphElement>('ps-summary');
  const notes = must<HTMLUListElement>('ps-notes');
  const download = must<HTMLAnchorElement>('ps-download');
  const againBtn = must<HTMLButtonElement>('ps-again');
  const resetBtn = must<HTMLButtonElement>('ps-reset');
  const saveName = must<HTMLParagraphElement>('ps-save-name');
  const modeRadios = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="ps-mode"]'));

  let state: State = 'empty';
  let file: File | null = null;
  let bytes: Uint8Array | null = null;
  let opened: OpenedPdf | null = null;
  /** The open password, in memory only while this file is open. */
  let password: string | undefined;
  let encrypted: 'none' | 'owner' | 'user' = 'none';
  let pages: PageState[] = [];
  // Incremented by every open, run, cancel and reset; work that finds a newer id stops.
  let runId = 0;
  let worker: Worker | null = null;
  let unlocking = false;
  let blobUrl: string | null = null;
  // A row drag holds re-renders: replacing the list would detach the dragged row and its pointer capture.
  let dragging = false;
  let renderHeld = false;

  // Page pictures, by source page. `docId` changes with every opened file, so a late picture of an old file is dropped.
  let thumbsOn = false;
  let docId = 0;
  const thumbs = new Map<number, HTMLCanvasElement>();
  const wanted = new Set<number>();
  let inFlight = 0;
  let observer: IntersectionObserver | null = null;

  const status = (msg: string): void => announce('status', msg, root);
  const usageFail = (c: string, p: UsagePhase): void => track({ e: 'fail', t: 'pdf-split', c, p });
  const mode = (): SaveMode => {
    const v = modeRadios.find((r) => r.checked)?.value as SaveMode | undefined;
    return v && SAVE_MODES.includes(v) ? v : 'edit';
  };

  const showNotice = (msg: string | null): void => {
    notice.hidden = !msg;
    notice.textContent = msg ?? '';
  };
  const fileNotice = (): string | null => [encrypted === 'owner' ? OWNER_NOTE : null, thumbsOn || !pages.length ? null : MANY_NOTE].filter(Boolean).join(' ') || null;

  const revokeBlob = (): void => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
    download.removeAttribute('href');
  };

  const stopWorker = (): void => {
    worker?.terminate();
    worker = null;
  };

  const setFieldError = (field: HTMLElement, errEl: HTMLElement, msg: string): void => {
    errEl.textContent = msg;
    if (msg) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  };

  function setState(next: State): void {
    state = next;
    root.dataset.state = next;
    const busy = next === 'working';
    if (busy) document.body.dataset.busy = 'pdf-split';
    else delete document.body.dataset.busy;
    const editing = next === 'ready' || busy;
    drop.hidden = next !== 'empty';
    card.hidden = next === 'empty' || next === 'done';
    pwForm.hidden = next !== 'locked';
    bulk.hidden = next !== 'ready';
    list.hidden = !editing;
    controls.hidden = next !== 'ready';
    actions.hidden = next === 'empty' || busy || next === 'done';
    runBtn.hidden = next !== 'ready';
    progressBox.hidden = !busy;
    result.hidden = next !== 'done';
    confirmBox.hidden = true;
    list.querySelectorAll('button, input').forEach((b) => {
      (b as HTMLButtonElement | HTMLInputElement).disabled = busy || (b as HTMLElement).dataset.off === '1';
    });
    updateRun();
  }

  // ---------- the plan for the chosen save mode ----------

  type Plan = { ok: true; mode: SaveMode; parts: PartPlan[] } | { ok: false; why: string };

  function currentPlan(): Plan {
    const kept = keptPages(pages).length;
    if (!kept) return { ok: false, why: '쪽을 하나 이상 남겨 주세요.' };
    const m = mode();
    if (m === 'edit') return { ok: true, mode: m, parts: [editPlan(pages)!] };
    if (m === 'extract') {
      const p = extractPlan(pages);
      return p ? { ok: true, mode: m, parts: [p] } : { ok: false, why: '새 PDF로 만들 쪽을 골라 주세요.' };
    }
    let positions: number[][];
    if (m === 'ranges') {
      const r = parseParts(rangesInput.value, kept);
      if (!r.ok) {
        const msg = RANGE_MESSAGES[r.error](kept);
        return { ok: false, why: r.line > 0 && rangesInput.value.trim().includes('\n') ? `${r.line}번째 줄: ${msg}` : msg };
      }
      positions = r.parts;
    } else {
      const size = m === 'each' ? 1 : parseSize(everyInput.value);
      if (size === null) return { ok: false, why: '몇 쪽씩 나눌지 1 이상의 숫자로 입력해 주세요.' };
      positions = everyN(kept, size);
    }
    const over = partsLimitMessage(positions.length, detectDevice());
    if (over) return { ok: false, why: over };
    return { ok: true, mode: m, parts: splitPlans(pages, positions) };
  }

  function updateRun(): void {
    if (state !== 'ready') return;
    const m = mode();
    rangesBox.hidden = m !== 'ranges';
    everyBox.hidden = m !== 'every';
    const plan = currentPlan();
    // Field messages only for what the person typed (an empty range box is not an error yet).
    const rangeMsg = !plan.ok && m === 'ranges' && rangesInput.value.trim() && keptPages(pages).length ? plan.why : '';
    setFieldError(rangesInput, rangesError, rangeMsg);
    const everyMsg = !plan.ok && m === 'every' && keptPages(pages).length ? plan.why : '';
    setFieldError(everyInput, everyError, everyMsg);
    runBtn.disabled = !plan.ok;
    if (!plan.ok) {
      runBtn.textContent = m === 'edit' ? '편집한 PDF 저장' : m === 'extract' ? '고른 쪽 저장' : 'PDF 나누기';
      // A message already under its field is not repeated in the hint.
      hint.textContent = rangeMsg || everyMsg ? '' : plan.why;
      return;
    }
    const n = plan.parts.length;
    const pageTotal = plan.parts.reduce((a, p) => a + p.pages.length, 0);
    if (m === 'edit') {
      runBtn.textContent = '편집한 PDF 저장';
      hint.textContent = `${formatPages(pageTotal)}을 PDF 하나로 저장합니다.`;
    } else if (m === 'extract') {
      runBtn.textContent = `고른 ${formatPages(pageTotal)} 저장`;
      hint.textContent = `고른 ${formatPages(pageTotal)}만 새 PDF로 저장합니다.`;
    } else {
      runBtn.textContent = `PDF ${n.toLocaleString('ko-KR')}개로 나누기`;
      hint.textContent = n > 1 ? `PDF ${n.toLocaleString('ko-KR')}개로 나눠 ZIP 파일 하나로 받습니다.` : 'PDF 하나로 저장합니다.';
    }
  }

  function updateBulk(): void {
    const kept = keptPages(pages);
    const chosen = kept.filter((p) => p.selected).length;
    const allOn = kept.length > 0 && chosen === kept.length;
    allBtn.textContent = allOn ? '선택 해제' : '모두 선택';
    allBtn.disabled = !kept.length;
    rotateSel.disabled = !chosen;
    removeSel.disabled = !chosen;
  }

  // ---------- the page list ----------

  const rowLabel = (p: PageState, pos: number | null): string => (pos !== null ? formatPages(pos) : `원래 ${formatPages(p.src + 1)}`);

  /** 1-based place of each kept page in the edited document; null for removed pages. */
  function positions(): (number | null)[] {
    let k = 0;
    return pages.map((p) => (p.removed ? null : ++k));
  }

  function renderList(): void {
    if (dragging) {
      renderHeld = true;
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const focusedId = active?.closest('li')?.dataset.id;
    const focusedRole = active?.dataset.role;
    const pos = positions();
    list.replaceChildren(...pages.map((p, i) => renderItem(p, i, pos[i]!)));
    if (focusedId && focusedRole) list.querySelector<HTMLElement>(`li[data-id="${focusedId}"] [data-role="${focusedRole}"]`)?.focus();
    observeThumbs();
    updateBulk();
    updateRun();
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

  /** Disables a control for this row (kept across setState, which re-enables everything else after a run). */
  const off = (b: HTMLButtonElement | HTMLInputElement, yes: boolean): void => {
    b.disabled = yes;
    if (yes) b.dataset.off = '1';
  };

  function renderItem(p: PageState, i: number, pos: number | null): HTMLLIElement {
    const li = el('li', p.removed ? 'file-item removed' : 'file-item');
    li.dataset.id = String(p.src);
    const label = rowLabel(p, pos);

    // Pointer-only drag handle; the keyboard uses the ↑↓ buttons.
    const handle = el('span', 'drag-handle');
    handle.setAttribute('aria-hidden', 'true');
    handle.tabIndex = -1;
    handle.textContent = '⋮⋮';
    handle.addEventListener('pointerdown', (ev) => beginDrag(ev, li, p.src));

    const thumb = el('div', 'thumb');
    thumb.dataset.src = String(p.src);
    thumb.setAttribute('aria-hidden', 'true');
    const canvas = thumbs.get(p.src);
    if (canvas) thumb.append(placeCanvas(canvas, p.rotate));
    else thumb.append(el('span', 'thumb-ph', String(p.src + 1)));

    const meta = el('div', 'meta');
    const pick = el('label', 'check page-pick');
    const box = el('input');
    box.type = 'checkbox';
    box.dataset.role = 'pick';
    box.checked = p.selected && !p.removed;
    off(box, p.removed);
    box.setAttribute('aria-label', `${label} 고르기`);
    box.addEventListener('change', () => {
      p.selected = box.checked;
      updateBulk();
      updateRun();
    });
    pick.append(box, el('span', 'name', pos !== null ? formatPages(pos) : '빼는 쪽'));
    const info: string[] = [];
    if (pos !== p.src + 1) info.push(`원래 ${formatPages(p.src + 1)}`);
    if (p.rotate) info.push(`${p.rotate}° 돌림`);
    meta.append(pick);
    if (info.length) meta.append(el('p', 'info', info.join(' · ')));

    const act = el('div', 'actions');
    const rot = iconButton('rotate', `${label} 오른쪽으로 돌리기`, ICONS.rotate, () => rotate([p]));
    off(rot, p.removed);
    const up = iconButton('up', `${label} 위로 이동`, ICONS.up, () => reorder(p.src, i - 1, 'up'));
    off(up, i === 0);
    const down = iconButton('down', `${label} 아래로 이동`, ICONS.down, () => reorder(p.src, i + 1, 'down'));
    off(down, i === pages.length - 1);
    const del = p.removed
      ? iconButton('remove', `${label} 되살리기`, ICONS.restore, () => setRemoved([p], false))
      : iconButton('remove', `${label} 빼기`, ICONS.remove, () => setRemoved([p], true), 'danger');
    act.append(rot, up, down, del);

    li.append(handle, thumb, meta, act);
    return li;
  }

  /** The cached page picture, turned by its extra rotation (the saved page turns the same way). */
  function placeCanvas(canvas: HTMLCanvasElement, deg: number): HTMLCanvasElement {
    canvas.style.transform = deg ? `rotate(${deg}deg)` : '';
    return canvas;
  }

  function rotate(targets: PageState[]): void {
    if (state !== 'ready' || !targets.length) return;
    for (const p of targets) p.rotate = turn(p.rotate);
    renderList();
    status(targets.length === 1 ? `${rowLabel(targets[0]!, positions()[pages.indexOf(targets[0]!)]!)}을 오른쪽으로 돌렸습니다. 지금 ${targets[0]!.rotate}°입니다.` : `고른 ${formatPages(targets.length)}을 오른쪽으로 돌렸습니다.`);
  }

  function setRemoved(targets: PageState[], removed: boolean): void {
    if (state !== 'ready' || !targets.length) return;
    for (const p of targets) {
      p.removed = removed;
      p.selected = false;
    }
    renderList();
    const left = keptPages(pages).length;
    const what = targets.length === 1 ? `원래 ${formatPages(targets[0]!.src + 1)}` : formatPages(targets.length);
    status(`${what}을 ${removed ? '뺐습니다' : '되살렸습니다'}. 남은 쪽은 ${formatPages(left)}입니다.${left ? '' : ' 쪽을 하나 이상 남겨 주세요.'}`);
  }

  /** The one reorder path: the ↑↓ buttons and a drag drop both end here (same announcement). */
  function reorder(src: number, to: number, focusRole?: 'up' | 'down'): void {
    const i = pages.findIndex((p) => p.src === src);
    const j = Math.max(0, Math.min(pages.length - 1, to));
    if (state !== 'ready' || i < 0 || i === j) return;
    pages = move(pages, i, j);
    renderList();
    if (focusRole) {
      // Focus follows the moved page; if its button is now disabled (top/bottom), use the other one.
      const li = list.querySelector<HTMLElement>(`li[data-id="${src}"]`);
      const same = li?.querySelector<HTMLButtonElement>(`[data-role="${focusRole}"]`);
      const other = li?.querySelector<HTMLButtonElement>(`[data-role="${focusRole === 'up' ? 'down' : 'up'}"]`);
      (same && !same.disabled ? same : other)?.focus();
    }
    status(`원래 ${formatPages(src + 1)}을 ${pages.length.toLocaleString('ko-KR')}개 중 ${j + 1}번째로 옮겼습니다.`);
  }

  function beginDrag(ev: PointerEvent, li: HTMLLIElement, src: number): void {
    if (state !== 'ready' || ev.button > 0 || pages.length < 2) return;
    ev.preventDefault();
    dragging = true;
    renderHeld = false;
    startRowDrag(ev, li, list, (to) => {
      dragging = false;
      const held = renderHeld;
      renderHeld = false;
      if (to !== null) reorder(src, to);
      else if (held) renderList();
    });
  }

  // ---------- page pictures ----------

  function observeThumbs(): void {
    observer?.disconnect();
    wanted.clear();
    if (!thumbsOn || typeof IntersectionObserver === 'undefined') return;
    observer ??= new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const src = Number((en.target as HTMLElement).dataset.src);
          if (en.isIntersecting) wanted.add(src);
          else wanted.delete(src);
        }
        pump();
      },
      { rootMargin: '300px 0px' },
    );
    for (const t of list.querySelectorAll<HTMLElement>('.thumb[data-src]')) if (!thumbs.has(Number(t.dataset.src))) observer.observe(t);
  }

  function pump(): void {
    const doc = opened?.doc;
    if (!doc) return;
    while (inFlight < THUMBS_IN_FLIGHT && wanted.size) {
      const src = wanted.values().next().value as number;
      wanted.delete(src);
      if (thumbs.has(src)) continue;
      const id = docId;
      inFlight++;
      void loadInspect()
        .then(({ renderPageThumb }) => renderPageThumb(doc, src, THUMB_PX, THUMB_PX))
        .then((canvas) => {
          if (id !== docId || !canvas) return;
          thumbs.set(src, canvas);
          const box = list.querySelector<HTMLElement>(`.thumb[data-src="${src}"]`);
          if (box) {
            observer?.unobserve(box);
            box.replaceChildren(placeCanvas(canvas, pages.find((p) => p.src === src)?.rotate ?? 0));
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (id !== docId) return;
          inFlight--;
          pump();
        });
    }
  }

  function dropThumbs(): void {
    docId++;
    observer?.disconnect();
    observer = null;
    wanted.clear();
    inFlight = 0;
    for (const c of thumbs.values()) {
      c.width = 0;
      c.height = 0;
    }
    thumbs.clear();
  }

  // ---------- opening ----------

  async function closeDoc(): Promise<void> {
    dropThumbs();
    const o = opened;
    opened = null;
    await o?.close().catch(() => undefined);
  }

  function clearFile(): void {
    void closeDoc();
    file = null;
    bytes = null;
    password = undefined;
    encrypted = 'none';
    pages = [];
    thumbsOn = false;
    list.replaceChildren();
    pwInput.value = '';
    pwInput.type = 'password';
    pwError.textContent = '';
    rangesInput.value = '';
    setFieldError(rangesInput, rangesError, '');
    setFieldError(everyInput, everyError, '');
  }

  function fileError(msg: string): void {
    clearFile();
    setState('empty');
    announce('alert', msg, root);
    input.focus();
  }

  async function openFiles(picked: File[]): Promise<void> {
    const f = picked[0];
    if (!f || state === 'working') return;
    const id = ++runId;
    revokeBlob();
    clearFile();
    clearAlert(root);
    hideEngineError();
    showNotice(picked.length > 1 ? 'PDF 파일은 한 번에 하나만 편집할 수 있어 첫 번째 파일만 열었습니다.' : null);
    track({ e: 'pick', t: 'pdf-split' });
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
  async function openWith(id: number, pw?: string): Promise<void> {
    if (!bytes || !file) return;
    try {
      const { openPdf } = await loadInspect();
      const o = await openPdf(bytes, pw);
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
      password = pw;
      encrypted = pw ? 'user' : (await o.doc.getPermissions().catch(() => null)) !== null ? 'owner' : 'none';
      if (id !== runId) return;
      const count = o.doc.numPages;
      pages = initialState(count);
      thumbsOn = count <= LIMITS[detectDevice()].maxThumbPages;
      showNotice(fileNotice());
      pwInput.value = '';
      pwError.textContent = '';
      infoEl.textContent = `${formatPages(count)} · ${formatSize(file.size)}`;
      setState('ready');
      renderList();
      if (pw) allBtn.focus();
      status(`${file.name}, ${formatPages(count)}. 쪽을 편집하고 저장 방식을 고른 뒤 저장하세요.`);
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

  // ---------- saving ----------

  function requestRun(): void {
    if (state !== 'ready' || !file) return;
    const plan = currentPlan();
    if (!plan.ok) {
      status(plan.why);
      return;
    }
    const soft = softLimitMessage(file.size, pages.length, detectDevice());
    if (soft) {
      confirmText.textContent = soft;
      confirmBox.hidden = false;
      confirmYes.focus();
      status(soft);
      return;
    }
    void run();
  }

  /** One merge-worker run; resolves with the output or rejects with a RunFailure. */
  function ask(w: Worker, req: MergeRequest, transfer: Transferable[], answered: { yes: boolean }): Promise<{ bytes: Uint8Array; report: MergeReport }> {
    return new Promise((resolve, reject) => {
      w.onmessage = (ev: MessageEvent<MergeResponse>) => {
        answered.yes = true;
        const msg = ev.data;
        if (msg.type === 'done') resolve({ bytes: msg.bytes, report: msg.report });
        else if (msg.type === 'error') reject(new RunFailure(msg.code));
      };
      w.onerror = (ev) => {
        ev.preventDefault();
        reject(new RunFailure(answered.yes ? 'unknown' : 'engine'));
      };
      w.postMessage(req, transfer);
    });
  }

  async function run(): Promise<void> {
    if (state !== 'ready' || !file || !bytes) return;
    const plan = currentPlan();
    if (!plan.ok) return;
    confirmBox.hidden = true;
    clearAlert(root);
    const id = ++runId;
    const source = file;
    const input0 = bytes;
    const pw = password;
    const parts = plan.parts;
    const many = parts.length > 1;
    track({ e: 'start', t: 'pdf-split', o: 'save', v: plan.mode });
    setState('working');
    const verb = many ? '나누는 중…' : '저장하는 중…';
    progressBar.max = parts.length;
    progressBar.value = 0;
    progressText.textContent = many ? `${verb} (0/${parts.length})` : verb;
    status(many ? 'PDF를 나누는 중입니다.' : 'PDF를 저장하는 중입니다.');
    cancelBtn.focus();

    const w = createMergeWorker();
    worker = w;
    const answered = { yes: false };
    const names = many ? dedupeNames(parts.map((p) => partName(source.name, p))) : [];
    const zip = many ? new StoredZip() : null;
    let single: Uint8Array | null = null;
    let signed = false;
    try {
      for (const [k, part] of parts.entries()) {
        // pdf-lib takes the buffer it is given (transferred), so each run gets its own copy.
        const buffer = input0.slice().buffer;
        const req: MergeRequest = {
          type: 'merge',
          files: [{ buffer, password: pw, title: '', pages: part.pages, rotate: part.rotate }],
          addFileBookmarks: false,
          detectSignature: k === 0,
        };
        const out = await ask(w, req, [buffer], answered);
        if (id !== runId) return;
        if (k === 0) signed = out.report.signed === true;
        if (zip) zip.add(names[k]!, out.bytes);
        else single = out.bytes;
        progressBar.value = k + 1;
        if (many) progressText.textContent = `${verb} (${k + 1}/${parts.length})`;
      }
      const blob = zip ? await zip.finish() : new Blob([single as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
      if (id !== runId) return;
      stopWorker();
      finish(blob, plan.mode, parts, signed, source);
    } catch (err) {
      if (id !== runId) return;
      stopWorker();
      const code: WorkerErrorCode = err instanceof RunFailure ? err.code : isOutOfMemory(err) ? 'oom' : 'unknown';
      if (code === 'engine') {
        usageFail('engine', 'process');
        setState('ready');
        void showEngineError();
        return;
      }
      usageFail(code, code === 'verify' ? 'save' : 'process');
      setState('ready');
      announce('alert', code === 'corrupt' || code === 'oom' ? MESSAGES[code] : MESSAGES.unknown, root);
      runBtn.focus();
    }
  }

  function cancel(): void {
    if (state !== 'working') return;
    runId++;
    stopWorker();
    setState('ready');
    runBtn.focus();
    status('저장을 취소했습니다. 편집한 내용은 그대로 있습니다.');
  }

  function finish(out: Blob, m: SaveMode, parts: PartPlan[], signed: boolean, source: File): void {
    revokeBlob();
    blobUrl = URL.createObjectURL(out);
    track({ e: 'success', t: 'pdf-split' });
    download.href = blobUrl;
    const many = parts.length > 1;
    const n = parts.length.toLocaleString('ko-KR');
    const pageTotal = parts.reduce((a, p) => a + p.pages.length, 0);
    download.download = many ? splitZipName(source.name) : m === 'edit' ? editName(source.name) : m === 'extract' ? extractName(source.name) : partName(source.name, parts[0]!);
    headline.textContent = many ? `PDF ${n}개가 ZIP 파일로 준비되었습니다` : 'PDF가 준비되었습니다';
    summary.textContent = many ? `PDF ${n}개 · ZIP · ${formatSize(out.size)}` : `${formatPages(pageTotal)} · ${formatSize(out.size)}`;
    const lines = [...(signed ? [SIGNATURE_NOTE] : []), ...(encrypted === 'user' ? [NO_PASSWORD_NOTE] : [])];
    notes.replaceChildren(...lines.map((t) => el('li', undefined, t)));
    notes.hidden = !lines.length;
    saveName.textContent = `저장될 이름: ${download.download}`;
    setState('done');
    result.scrollIntoView({ block: 'start' });
    headline.focus({ preventScroll: true });
    status(`${headline.textContent}. ${summary.textContent}.${lines.length ? ` ${lines.join(' ')}` : ''}`);
  }

  function again(): void {
    if (state !== 'done') return;
    revokeBlob();
    setState('ready');
    renderList();
    runBtn.focus();
  }

  function resetAll(focus = true): void {
    runId++;
    stopWorker();
    revokeBlob();
    clearFile();
    input.value = '';
    showNotice(null);
    clearAlert(root);
    hideEngineError();
    notes.replaceChildren();
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
  bindPasswordToggle(must<HTMLButtonElement>('ps-pw-toggle'), pwInput);

  allBtn.addEventListener('click', () => {
    const kept = keptPages(pages);
    const on = !kept.every((p) => p.selected);
    for (const p of kept) p.selected = on;
    renderList();
    status(on ? `${formatPages(kept.length)}을 모두 골랐습니다.` : '고른 쪽을 모두 해제했습니다.');
  });
  rotateSel.addEventListener('click', () => rotate(keptPages(pages).filter((p) => p.selected)));
  removeSel.addEventListener('click', () => setRemoved(keptPages(pages).filter((p) => p.selected), true));
  for (const r of modeRadios) r.addEventListener('change', updateRun);
  rangesInput.addEventListener('input', updateRun);
  everyInput.addEventListener('input', updateRun);
  everyInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      requestRun();
    }
  });
  runBtn.addEventListener('click', requestRun);
  confirmYes.addEventListener('click', () => void run());
  confirmNo.addEventListener('click', () => {
    confirmBox.hidden = true;
    runBtn.focus();
  });
  changeBtn.addEventListener('click', () => resetAll());
  cancelBtn.addEventListener('click', cancel);
  againBtn.addEventListener('click', again);
  resetBtn.addEventListener('click', () => resetAll());
  window.addEventListener('pagehide', () => {
    runId++;
    stopWorker();
    revokeBlob();
  });
  window.addEventListener('pageshow', (ev) => {
    // Coming back from the bfcache: the blob URL was revoked and any run stopped on pagehide.
    if (ev.persisted && (state === 'done' || state === 'working')) resetAll(false);
  });
  download.addEventListener('click', () => track({ e: 'download', t: 'pdf-split' }));

  setState('empty');
  // A file picked or dropped while this module loaded.
  const first = pending ?? Array.from(input.files ?? []);
  input.value = '';
  if (first.length) void openFiles(first);
  return { open: (files) => void openFiles(files) };
}
