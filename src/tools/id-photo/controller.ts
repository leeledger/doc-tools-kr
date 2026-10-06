// 여권·증명사진 규격 맞추기 page controller (brief Step 4 §3). States: empty → loading → adjust (or blocked)
// → exporting → done, plus error. One photo at a time; it never leaves the page: the pixels are decoded here,
// measured here (MediaPipe, main thread) and encoded in a module worker created on the save click.
import { CUSTOM_BOUNDS, DEFAULT_PRESET, customPreset, getPreset, outputName, type IdPreset } from '../../data/id-photo-presets';
import { shouldTryAutoFrame, sessionStore } from '../../lib/face/guard';
import { hasFace, type FaceMeasure } from '../../lib/face/types';
import { decodeImage } from '../../lib/image/decode';
import { ERRORS, PhotoError, unsupportedMessage } from '../../lib/image/messages';
import { HEAD_BYTES, TAIL_BYTES, orientedSize, sniffImage } from '../../lib/image/sniff';
import { checkBackground, type BackgroundResult } from '../../lib/idphoto/background';
import { clampZoom, minZoom, pan, pinch, rotate, snapRotation, zoomAt, zoomTo, type CropState, type Point } from '../../lib/idphoto/crop';
import type { EncodeRequest, EncodeResponse } from '../../lib/idphoto/encode.worker';
import { autoFrame, manualFrame } from '../../lib/idphoto/frame';
import { drawCrop, renderOutput, renderPreview } from '../../lib/idphoto/render';
import { checklist, headReading, limitLabel, type Checklist } from '../../lib/idphoto/warnings';
import { announce as live, clearAlert } from '../../lib/ui/announce';
import { renderSource } from './source';
import { track } from '../../lib/ui/usage';
import { detectDevice } from '../../lib/ui/device';
import { hideEngineError, showEngineError } from '../../lib/ui/engine-error';
import { formatSize } from '../../lib/ui/format';
import { josa } from '../../lib/ui/josa';
import { checkDims, checkFileBytes, WORKING_LONG_EDGE } from './limits';
import { INITIAL, canSave, reduce, saveReason, type Phase, type SaveAction, type SaveModel } from './model';
import { drawOverlay } from './overlay';
import { attachStage } from './stage';
import type { AutoRun } from './autoframe';

export const COPY = {
  loading: (loaded: number, total: number) => `얼굴 위치를 찾는 준비 중입니다 (${mb(loaded)} / ${mb(total)} MB)`,
  opening: '사진을 여는 중입니다',
  manualSwitch: '자동 맞춤을 쓰지 못해 직접 맞추기로 바꿨습니다',
  manualReadout: '직접 맞추기: 안내선에 정수리와 턱을 맞추세요',
  resetAuto: '자동 맞춤으로 되돌리기',
  resetManual: '처음 위치로',
  exported: (name: string) => `저장했습니다. ${josa(name, '을/를')} 내려받을 수 있습니다.`,
  /** The Step 3 copy says "줄일 수 없습니다"; this tool does not compress (UX-AUDIT-2 §7.3). */
  animated: '움직이는 이미지는 여권·증명사진으로 쓸 수 없습니다. 사진 파일을 선택해 주세요.',
  /** Done headline (UX-AUDIT-2 §7.2): what happened, then the size; the pixel size is a chip. */
  done: (size: string) => `규격에 맞췄습니다 · ${size}`,
  verify: '규격에 맞는 파일을 만들지 못했습니다. 다시 저장해 보고, 계속되면 다른 사진을 써 주세요.',
  unreachable: (kb: number, w: number, h: number) => `${kb.toLocaleString('ko-KR')} KB로는 ${w}×${h}픽셀 사진을 만들 수 없습니다. 용량 한도를 조금 높여 주세요.`,
  fallback: '빠른 방식으로 저장했습니다. 규격과 용량은 같습니다.',
  summary: (c: Checklist) =>
    c.blocks.length
      ? `저장할 수 없습니다. ${c.blocks[0]!.text}`
      : c.warns.length
        ? `확인할 항목 ${c.warns.length}개가 있습니다.`
        : '확인할 항목이 없습니다.',
  customPx: `가로와 세로는 ${CUSTOM_BOUNDS.minPx}–${CUSTOM_BOUNDS.maxPx.toLocaleString('ko-KR')}픽셀 사이의 정수로 입력해 주세요.`,
  customKb: `용량 한도는 ${CUSTOM_BOUNDS.minKb}–${CUSTOM_BOUNDS.maxKb.toLocaleString('ko-KR')} KB 사이의 정수로 입력하거나 비워 두세요.`,
} as const;

