// PDF 서명·도장 넣기 UI controller (TOOLS5 U3). States: empty → opening → locked → ready → working → done.
// Loaded by entry.ts on the first interaction (or at once with a picture from /stamp-signature/). pdf.js
// (src/lib/pdf/inspect.ts) opens the PDF and draws the page being placed on; the picture is decoded here and re-encoded
// as a PNG (long edge at most IMAGE_EDGE); saving sends the PDF, the PNG and the drawImage arguments to the PDF 합치기
// worker (`sign`). Placement maths live in place.ts.
import type { PdfErrorCode, WorkerErrorCode } from '../../lib/pdf/errors';
import type { OpenedPdf } from '../../lib/pdf/inspect';
import type { MergeRequest, MergeResponse } from '../../lib/pdf/merge.worker';
import type { PageRangeError } from '../../lib/pdf/page-range';
import { decodeImage } from '../../lib/image/decode';
import { ERRORS, photoErrorCode } from '../../lib/image/messages';
import { HEAD_BYTES, TAIL_BYTES, sniffImage, type ImageFormat } from '../../lib/image/sniff';
import { isOutOfMemory } from '../../lib/pdf/errors';
import { announce, clearAlert } from '../../lib/ui/announce';
import { detectDevice } from '../../lib/ui/device';
import { hideEngineError, showEngineError } from '../../lib/ui/engine-error';
import { isEngineLoadFailure, withEngineRetry } from '../../lib/ui/engine-load';
import { loadDynamicFont } from '../../lib/ui/font';
import { formatPages, formatSize } from '../../lib/ui/format';
import { bindPasswordToggle } from '../../lib/ui/password';
import { isPdfFile } from '../../lib/ui/pdf-pick';
import { takeSignPng } from '../../lib/ui/sign-handoff';
import { track, type UsagePhase } from '../../lib/ui/usage';
import { IMAGE_EDGE, fileLimitMessage, imageLimitMessage } from './limits';
import {
  WHERE,
  clampBox,
  moveBox,
  pagesOf,
  placeValue,
  reshapeBox,
  resizeBox,
  showsOn,
  signName,
  stampsFor,
  startBox,
  type Box,
  type PageInfo,
  type Placement,
  type Where,
} from './place';

type State = 'empty' | 'opening' | 'locked' | 'ready' | 'working' | 'done';

const MESSAGES = {
  'not-pdf': 'PDF 파일이 아닙니다. PDF 파일을 골라 주세요.',
  password: '이 파일은 비밀번호로 보호되어 있습니다. 비밀번호를 입력해 주세요.',
  'wrong-password': '비밀번호가 맞지 않습니다. 다시 입력해 주세요.',
  corrupt: '파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아 주세요.',
  oom: '이 기기에서 한 번에 처리할 수 있는 양을 넘었습니다. 더 작은 파일로 시도하거나 PC에서 다시 시도해 주세요.',
  unknown: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
  /** The stored picture from /stamp-signature/ could not be read. */
  'no-image': '가져온 그림을 읽지 못했습니다. 그림을 다시 골라 주세요.',
} as const;

const RANGE_MESSAGES: Record<PageRangeError, (pages: number) => string> = {
  empty: () => '넣을 쪽을 「1-3, 5」처럼 입력해 주세요.',
  'out-of-range': (n) => `이 PDF는 ${formatPages(n)}까지입니다. 1부터 ${n.toLocaleString('ko-KR')} 사이의 쪽 번호를 입력해 주세요.`,
  reversed: () => '쪽 범위는 작은 번호부터 「3-5」처럼 입력해 주세요.',
  junk: () => '쪽 번호는 「1-3」이나 「1-3, 5」처럼 숫자, 「-」, 쉼표로 입력해 주세요.',
};

const OWNER_NOTE = '보안 설정(편집 제한)이 해제된 사본이 만들어집니다.';
const MULTI_NOTE = 'PDF 파일은 한 번에 하나만 쓸 수 있어 첫 번째 파일만 열었습니다.';
const SIGNATURE_NOTE = '전자서명이 들어 있는 문서입니다. 그림을 넣어 새로 저장하면 전자서명이 더 이상 유효하지 않습니다. 발급받은 증명서는 원본을 제출하세요.';
const ARRIVED_NOTE = '전자서명·도장 이미지 만들기에서 만든 그림을 가져왔습니다. 이제 PDF 파일을 고르세요.';
const IMAGE_FORMATS: readonly ImageFormat[] = ['png', 'jpeg', 'webp', 'heic'];
/** Arrow keys move the picture this many points (Shift: SHIFT_STEP). */
const STEP = 1;
const SHIFT_STEP = 10;
/** The page preview is at most this tall, as a share of the window height. */
const MAX_STAGE_HEIGHT = 0.8;
const MIN_SIZE_PCT = 3;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

