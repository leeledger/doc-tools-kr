// 신분증 사본 만들기 UI controller (TOOLS1015 I1). States: empty → opening → editing → working → done.
// Loaded by entry.ts on the first interaction. One photo: checked from its header (sniff), decoded at most DECODE_EDGE on
// its long side, then edited on a stage — quarter turns, an optional crop, opaque black boxes (가릴 곳), the tiled 용도
// 문구 — that previews exactly what is saved (mask.ts drawCopy, the same pass as the file). 「사본 만들기」 draws that pass
// once on a canvas and saves it as JPEG (pixels only: no metadata, nothing under a box); the PDF is that same JPEG on an
// A4 page, built by the 사진 PDF 변환 worker. Nothing is stored; bitmaps, canvases and links are released on reset and
// when the page is left.
import type { ImagesErrorCode, ImagesResponse } from '../../lib/pdf/images.worker';
import { fitWithinCaps } from '../../lib/image/caps';
import { decodeImage } from '../../lib/image/decode';
import { ERRORS, photoErrorCode } from '../../lib/image/messages';
import { HEAD_BYTES, TAIL_BYTES, sniffImage, type Sniff } from '../../lib/image/sniff';
import { announce, clearAlert } from '../../lib/ui/announce';
import { MB, detectDevice } from '../../lib/ui/device';
import { loadDynamicFont } from '../../lib/ui/font';
import { formatSize } from '../../lib/ui/format';
import { hideNextSteps, showNextSteps } from '../../lib/ui/next-steps';
import { track, type UsagePhase } from '../../lib/ui/usage';
import { DECODE_EDGE, JPEG_QUALITY, LIMITS } from './limits';
import {
  MAX_MASKS,
  clampRect,
  drawCopy,
  fullRect,
  minEdge,
  moveRect,
  nextRotation,
  pdfRequest,
  resizeRect,
  startMask,
  turnRect,
  turnedSize,
  type CopyPlan,
  type DrawCtx,
  type Rect,
  type Rotation,
} from './mask';
import { copyName, markLines } from './watermark';

type State = 'empty' | 'opening' | 'editing' | 'working' | 'done';
type FailCode = 'heic' | 'not-image' | 'corrupt' | 'too-big' | 'canvas' | 'oom' | 'encoder' | 'engine' | 'unknown';

interface Photo {
  src: ImageBitmap | HTMLCanvasElement;
  w: number;
  h: number;
  close(): void;
}

interface Mask {
  id: number;
  r: Rect;
}

const ACCEPTED: readonly Sniff['format'][] = ['jpeg', 'png', 'webp', 'heic', 'avif'];
/** The stage is never taller than this share of the window (a portrait photo would push the controls away). */
const STAGE_MAX_VH = 0.6;
const STAGE_MIN_H = 240;
/** The preview canvas is at most this wide in device pixels. */
const PREVIEW_MAX = 1600;