function mb(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}

const createEncodeWorker = (): Worker => new Worker(new URL('../../lib/idphoto/encode.worker.ts', import.meta.url), { type: 'module' });

/** Stage preview bitmap: long edge ≤ this (the stage is ≤ 360 CSS px; enough for a 3× screen). */
const PREVIEW_EDGE = 2048;
const BG_EDGE = 160;
const ANNOUNCE_MS = 600;
const NUDGE = 5;
const ZOOM_STEPS = 1000;

const ICON = {
  ok: '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.5 8.2l2.2 2.2 4.8-4.8" stroke="#fff" stroke-width="1.8" fill="none"/></svg>',
  warn: '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="M8 1l7.5 13.5h-15z" fill="currentColor"/><path d="M8 5.5v4.5M8 11.6v1.4" stroke="#fff" stroke-width="1.8"/></svg>',
  block: '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M5.2 5.2l5.6 5.6M10.8 5.2l-5.6 5.6" stroke="#fff" stroke-width="1.8"/></svg>',
} as const;
const KIND_LABEL = { ok: '통과', warn: '확인 필요', block: '저장 불가' } as const;

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

interface Photo {
  bitmap: ImageBitmap;
  preview: ImageBitmap;
  face: FaceMeasure | null;
  manualReason: 'noface' | 'skipped' | 'failed' | null;
}

/**
 * Loaded by entry.ts on the first interaction (never on page load alone). `pending` is a photo that arrived
 * (drop or picker) while this module was loading; the preset controls may already have been changed.
 */