const loadInspect = () => withEngineRetry(() => import('../../lib/pdf/inspect'));
const createMergeWorker = (): Worker => new Worker(new URL('../../lib/pdf/merge.worker.ts', import.meta.url), { type: 'module' });
/** createImageBitmap's resize needs OffscreenCanvas when the browser ignores it (decode.ts); without it, full size. */
const canShrinkOnDecode = (): boolean => typeof OffscreenCanvas !== 'undefined';

/** A failed worker run: `engine` when the worker script never answered. */
class RunFailure extends Error {
  constructor(readonly code: WorkerErrorCode) {
    super(code);
  }
}

/** A picture that cannot be used, with its usage fail code. */
class ImageFailure extends Error {
  constructor(
    readonly code: 'heic' | 'not-image' | 'corrupt' | 'too-big' | 'oom' | 'canvas',
    message: string,
  ) {
    super(message);
  }
}

/** The signature picture as a PNG at most IMAGE_EDGE on its long edge (EXIF orientation applied, sRGB). */
async function toPng(file: Blob): Promise<{ png: Blob; width: number; height: number }> {
  const tooBig = imageLimitMessage(file.size, detectDevice());
  if (tooBig) throw new ImageFailure('too-big', tooBig);
  if (file.size === 0) throw new ImageFailure('corrupt', ERRORS.empty);
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - TAIL_BYTES)).arrayBuffer());
  const sniff = sniffImage(head, { tail, size: file.size });
  if (!IMAGE_FORMATS.includes(sniff.format)) throw new ImageFailure('not-image', ERRORS['not-image']);
  if (sniff.truncated) throw new ImageFailure('corrupt', ERRORS.truncated);
  let d: Awaited<ReturnType<typeof decodeImage>>;
  try {
    d = await decodeImage(file, sniff, { maxLongEdge: canShrinkOnDecode() ? IMAGE_EDGE : null });
  } catch (err) {
    const code = photoErrorCode(err);
    if (code === 'heic') throw new ImageFailure('heic', ERRORS.heic);
    if (code === 'oom') throw new ImageFailure('oom', ERRORS.oom);
    throw new ImageFailure('corrupt', ERRORS.corrupt);
  }
  const s = Math.min(1, IMAGE_EDGE / Math.max(d.width, d.height));
  const c = el('canvas');
  c.width = Math.max(1, Math.round(d.width * s));
  c.height = Math.max(1, Math.round(d.height * s));
  try {
    const g = c.getContext('2d');
    if (!g) throw new ImageFailure('canvas', ERRORS.oom);
    g.drawImage(d.src, 0, 0, c.width, c.height);
    const png = await new Promise<Blob | null>((resolve) => {
      try {
        c.toBlob(resolve, 'image/png');
      } catch {
        resolve(null);
      }
    });
    if (!png) throw new ImageFailure('canvas', ERRORS.oom);
    return { png, width: c.width, height: c.height };
  } finally {
    d.close();
    c.width = 0;
    c.height = 0;
  }
}

