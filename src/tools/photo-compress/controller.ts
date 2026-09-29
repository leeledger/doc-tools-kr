// 사진 용량 줄이기 UI controller. States: empty → ready → working → done (rows may mix done, kept and errors).
// The page checks each file from its header and a tail slice only (sniff.ts, never the whole file).
// The worker, the codecs and their wasm load only when "사진 용량 줄이기" is pressed; fflate only on the ZIP click.
import { ERRORS, NOTES, unreachableMessage, unsupportedMessage, type PhotoErrorCode } from '../../lib/image/messages';
import type { PhotoReport } from '../../lib/image/report';
import { HEAD_BYTES, TAIL_BYTES, orientedSize, sniffImage, type Sniff } from '../../lib/image/sniff';
import type { PhotoRequest, PhotoResponse } from '../../lib/image/photo.worker';
import { detectDevice, type Device } from '../../lib/ui/device';
import { hideEngineError, showEngineError } from '../../lib/ui/engine-error';
import { loadDynamicFont } from '../../lib/ui/font';
import { safeFileName } from '../../lib/ui/format';
import { initCompare } from './compare';
import { checkCount, checkDims, checkFileBytes, checkRun } from './limits';
import { DEFAULT_FORM, KB_BYTES, formatSize, parseOptions, rangeMessage, reductionPercent, type FieldName, type FormState, type Parsed } from './options';
import { cancelRun, crash, startRun, summary, type RowState } from './queue';

type State = 'empty' | 'ready' | 'working' | 'done';

interface Result {
  url: string;
  bytes: Uint8Array;
  name: string;
  report: PhotoReport;
  thumbUrl: string | null;
  /** The mobile working bitmap, shown as 원본 in the compare view. */
  previewUrl: string | null;
  /** The run had a byte target (target or percent mode). */
  hasTarget: boolean;
}

interface Row {
  id: number;
  file: File;
  sniff: Sniff | null;
  /** Oriented header size. */
  dims: { width: number; height: number } | null;
  checking: boolean;
  state: RowState;
  error: string | null;
  softPixels: boolean;
  result: Result | null;
  kept: PhotoReport | null;
  origUrl: string | null;
  li: HTMLLIElement;
}

const STATUS: Record<RowState, string> = {
  invalid: '오류',
  pending: '대기',
  decode: '불러오는 중',
  search: '용량 맞추는 중',
  final: '마무리 중',
  done: '완료',
  kept: '완료',
  error: '오류',
};

const PHOTO_ICON =
  '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/></svg>';

/**
 * The photo worker draws and encodes on an OffscreenCanvas (2d + convertToBlob). Browsers without it
 * (Safari before 16.4) get a notice up front instead of a failure per photo; there is no main-thread path.
 * Workers expose OffscreenCanvas wherever the page does, so the page-side check stands for the worker.
 */
export function canCompressPhotos(): boolean {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') return false;
  try {
    const c = new OffscreenCanvas(1, 1);
    return c.getContext('2d') !== null && typeof c.convertToBlob === 'function';
  } catch {
    return false;
  }
}

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

const dimsText = (w: number, h: number): string => `${w}×${h}`;
const stem = (name: string): string => name.replace(/\.[^./\\]+$/, '');