export function initIdPhotoTool(pending?: File): { open(file: File): void } | null {
  const found = document.getElementById('idp-tool');
  if (!found) return null;
  const root: HTMLElement = found;
  const presetSel = must<HTMLSelectElement>('idp-preset');
  const customBox = must<HTMLElement>('idp-custom');
  const customW = must<HTMLInputElement>('idp-w');
  const customH = must<HTMLInputElement>('idp-h');
  const customKb = must<HTMLInputElement>('idp-kb');
  const customError = must<HTMLElement>('idp-custom-error');
  const source = must<HTMLElement>('idp-source');
  const input = must<HTMLInputElement>('idp-input');
  const drop = must<HTMLElement>('idp-drop');
  const errorBox = must<HTMLElement>('idp-error');
  const loading = must<HTMLElement>('idp-loading');
  const loadingText = must<HTMLElement>('idp-loading-text');
  const loadingBar = must<HTMLProgressElement>('idp-loading-bar');
  // Rendered only when auto-framing is built in.
  const skipBtn = document.getElementById('idp-skip') as HTMLButtonElement | null;
  const adjust = must<HTMLElement>('idp-adjust');
  const stage = must<HTMLElement>('idp-stage');
  const photoCanvas = must<HTMLCanvasElement>('idp-photo');
  const overlayCanvas = must<HTMLCanvasElement>('idp-overlay');
  const readout = must<HTMLElement>('idp-readout');
  const zoomRange = must<HTMLInputElement>('idp-zoom');
  const rotRange = must<HTMLInputElement>('idp-rot');
  const rotOut = must<HTMLOutputElement>('idp-rot-out');
  const resetBtn = must<HTMLButtonElement>('idp-reset');
  const list = must<HTMLUListElement>('idp-checklist');
  const confirmBox = must<HTMLInputElement>('idp-confirm');
  const saveBtn = must<HTMLButtonElement>('idp-save');
  const reason = must<HTMLElement>('idp-save-reason');
  const exporting = must<HTMLElement>('idp-exporting');
  const done = must<HTMLElement>('idp-done');
  const headline = must<HTMLElement>('idp-headline');
  const chips = must<HTMLUListElement>('idp-chips');
  const download = must<HTMLAnchorElement>('idp-download');
  const saveName = must<HTMLElement>('idp-save-name');
  const fallbackNote = must<HTMLElement>('idp-fallback');
  const result = must<HTMLImageElement>('idp-result');
  const zoom2 = must<HTMLInputElement>('idp-zoom2');
  const againBtn = must<HTMLButtonElement>('idp-again');
  const newBtn = must<HTMLButtonElement>('idp-new');

  let model: SaveModel = INITIAL;
  let preset: IdPreset = getPreset(DEFAULT_PRESET)!;
  let customMsg: string | null = null;
  let photo: Photo | null = null;
  let state: CropState | null = null;
  let start: CropState | null = null;
  let lowres = false;
  let bg: BackgroundResult | null = null;
  let current: Checklist | null = null;
  let run = 0;
  let auto: AutoRun | null = null;
  let resultUrl: string | null = null;
  let worker: Worker | null = null;
  let frame = 0;
  let bgTimer: ReturnType<typeof setTimeout> | undefined;
  let sayTimer: ReturnType<typeof setTimeout> | undefined;
  /** A one-off message put in front of the next checklist announcement. */
  let note = '';

  const say = (msg: string): void => live('status', msg, root);

  function setPhase(p: Phase): void {
    dispatch({ type: 'phase', phase: p });
    root.dataset.state = p;
    loading.hidden = p !== 'loading';
    adjust.hidden = p !== 'adjust' && p !== 'blocked';
    exporting.hidden = p !== 'exporting';
    done.hidden = p !== 'done';
    drop.hidden = p !== 'empty' && p !== 'error';
  }

  function dispatch(a: SaveAction): void {
    model = reduce(model, a);
    confirmBox.checked = model.confirmed;
    saveBtn.disabled = !canSave(model);
    const r = saveReason(model);
    reason.textContent = r;
    reason.hidden = !r;
  }

  function showError(msg: string): void {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    live('alert', msg, root);
  }

  function hideError(): void {
    errorBox.hidden = true;
    errorBox.textContent = '';
    clearAlert(root);
  }

  // ---------- preset ----------

  const showSource = (p: IdPreset): void => renderSource(source, p);

  function readCustom(): IdPreset | null {
    const int = (v: string): number => (/^\s*\d+\s*$/.test(v) ? Number(v) : NaN);
    const w = int(customW.value);
    const h = int(customH.value);
    const kbText = customKb.value.trim();
    const kb = kbText === '' ? null : int(kbText);
    const pxBad = !customPreset(Number.isFinite(w) ? w : -1, Number.isFinite(h) ? h : -1);
    const kbBad = kb !== null && (!Number.isFinite(kb) || kb < CUSTOM_BOUNDS.minKb || kb > CUSTOM_BOUNDS.maxKb);
    customW.setAttribute('aria-invalid', String(pxBad && !(w >= CUSTOM_BOUNDS.minPx && w <= CUSTOM_BOUNDS.maxPx)));
    customH.setAttribute('aria-invalid', String(pxBad && !(h >= CUSTOM_BOUNDS.minPx && h <= CUSTOM_BOUNDS.maxPx)));
    customKb.setAttribute('aria-invalid', String(kbBad));
    customMsg = pxBad ? COPY.customPx : kbBad ? COPY.customKb : null;
    customError.textContent = customMsg ?? '';
    if (customMsg) return null;
    return customPreset(w, h, kb);
  }

  function choosePreset(): void {
    const custom = presetSel.value === 'custom';
    customBox.hidden = !custom;
    if (custom) {
      const p = readCustom();
      // An invalid entry keeps the last valid size on the stage, and blocks the save.
      if (p) preset = p;
      else if (preset.id !== 'custom') preset = customPreset(413, 531)!;
    } else {
      customMsg = null;
      customError.textContent = '';
      preset = getPreset(presetSel.value) ?? getPreset(DEFAULT_PRESET)!;
    }
    showSource(preset);
    if (photo) {
      frameFor(preset);
      dispatch({ type: 'preset' });
      layoutStage();
      update(true);
    }
  }

  // ---------- framing and redraw ----------

  function frameFor(p: IdPreset): void {
    if (!photo) return;
    const out = { w: p.outW, h: p.outH };
    const W = photo.bitmap.width;
    const H = photo.bitmap.height;
    const f = photo.face ? autoFrame(photo.face, out, W, H) : manualFrame(out, W, H);
    // The photo cannot fill this size at all: blocked (a smaller preset may still work).
    lowres = f.lowres || manualFrame(out, W, H).lowres;
    state = f.state;
    start = f.state;
    resetBtn.textContent = photo.face ? COPY.resetAuto : COPY.resetManual;
    setPhase(lowres ? 'blocked' : 'adjust');
  }

  function sMin(): number {
    return photo ? minZoom({ w: preset.outW, h: preset.outH }, photo.bitmap.width, photo.bitmap.height) : 0.01;
  }

  function zoomToRange(s: number): number {
    const lo = Math.log(sMin());
    return Math.round(((Math.log(s) - lo) / (Math.log(1) - lo)) * ZOOM_STEPS);
  }

  function rangeToZoom(v: number): number {
    const lo = Math.log(sMin());
    return Math.exp(lo + (v / ZOOM_STEPS) * (0 - lo));
  }

  function layoutStage(): void {
    stage.style.setProperty('--idp-ar', `${preset.outW} / ${preset.outH}`);
    requestDraw();
  }

  function requestDraw(): void {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }

  function draw(): void {
    if (!photo || !state) return;
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dpr);
    const h = Math.round((r.width * preset.outH * dpr) / preset.outW);
    for (const c of [photoCanvas, overlayCanvas]) {
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
    }
    const g = photoCanvas.getContext('2d');
    if (g) drawCrop(g, photo.preview, photo.bitmap.width, photo.bitmap.height, state, preset.outW, preset.outH, w / preset.outW);
    drawOverlay(overlayCanvas, preset, state, { w: photo.bitmap.width, h: photo.bitmap.height });
  }

  /** After any change: controls, readout, checklist; the background check and the announcement are debounced. */
  function update(announceNow = false): void {
    if (!photo || !state) return;
    zoomRange.value = String(zoomToRange(state.s));
    rotRange.value = String(state.rotDeg);
    rotOut.value = `${state.rotDeg.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`;
    if (photo.face) {
      const h = headReading(photo.face, state, preset);
      const band = preset.headBand.kind === 'official' ? '규격 32–36 mm' : '참고 32–36 mm';
      readout.textContent =
        h.mm !== null
          ? `추정 머리 길이 ${h.mm.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm (${band})`
          : `추정 머리 길이 사진 높이의 ${Math.round(h.frac * 100)}% (참고 71–80%)`;
    } else {
      readout.textContent = COPY.manualReadout;
    }
    renderChecklist();
    requestDraw();
    clearTimeout(bgTimer);
    bgTimer = setTimeout(measureBackground, 150);
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => {
      if (!current) return;
      say(note ? `${note}. ${COPY.summary(current)}` : COPY.summary(current));
      note = '';
    }, announceNow ? 0 : ANNOUNCE_MS);
  }

  function measureBackground(): void {
    if (!photo || !state) return;
    try {
      bg = checkBackground(renderPreview(photo.preview, { ...state }, preset.outW, preset.outH, BG_EDGE));
    } catch {
      bg = null;
    }
    renderChecklist();
  }

  function renderChecklist(): void {
    if (!photo || !state) return;
    current = checklist({
      face: photo.face,
      state,
      preset,
      srcW: photo.bitmap.width,
      srcH: photo.bitmap.height,
      lowres,
      bg,
      manualReason: photo.manualReason,
      customError: customMsg,
    });
    const items: [keyof typeof ICON, string][] = [
      ...current.blocks.map((b) => ['block', b.text] as [keyof typeof ICON, string]),
      ...current.warns.map((w) => ['warn', w.text] as [keyof typeof ICON, string]),
      ...current.oks.map((o) => ['ok', o.text] as [keyof typeof ICON, string]),
    ];
    list.replaceChildren(
      ...items.map(([kind, text]) => {
        const li = document.createElement('li');
        li.className = `idp-item ${kind}`;
        li.innerHTML = ICON[kind];
        const sr = document.createElement('span');
        sr.className = 'visually-hidden';
        sr.textContent = `${KIND_LABEL[kind]}: `;
        const t = document.createElement('span');
        t.textContent = text;
        li.append(sr, t);
        return li;
      }),
    );
    dispatch({ type: 'blocks', blocks: current.blocks.map((b) => b.id) });
  }

  function change(next: CropState, kind: 'pan' | 'zoom' | 'rotate' | 'reset'): void {
    state = next;
    dispatch({ type: kind });
    update();
  }

  const out = (): { w: number; h: number } => ({ w: preset.outW, h: preset.outH });

  attachStage(stage, () => preset.outW, {
    pan: (dx, dy) => state && change(pan(state, dx, dy), 'pan'),
    zoom: (factor, anchor: Point | null) => state && change(zoomAt(state, out(), factor, anchor ?? { x: preset.outW / 2, y: preset.outH / 2 }, sMin()), 'zoom'),
    pinch: (p0, p1, q0, q1) => state && change(pinch(state, out(), p0, p1, q0, q1, sMin()), 'zoom'),
    rotate: (d) => state && change(rotate(state, d), 'rotate'),
    reset: () => start && change(start, 'reset'),
    end: () => undefined,
  });

  zoomRange.addEventListener('input', () => state && change(zoomTo(state, out(), clampZoom(rangeToZoom(Number(zoomRange.value)), sMin()), sMin()), 'zoom'));
  rotRange.addEventListener('input', () => state && change({ ...state, rotDeg: snapRotation(Number(rotRange.value)) }, 'rotate'));
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-nudge]')) {
    b.addEventListener('click', () => {
      if (!state) return;
      const [dx, dy] = (b.dataset.nudge ?? '0,0').split(',').map(Number) as [number, number];
      change(pan(state, dx * NUDGE, dy * NUDGE), 'pan');
    });
  }
  resetBtn.addEventListener('click', () => start && change(start, 'reset'));
  confirmBox.addEventListener('change', () => dispatch({ type: 'confirm', value: confirmBox.checked }));
  presetSel.addEventListener('change', choosePreset);
  for (const f of [customW, customH, customKb]) f.addEventListener('input', choosePreset);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => requestDraw()).observe(stage);

  // ---------- photo ----------

  function releasePhoto(): void {
    run++;
    auto?.skip();
    auto = null;
    photo?.bitmap.close();
    if (photo && photo.preview !== photo.bitmap) photo.preview.close();
    photo = null;
    state = null;
    start = null;
    bg = null;
    current = null;
    lowres = false;
    worker?.terminate();
    worker = null;
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    result.removeAttribute('src');
    download.removeAttribute('href');
  }

  function toEmpty(): void {
    releasePhoto();
    input.value = '';
    list.replaceChildren();
    setPhase('empty');
  }

  async function openFile(file: File): Promise<void> {
    releasePhoto();
    hideError();
    hideEngineError();
    const my = run;
    const device = detectDevice();
    track({ e: 'pick', t: 'id-photo' });
    const fail = (code: string, msg: string): void => {
      if (my !== run) return;
      track({ e: 'fail', t: 'id-photo', c: code, p: 'parse' });
      setPhase('error');
      showError(msg);
    };
    const bytesErr = checkFileBytes(file.size, device);
    if (bytesErr) return fail('too-large', bytesErr);
    if (file.size === 0) return fail('empty', ERRORS.empty);
    let sniff;
    try {
      const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
      const tail = new Uint8Array(await file.slice(Math.max(0, file.size - TAIL_BYTES)).arrayBuffer());
      sniff = sniffImage(head, { tail, size: file.size });
    } catch {
      return fail('corrupt', ERRORS.corrupt);
    }
    if (sniff.format === 'unknown') return fail('not-image', ERRORS['not-image']);
    if (sniff.format === 'tiff') return fail('unsupported', unsupportedMessage(sniff.format));
    if (sniff.animated) return fail('animated', COPY.animated);
    if (sniff.truncated) return fail('truncated', ERRORS.truncated);
    const dims = orientedSize(sniff);
    if (dims) {
      const d = checkDims(dims.width, dims.height, device);
      if (d) return fail('dims', d);
    }

    setPhase('loading');
    loadingText.textContent = COPY.opening;
    loadingBar.removeAttribute('value');
    if (skipBtn) skipBtn.hidden = true;
    say(COPY.opening);

    const decoded = decodeImage(file, sniff, { maxLongEdge: WORKING_LONG_EDGE });
    const bitmapP = decoded.then((d) => d.src);
    bitmapP.catch(() => undefined);
    // A HEIC photo opens only where the browser decodes it (Safari): wait for that before any face download.
    let heicFailed = false;
    if (sniff.format === 'heic') await decoded.catch(() => (heicFailed = true));
    if (my !== run) return;

    // Face assets in parallel with the decode, only now (a photo was chosen).
    let autoRun: AutoRun | null = null;
    // A build with PUBLIC_ID_PHOTO_AUTOFRAME=0 folds this branch away: no MediaPipe chunk exists at all.
    if (__ID_PHOTO_AUTOFRAME__ && !heicFailed && shouldTryAutoFrame({ flag: true, deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory, storage: sessionStore() })) {
      if (skipBtn) skipBtn.hidden = false;
      try {
        const { runAutoFrame } = await import('./autoframe');
        if (my !== run) return;
        autoRun = runAutoFrame(bitmapP, (p) => {
          if (my !== run) return;
          loadingText.textContent = COPY.loading(p.loaded, p.total);
          loadingBar.max = p.total;
          loadingBar.value = p.loaded;
        });
        auto = autoRun;
      } catch {
        autoRun = null;
      }
    }

    let d;
    try {
      d = await decoded;
    } catch (err) {
      autoRun?.skip();
      const code = err instanceof PhotoError ? err.code : 'corrupt';
      const known = code === 'heic' || code === 'oom' ? code : 'corrupt';
      return fail(known, ERRORS[known]);
    }
    if (my !== run) {
      d.close();
      return;
    }
    const d2 = checkDims(d.sourceWidth, d.sourceHeight, device);
    if (d2) {
      d.close();
      autoRun?.skip();
      return fail('dims', d2);
    }
    const bitmap = d.src;
    let preview = bitmap;
    if (Math.max(bitmap.width, bitmap.height) > PREVIEW_EDGE) {
      const k = PREVIEW_EDGE / Math.max(bitmap.width, bitmap.height);
      preview = await createImageBitmap(bitmap, { resizeWidth: Math.round(bitmap.width * k), resizeHeight: Math.round(bitmap.height * k), resizeQuality: 'high' });
    }

    let face: FaceMeasure | null = null;
    let manualReason: Photo['manualReason'] = null;
    if (autoRun) {
      const o = await autoRun.result;
      if (my !== run) {
        bitmap.close();
        if (preview !== bitmap) preview.close();
        return;
      }
      if (o.kind === 'face') {
        if (hasFace(o.face)) face = o.face;
        else manualReason = 'noface';
      } else {
        manualReason = o.reason === 'skipped' ? 'skipped' : 'failed';
        // Announced with the first checklist summary (a separate message would be replaced at once).
        if (o.reason !== 'skipped') note = COPY.manualSwitch;
      }
    }
    auto = null;
    photo = { bitmap, preview, face, manualReason };
    frameFor(preset);
    layoutStage();
    update(true);
    stage.focus({ preventScroll: true });
  }

  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) void openFile(f);
  });
  skipBtn?.addEventListener('click', () => auto?.skip());
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer?.files?.[0];
    if (f) void openFile(f);
  });

  // ---------- save ----------

  saveBtn.addEventListener('click', () => void save());

  async function save(): Promise<void> {
    if (!photo || !state || !canSave(model)) return;
    const my = run;
    const p = preset;
    const st = { ...state };
    track({ e: 'start', t: 'id-photo', o: 'preset', v: p.id });
    setPhase('exporting');
    say('저장하는 중입니다');
    let pixels: ImageData;
    try {
      pixels = await renderOutput(photo.bitmap, st, p.outW, p.outH);
    } catch {
      if (my === run) backToAdjust('verify', COPY.verify);
      return;
    }
    let w: Worker;
    try {
      w = createEncodeWorker();
    } catch {
      if (my === run) void engineFailed();
      return;
    }
    worker = w;
    w.onerror = (ev) => {
      ev.preventDefault();
      if (my === run && worker === w) void engineFailed();
    };
    w.onmessage = (ev: MessageEvent<EncodeResponse>) => {
      if (my !== run || worker !== w) return;
      w.terminate();
      worker = null;
      const m = ev.data;
      if (m.type === 'done') showDone(p, m.bytes, m.fallback);
      else if (m.code === 'unreachable') backToAdjust('unreachable', COPY.unreachable((p.limitBytes ?? 0) / 1000, p.outW, p.outH));
      else if (m.code === 'engine') void engineFailed();
      else backToAdjust('verify', COPY.verify);
    };
    const req: EncodeRequest = { type: 'encode', pixels, spec: { outW: p.outW, outH: p.outH, ...(p.limitBytes !== undefined ? { limitBytes: p.limitBytes } : {}), dpi: p.dpi } };
    w.postMessage(req, [pixels.data.buffer]);
  }

  async function engineFailed(): Promise<void> {
    worker?.terminate();
    worker = null;
    track({ e: 'fail', t: 'id-photo', c: 'engine', p: 'save' });
    setPhase(lowres ? 'blocked' : 'adjust');
    update(true);
    await showEngineError();
  }

  function backToAdjust(code: string, msg: string): void {
    track({ e: 'fail', t: 'id-photo', c: code, p: 'save' });
    setPhase(lowres ? 'blocked' : 'adjust');
    update(true);
    showError(msg);
  }

  function showDone(p: IdPreset, bytes: Uint8Array, fallback: boolean): void {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }));
    const name = outputName(p);
    track({ e: 'success', t: 'id-photo' });
    download.href = resultUrl;
    download.download = name;
    saveName.textContent = `저장될 이름: ${name}`;
    result.src = resultUrl;
    result.width = p.outW;
    result.height = p.outH;
    result.alt = `저장한 사진 미리보기 (${p.outW}×${p.outH}픽셀)`;
    zoom2.checked = false;
    result.style.width = `${p.outW}px`;
    headline.textContent = COPY.done(formatSize(bytes.length));
    const lim = limitLabel(p);
    const chipTexts = [p.id === 'custom' ? '직접 입력한 규격' : p.label, `${p.outW}×${p.outH}픽셀`, ...(lim ? [lim] : []), '촬영 위치 등 사진 정보 없음'];
    chips.replaceChildren(
      ...chipTexts.map((t) => {
        const li = document.createElement('li');
        li.className = 'idp-chip';
        li.innerHTML = ICON.ok;
        li.append(t);
        return li;
      }),
    );
    fallbackNote.hidden = !fallback;
    fallbackNote.textContent = fallback ? COPY.fallback : '';
    hideError();
    setPhase('done');
    say(COPY.exported(name));
    // The headline, the chips and 내려받기 sit fully below the sticky header (UX-AUDIT-2 P1-1): the box scrolls to
    // its scroll-margin-top, then the headline takes focus without a second scroll.
    done.scrollIntoView({ block: 'start', behavior: 'instant' });
    headline.focus({ preventScroll: true });
  }

  zoom2.addEventListener('change', () => {
    result.style.width = `${preset.outW * (zoom2.checked ? 2 : 1)}px`;
  });
  againBtn.addEventListener('click', () => {
    if (!photo) return toEmpty();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    result.removeAttribute('src');
    download.removeAttribute('href');
    setPhase(lowres ? 'blocked' : 'adjust');
    dispatch({ type: 'preset' });
    layoutStage();
    update(true);
    presetSel.focus();
  });
  newBtn.addEventListener('click', () => {
    toEmpty();
    input.focus();
  });
  window.addEventListener('pagehide', () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
  });
  download.addEventListener('click', () => track({ e: 'download', t: 'id-photo' }));

  // Initial state: whatever the preset controls show now (they work before this module loads).
  choosePreset();
  setPhase('empty');
  const first = pending ?? input.files?.[0];
  if (first) void openFile(first);
  return { open: (file) => void openFile(file) };
}