export function initPdfSign(pending?: File[]): { open(files: File[]): Promise<void> } | null {
  const found = document.getElementById('sg-tool');
  if (!found) return null;
  const root: HTMLElement = found;

  const input = must<HTMLInputElement>('sg-input');
  const drop = must<HTMLDivElement>('sg-drop');
  const notice = must<HTMLParagraphElement>('sg-notice');
  const card = must<HTMLDivElement>('sg-file');
  const nameEl = must<HTMLParagraphElement>('sg-name');
  const infoEl = must<HTMLParagraphElement>('sg-info');
  const pwForm = must<HTMLFormElement>('sg-pw');
  const pwInput = must<HTMLInputElement>('sg-pw-input');
  const pwError = must<HTMLParagraphElement>('sg-pw-error');
  const imageBox = must<HTMLDivElement>('sg-image');
  const imageInput = must<HTMLInputElement>('sg-image-input');
  const imageThumb = must<HTMLSpanElement>('sg-image-thumb');
  const imageName = must<HTMLParagraphElement>('sg-image-name');
  const imageInfo = must<HTMLParagraphElement>('sg-image-info');
  const imagePick = must<HTMLLabelElement>('sg-image-pick');
  const editor = must<HTMLDivElement>('sg-editor');
  const prevBtn = must<HTMLButtonElement>('sg-prev');
  const nextBtn = must<HTMLButtonElement>('sg-next');
  const gotoInput = must<HTMLInputElement>('sg-goto');
  const pageCountEl = must<HTMLSpanElement>('sg-page-count');
  const stage = must<HTMLDivElement>('sg-stage');
  const addBtn = must<HTMLButtonElement>('sg-add');
  const controls = must<HTMLDivElement>('sg-controls');
  const sizeInput = must<HTMLInputElement>('sg-size');
  const sizeOut = must<HTMLOutputElement>('sg-size-out');
  const rangeBox = must<HTMLDivElement>('sg-range-box');
  const rangeInput = must<HTMLInputElement>('sg-range');
  const rangeError = must<HTMLParagraphElement>('sg-range-error');
  const removeBtn = must<HTMLButtonElement>('sg-remove');
  const hint = must<HTMLParagraphElement>('sg-hint');
  const actions = must<HTMLDivElement>('sg-actions');
  const runBtn = must<HTMLButtonElement>('sg-run');
  const changeBtn = must<HTMLButtonElement>('sg-change');
  const progressBox = must<HTMLDivElement>('sg-progress');
  const cancelBtn = must<HTMLButtonElement>('sg-cancel');
  const result = must<HTMLDivElement>('sg-result');
  const headline = must<HTMLParagraphElement>('sg-headline');
  const summary = must<HTMLParagraphElement>('sg-summary');
  const notes = must<HTMLUListElement>('sg-notes');
  const download = must<HTMLAnchorElement>('sg-download');
  const againBtn = must<HTMLButtonElement>('sg-again');
  const resetBtn = must<HTMLButtonElement>('sg-reset');
  const saveName = must<HTMLParagraphElement>('sg-save-name');
  const whereRadios = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="sg-where"]'));

  let state: State = 'empty';
  let file: File | null = null;
  let bytes: Uint8Array | null = null;
  let opened: OpenedPdf | null = null;
  /** The open password, in memory only while this file is open. */
  let password: string | undefined;
  let encrypted: 'none' | 'owner' | 'user' = 'none';
  let pageCount = 0;
  // Incremented by every open, run, cancel and reset; work that finds a newer id stops.
  let runId = 0;
  let worker: Worker | null = null;
  let unlocking = false;
  let blobUrl: string | null = null;
  let multiNote = false;

  /** The signature picture (kept across PDFs until another is picked). */
  let image: { png: Blob; url: string; width: number; height: number } | null = null;
  let imageRun = 0;

  let placements: Placement[] = [];
  let selected: number | null = null;
  let nextId = 1;
  /** 0-based page shown in the editor. */
  let cur = 0;
  /** Page geometry by page (pdf.js viewport at scale 1); dropped with the document. */
  const infos = new Map<number, PageInfo>();
  /** CSS pixels per point of the page shown. */
  let scale = 1;
  let renderId = 0;
  let pageCanvas: HTMLCanvasElement | null = null;

  const status = (msg: string): void => announce('status', msg, root);
  const usageFail = (c: string, p: UsagePhase): void => track({ e: 'fail', t: 'pdf-sign', c, p });
  const sel = (): Placement | undefined => placements.find((p) => p.id === selected);
  const curInfo = (): PageInfo | undefined => infos.get(cur);

  const showNotice = (msg: string | null): void => {
    notice.hidden = !msg;
    notice.textContent = msg ?? '';
  };
  const fileNotice = (): string | null => [multiNote ? MULTI_NOTE : null, encrypted === 'owner' ? OWNER_NOTE : null].filter(Boolean).join(' ') || null;

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
    if (busy) document.body.dataset.busy = 'pdf-sign';
    else delete document.body.dataset.busy;
    drop.hidden = next !== 'empty';
    card.hidden = next === 'empty' || next === 'done';
    pwForm.hidden = next !== 'locked';
    imageBox.hidden = next !== 'ready';
    editor.hidden = next !== 'ready';
    actions.hidden = next === 'empty' || busy || next === 'done';
    runBtn.hidden = next !== 'ready';
    hint.hidden = next !== 'ready';
    progressBox.hidden = !busy;
    result.hidden = next !== 'done';
    updateUi();
  }

  // ---------- the plan ----------

  /** Why saving cannot start yet, or null. */
  function blocker(): string | null {
    if (!image) return '서명·도장 그림을 골라 주세요.';
    if (!placements.length) return '「그림 하나 더 넣기」로 그림을 넣을 자리를 정해 주세요.';
    for (const p of placements) {
      const r = pagesOf(p, pageCount);
      if (!r.ok) return `쪽 범위: ${RANGE_MESSAGES[r.error](pageCount)}`;
    }
    return null;
  }

  function updateUi(): void {
    if (state !== 'ready') return;
    const why = blocker();
    runBtn.disabled = why !== null;
    const planned = placements.map((p) => pagesOf(p, pageCount)).flatMap((r) => (r.ok ? [r.pages] : []));
    const stamps = planned.reduce((a, pages) => a + pages.length, 0);
    hint.textContent = why ?? `${formatPages(new Set(planned.flat()).size)}에 그림 ${stamps.toLocaleString('ko-KR')}개를 넣어 저장합니다.`;
    addBtn.disabled = !image;
    addBtn.textContent = placements.some((p) => showsOn(p, cur, pageCount)) ? '그림 하나 더 넣기' : '이 쪽에 그림 넣기';
    prevBtn.disabled = cur <= 0;
    nextBtn.disabled = cur >= pageCount - 1;
    if (document.activeElement !== gotoInput) gotoInput.value = String(cur + 1);
    pageCountEl.textContent = ` / ${formatPages(pageCount)}`;
    gotoInput.setAttribute('aria-label', `보는 쪽, 전체 ${formatPages(pageCount)}`);
    updateControls();
  }

  /** The controls of the chosen picture: size, 넣을 쪽, its range. */
  function updateControls(): void {
    const p = sel();
    const info = curInfo();
    controls.hidden = !p || !info;
    if (!p || !info) return;
    const pct = Math.round((clampBox(p.box, info.width, info.height).w / info.width) * 100);
    sizeInput.value = String(pct);
    sizeOut.value = `쪽 너비의 ${pct}%`;
    sizeInput.setAttribute('aria-valuetext', sizeOut.value);
    for (const r of whereRadios) r.checked = r.value === p.where;
    rangeBox.hidden = p.where !== 'range';
    if (document.activeElement !== rangeInput) rangeInput.value = p.range;
    const r = pagesOf(p, pageCount);
    setFieldError(rangeInput, rangeError, p.where === 'range' && !r.ok && p.range.trim() ? RANGE_MESSAGES[r.error](pageCount) : '');
  }

  // ---------- the page preview ----------

  async function pageInfo(index: number): Promise<PageInfo> {
    const known = infos.get(index);
    if (known) return known;
    const doc = opened?.doc;
    if (!doc) throw new Error('no document');
    const page = await doc.getPage(index + 1);
    const vp = page.getViewport({ scale: 1 });
    const info: PageInfo = { width: vp.width, height: vp.height, rotate: page.rotate, toPdf: (x, y) => vp.convertToPdfPoint(x, y) };
    infos.set(index, info);
    return info;
  }

  async function showPage(index: number): Promise<void> {
    const doc = opened?.doc;
    if (!doc) return;
    cur = Math.max(0, Math.min(pageCount - 1, index));
    const id = ++renderId;
    updateUi();
    try {
      const info = await pageInfo(cur);
      const page = await doc.getPage(cur + 1);
      if (id !== renderId) return;
      const avail = stage.clientWidth || stage.parentElement?.clientWidth || 320;
      const maxH = Math.max(320, window.innerHeight * MAX_STAGE_HEIGHT);
      scale = Math.min(avail / info.width, maxH / info.height);
      const cssW = Math.round(info.width * scale);
      const cssH = Math.round(info.height * scale);
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale: scale * dpr });
      const canvas = el('canvas', 'sign-page');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `${formatPages(cur + 1)} 미리보기`);
      await page.render({ canvas, viewport }).promise;
      page.cleanup();
      if (id !== renderId) {
        canvas.width = 0;
        return;
      }
      if (pageCanvas) pageCanvas.width = 0;
      pageCanvas = canvas;
      stage.style.width = `${cssW}px`;
      stage.style.height = `${cssH}px`;
      drawBoxes();
      updateUi();
    } catch {
      // A page that cannot be drawn still takes placements by its size; the stage stays empty.
      if (id === renderId) drawBoxes();
    }
  }

  function boxStyle(b: HTMLElement, box: Box): void {
    b.style.left = `${box.x * scale}px`;
    b.style.top = `${box.y * scale}px`;
    b.style.width = `${box.w * scale}px`;
    b.style.height = `${box.h * scale}px`;
  }

  function drawBoxes(focusId?: number): void {
    // Replacing the boxes keeps keyboard focus on the same picture.
    const active = document.activeElement as HTMLElement | null;
    const keep = focusId ?? (active && stage.contains(active) && active.dataset.id ? Number(active.dataset.id) : undefined);
    const info = curInfo();
    const items: HTMLElement[] = pageCanvas ? [pageCanvas] : [];
    if (info && image) {
      let k = 0;
      for (const p of placements) {
        if (!showsOn(p, cur, pageCount)) continue;
        k++;
        // Display only: a smaller page shows the shared box clamped, without changing it for the other pages.
        items.push(boxButton(p, k, clampBox(p.box, info.width, info.height)));
      }
    }
    stage.replaceChildren(...items);
    if (keep !== undefined) stage.querySelector<HTMLElement>(`[data-id="${keep}"]`)?.focus({ preventScroll: focusId === undefined });
  }

  function boxButton(p: Placement, k: number, shown: Box): HTMLButtonElement {
    const b = el('button', p.id === selected ? 'sign-box selected' : 'sign-box');
    b.type = 'button';
    b.dataset.id = String(p.id);
    b.setAttribute('aria-label', `그림 ${k}, ${formatPages(cur + 1)}`);
    b.setAttribute('aria-pressed', String(p.id === selected));
    b.setAttribute('aria-describedby', 'sg-stage-hint');
    const img = el('img');
    img.src = image!.url;
    img.alt = '';
    img.draggable = false;
    const handle = el('span', 'sign-handle');
    handle.setAttribute('aria-hidden', 'true');
    b.append(img, handle);
    boxStyle(b, shown);
    b.addEventListener('pointerdown', (ev) => beginDrag(ev, b, p, ev.target === handle));
    b.addEventListener('keydown', (ev) => onBoxKey(ev, p));
    b.addEventListener('click', () => choose(p.id));
    return b;
  }

  function choose(id: number | null): void {
    if (selected === id) return;
    selected = id;
    for (const b of stage.querySelectorAll<HTMLElement>('.sign-box')) {
      const on = b.dataset.id === String(id);
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', String(on));
    }
    updateControls();
  }

  /** Writes a placement's new box (kept inside the page shown) and moves its element. */
  function setBox(p: Placement, box: Box): void {
    const info = curInfo();
    if (!info) return;
    p.box = clampBox(box, info.width, info.height);
    const b = stage.querySelector<HTMLElement>(`.sign-box[data-id="${p.id}"]`);
    if (b) boxStyle(b, p.box);
  }

  function beginDrag(ev: PointerEvent, b: HTMLElement, p: Placement, resizing: boolean): void {
    const info = curInfo();
    if (state !== 'ready' || ev.button > 0 || !info) return;
    ev.preventDefault();
    choose(p.id);
    b.focus({ preventScroll: true });
    // From the box as shown on this page (a shared box may be clamped here).
    const start = clampBox(p.box, info.width, info.height);
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    let moved = false;
    try {
      b.setPointerCapture(ev.pointerId);
    } catch {
      // Capture is a nicety; moves still arrive while the pointer stays over the box.
    }
    const onMove = (e: PointerEvent): void => {
      const dx = (e.clientX - x0) / scale;
      const dy = (e.clientY - y0) / scale;
      if (!moved && Math.hypot(dx, dy) * scale < 2) return;
      moved = true;
      setBox(p, resizing ? resizeBox(start, start.w + dx, info.width, info.height) : moveBox(start, dx, dy, info.width, info.height));
    };
    const onEnd = (): void => {
      b.removeEventListener('pointermove', onMove);
      b.removeEventListener('pointerup', onEnd);
      b.removeEventListener('pointercancel', onEnd);
      if (!moved) return;
      updateControls();
      status(resizing ? `그림 크기를 ${sizeOut.value}로 바꿨습니다.` : '그림을 옮겼습니다.');
    };
    b.addEventListener('pointermove', onMove);
    b.addEventListener('pointerup', onEnd);
    b.addEventListener('pointercancel', onEnd);
  }

  function onBoxKey(ev: KeyboardEvent, p: Placement): void {
    const info = curInfo();
    if (state !== 'ready' || !info) return;
    const step = ev.shiftKey ? SHIFT_STEP : STEP;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = d[ev.key];
    if (move) {
      ev.preventDefault();
      choose(p.id);
      // From the box as shown on this page (as the drag), so the first press moves visibly on a smaller page.
      setBox(p, moveBox(clampBox(p.box, info.width, info.height), move[0], move[1], info.width, info.height));
      return;
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      choose(p.id);
      removeSelected();
    }
  }

  function addPlacement(): void {
    const info = curInfo();
    if (state !== 'ready' || !image || !info) return;
    let box = startBox(image.width, image.height, info.width, info.height);
    // A second picture on the same page starts a little up and left of the first, not on top of it.
    const here = placements.filter((p) => showsOn(p, cur, pageCount)).length;
    if (here) box = moveBox(box, -24 * here, -24 * here, info.width, info.height);
    const p: Placement = { id: nextId++, box, where: 'one', page: cur, range: '' };
    placements.push(p);
    selected = p.id;
    drawBoxes(p.id);
    updateUi();
    status(`${formatPages(cur + 1)} 오른쪽 아래에 그림을 놓았습니다. 끌거나 화살표 키로 옮기세요.`);
  }

  function removeSelected(): void {
    const p = sel();
    if (!p || state !== 'ready') return;
    placements = placements.filter((x) => x !== p);
    selected = null;
    drawBoxes();
    updateUi();
    addBtn.focus();
    status('그림을 뺐습니다.');
  }

  function setWhere(w: Where): void {
    const p = sel();
    if (!p) return;
    p.where = w;
    // The picture stays on the page being looked at (an unfinished range shows it there too).
    p.page = cur;
    if (w === 'range' && !p.range.trim()) p.range = String(cur + 1);
    drawBoxes();
    updateUi();
    if (w === 'range') {
      rangeInput.focus();
      // WebKit focuses a clicked label's radio after its change event (GTK/WPE make radios mouse-focusable), which
      // takes focus back from the field; hand it over again once that default action is done.
      setTimeout(() => {
        if (!rangeBox.hidden && whereRadios.includes(document.activeElement as HTMLInputElement)) rangeInput.focus();
      }, 0);
    }
  }

  // ---------- the picture ----------

  function showImage(): void {
    imageThumb.replaceChildren();
    if (!image) {
      imageName.textContent = '서명·도장 그림';
      imageInfo.textContent = '배경이 투명한 PNG가 좋습니다.';
      imagePick.textContent = '그림 고르기';
      return;
    }
    const img = el('img');
    img.src = image.url;
    img.alt = '';
    imageThumb.append(img);
    imagePick.textContent = '그림 바꾸기';
  }

  function dropImage(): void {
    if (image) URL.revokeObjectURL(image.url);
    image = null;
  }

  async function useImage(picked: Blob, label: string, fromStamp: boolean): Promise<boolean> {
    const id = ++imageRun;
    const before = imageInfo.textContent;
    clearAlert(root);
    imageInfo.textContent = '그림을 여는 중…';
    try {
      const out = await toPng(picked);
      if (id !== imageRun) return false;
      dropImage();
      image = { png: out.png, url: URL.createObjectURL(out.png), width: out.width, height: out.height };
      imageName.textContent = label;
      imageInfo.textContent = fromStamp ? '전자서명·도장 이미지 만들기에서 가져온 그림' : `${out.width.toLocaleString('ko-KR')}×${out.height.toLocaleString('ko-KR')}픽셀`;
      showImage();
      const info = curInfo();
      // Same width and corner; each page clamps it when shown and when saved.
      for (const p of placements) p.box = reshapeBox(p.box, out.width, out.height);
      if (state === 'ready') {
        if (!placements.length) addPlacement();
        else {
          drawBoxes();
          updateUi();
          status('그림을 바꿨습니다.');
        }
      }
      return true;
    } catch (err) {
      if (id !== imageRun) return false;
      const f = err instanceof ImageFailure ? err : new ImageFailure(isOutOfMemory(err) ? 'oom' : 'corrupt', isOutOfMemory(err) ? ERRORS.oom : ERRORS.corrupt);
      usageFail(f.code, 'parse');
      imageInfo.textContent = before;
      announce('alert', f.message, root);
      return false;
    }
  }

  // ---------- opening ----------

  async function closeDoc(): Promise<void> {
    renderId++;
    infos.clear();
    if (pageCanvas) pageCanvas.width = 0;
    pageCanvas = null;
    stage.replaceChildren();
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
    pageCount = 0;
    placements = [];
    selected = null;
    cur = 0;
    multiNote = false;
    pwInput.value = '';
    pwInput.type = 'password';
    pwError.textContent = '';
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
    multiNote = picked.length > 1;
    showNotice(fileNotice());
    track({ e: 'pick', t: 'pdf-sign' });
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
      pageCount = o.doc.numPages;
      showNotice(fileNotice());
      pwInput.value = '';
      pwError.textContent = '';
      infoEl.textContent = `${formatPages(pageCount)} · ${formatSize(file.size)}`;
      setState('ready');
      await pageInfo(0).catch(() => undefined);
      if (id !== runId) return;
      if (image && !placements.length) addPlacement();
      await showPage(0);
      if (id !== runId) return;
      if (image) {
        stage.querySelector<HTMLElement>('.sign-box')?.focus({ preventScroll: true });
        status(`${file.name}, ${formatPages(pageCount)}. 1쪽 오른쪽 아래에 그림을 놓았습니다. 끌거나 화살표 키로 옮긴 뒤 저장하세요.`);
      } else {
        imagePick.focus();
        status(`${file.name}, ${formatPages(pageCount)}. 서명·도장 그림을 고르세요.`);
      }
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

  async function run(): Promise<void> {
    if (state !== 'ready' || !file || !bytes || !image) return;
    const why = blocker();
    if (why) {
      status(why);
      return;
    }
    clearAlert(root);
    const id = ++runId;
    const source = file;
    const pw = password;
    const png = image.png;
    track({ e: 'start', t: 'pdf-sign', o: 'place', v: placeValue(placements) });
    setState('working');
    status('서명을 넣어 저장하는 중입니다.');
    cancelBtn.focus();
    try {
      const plan = await stampsFor(placements, pageCount, pageInfo);
      if (id !== runId) return;
      if (!plan.ok) throw new Error('range');
      // pdf-lib takes the buffer it is given (transferred), so it gets a copy.
      const buffer = bytes.slice().buffer;
      const pngBuffer = await png.arrayBuffer();
      if (id !== runId) return;
      const w = createMergeWorker();
      worker = w;
      let answered = false;
      const out = await new Promise<{ bytes: Uint8Array; signed: boolean }>((resolve, reject) => {
        w.onmessage = (ev: MessageEvent<MergeResponse>) => {
          answered = true;
          const msg = ev.data;
          if (msg.type === 'signed') resolve({ bytes: msg.bytes, signed: msg.signed });
          else if (msg.type === 'error') reject(new RunFailure(msg.code));
        };
        w.onerror = (ev) => {
          ev.preventDefault();
          reject(new RunFailure(answered ? 'unknown' : 'engine'));
        };
        const req: MergeRequest = { type: 'sign', buffer, password: pw, png: pngBuffer, stamps: plan.stamps };
        w.postMessage(req, [buffer, pngBuffer]);
      });
      if (id !== runId) return;
      stopWorker();
      finish(new Blob([out.bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), new Set(plan.stamps.map((s) => s.page)).size, out.signed, source);
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
      drawBoxes();
      announce('alert', code === 'corrupt' || code === 'oom' ? MESSAGES[code] : MESSAGES.unknown, root);
      runBtn.focus();
    }
  }

  function cancel(): void {
    if (state !== 'working') return;
    runId++;
    stopWorker();
    setState('ready');
    drawBoxes();
    runBtn.focus();
    status('저장을 취소했습니다. 놓은 그림은 그대로 있습니다.');
  }

  function finish(out: Blob, pages: number, signed: boolean, source: File): void {
    revokeBlob();
    blobUrl = URL.createObjectURL(out);
    track({ e: 'success', t: 'pdf-sign' });
    download.href = blobUrl;
    download.download = signName(source.name);
    headline.textContent = 'PDF가 준비되었습니다';
    summary.textContent = `${formatPages(pages)}에 그림을 넣었습니다 · ${formatSize(out.size)}`;
    const lines: (string | HTMLLIElement)[] = signed ? [SIGNATURE_NOTE] : [];
    if (encrypted === 'user') {
      const li = el('li', undefined, '암호 없이 저장했습니다. 다시 걸려면 ');
      const a = el('a', undefined, 'PDF 암호 해제·설정');
      a.href = '/pdf-password/';
      li.append(a, '을 쓰세요.');
      lines.push(li);
    }
    notes.replaceChildren(...lines.map((t) => (typeof t === 'string' ? el('li', undefined, t) : t)));
    notes.hidden = !lines.length;
    saveName.textContent = `저장될 이름: ${download.download}`;
    setState('done');
    result.scrollIntoView({ block: 'start' });
    headline.focus({ preventScroll: true });
    status(`${headline.textContent}. ${summary.textContent}.${notes.textContent ? ` ${Array.from(notes.children, (li) => li.textContent).join(' ')}` : ''}`);
  }

  function again(): void {
    if (state !== 'done') return;
    revokeBlob();
    setState('ready');
    void showPage(cur);
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
    const files = Array.from(ev.dataTransfer?.files ?? []);
    // A picture dropped while a PDF is open is the signature; anything else opens as the PDF.
    if (state === 'ready' && files[0] && !/pdf$/i.test(files[0].type || files[0].name)) void useImage(files[0], files[0].name, false);
    else void openFiles(files);
  });
  pwForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    unlock();
  });
  bindPasswordToggle(must<HTMLButtonElement>('sg-pw-toggle'), pwInput);

  imageInput.addEventListener('change', () => {
    const f = imageInput.files?.[0];
    imageInput.value = '';
    if (f) void useImage(f, f.name, false);
  });
  prevBtn.addEventListener('click', () => void showPage(cur - 1));
  nextBtn.addEventListener('click', () => void showPage(cur + 1));
  const goto = (): void => {
    const n = Number.parseInt(gotoInput.value.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(n)) void showPage(n - 1);
    else gotoInput.value = String(cur + 1);
  };
  gotoInput.addEventListener('change', goto);
  gotoInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      goto();
    }
  });
  addBtn.addEventListener('click', addPlacement);
  removeBtn.addEventListener('click', removeSelected);
  sizeInput.addEventListener('input', () => {
    const p = sel();
    const info = curInfo();
    if (!p || !info) return;
    const pct = Math.max(MIN_SIZE_PCT, Number(sizeInput.value) || MIN_SIZE_PCT);
    setBox(p, resizeBox(clampBox(p.box, info.width, info.height), (pct / 100) * info.width, info.width, info.height));
    const now = Math.round((p.box.w / info.width) * 100);
    sizeOut.value = `쪽 너비의 ${now}%`;
    sizeInput.setAttribute('aria-valuetext', sizeOut.value);
  });
  for (const r of whereRadios) r.addEventListener('change', () => r.checked && WHERE.includes(r.value as Where) && setWhere(r.value as Where));
  rangeInput.addEventListener('input', () => {
    const p = sel();
    if (!p) return;
    p.range = rangeInput.value;
    drawBoxes();
    updateUi();
  });
  runBtn.addEventListener('click', () => void run());
  changeBtn.addEventListener('click', () => resetAll());
  cancelBtn.addEventListener('click', cancel);
  againBtn.addEventListener('click', again);
  resetBtn.addEventListener('click', () => resetAll());
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state === 'ready') void showPage(cur);
    }, 150);
  });
  window.addEventListener('pagehide', () => {
    runId++;
    stopWorker();
    revokeBlob();
  });
  window.addEventListener('pageshow', (ev) => {
    // Coming back from the bfcache: the blob URL was revoked and any run stopped on pagehide.
    if (ev.persisted && (state === 'done' || state === 'working')) resetAll(false);
  });
  download.addEventListener('click', () => track({ e: 'download', t: 'pdf-sign' }));

  setState('empty');
  // A picture handed over by /stamp-signature/ (read once, removed).
  const handed = takeSignPng();
  if (handed === 'invalid') {
    usageFail('no-image', 'parse');
    announce('alert', MESSAGES['no-image'], root);
  } else if (handed) {
    void useImage(handed, '서명·도장 그림', true).then((ok) => {
      if (ok && state === 'empty') {
        showNotice(ARRIVED_NOTE);
        status(ARRIVED_NOTE);
      }
    });
  }
  // A file picked or dropped while this module loaded.
  const first = pending ?? Array.from(input.files ?? []);
  input.value = '';
  if (first.length) void openFiles(first);
  return { open: (files) => openFiles(files) };
}