const MSG = {
  opening: '사진을 여는 중…',
  opened: '사진을 열었습니다. 가릴 곳 추가로 검은 상자를 놓고, 어디에 낼지 적으세요.',
  tooBig: (mb: number) => `사진이 너무 큽니다. 이 기기에서는 ${mb.toLocaleString('ko-KR')} MB까지 고를 수 있습니다.`,
  canvas: '사본을 그리지 못했습니다. 새로고침 후 다시 시도해 주세요.',
  encoder: 'JPG로 저장하지 못했습니다. 새로고침 후 다시 시도해 주세요.',
  pdfFailed: 'PDF를 만들지 못했습니다. JPG로 저장한 뒤 사진 PDF 변환에서 PDF로 바꿀 수 있습니다.',
  maskAdded: (n: number) => `가릴 곳 ${n}을 놓았습니다. 끌어서 옮기고 크기를 맞추세요.`,
  maskMax: `가릴 곳은 ${MAX_MASKS}개까지 놓을 수 있습니다.`,
  maskRemoved: '고른 상자를 지웠습니다.',
  maskLabel: (n: number) => `가릴 곳 ${n}`,
  cropLabel: '남길 부분',
  cropOn: '자르기: 점선 상자를 끌어 남길 부분을 맞춘 뒤 자르기 끝을 누르세요.',
  cropOff: '자른 부분만 남겼습니다.',
  cropDone: '자르기 끝',
  cropButton: '자르기',
  rotated: (deg: number) => `사진을 ${deg}도 돌렸습니다.`,
  moved: '상자를 옮겼습니다.',
  resized: '상자 크기를 바꿨습니다.',
  markEmpty: '용도 문구를 넣으면 다른 곳에 쓰이는 것을 막는 데 도움이 됩니다.',
  working: '사본을 만드는 중입니다.',
  done: '사본이 준비되었습니다. JPG나 PDF로 저장하세요.',
  doneJpgOnly: '사본이 준비되었습니다. JPG로 저장하세요.',
  saveName: (jpg: string, pdf: string | null) => `저장될 이름: ${jpg}${pdf ? `, ${pdf}` : ''}`,
  reset: '사진을 지웠습니다. 다른 사진을 고르세요.',
  editing: '다시 고칠 수 있습니다.',
} as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const release = (c: HTMLCanvasElement): void => {
  c.width = 0;
  c.height = 0;
};

/** The photo decoded and at most DECODE_EDGE on its long side (never enlarged). */
async function openPhoto(file: File, sniff: Sniff): Promise<Photo> {
  // createImageBitmap's resize needs OffscreenCanvas when the browser ignores it (decode.ts); without it, full size here.
  const d = await decodeImage(file, sniff, { maxLongEdge: typeof OffscreenCanvas !== 'undefined' ? DECODE_EDGE : null });
  const long = Math.max(d.width, d.height);
  if (long <= DECODE_EDGE) return { src: d.src, w: d.width, h: d.height, close: d.close };
  // A browser without OffscreenCanvas (Playwright WebKit on Windows): shrink on a page canvas.
  const s = DECODE_EDGE / long;
  const c = el('canvas');
  c.width = Math.max(1, Math.round(d.width * s));
  c.height = Math.max(1, Math.round(d.height * s));
  const g = c.getContext('2d');
  if (!g) {
    d.close();
    throw new Error('2d context unavailable');
  }
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(d.src, 0, 0, c.width, c.height);
  d.close();
  return { src: c, w: c.width, h: c.height, close: () => release(c) };
}

