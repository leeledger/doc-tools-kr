// 사진 JPG 변환 UI controller (TOOLS5 U1). States: empty → listing → working → done.
// Loaded by entry.ts on the first interaction. Each added photo is checked from its header (sniff) and decoded small
// for its thumbnail, one at a time. 「변환하기」 converts one photo at a time on the main thread (convert.ts: an
// HTMLCanvasElement works where OffscreenCanvas does not), yielding between photos; WebP falls back to @jsquash/webp
// in src/lib/codecs/webp.worker.ts where the canvas cannot save it; one file is saved as is, more go
// into one stored ZIP. Rows that cannot be read or saved say why; the others continue.
import type { WebpRequest, WebpResponse } from '../../lib/codecs/webp.worker';
import type { Sniff } from '../../lib/image/sniff';
import { decodeImage } from '../../lib/image/decode';
import { stripJpegMetadata } from '../../lib/image/jpeg-strip';
import { ERRORS, photoErrorCode } from '../../lib/image/messages';
import { HEAD_BYTES, TAIL_BYTES, sniffImage } from '../../lib/image/sniff';
import { announce, clearAlert } from '../../lib/ui/announce';
import { detectDevice } from '../../lib/ui/device';
import { loadDynamicFont } from '../../lib/ui/font';
import { formatSize } from '../../lib/ui/format';
import { track, type UsagePhase } from '../../lib/ui/usage';
import { dedupeNames } from '../../lib/zip/names';
import { StoredZip } from '../../lib/zip/stored';
import {
  ACCEPTED_FORMATS,
  ConvertError,
  convertImage,
  noteText,
  oncePerCode,
  outputName,
  zipName,
  type ConvertDeps,
  type Ctx2D,
  type QualityLevel,
  type RowNote,
  type Target,
} from './convert';
import { LIMITS, planAdd } from './limits';

type State = 'empty' | 'listing' | 'working' | 'done';
type RowError = 'heic' | 'not-image' | 'corrupt' | 'empty' | 'canvas' | 'encoder' | 'oom' | 'unknown';

interface Output {
  name: string;
  to: Target;
  blob: Blob;
  url: string;
  notes: RowNote[];
}

interface Entry {
  id: number;
  file: File;
  sniff: Sniff | null;
  checking: boolean;
  error: RowError | null;
  /** The error came from a conversion run (not from reading the file): cleared by the next run or a new option. */
  runError: boolean;
  message: string;
  thumb: HTMLCanvasElement | null;
  out: Output | null;
}

const THUMB_EDGE = 128;

const FORMAT_LABEL: Record<string, string> = { jpeg: 'JPG', png: 'PNG', webp: 'WebP', heic: 'HEIC', avif: 'AVIF', gif: 'GIF', bmp: 'BMP', tiff: 'TIFF' };
const TARGET_LABEL: Record<Target, string> = { jpg: 'JPG', png: 'PNG', webp: 'WebP' };

const MESSAGES: Record<Exclude<RowError, 'heic' | 'not-image' | 'corrupt' | 'empty'>, string> = {
  canvas: '이 기기에서 사진을 그리지 못했습니다. 다른 앱이나 PC에서 다시 해 주세요.',
  encoder: '이 형식으로 저장하지 못했습니다. 다른 저장 형식을 골라 다시 해 주세요.',
  oom: ERRORS.oom,
  unknown: ERRORS.unknown,
};