export function initPhotoTool(): void {
  const root = document.getElementById('photo-tool');
  if (!root) return;

  const input = must<HTMLInputElement>('ph-input');
  const addInput = must<HTMLInputElement>('ph-add');
  const drop = must<HTMLDivElement>('ph-drop');
  const notice = must<HTMLParagraphElement>('ph-notice');
  const listBox = must<HTMLDivElement>('ph-list-box');
  const list = must<HTMLUListElement>('ph-list');
  const addRow = must<HTMLDivElement>('ph-add-row');
  const controls = must<HTMLDivElement>('ph-controls');
  const runRow = must<HTMLDivElement>('ph-run-row');
  const runBtn = must<HTMLButtonElement>('ph-run');
  const hint = must<HTMLParagraphElement>('ph-hint');
  const confirmBox = must<HTMLDivElement>('ph-confirm');
  const confirmText = must<HTMLParagraphElement>('ph-confirm-text');
  const confirmYes = must<HTMLButtonElement>('ph-confirm-yes');
  const confirmNo = must<HTMLButtonElement>('ph-confirm-no');
  const progressBox = must<HTMLDivElement>('ph-progress');
  const progressText = must<HTMLParagraphElement>('ph-progress-text');
  const progressBar = must<HTMLProgressElement>('ph-progress-bar');
  const cancelBtn = must<HTMLButtonElement>('ph-cancel');
  const doneBar = must<HTMLDivElement>('ph-done-bar');
  const zipBtn = must<HTMLButtonElement>('ph-zip');
  const zipError = must<HTMLParagraphElement>('ph-zip-error');
  const headline = must<HTMLParagraphElement>('ph-headline');
  const engineBox = must<HTMLDivElement>('ph-engine-error');
  const againBtn = must<HTMLButtonElement>('ph-again');
  const resetBtn = must<HTMLButtonElement>('ph-reset');
  const status = must<HTMLParagraphElement>('ph-status');
  const compareRoot = must<HTMLElement>('ph-compare');
  const formatSummary = must<HTMLElement>('ph-format-summary');
  const fast = must<HTMLInputElement>('ph-fast');
  const fastReason = must<HTMLParagraphElement>('ph-fast-reason');
  const quality = must<HTMLInputElement>('ph-quality');
  const qualityOut = must<HTMLOutputElement>('ph-quality-out');
  const edge = must<HTMLSelectElement>('ph-edge');
  const fields: Record<FieldName, { input: HTMLInputElement; box: HTMLElement | null; error: HTMLElement | null }> = {
    targetCustom: { input: must('ph-target-kb'), box: must('ph-target-custom-box'), error: must('ph-target-kb-error') },
    percentCustom: { input: must('ph-percent-num'), box: must('ph-percent-custom-box'), error: must('ph-percent-num-error') },
    quality: { input: quality, box: null, error: null },
    edgeCustom: { input: must('ph-edge-px'), box: must('ph-edge-custom-box'), error: must('ph-edge-px-error') },
  };
  const subs = { target: must('ph-sub-target'), percent: must('ph-sub-percent'), quality: must('ph-sub-quality') };
  const radios = (name: string): HTMLInputElement[] => Array.from(root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`));
  const checked = (name: string, fallback: string): string => radios(name).find((r) => r.checked)?.value ?? fallback;
  const compare = initCompare(compareRoot);
  const supported = canCompressPhotos();

  let state: State = 'empty';
  let rows: Row[] = [];
  let nextId = 1;
  /** Incremented by every run start, cancel and reset; stale worker messages check it. */
  let runId = 0;
  let worker: Worker | null = null;
  let runIds: number[] = [];
  let runTarget: { kb: number | null; parsed: Extract<Parsed, { ok: true }> } | null = null;
  let compareId: number | null = null;
  let zipUrl: string | null = null;
  let device: Device = detectDevice();

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

  // ---------- form ----------

  function form(): FormState {
    return {
      mode: checked('ph-mode', DEFAULT_FORM.mode) as FormState['mode'],
      target: checked('ph-target', DEFAULT_FORM.target),
      targetCustom: fields.targetCustom.input.value,
      percent: checked('ph-percent', DEFAULT_FORM.percent),
      percentCustom: fields.percentCustom.input.value,
      quality: quality.value,
      edge: edge.value,
      edgeCustom: fields.edgeCustom.input.value,
      format: checked('ph-format', DEFAULT_FORM.format) as FormState['format'],
      fast: fast.checked,
    };
  }

  function renderForm(): Parsed {
    const f = form();
    subs.target.hidden = f.mode !== 'target';
    subs.percent.hidden = f.mode !== 'percent';
    subs.quality.hidden = f.mode !== 'quality';
    fields.targetCustom.box!.hidden = f.target !== 'custom';
    fields.percentCustom.box!.hidden = f.percent !== 'custom';
    fields.edgeCustom.box!.hidden = f.edge !== 'custom';
    qualityOut.value = quality.value;
    formatSummary.textContent = `저장 형식: ${f.format === 'webp' ? 'WebP' : 'JPG'}`;
    fast.disabled = f.format === 'webp' || state === 'working';
    fastReason.hidden = f.format !== 'webp';
    const parsed = parseOptions(f);
    for (const [name, fld] of Object.entries(fields) as [FieldName, (typeof fields)[FieldName]][]) {
      const bad = !parsed.ok && parsed.field === name && fld.input.value.trim() !== '';
      fld.input.setAttribute('aria-invalid', String(bad));
      if (fld.error) fld.error.textContent = bad ? rangeMessage(name) : '';
    }
    return parsed;
  }

  function blocker(parsed: Parsed): string | null {
    if (rows.some((r) => r.checking)) return '사진을 확인하는 중입니다.';
    if (!rows.some((r) => r.state !== 'invalid')) return rows.length ? '줄일 수 있는 사진이 없습니다. 다른 사진을 선택해 주세요.' : null;
    if (!parsed.ok) return parsed.message;
    return null;
  }

  function update(): void {
    const parsed = renderForm();
    const why = blocker(parsed);
    runBtn.disabled = why !== null || state === 'working';
    againBtn.disabled = runBtn.disabled;
    hint.textContent = state === 'working' ? '' : (why ?? '');
  }

  function setState(next: State): void {
    state = next;
    root!.dataset.state = next;
    const has = rows.length > 0;
    drop.hidden = has || next === 'working';
    listBox.hidden = !has;
    addRow.hidden = next === 'working';
    controls.hidden = !has || next === 'working';
    runRow.hidden = next === 'done';
    progressBox.hidden = next !== 'working';
    doneBar.hidden = next !== 'done';
    confirmBox.hidden = true;
    for (const inp of controls.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')) inp.disabled = next === 'working';
    zipBtn.hidden = rows.filter((r) => r.result).length < 2;
    if (next !== 'done') {
      zipError.hidden = true;
      compare.hide();
    }
    update();
    for (const r of rows) renderRow(r);
  }

  // ---------- rows ----------

  function renderRow(r: Row): void {
    const li = r.li;
    li.replaceChildren();
    li.dataset.state = r.state;
    const thumb = el('div', 'ph-thumb');
    if (r.result?.thumbUrl) {
      const img = el('img');
      img.src = r.result.thumbUrl;
      img.alt = '';
      thumb.append(img);
    } else thumb.innerHTML = PHOTO_ICON;

    const meta = el('div', 'ph-meta');
    meta.append(el('p', 'name', r.file.name));
    const info = [formatSize(r.file.size), r.dims ? dimsText(r.dims.width, r.dims.height) : null].filter(Boolean).join(' · ');
    meta.append(el('p', 'info', r.checking ? `${info} · 확인 중` : info));
    const badges = el('p', 'ph-badges');
    if (r.sniff?.hasGps) badges.append(el('span', 'badge', r.result?.report.gpsRemoved ? NOTES.gpsRemoved : NOTES.gpsBefore));
    if (badges.childElementCount) meta.append(badges);
    const st = el('p', 'ph-status', STATUS[r.state]);
    // Before its first run a waiting row needs no status; once a run included it, it shows 대기.
    if (!r.checking && (state === 'working' || state === 'done' || runIds.includes(r.id) || r.state !== 'pending')) meta.append(st);
    if (r.error) meta.append(el('p', 'file-error', r.error));

    const res = r.result;
    if (res) {
      const rep = res.report;
      if (rep.outBytes > rep.inBytes) {
        meta.append(el('p', 'ph-size', NOTES.grown(formatSize(rep.inBytes), formatSize(rep.outBytes), res.hasTarget, rep.resaved)));
      } else {
        meta.append(el('p', 'ph-size', `${formatSize(rep.inBytes)} → ${formatSize(rep.outBytes)}`));
        meta.append(el('p', 'ph-pct', `${reductionPercent(rep.inBytes, rep.outBytes)} % 줄었습니다`));
      }
      if (rep.outW !== rep.inW || rep.outH !== rep.inH) meta.append(el('p', 'ph-dims', `${dimsText(rep.inW, rep.inH)} → ${dimsText(rep.outW, rep.outH)}`));
    }
    const notes = rowNotes(r);
    if (notes.length) {
      const ul = el('ul', 'ph-notes');
      for (const n of notes) {
        const item = el('li', undefined, n);
        item.setAttribute('role', 'note');
        ul.append(item);
      }
      meta.append(ul);
    }

    const actions = el('div', 'actions');
    if (res) {
      const a = el('a', 'btn primary small', '내려받기');
      a.href = res.url;
      a.download = res.name;
      a.setAttribute('aria-label', `${res.name} 내려받기`);
      a.dataset.role = 'download';
      const cmp = el('button', 'btn ghost small', '비교');
      cmp.type = 'button';
      cmp.setAttribute('aria-label', `${r.file.name} 원본과 비교`);
      cmp.setAttribute('aria-pressed', String(compareId === r.id));
      cmp.addEventListener('click', () => showCompare(r.id, true));
      actions.append(a, cmp);
    }
    const del = el('button', 'btn ghost small danger', '삭제');
    del.type = 'button';
    del.setAttribute('aria-label', `${r.file.name} 삭제`);
    del.disabled = state === 'working';
    del.addEventListener('click', () => removeRow(r.id));
    actions.append(del);
    li.append(thumb, meta, actions);
  }

  function rowNotes(r: Row): string[] {
    const rep = r.result?.report ?? r.kept;
    if (!rep) return [];
    if (rep.kept) return [NOTES.kept];
    const n: string[] = [];
    if (rep.encoder === 'stripped') n.push(NOTES.stripped);
    // A grown file already says why in its size line.
    if (rep.resaved && rep.outBytes <= rep.inBytes) n.push(NOTES.resaved);
    if (rep.scaled) n.push(NOTES.scaled(rep.outW, rep.outH));
    if (rep.flattened) n.push(NOTES.flattened);
    if (rep.cmykConverted) n.push(NOTES.cmyk);
    if (rep.mobileCapped) n.push(NOTES.mobileCapped);
    if (rep.mozjpegFallback) n.push(NOTES.mozjpegFallback);
    return n;
  }

  function releaseResult(r: Row): void {
    if (r.result) {
      URL.revokeObjectURL(r.result.url);
      if (r.result.thumbUrl) URL.revokeObjectURL(r.result.thumbUrl);
      if (r.result.previewUrl) URL.revokeObjectURL(r.result.previewUrl);
    }
    r.result = null;
    r.kept = null;
  }

  function releaseRow(r: Row): void {
    releaseResult(r);
    if (r.origUrl) URL.revokeObjectURL(r.origUrl);
    r.origUrl = null;
  }

  function revokeZip(): void {
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    zipUrl = null;
  }

  async function check(r: Row): Promise<void> {
    const f = r.file;
    const invalid = (msg: string): void => {
      r.state = 'invalid';
      r.error = msg;
    };
    try {
      const bytesError = checkFileBytes(f.size, device);
      if (bytesError) return invalid(bytesError);
      if (f.size === 0) return invalid(ERRORS['not-image']);
      const head = new Uint8Array(await f.slice(0, HEAD_BYTES).arrayBuffer());
      const tail = new Uint8Array(await f.slice(Math.max(0, f.size - TAIL_BYTES)).arrayBuffer());
      const s = sniffImage(head, { tail, size: f.size });
      r.sniff = s;
      r.dims = orientedSize(s);
      if (s.format === 'unknown') return invalid(ERRORS['not-image']);
      if (s.format === 'tiff') return invalid(unsupportedMessage(s.format));
      if (s.animated) return invalid(ERRORS.animated);
      if (s.truncated) return invalid(ERRORS.truncated);
      if (r.dims) {
        const d = checkDims(r.dims.width, r.dims.height, device);
        if (d.level === 'hard') return invalid(d.message);
        r.softPixels = d.level === 'soft';
      }
    } catch {
      invalid(ERRORS.corrupt);
    }
  }

  async function addFiles(files: File[]): Promise<void> {
    if (!supported || state === 'working' || !files.length) return;
    device = detectDevice();
    const { accept, message } = checkCount(rows.length, files.length, device);
    showNotice(message);
    if (!accept) {
      if (message) announce(message);
      return;
    }
    loadDynamicFont();
    const added = files.slice(0, accept).map((file): Row => {
      const li = el('li', 'photo-row');
      list.append(li);
      return { id: nextId++, file, sniff: null, dims: null, checking: true, state: 'pending', error: null, softPixels: false, result: null, kept: null, origUrl: null, li };
    });
    rows.push(...added);
    if (state === 'empty') setState('ready');
    else setState(state);
    announce(`사진 ${accept}장을 확인하는 중입니다.`);
    await Promise.all(
      added.map(async (r) => {
        await check(r);
        r.checking = false;
        if (rows.includes(r)) renderRow(r);
      }),
    );
    update();
    const bad = added.filter((r) => r.state === 'invalid').length;
    const ok = added.length - bad;
    announce(`사진 ${ok}장을 추가했습니다.${bad ? ` ${bad}장은 줄일 수 없습니다.` : ''}${message ? ` ${message}` : ''}`);
  }

  function removeRow(id: number): void {
    if (state === 'working') return;
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return;
    const [r] = rows.splice(i, 1);
    releaseRow(r!);
    r!.li.remove();
    const name = r!.file.name;
    if (compareId === id) {
      compareId = null;
      const first = rows.find((x) => x.result);
      if (first) showCompare(first.id, false);
      else compare.hide();
    }
    revokeZip();
    if (!rows.length) {
      resetAll(false);
      announce(`${name}을(를) 목록에서 삭제했습니다.`);
      return;
    }
    setState(state === 'done' && !rows.some((x) => x.result || x.kept) ? 'ready' : state);
    announce(`${name}을(를) 목록에서 삭제했습니다.`);
    (list.querySelector<HTMLButtonElement>('.photo-row button.danger') ?? addInput).focus();
  }

  // ---------- compare ----------

  function showCompare(id: number, focus: boolean): void {
    const r = rows.find((x) => x.id === id);
    if (!r?.result) return;
    compareId = id;
    r.origUrl ??= URL.createObjectURL(r.file);
    const rep = r.result.report;
    const preview = r.result.previewUrl;
    compare.show({
      original: preview ?? r.origUrl,
      result: r.result.url,
      aspect: rep.outW / rep.outH,
      caption: preview ? '원본(휴대폰에서 줄여 불러온 사진)' : `${r.file.name}: 원본과 결과 비교`,
      label: '원본',
    });
    for (const x of rows) renderRow(x);
    if (focus) compareRoot.querySelector<HTMLElement>('.pc-stage')?.focus();
  }

  // ---------- running ----------

  function requestRun(): void {
    const parsed = renderForm();
    if (state === 'working' || blocker(parsed) !== null || !parsed.ok) return;
    const valid = rows.filter((r) => r.state !== 'invalid');
    const question = checkRun(
      valid.reduce((a, r) => a + r.file.size, 0),
      valid.some((r) => r.softPixels),
      device,
    );
    if (question) {
      confirmText.textContent = question;
      confirmBox.hidden = false;
      runRow.hidden = true;
      confirmYes.focus();
      announce(question);
      return;
    }
    start(parsed);
  }

  function setProgress(): void {
    const finished = rows.filter((r) => runIds.includes(r.id) && (r.state === 'done' || r.state === 'kept' || r.state === 'error')).length;
    const total = runIds.length;
    progressBar.max = total;
    progressBar.value = finished;
    progressText.textContent = `사진 줄이는 중… (${Math.min(total, finished + 1)}/${total})`;
  }

  function stopWorker(): void {
    worker?.terminate();
    worker = null;
  }

  function start(parsed: Extract<Parsed, { ok: true }>): void {
    const run = ++runId;
    stopWorker();
    revokeZip();
    for (const r of rows) {
      releaseResult(r);
      if (r.state !== 'invalid') r.error = null;
    }
    compareId = null;
    runIds = startRun(rows);
    runTarget = { kb: parsed.targetKb, parsed };
    showNotice(null);
    hideEngineError(engineBox);
    status.textContent = '';
    setState('working');
    setProgress();
    cancelBtn.focus();
    announce(`사진 ${runIds.length}장을 줄이는 중입니다.`);
    spawn(run, runIds);
  }

  function spawn(run: number, ids: number[]): void {
    const w = new Worker(new URL('../../lib/image/photo.worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    let answered = false;
    w.onmessage = (ev: MessageEvent<PhotoResponse>) => {
      if (worker !== w || run !== runId) return;
      answered = true;
      onMessage(run, ev.data);
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      if (worker !== w || run !== runId) return;
      // A worker that never answered did not load (offline, stale deploy): an engine error, not the file's.
      if (!answered) {
        engineFailure();
        return;
      }
      stopWorker();
      const { failed, rest } = crash(rows, runIds);
      const row = rows.find((r) => r.id === failed);
      if (row) row.error = ERRORS.oom;
      if (rest.length) spawn(run, rest);
      else finish();
      setProgress();
      for (const r of rows) renderRow(r);
    };
    const items = ids.map((id) => ({ id, file: rows.find((r) => r.id === id)!.file }));
    const req: PhotoRequest = { type: 'run', items, options: runTarget!.parsed.options, device };
    w.postMessage(req);
  }

  function rowError(r: Row, code: PhotoErrorCode, size?: { width?: number; height?: number }): string {
    switch (code) {
      case 'unsupported':
        return unsupportedMessage(r.sniff?.format ?? 'unknown');
      case 'target-unreachable': {
        const kb = runTarget?.kb ?? Math.floor((r.file.size * (runTarget?.parsed.options.percent ?? 50)) / 100 / KB_BYTES);
        return unreachableMessage(kb);
      }
      case 'too-large': {
        const d = size?.width && size.height ? checkDims(size.width, size.height, device) : null;
        return d && d.level !== 'ok' ? d.message : ERRORS.oom;
      }
      case 'engine':
        return ERRORS.unknown;
      case 'heic':
      case 'animated':
      case 'not-image':
      case 'corrupt':
      case 'truncated':
      case 'oom':
      case 'unknown':
      case 'verify':
        return ERRORS[code];
    }
  }

  function onMessage(run: number, msg: PhotoResponse): void {
    if (msg.type === 'run-done') {
      stopWorker();
      finish();
      return;
    }
    const r = rows.find((x) => x.id === msg.id);
    if (!r) return;
    if (msg.type === 'item-phase') {
      r.state = msg.phase;
    } else if (msg.type === 'item-done') {
      if (msg.bytes) {
        const ext = msg.mime === 'image/webp' ? '.webp' : '.jpg';
        const blob = new Blob([msg.bytes as Uint8Array<ArrayBuffer>], { type: msg.mime });
        const thumbUrl = msg.thumb ? URL.createObjectURL(new Blob([msg.thumb as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })) : null;
        const previewUrl = msg.sourcePreview ? URL.createObjectURL(new Blob([msg.sourcePreview as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })) : null;
        r.result = {
          url: URL.createObjectURL(blob),
          bytes: msg.bytes,
          name: safeFileName(stem(r.file.name), `_압축${ext}`),
          report: msg.report,
          thumbUrl,
          previewUrl,
          hasTarget: runTarget?.parsed.options.mode !== 'quality',
        };
        r.state = 'done';
      } else {
        r.kept = msg.report;
        r.state = 'kept';
      }
    } else if (msg.type === 'item-error') {
      if (msg.code === 'engine') {
        engineFailure();
        return;
      }
      r.state = 'error';
      r.error = rowError(r, msg.code, msg);
    }
    if (run === runId) {
      setProgress();
      renderRow(r);
    }
  }

  function finish(): void {
    runId++;
    stopWorker();
    const s = summary(rows);
    setState('done');
    const first = rows.find((r) => r.result);
    if (first) showCompare(first.id, false);
    const tail = s.failed ? ` ${s.failed}장은 줄이지 못했습니다.` : '';
    const text = `${s.total}장 중 ${s.done}장을 줄였습니다.${tail}`;
    renderHeadline(text);
    announce(text);
    const target = !zipBtn.hidden ? zipBtn : (list.querySelector<HTMLElement>('a[data-role="download"]') ?? againBtn);
    // The headline and the first download stay in view (below the sticky header); focus lands on a visible element.
    doneBar.scrollIntoView({ block: 'start' });
    target.focus();
  }

  /** Done-state headline: the count, and the total before → after of the finished photos. */
  function renderHeadline(summaryText: string): void {
    const done = rows.filter((r) => r.result);
    const before = done.reduce((a, r) => a + r.result!.report.inBytes, 0);
    const after = done.reduce((a, r) => a + r.result!.report.outBytes, 0);
    headline.textContent = done.length ? `${summaryText} ${formatSize(before)} → ${formatSize(after)}` : summaryText;
  }

  /** The worker or a codec did not load. Rows go back to 대기 (never a file error); the banner offers 새로고침. */
  function engineFailure(): void {
    runId++;
    stopWorker();
    const { anyFinished } = cancelRun(rows);
    setState(anyFinished ? 'done' : 'ready');
    if (anyFinished) renderHeadline(`${summary(rows).total}장 중 ${summary(rows).done}장을 줄였습니다.`);
    const msg = showEngineError(engineBox);
    announce(msg);
    engineBox.querySelector('button')?.focus();
  }

  function cancel(): void {
    if (state !== 'working') return;
    runId++;
    stopWorker();
    const { anyFinished } = cancelRun(rows);
    setState(anyFinished ? 'done' : 'ready');
    if (anyFinished) renderHeadline(`${summary(rows).total}장 중 ${summary(rows).done}장을 줄였습니다.`);
    const first = rows.find((r) => r.result);
    if (first) showCompare(first.id, false);
    (anyFinished ? againBtn : runBtn).focus();
    announce('줄이기를 취소했습니다. 끝난 사진은 그대로 있고 나머지는 대기 중입니다.');
  }

  async function downloadZip(): Promise<void> {
    const done = rows.filter((r) => r.result);
    if (done.length < 2) return;
    zipError.hidden = true;
    let buildZip: (typeof import('./zip'))['buildZip'];
    try {
      ({ buildZip } = await import('./zip'));
    } catch {
      announce(showEngineError(engineBox));
      return;
    }
    try {
      const bytes = buildZip(done.map((r) => ({ name: r.result!.name, bytes: r.result!.bytes })));
      revokeZip();
      zipUrl = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
      const a = el('a');
      a.href = zipUrl;
      a.download = `사진_압축_${done.length}장.zip`;
      a.hidden = true;
      root!.append(a);
      a.click();
      a.remove();
    } catch {
      zipError.textContent = ERRORS.zip;
      zipError.hidden = false;
      announce(ERRORS.zip);
    }
  }

  function resetAll(focus = true): void {
    runId++;
    stopWorker();
    revokeZip();
    for (const r of rows) releaseRow(r);
    rows = [];
    list.replaceChildren();
    runIds = [];
    compareId = null;
    input.value = '';
    addInput.value = '';
    showNotice(null);
    hideEngineError(engineBox);
    status.textContent = '';
    setState('empty');
    if (focus) {
      input.focus();
      announce('처음 상태로 돌아왔습니다.');
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
  root.addEventListener('dragover', (ev) => {
    if (!ev.dataTransfer?.types.includes('Files') || state === 'working') return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    drop.classList.add('over');
  });
  root.addEventListener('dragleave', () => drop.classList.remove('over'));
  root.addEventListener('drop', (ev) => {
    if (state === 'working') return;
    ev.preventDefault();
    drop.classList.remove('over');
    void addFiles(Array.from(ev.dataTransfer?.files ?? []));
  });
  controls.addEventListener('input', () => {
    confirmBox.hidden = true;
    runRow.hidden = state === 'done';
    update();
  });
  controls.addEventListener('change', () => update());
  runBtn.addEventListener('click', requestRun);
  againBtn.addEventListener('click', requestRun);
  confirmYes.addEventListener('click', () => {
    const parsed = renderForm();
    if (parsed.ok) start(parsed);
  });
  confirmNo.addEventListener('click', () => {
    confirmBox.hidden = true;
    runRow.hidden = state === 'done';
    (state === 'done' ? againBtn : runBtn).focus();
  });
  cancelBtn.addEventListener('click', cancel);
  zipBtn.addEventListener('click', () => void downloadZip());
  resetBtn.addEventListener('click', () => resetAll());
  window.addEventListener('pagehide', () => {
    runId++;
    stopWorker();
    revokeZip();
    for (const r of rows) releaseRow(r);
  });
  window.addEventListener('pageshow', (ev) => {
    // Back from the bfcache: every blob URL was revoked on pagehide.
    if (ev.persisted && rows.length) resetAll(false);
  });

  setState('empty');
  if (!supported) {
    must<HTMLParagraphElement>('ph-unsupported').hidden = false;
    input.disabled = true;
    addInput.disabled = true;
  }
}