export function initIdCopy(pending?: File): { open(file: File): void } | null {
  const found = document.getElementById('ic-tool');
  if (!found) return null;
  const root: HTMLElement = found;

  const input = must<HTMLInputElement>('ic-input');
  const changeInput = must<HTMLInputElement>('ic-change');
  const drop = must<HTMLDivElement>('ic-drop');
  const unsupported = must<HTMLParagraphElement>('ic-unsupported');
  const editor = must<HTMLDivElement>('ic-editor');
  const rotateBtn = must<HTMLButtonElement>('ic-rotate');
  const cropBtn = must<HTMLButtonElement>('ic-crop');
  const addBtn = must<HTMLButtonElement>('ic-add');
  const delBtn = must<HTMLButtonElement>('ic-del');
  const stage = must<HTMLDivElement>('ic-stage');
  const canvas = must<HTMLCanvasElement>('ic-canvas');
  const place = must<HTMLInputElement>('ic-place');
  const dateBox = must<HTMLInputElement>('ic-date');
  const markNote = must<HTMLParagraphElement>('ic-mark-note');
  const runBtn = must<HTMLButtonElement>('ic-run');
  const progressBox = must<HTMLDivElement>('ic-progress');
  const progressText = must<HTMLParagraphElement>('ic-progress-text');
  const result = must<HTMLDivElement>('ic-result');
  const headline = must<HTMLParagraphElement>('ic-headline');
  const summary = must<HTMLParagraphElement>('ic-summary');
  const jpgLink = must<HTMLAnchorElement>('ic-jpg');
  const pdfLink = must<HTMLAnchorElement>('ic-pdf');
  const nextSlot = must<HTMLDivElement>('ic-next');
  const editBtn = must<HTMLButtonElement>('ic-edit');
  const resetBtn = must<HTMLButtonElement>('ic-reset');
  const saveName = must<HTMLParagraphElement>('ic-save-name');

  let state: State = 'empty';
  let photo: Photo | null = null;
  let rotation: Rotation = 0;
  let crop: Rect = fullRect(1, 1);
  let masks: Mask[] = [];
  let nextId = 1;
  let selected: number | null = null;
  let cropping = false;
  /** CSS pixels per photo pixel on the stage. */
  let scale = 1;
  // Incremented by every open, run, reset and leave; async work that finds a newer id stops.
  let runId = 0;
  let worker: Worker | null = null;
  let urls: string[] = [];
  let drawQueued = false;

  const status = (msg: string): void => announce('status', msg, root);
  const alert = (msg: string): void => announce('alert', msg, root);
  const usageFail = (c: FailCode, p: UsagePhase): void => track({ e: 'fail', t: 'id-copy', c, p });

  const turned = (): { w: number; h: number } => (photo ? turnedSize(photo.w, photo.h, rotation) : { w: 1, h: 1 });
  const minSide = (): number => {
    const t = turned();
    return minEdge(t.w, t.h);
  };
  /** The part of the photo the stage shows: all of it while cropping, else the crop. */
  const view = (): Rect => (cropping ? fullRect(turned().w, turned().h) : crop);
  const lines = (): string[] => markLines(place.value, dateBox.checked, new Date());
  const plan = (mark: readonly string[]): CopyPlan => ({ src: photo!.src, srcW: photo!.w, srcH: photo!.h, rotation, crop, masks: masks.map((m) => m.r), mark });

  function stopWorker(): void {
    worker?.terminate();
    worker = null;
  }

  function revokeAll(): void {
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
    jpgLink.removeAttribute('href');
    pdfLink.removeAttribute('href');
    hideNextSteps(nextSlot);
  }

  function setState(next: State): void {
    state = next;
    root.dataset.state = next;
    const busy = next === 'opening' || next === 'working';
    if (busy) document.body.dataset.busy = 'id-copy';
    else delete document.body.dataset.busy;
    drop.hidden = next !== 'empty';
    editor.hidden = next !== 'editing';
    progressBox.hidden = !busy;
    result.hidden = next !== 'done';
    if (next !== 'done') revokeAll();
    updateControls();
  }

  function updateControls(): void {
    const editing = state === 'editing';
    rotateBtn.disabled = !editing || cropping;
    addBtn.disabled = !editing || cropping || masks.length >= MAX_MASKS;
    delBtn.disabled = !editing || cropping || selected === null;
    cropBtn.disabled = !editing;
    cropBtn.setAttribute('aria-pressed', String(cropping));
    cropBtn.textContent = cropping ? MSG.cropDone : MSG.cropButton;
    runBtn.disabled = !editing;
    markNote.textContent = lines().length ? '' : MSG.markEmpty;
  }

  // ---------- stage ----------

  /** Sizes the stage to the view (full width, never taller than STAGE_MAX_VH of the window). */
  function layoutStage(): void {
    const v = view();
    const avail = Math.max(1, editor.clientWidth || stage.parentElement?.clientWidth || 320);
    const maxH = Math.max(STAGE_MIN_H, Math.round(window.innerHeight * STAGE_MAX_VH));
    const cssW = Math.max(1, Math.min(avail, (maxH * v.w) / v.h));
    stage.style.width = `${Math.round(cssW)}px`;
    scale = Math.round(cssW) / v.w;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.min(PREVIEW_MAX, Math.round(Math.round(cssW) * dpr)));
    canvas.height = Math.max(1, Math.round((canvas.width * v.h) / v.w));
  }

  /** Redraws the preview on the next frame (many inputs in one frame draw once). */
  function queueDraw(): void {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      drawPreview();
    });
  }

  function drawPreview(): void {
    if (!photo || state !== 'editing') return;
    const ctx = canvas.getContext('2d') as DrawCtx | null;
    if (!ctx) return;
    const v = view();
    // While cropping, the whole photo with its boxes; the watermark belongs to the copy (the crop), so it waits.
    const p = cropping ? { ...plan([]), crop: v } : plan(lines());
    drawCopy(ctx, p, canvas.width / v.w, canvas.width, canvas.height);
  }

  /** Rebuilds the stage: canvas size, preview, and one handle per box (or the crop box while cropping). */
  function renderStage(focusId?: number | 'crop'): void {
    if (!photo) return;
    layoutStage();
    drawPreview();
    const items: HTMLElement[] = [canvas];
    if (cropping) items.push(boxButton('crop', MSG.cropLabel, crop, 'ic-box ic-crop-box selected'));
    else masks.forEach((m, i) => items.push(boxButton(m.id, MSG.maskLabel(i + 1), m.r, m.id === selected ? 'ic-box selected' : 'ic-box')));
    stage.replaceChildren(...items);
    if (focusId !== undefined) stage.querySelector<HTMLElement>(`[data-id="${focusId}"]`)?.focus({ preventScroll: true });
  }

  function position(b: HTMLElement, r: Rect): void {
    const v = view();
    b.style.left = `${(r.x - v.x) * scale}px`;
    b.style.top = `${(r.y - v.y) * scale}px`;
    b.style.width = `${r.w * scale}px`;
    b.style.height = `${r.h * scale}px`;
  }

  function rectOf(id: number | 'crop'): Rect | null {
    return id === 'crop' ? crop : (masks.find((m) => m.id === id)?.r ?? null);
  }

  /** Writes a box (kept inside the photo or the crop) and moves its element. */
  function setRect(id: number | 'crop', r: Rect): void {
    if (id === 'crop') crop = r;
    else {
      const m = masks.find((x) => x.id === id);
      if (!m) return;
      m.r = r;
    }
    const b = stage.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (b) position(b, r);
    queueDraw();
  }

  /** Where a box may go: the whole turned photo for the crop, the crop for a black box. */
  const boundsOf = (id: number | 'crop'): Rect => (id === 'crop' ? fullRect(turned().w, turned().h) : crop);

  function boxButton(id: number | 'crop', label: string, r: Rect, cls: string): HTMLButtonElement {
    const b = el('button', cls);
    b.type = 'button';
    b.dataset.id = String(id);
    b.setAttribute('aria-label', label);
    if (id !== 'crop') b.setAttribute('aria-pressed', String(id === selected));
    b.setAttribute('aria-describedby', 'ic-stage-hint');
    const handle = el('span', 'ic-handle');
    handle.setAttribute('aria-hidden', 'true');
    b.append(handle);
    position(b, r);
    b.addEventListener('pointerdown', (ev) => beginDrag(ev, b, id, ev.target === handle));
    b.addEventListener('keydown', (ev) => onBoxKey(ev, id));
    b.addEventListener('click', () => choose(id));
    return b;
  }

  function choose(id: number | 'crop' | null): void {
    if (id === 'crop' || selected === id) return;
    selected = id;
    for (const b of stage.querySelectorAll<HTMLElement>('.ic-box:not(.ic-crop-box)')) {
      const on = b.dataset.id === String(id);
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', String(on));
    }
    updateControls();
  }

  function beginDrag(ev: PointerEvent, b: HTMLElement, id: number | 'crop', resizing: boolean): void {
    const start = rectOf(id);
    if (state !== 'editing' || ev.button > 0 || !start) return;
    ev.preventDefault();
    choose(id);
    b.focus({ preventScroll: true });
    const bounds = boundsOf(id);
    const min = minSide();
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
      setRect(id, resizing ? resizeRect(start, start.w + dx, start.h + dy, bounds, min) : moveRect(start, dx, dy, bounds, min));
    };
    const onEnd = (): void => {
      b.removeEventListener('pointermove', onMove);
      b.removeEventListener('pointerup', onEnd);
      b.removeEventListener('pointercancel', onEnd);
      if (moved) status(resizing ? MSG.resized : MSG.moved);
    };
    b.addEventListener('pointermove', onMove);
    b.addEventListener('pointerup', onEnd);
    b.addEventListener('pointercancel', onEnd);
  }

  function onBoxKey(ev: KeyboardEvent, id: number | 'crop'): void {
    const r = rectOf(id);
    if (state !== 'editing' || !r) return;
    const t = turned();
    const step = Math.max(1, Math.round(Math.max(t.w, t.h) / 200));
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const k = d[ev.key];
    if (k) {
      ev.preventDefault();
      choose(id);
      const bounds = boundsOf(id);
      setRect(id, ev.shiftKey ? resizeRect(r, r.w + k[0], r.h + k[1], bounds, minSide()) : moveRect(r, k[0], k[1], bounds, minSide()));
      return;
    }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && id !== 'crop') {
      ev.preventDefault();
      choose(id);
      removeSelected();
    }
  }

  function addMask(): void {
    if (state !== 'editing' || cropping || !photo) return;
    if (masks.length >= MAX_MASKS) {
      status(MSG.maskMax);
      return;
    }
    const m: Mask = { id: nextId++, r: startMask(crop, masks.length, minSide()) };
    masks.push(m);
    selected = m.id;
    renderStage(m.id);
    updateControls();
    status(masks.length >= MAX_MASKS ? `${MSG.maskAdded(masks.length)} ${MSG.maskMax}` : MSG.maskAdded(masks.length));
  }

  function removeSelected(): void {
    const i = masks.findIndex((m) => m.id === selected);
    if (i < 0) return;
    masks.splice(i, 1);
    const next = masks[Math.min(i, masks.length - 1)];
    selected = next?.id ?? null;
    renderStage(next?.id);
    updateControls();
    if (!next) addBtn.focus();
    status(MSG.maskRemoved);
  }

  function rotate(): void {
    if (state !== 'editing' || cropping || !photo) return;
    const h = turned().h;
    rotation = nextRotation(rotation);
    crop = turnRect(crop, h);
    for (const m of masks) m.r = turnRect(m.r, h);
    renderStage();
    rotateBtn.focus();
    status(MSG.rotated(rotation));
  }

  function toggleCrop(): void {
    if (state !== 'editing' || !photo) return;
    cropping = !cropping;
    if (cropping) selected = null;
    else {
      // Boxes stay on the part that is kept.
      const min = minSide();
      for (const m of masks) m.r = clampRect(m.r, crop, min);
    }
    renderStage(cropping ? 'crop' : undefined);
    updateControls();
    if (!cropping) cropBtn.focus();
    status(cropping ? MSG.cropOn : MSG.cropOff);
  }

  // ---------- opening ----------

  function showError(code: FailCode, message: string, phase: UsagePhase): void {
    usageFail(code, phase);
    alert(message);
  }

  async function open(file: File): Promise<void> {
    if (state === 'working' || state === 'opening') return;
    const id = ++runId;
    clearAlert(root);
    closePhoto();
    track({ e: 'pick', t: 'id-copy' });
    loadDynamicFont();
    const max = LIMITS[detectDevice()].maxFileBytes;
    if (file.size === 0 || file.size > max) {
      setState('empty');
      if (file.size === 0) showError('corrupt', ERRORS.empty, 'parse');
      else showError('too-big', MSG.tooBig(max / MB), 'parse');
      return;
    }
    setState('opening');
    progressText.textContent = MSG.opening;
    status(MSG.opening);
    let sniff: Sniff;
    try {
      const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
      const tail = new Uint8Array(await file.slice(Math.max(0, file.size - TAIL_BYTES)).arrayBuffer());
      sniff = sniffImage(head, { tail, size: file.size });
    } catch {
      if (id !== runId) return;
      setState('empty');
      return showError('corrupt', ERRORS.corrupt, 'parse');
    }
    if (id !== runId) return;
    if (!ACCEPTED.includes(sniff.format)) {
      setState('empty');
      return showError('not-image', ERRORS['not-image'], 'parse');
    }
    if (sniff.truncated) {
      setState('empty');
      return showError('corrupt', ERRORS.truncated, 'parse');
    }
    let p: Photo;
    try {
      p = await openPhoto(file, sniff);
    } catch (err) {
      if (id !== runId) return;
      setState('empty');
      const code = photoErrorCode(err);
      if (code === 'heic') return showError('heic', ERRORS.heic, 'parse');
      if (code === 'oom') return showError('oom', ERRORS.oom, 'parse');
      return showError('corrupt', ERRORS.corrupt, 'parse');
    }
    if (id !== runId) {
      p.close();
      return;
    }
    photo = p;
    rotation = 0;
    crop = fullRect(p.w, p.h);
    masks = [];
    selected = null;
    cropping = false;
    setState('editing');
    renderStage();
    addBtn.focus();
    status(MSG.opened);
  }

  function closePhoto(): void {
    photo?.close();
    photo = null;
    masks = [];
    selected = null;
    cropping = false;
    stage.replaceChildren(canvas);
    release(canvas);
  }

  // ---------- making the copy ----------

  async function run(): Promise<void> {
    if (state !== 'editing' || !photo) return;
    if (cropping) toggleCrop();
    const id = ++runId;
    clearAlert(root);
    const now = new Date();
    const mark = lines();
    track({ e: 'start', t: 'id-copy', o: 'mark', v: mark.length ? 'on' : 'off' });
    setState('working');
    progressText.textContent = MSG.working;
    status(MSG.working);
    await nextFrame();
    if (id !== runId || !photo) return;

    const caps = LIMITS[detectDevice()].caps;
    const k = Math.min(1, fitWithinCaps(crop.w, crop.h, caps).scale);
    const out = el('canvas');
    out.width = Math.max(1, Math.round(crop.w * k));
    out.height = Math.max(1, Math.round(crop.h * k));
    let jpg: Blob | null = null;
    try {
      const ctx = out.getContext('2d') as DrawCtx | null;
      if (!ctx) {
        backToEditing();
        return showError('canvas', MSG.canvas, 'process');
      }
      drawCopy(ctx, plan(mark), k, out.width, out.height);
      jpg = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    } catch (err) {
      if (id !== runId) return;
      backToEditing();
      return photoErrorCode(err) === 'oom' ? showError('oom', ERRORS.oom, 'process') : showError('canvas', MSG.canvas, 'process');
    } finally {
      release(out);
    }
    if (id !== runId) return;
    if (!jpg || jpg.type !== 'image/jpeg') {
      backToEditing();
      return showError('encoder', MSG.encoder, 'save');
    }
    const pdf = await buildPdf(jpg, caps.maxEdge, id);
    if (id !== runId) return;
    finish(jpg, pdf, now);
  }

  /** The PDF of the copy from the 사진 PDF 변환 worker; null when it could not be made (the JPG still is). */
  function buildPdf(jpg: Blob, maxEdge: number, id: number): Promise<Blob | null> {
    return new Promise((resolve) => {
      let w: Worker;
      try {
        w = new Worker(new URL('../../lib/pdf/images.worker.ts', import.meta.url), { type: 'module' });
      } catch {
        pdfFail('engine');
        resolve(null);
        return;
      }
      worker = w;
      // An `error` before the worker's first message means its script did not load (engine), not a photo problem.
      let answered = false;
      const done = (b: Blob | null): void => {
        if (worker === w) stopWorker();
        resolve(b);
      };
      w.onmessage = (ev: MessageEvent<ImagesResponse>) => {
        if (worker !== w || id !== runId) return;
        answered = true;
        const msg = ev.data;
        if (msg.type === 'done') done(new Blob([msg.bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
        else if (msg.type === 'error') {
          pdfFail(msg.code);
          done(null);
        }
      };
      w.onerror = (ev) => {
        ev.preventDefault();
        if (worker !== w) return;
        pdfFail(answered ? 'unknown' : 'engine');
        done(null);
      };
      w.postMessage(pdfRequest(jpg, maxEdge));
    });
  }

  function pdfFail(code: ImagesErrorCode): void {
    usageFail(code === 'engine' || code === 'oom' ? code : 'unknown', 'save');
  }

  function backToEditing(): void {
    setState('editing');
    renderStage();
    runBtn.focus();
  }

  function finish(jpg: Blob, pdf: Blob | null, now: Date): void {
    track({ e: 'success', t: 'id-copy' });
    setState('done');
    const jpgName = copyName(now, 'jpg');
    const pdfName = pdf ? copyName(now, 'pdf') : null;
    const jpgUrl = URL.createObjectURL(jpg);
    urls.push(jpgUrl);
    jpgLink.href = jpgUrl;
    jpgLink.download = jpgName;
    pdfLink.hidden = !pdf;
    if (pdf && pdfName) {
      const pdfUrl = URL.createObjectURL(pdf);
      urls.push(pdfUrl);
      pdfLink.href = pdfUrl;
      pdfLink.download = pdfName;
      showNextSteps(nextSlot, 'id-copy', [{ blob: pdf, name: pdfName }]);
    }
    summary.textContent = [`JPG ${formatSize(jpg.size)}`, pdf ? `PDF ${formatSize(pdf.size)}` : ''].filter(Boolean).join(' · ');
    saveName.textContent = MSG.saveName(jpgName, pdfName);
    result.scrollIntoView({ block: 'start' });
    headline.focus({ preventScroll: true });
    if (!pdf) alert(MSG.pdfFailed);
    status(pdf ? MSG.done : MSG.doneJpgOnly);
  }

  function edit(): void {
    if (state !== 'done' || !photo) return;
    runId++;
    setState('editing');
    renderStage();
    runBtn.focus();
    status(MSG.editing);
  }

  function resetAll(focus = true): void {
    runId++;
    stopWorker();
    closePhoto();
    place.value = '';
    input.value = '';
    changeInput.value = '';
    clearAlert(root);
    setState('empty');
    if (focus) {
      input.focus();
      status(MSG.reset);
    }
  }

  // ---------- wiring ----------

  if (typeof createImageBitmap !== 'function') {
    unsupported.hidden = false;
    for (const inp of [input, changeInput]) inp.disabled = true;
    usageFail('canvas', 'load');
    return null;
  }

  for (const inp of [input, changeInput]) {
    inp.addEventListener('change', () => {
      const file = inp.files?.[0];
      inp.value = '';
      if (file) void open(file);
    });
  }
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
    const file = ev.dataTransfer.files[0];
    if (file) void open(file);
  });
  rotateBtn.addEventListener('click', rotate);
  cropBtn.addEventListener('click', toggleCrop);
  addBtn.addEventListener('click', addMask);
  delBtn.addEventListener('click', removeSelected);
  place.addEventListener('input', () => {
    updateControls();
    queueDraw();
  });
  dateBox.addEventListener('change', () => {
    updateControls();
    queueDraw();
  });
  runBtn.addEventListener('click', () => void run());
  editBtn.addEventListener('click', edit);
  resetBtn.addEventListener('click', () => resetAll());
  for (const a of [jpgLink, pdfLink]) a.addEventListener('click', () => track({ e: 'download', t: 'id-copy' }));
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state === 'editing') renderStage();
    }, 150);
  });
  // Leaving the page: nothing of the photo stays behind (the bfcache keeps the page, so it comes back empty).
  window.addEventListener('pagehide', () => {
    if (state !== 'empty') resetAll(false);
  });

  setState('empty');
  // A photo picked or dropped while this module loaded.
  const first = pending ?? input.files?.[0];
  input.value = '';
  if (first) void open(first);
  return { open: (f: File) => void open(f) };
}