const ICONS = {
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

const nextTask = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** createImageBitmap's resize needs OffscreenCanvas when the browser ignores it (decode.ts); without it, full size. */
const canShrinkOnDecode = (): boolean => typeof OffscreenCanvas !== 'undefined';

/** The page's converter parts: createImageBitmap, an HTMLCanvasElement, toBlob, and @jsquash/webp in its own worker on demand. */
function browserDeps(file: File, sniff: Sniff): ConvertDeps<ImageBitmap, HTMLCanvasElement> {
  return {
    readBytes: async () => new Uint8Array(await file.arrayBuffer()),
    strip: stripJpegMetadata,
    decode: (edge) => decodeImage(file, sniff, { maxLongEdge: canShrinkOnDecode() ? edge : null }),
    surface(width, height) {
      const canvas = el('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx2D | null;
      return {
        canvas,
        ctx,
        release() {
          canvas.width = 0;
          canvas.height = 0;
        },
      };
    },
    encode: (canvas, mime, quality) => new Promise((resolve) => canvas.toBlob(resolve, mime, quality)),
    webp: (img, quality) =>
      new Promise<Uint8Array>((resolve, reject) => {
        let w: Worker;
        try {
          w = new Worker(new URL('../../lib/codecs/webp.worker.ts', import.meta.url), { type: 'module' });
        } catch (err) {
          reject(err);
          return;
        }
        w.onmessage = (ev: MessageEvent<WebpResponse>) => {
          w.terminate();
          if (ev.data.ok) resolve(ev.data.bytes);
          else reject(new Error('webp encoder failed'));
        };
        w.onerror = (ev) => {
          ev.preventDefault();
          w.terminate();
          reject(new Error('webp worker did not load'));
        };
        w.postMessage({ img, quality } satisfies WebpRequest, [img.data.buffer]);
      }),
  };
}

/** A thumbnail at most THUMB_EDGE on its long side. */
async function thumbnail(file: File, sniff: Sniff): Promise<HTMLCanvasElement> {
  const d = await decodeImage(file, sniff, { maxLongEdge: canShrinkOnDecode() ? THUMB_EDGE : null });
  try {
    const s = Math.min(1, THUMB_EDGE / Math.max(d.width, d.height));
    const c = el('canvas');
    c.width = Math.max(1, Math.round(d.width * s));
    c.height = Math.max(1, Math.round(d.height * s));
    c.getContext('2d')?.drawImage(d.src, 0, 0, c.width, c.height);
    return c;
  } finally {
    d.close();
  }
}

/** Row code of a conversion failure. */
function runErrorCode(err: unknown): RowError {
  if (err instanceof ConvertError) return err.code;
  const code = photoErrorCode(err);
  return code === 'heic' || code === 'corrupt' || code === 'oom' ? code : 'unknown';
}

export function initImageToJpg(pending?: File[]): { add(files: File[]): void } | null {
  const found = document.getElementById('ij-tool');
  if (!found) return null;
  const root: HTMLElement = found;

  const input = must<HTMLInputElement>('ij-input');
  const addInput = must<HTMLInputElement>('ij-add');
  const drop = must<HTMLDivElement>('ij-drop');
  const unsupported = must<HTMLParagraphElement>('ij-unsupported');
  const notice = must<HTMLParagraphElement>('ij-notice');
  const list = must<HTMLOListElement>('ij-list');
  const controls = must<HTMLDivElement>('ij-controls');
  const actions = must<HTMLDivElement>('ij-actions');
  const runBtn = must<HTMLButtonElement>('ij-run');
  const hint = must<HTMLParagraphElement>('ij-hint');
  const qualityGroup = must<HTMLFieldSetElement>('ij-quality-group');
  const progressBox = must<HTMLDivElement>('ij-progress');
  const progressText = must<HTMLParagraphElement>('ij-progress-text');
  const progressBar = must<HTMLProgressElement>('ij-progress-bar');
  const cancelBtn = must<HTMLButtonElement>('ij-cancel');
  const result = must<HTMLDivElement>('ij-result');
  const headline = must<HTMLParagraphElement>('ij-headline');
  const summary = must<HTMLParagraphElement>('ij-summary');
  const saveName = must<HTMLParagraphElement>('ij-save-name');
  const download = must<HTMLAnchorElement>('ij-download');
  const resetBtn = must<HTMLButtonElement>('ij-reset');

  let state: State = 'empty';
  let entries: Entry[] = [];
  let nextId = 1;
  // Incremented by every run start, cancel and reset; a run that finds a newer id stops after the current photo.
  let runId = 0;
  let blobUrl: string | null = null;
  // Photos are checked one at a time to bound memory.
  let checkQueue: Promise<void> = Promise.resolve();

  const status = (msg: string): void => announce('status', msg, root);
  const usageFail = (c: string, p: UsagePhase): void => track({ e: 'fail', t: 'image-to-jpg', c, p });

  const showNotice = (msg: string | null): void => {
    notice.hidden = !msg;
    notice.textContent = msg ?? '';
  };

  const radio = (name: string): string => root.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? '';
  const target = (): Target => {
    const v = radio('ij-to');
    return v === 'png' || v === 'webp' ? v : 'jpg';
  };
  const quality = (): QualityLevel => {
    const v = radio('ij-quality');
    return v === 'normal' || v === 'small' ? v : 'high';
  };
  const ready = (): Entry[] => entries.filter((e) => !e.checking && e.error === null);
  /** Rows the next run takes: ready ones and those that failed only while converting (a run clears that first). */
  const runnable = (): number => entries.filter((e) => !e.checking && (e.error === null || e.runError)).length;

  function revokeAll(): void {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
    download.removeAttribute('href');
    for (const e of entries) {
      if (e.out) URL.revokeObjectURL(e.out.url);
      e.out = null;
    }
  }

  function setState(next: State): void {
    state = next;
    root.dataset.state = next;
    const has = entries.length > 0;
    const busy = next === 'working';
    if (busy) document.body.dataset.busy = 'image-to-jpg';
    else delete document.body.dataset.busy;
    drop.hidden = has || busy || next === 'done';
    list.hidden = !has;
    controls.hidden = !has || busy || next === 'done';
    actions.hidden = !has || busy || next === 'done';
    progressBox.hidden = !busy;
    result.hidden = next !== 'done';
    renderList();
    updateRun();
  }

  function updateRun(): void {
    const n = runnable();
    const checking = entries.some((e) => e.checking);
    runBtn.textContent = n ? `사진 ${n.toLocaleString('ko-KR')}장 변환하기` : '변환하기';
    runBtn.disabled = checking || n === 0 || state === 'working';
    hint.textContent = checking ? '사진을 확인하는 중입니다.' : entries.some((e) => e.error && !e.runError) && n ? '문제가 있는 사진은 빼고 바꿉니다.' : '';
  }

  function syncOptions(): void {
    qualityGroup.hidden = target() === 'png';
  }

  // ---------- list ----------

  function renderList(): void {
    const focusedId = (document.activeElement as HTMLElement | null)?.closest('li')?.dataset.id;
    const focusedRole = (document.activeElement as HTMLElement | null)?.dataset.role;
    list.replaceChildren(...entries.map((e) => renderItem(e)));
    if (focusedId && focusedRole) list.querySelector<HTMLElement>(`li[data-id="${focusedId}"] [data-role="${focusedRole}"]`)?.focus();
  }

  function renderItem(e: Entry): HTMLLIElement {
    const li = el('li', 'file-item');
    li.dataset.id = String(e.id);
    const name = e.file.name;

    const thumb = el('div', 'thumb');
    thumb.setAttribute('aria-hidden', 'true');
    if (e.thumb) {
      const c = el('canvas');
      c.width = e.thumb.width;
      c.height = e.thumb.height;
      c.getContext('2d')?.drawImage(e.thumb, 0, 0);
      thumb.append(c);
    } else thumb.append(el('span', 'thumb-ph', e.checking ? '확인 중' : '사진'));

    const meta = el('div', 'meta');
    const nameEl = el('p', 'name', name);
    nameEl.title = name;
    const info = el('p', 'info');
    if (e.error) {
      const s = el('span', 'state-ico err');
      s.append(svgIcon(ICONS.error), el('span', 'visually-hidden', '오류'));
      info.append(s, ' ');
    }
    const from = e.sniff ? FORMAT_LABEL[e.sniff.format] : undefined;
    const parts = [from, formatSize(e.file.size)].filter(Boolean).join(' · ');
    info.append(e.out ? `${parts} → ${TARGET_LABEL[e.out.to]} · ${formatSize(e.out.blob.size)}` : parts);
    meta.append(nameEl, info);

    const act = el('div', 'actions');
    if (e.out) {
      const a = el('a', 'btn small ghost', '내려받기');
      a.href = e.out.url;
      a.download = e.out.name;
      a.dataset.role = 'download';
      a.setAttribute('aria-label', `${e.out.name} 내려받기`);
      a.addEventListener('click', () => track({ e: 'download', t: 'image-to-jpg' }));
      act.append(a);
    } else if (state !== 'done') {
      const del = el('button', 'btn small ghost icon-btn danger');
      del.type = 'button';
      del.dataset.role = 'remove';
      del.setAttribute('aria-label', `${name} 삭제`);
      del.append(svgIcon(ICONS.remove));
      del.disabled = state === 'working';
      del.addEventListener('click', () => remove(e.id));
      act.append(del);
    }

    li.append(thumb, meta, act);
    if (e.error) li.append(el('p', 'row-note file-error', e.message));
    for (const n of e.out?.notes ?? []) li.append(el('p', 'row-note', noteText(n)));
    return li;
  }

  function remove(id: number): void {
    const i = entries.findIndex((e) => e.id === id);
    if (i < 0 || state === 'working') return;
    const [gone] = entries.splice(i, 1);
    showNotice(null);
    if (!entries.length) {
      setState('empty');
      input.focus();
    } else {
      setState('listing');
      const next = entries[Math.min(i, entries.length - 1)]!;
      list.querySelector<HTMLElement>(`li[data-id="${next.id}"] [data-role="remove"]`)?.focus();
    }
    status(`${gone!.file.name} 사진을 목록에서 뺐습니다. ${entries.length}장 남았습니다.`);
  }

  // ---------- adding & checking ----------

  function addFiles(picked: File[]): void {
    if (!picked.length || state === 'working') return;
    if (state === 'done') resetAll(false);
    clearAlert(root);
    track({ e: 'pick', t: 'image-to-jpg' });
    loadDynamicFont();
    const plan = planAdd(
      picked.map((f) => f.size),
      entries.length,
      entries.reduce((a, e) => a + e.file.size, 0),
      detectDevice(),
    );
    // One usage event per code per picked batch (brief decision 7: `fail c=heic` once per batch).
    const failOnce = oncePerCode((code) => usageFail(code, 'parse'));
    for (const c of plan.codes) failOnce(c);
    showNotice(plan.messages.length ? plan.messages.join(' ') : null);
    const accepted = plan.accepted.map(
      (i): Entry => ({ id: nextId++, file: picked[i]!, sniff: null, checking: true, error: null, runError: false, message: '', thumb: null, out: null }),
    );
    if (!accepted.length) {
      status(plan.messages.join(' '));
      return;
    }
    entries.push(...accepted);
    setState('listing');
    status(`사진 ${accepted.length}장을 추가했습니다. 모두 ${entries.length}장입니다.`);
    for (const e of accepted) checkQueue = checkQueue.then(() => checkEntry(e, failOnce)).catch(() => undefined);
  }

  function markError(e: Entry, code: RowError, message: string, runError = false): void {
    e.error = code;
    e.message = message;
    e.runError = runError;
  }

  /** Rows that failed while converting get another try (another format or quality may work). Read errors stay. */
  function clearRunErrors(): void {
    for (const e of entries) {
      if (!e.runError) continue;
      e.error = null;
      e.message = '';
      e.runError = false;
    }
  }

  function onOptionChange(): void {
    syncOptions();
    if (state !== 'listing' || !entries.some((e) => e.runError)) return;
    clearRunErrors();
    renderList();
    updateRun();
  }

  async function checkEntry(e: Entry, failOnce: (code: string) => void): Promise<void> {
    if (!entries.includes(e)) return;
    const f = e.file;
    try {
      if (f.size === 0) {
        markError(e, 'empty', ERRORS.empty);
        failOnce('empty');
      } else {
        const head = new Uint8Array(await f.slice(0, HEAD_BYTES).arrayBuffer());
        const tail = new Uint8Array(await f.slice(Math.max(0, f.size - TAIL_BYTES)).arrayBuffer());
        const s = sniffImage(head, { tail, size: f.size });
        e.sniff = s;
        if (!ACCEPTED_FORMATS.includes(s.format)) {
          markError(e, 'not-image', s.format === 'unknown' ? ERRORS['not-image'] : `${FORMAT_LABEL[s.format] ?? s.format} 형식은 아직 바꿀 수 없습니다.`);
          failOnce('not-image');
        } else if (s.truncated) {
          markError(e, 'corrupt', ERRORS.truncated);
          failOnce('corrupt');
        } else e.thumb = await thumbnail(f, s);
      }
    } catch (err) {
      const code = photoErrorCode(err) === 'heic' ? 'heic' : 'corrupt';
      markError(e, code, code === 'heic' ? ERRORS.heic : ERRORS.corrupt);
      failOnce(code);
    } finally {
      e.checking = false;
    }
    if (entries.includes(e) && state !== 'working') {
      renderList();
      updateRun();
      if (e.error) status(`${f.name}: ${e.message}`);
    }
  }

  // ---------- converting ----------

  async function run(): Promise<void> {
    if (entries.some((e) => e.checking) || state === 'working') return;
    clearRunErrors();
    const todo = ready();
    if (!todo.length) return;
    const id = ++runId;
    showNotice(null);
    clearAlert(root);
    const to = target();
    const level = quality();
    const caps = LIMITS[detectDevice()].caps;
    track({ e: 'start', t: 'image-to-jpg', o: 'to', v: to });
    const failOnce = oncePerCode((code) => usageFail(code, 'process'));
    setState('working');
    progressBar.max = todo.length;
    progressBar.value = 0;
    progressText.textContent = `바꾸는 중… (0/${todo.length})`;
    status('사진을 바꾸는 중입니다.');
    cancelBtn.focus();

    const made: { entry: Entry; blob: Blob; notes: RowNote[] }[] = [];
    for (const [k, e] of todo.entries()) {
      try {
        const r = await convertImage(e.sniff!, { to, quality: level, caps }, browserDeps(e.file, e.sniff!));
        if (id !== runId) return;
        made.push({ entry: e, blob: r.blob, notes: r.notes });
      } catch (err) {
        if (id !== runId) return;
        const code = runErrorCode(err);
        markError(e, code, code === 'heic' ? ERRORS.heic : code === 'corrupt' ? ERRORS.corrupt : MESSAGES[code as keyof typeof MESSAGES], true);
        failOnce(code);
      }
      progressBar.value = k + 1;
      progressText.textContent = `바꾸는 중… (${k + 1}/${todo.length})`;
      await nextTask();
      if (id !== runId) return;
    }

    if (!made.length) {
      setState('listing');
      announce('alert', '사진을 바꾸지 못했습니다. 목록에서 이유를 확인해 주세요.', root);
      runBtn.focus();
      return;
    }
    const names = dedupeNames(made.map((m) => outputName(m.entry.file.name, to)));
    made.forEach((m, i) => {
      m.entry.out = { name: names[i]!, to, blob: m.blob, url: URL.createObjectURL(m.blob), notes: m.notes };
    });
    let out: Blob;
    let outName: string;
    try {
      if (made.length === 1) {
        out = made[0]!.blob;
        outName = names[0]!;
      } else {
        const zip = new StoredZip();
        for (const [i, m] of made.entries()) zip.add(names[i]!, new Uint8Array(await m.blob.arrayBuffer()));
        out = await zip.finish();
        outName = zipName(made[0]!.entry.file.name, to);
      }
    } catch (err) {
      if (id !== runId) return;
      usageFail(runErrorCode(err) === 'oom' ? 'oom' : 'unknown', 'save');
      finish(null, '', made.length, to);
      announce('alert', ERRORS.zip, root);
      return;
    }
    if (id !== runId) return;
    finish(out, outName, made.length, to);
  }

  function cancel(): void {
    if (state !== 'working') return;
    runId++;
    revokeAll();
    setState('listing');
    runBtn.focus();
    status('변환을 멈췄습니다. 사진 목록은 그대로 있습니다.');
  }

  /** `out` null: the ZIP failed, the rows' own links still work. */
  function finish(out: Blob | null, name: string, count: number, to: Target): void {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
    track({ e: 'success', t: 'image-to-jpg' });
    if (out) {
      blobUrl = URL.createObjectURL(out);
      download.href = blobUrl;
      download.download = name;
      download.hidden = false;
      saveName.textContent = `저장될 이름: ${name}`;
    } else {
      download.removeAttribute('href');
      download.hidden = true;
      saveName.textContent = '';
    }
    const failed = entries.filter((e) => e.error).length;
    headline.textContent = count > 1 ? `${TARGET_LABEL[to]} 사진 ${count.toLocaleString('ko-KR')}장이 ZIP 파일로 준비되었습니다` : `${TARGET_LABEL[to]} 사진이 준비되었습니다`;
    summary.textContent = [out ? `${count > 1 ? 'ZIP' : TARGET_LABEL[to]} · ${formatSize(out.size)}` : '', failed ? `바꾸지 못한 사진 ${failed.toLocaleString('ko-KR')}장` : '']
      .filter(Boolean)
      .join(' · ');
    setState('done');
    result.scrollIntoView({ block: 'start' });
    headline.focus({ preventScroll: true });
    status(`${headline.textContent}. ${summary.textContent}.`);
  }

  function resetAll(focus = true): void {
    runId++;
    revokeAll();
    entries = [];
    input.value = '';
    addInput.value = '';
    showNotice(null);
    clearAlert(root);
    setState('empty');
    if (focus) {
      input.focus();
      status('처음 상태로 돌아왔습니다.');
    }
  }

  // ---------- wiring ----------

  if (typeof createImageBitmap !== 'function') {
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
    addFiles(Array.from(ev.dataTransfer?.files ?? []));
  });
  for (const r of root.querySelectorAll<HTMLInputElement>('input[name="ij-to"], input[name="ij-quality"]')) r.addEventListener('change', onOptionChange);
  runBtn.addEventListener('click', () => void run());
  cancelBtn.addEventListener('click', cancel);
  resetBtn.addEventListener('click', () => resetAll());
  window.addEventListener('pagehide', () => {
    if (state === 'working') runId++;
    revokeAll();
  });
  window.addEventListener('pageshow', (ev) => {
    // Coming back from the bfcache: the blob URLs were revoked on pagehide.
    if (ev.persisted && (state === 'done' || state === 'working')) resetAll(false);
  });
  download.addEventListener('click', () => track({ e: 'download', t: 'image-to-jpg' }));

  syncOptions();
  setState('empty');
  // Photos picked or dropped while this module loaded.
  const first = pending ?? Array.from(input.files ?? []);
  input.value = '';
  if (first.length) addFiles(first);
  return { add: addFiles };
}
