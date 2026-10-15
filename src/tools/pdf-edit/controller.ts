// PDF 글자 넣기·편집 UI controller (TOOLS1015 E1). States: empty → opening → locked → ready → working → done.
// Loaded by entry.ts on the first interaction. pdf.js (src/lib/pdf/inspect.ts) opens the PDF and the shared page stage
// (src/lib/pdf/page-stage.ts) shows the page with the items on it; text is previewed on a canvas in the same faces the PDF
// gets (the HWP preview fonts, hwp-shared/fonts.ts), measured and drawn from the same baseline numbers (items.ts), so the
// saved text sits where it was seen. Saving sends the PDF and the drawing plan to edit.worker (pdf-lib + fontkit).
import type { PdfErrorCode, WorkerErrorCode } from '../../lib/pdf/errors';
import type { EditDraw } from '../../lib/pdf/edit';
import type { EditRequest, EditResponse } from '../../lib/pdf/edit.worker';
import type { OpenedPdf } from '../../lib/pdf/inspect';
import type { Range } from '../../lib/hwp/pdf/faces';
import { isOutOfMemory } from '../../lib/pdf/errors';
import { createPageStage } from '../../lib/pdf/page-stage';
import { announce, clearAlert } from '../../lib/ui/announce';
import { detectDevice } from '../../lib/ui/device';
import { hideEngineError, showEngineError } from '../../lib/ui/engine-error';
import { isEngineLoadFailure, withEngineRetry } from '../../lib/ui/engine-load';
import { formatPages, formatSize } from '../../lib/ui/format';
import { hideNextSteps, showNextSteps } from '../../lib/ui/next-steps';
import { bindPasswordToggle } from '../../lib/ui/password';
import { isPdfFile } from '../../lib/ui/pdf-pick';
import { track, type UsagePhase } from '../../lib/ui/usage';
import { loadHwpFonts } from '../hwp-shared/fonts';
import { clampBox, type Box, type PageInfo } from '../pdf-sign/place';
import {
  ASCENT,
  CSS_COLOR,
  DATE_FORMATS,
  FONT_CHAIN,
  PREVIEW_FAMILY,
  RGB,
  TEXT_COLORS,
  baselineOf,
  cleanText,
  clampSize,
  editName,
  fitSize,
  formatDate,
  isText,
  itemsValue,
  linesOf,
  textBox,
  uncovered,
  type DateFormat,
  type EditItem,
  type TextColor,
  type TextItem,
} from './items';
import { covered, loadCoverage } from './coverage';
import { CanvasFailure, pagesToFlatten, renderFlat, type FlatPage } from './flatten';
import { MAX_ITEMS, MAX_TEXT, RASTER_LIMITS, SIZE_DEFAULT, fileLimitMessage } from './limits';
import { textOrigin, whiteRect } from './text-place';

type State = 'empty' | 'opening' | 'locked' | 'ready' | 'working' | 'done';

const MESSAGES = {
  'not-pdf': 'PDF 파일이 아닙니다. PDF 파일을 골라 주세요.',
  password: '이 파일은 비밀번호로 보호되어 있습니다. 비밀번호를 입력해 주세요.',
  'wrong-password': '비밀번호가 맞지 않습니다. 다시 입력해 주세요.',
  corrupt: '파일이 손상되었거나 다운로드가 완료되지 않았습니다. 원본을 다시 받아 주세요.',
  oom: '이 기기에서 한 번에 처리할 수 있는 양을 넘었습니다. 더 작은 파일로 시도하거나 PC에서 다시 시도해 주세요.',
  unknown: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
  font: '글꼴을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 저장해 주세요.',
  canvas: '가린 쪽을 그림으로 바꾸지 못했어요. 「그림으로 바꿔 저장」을 끄고 저장하거나, PC에서 다시 해 주세요.',
} as const;

const OWNER_NOTE = '보안 설정(편집 제한)이 해제된 사본이 만들어집니다.';
const MULTI_NOTE = 'PDF 파일은 한 번에 하나만 쓸 수 있어 첫 번째 파일만 열었습니다.';
const SIGNATURE_NOTE = '전자서명이 들어 있는 문서입니다. 글자를 넣어 새로 저장하면 전자서명이 더 이상 유효하지 않습니다. 발급받은 증명서는 원본을 제출하세요.';
/** Next to the 흰 상자 button while a white box exists (brief: honest scope), with the E2 option right below it. */
const WHITE_NOTE = '흰 상자는 위에 덮는 것이라 밑의 글자는 파일 안에 남습니다. 남지 않게 하려면 아래 「그림으로 바꿔 저장」을 켜세요.';
const WHITE_RESULT_NOTE = '흰 상자로 가린 곳의 원래 글자는 파일 안에 그대로 남아 있습니다.';
/**
 * An item over an annotation (a form field, a note, a stamp): viewers paint those over the page content, so in the saved
 * file the field shows over a white box, or hides inserted text (E2 round 2, Arch: say so; nothing is deleted).
 */
const FIELD_NOTE = {
  white: '이 자리에 입력 칸이나 메모가 있어 저장한 파일에서는 그 내용이 흰 상자 위에 보일 수 있어요. 완전히 가리려면 「흰 상자로 가린 쪽은 그림으로 바꿔 저장」을 켜 주세요.',
  text: '이 자리에 입력 칸이나 메모가 있어 저장한 파일에서는 넣은 글자가 그 아래에 가려질 수 있어요.',
} as const;
const FIELD_RESULT_NOTE = '입력 칸이나 메모와 겹친 흰 상자나 글자가 있어요. 저장한 파일에서는 그 내용이 위에 보이거나 넣은 글자가 가려질 수 있어요.';
const PLACEHOLDER = '글자를 쓰세요';
const COLOR_LABELS: Record<TextColor, string> = { black: '검정', blue: '파랑' };
/** Item names (each takes 를). */
const KIND_LABELS = { text: '글자', date: '날짜', white: '흰 상자' } as const;
/** The 흰 상자 a new box starts as, in points (at most this share of the page width). */
const WHITE_W = 120;
const WHITE_H = 24;
/** Measuring size for widths in em. */
const MEASURE_PX = 100;

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
const createEditWorker = (): Worker => new Worker(new URL('../../lib/pdf/edit.worker.ts', import.meta.url), { type: 'module' });

/** A failed worker run: `engine` when the worker script never answered. */
class RunFailure extends Error {
  constructor(readonly code: WorkerErrorCode | 'font') {
    super(code);
  }
}

/** Characters no face had when saving (the worker found them). */
class MissingChars extends Error {
  constructor(readonly chars: string) {
    super(chars);
  }
}

/** One radio chip (the chips' words live here, in the late face). */
function chip(name: string, value: string, label: string): HTMLLabelElement {
  const l = el('label', 'chip');
  const r = el('input');
  r.type = 'radio';
  r.name = name;
  r.value = value;
  l.append(r, el('span', undefined, label));
  return l;
}

export function initPdfEdit(pending?: File[]): { open(files: File[]): Promise<void> } | null {
  const found = document.getElementById('ed-tool');
  if (!found) return null;
  const root: HTMLElement = found;

  const input = must<HTMLInputElement>('ed-input');
  const drop = must<HTMLDivElement>('ed-drop');
  const notice = must<HTMLParagraphElement>('ed-notice');
  const card = must<HTMLDivElement>('ed-file');
  const nameEl = must<HTMLParagraphElement>('ed-name');
  const infoEl = must<HTMLParagraphElement>('ed-info');
  const pwForm = must<HTMLFormElement>('ed-pw');
  const pwInput = must<HTMLInputElement>('ed-pw-input');
  const pwError = must<HTMLParagraphElement>('ed-pw-error');
  const editor = must<HTMLDivElement>('ed-editor');
  const prevBtn = must<HTMLButtonElement>('ed-prev');
  const nextBtn = must<HTMLButtonElement>('ed-next');
  const gotoInput = must<HTMLInputElement>('ed-goto');
  const pageCountEl = must<HTMLSpanElement>('ed-page-count');
  const addText = must<HTMLButtonElement>('ed-add-text');
  const addDate = must<HTMLButtonElement>('ed-add-date');
  const addWhite = must<HTMLButtonElement>('ed-add-white');
  const whiteNote = must<HTMLParagraphElement>('ed-white-note');
  const itemNote = must<HTMLParagraphElement>('ed-item-note');
  const flattenBox = must<HTMLLabelElement>('ed-flatten-box');
  const flattenInput = must<HTMLInputElement>('ed-flatten');
  const stage = must<HTMLDivElement>('ed-stage');
  const controls = must<HTMLDivElement>('ed-controls');
  const textBoxEl = must<HTMLDivElement>('ed-text-box');
  const textInput = must<HTMLTextAreaElement>('ed-text');
  const textError = must<HTMLParagraphElement>('ed-text-error');
  const formats = must<HTMLFieldSetElement>('ed-formats');
  const formatChips = must<HTMLDivElement>('ed-format-chips');
  const colorChips = must<HTMLDivElement>('ed-color-chips');
  const sizeInput = must<HTMLInputElement>('ed-size');
  const sizeOut = must<HTMLOutputElement>('ed-size-out');
  const removeBtn = must<HTMLButtonElement>('ed-remove');
  const hint = must<HTMLParagraphElement>('ed-hint');
  const actions = must<HTMLDivElement>('ed-actions');
  const runBtn = must<HTMLButtonElement>('ed-run');
  const changeBtn = must<HTMLButtonElement>('ed-change');
  const progressBox = must<HTMLDivElement>('ed-progress');
  const cancelBtn = must<HTMLButtonElement>('ed-cancel');
  const result = must<HTMLDivElement>('ed-result');
  const headline = must<HTMLParagraphElement>('ed-headline');
  const summary = must<HTMLParagraphElement>('ed-summary');
  const notes = must<HTMLUListElement>('ed-notes');
  const download = must<HTMLAnchorElement>('ed-download');
  const againBtn = must<HTMLButtonElement>('ed-again');
  const resetBtn = must<HTMLButtonElement>('ed-reset');
  const saveName = must<HTMLParagraphElement>('ed-save-name');
  const nextSlot = must<HTMLDivElement>('ed-chain');

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

  let items: EditItem[] = [];
  let nextId = 1;
  /** Size and colour of the last text item touched: the next one starts with them. */
  let lastSize = SIZE_DEFAULT;
  let lastColor: TextColor = 'black';
  /** Box width each text item was last drawn at (a corner drag scales the size by the new width over it). */
  const drawnW = new Map<number, number>();
  /** Code point ranges of the faces (null until the face list arrived, or when it cannot: every character passes then). */
  let coverage: Range[] | null = null;
  /** Characters the worker found no glyph for, though a face's range names them. */
  const noGlyph = new Set<string>();

  const status = (msg: string): void => announce('status', msg, root);
  const usageFail = (c: string, p: UsagePhase): void => track({ e: 'fail', t: 'pdf-edit', c, p });
  const byId = (id: number): EditItem | undefined => items.find((i) => i.id === id);
  const covers = (cp: number): boolean => !noGlyph.has(String.fromCodePoint(cp)) && covered(coverage, cp);
  const badChars = (it: EditItem): string[] => (isText(it) ? uncovered(it.text, covers) : []);

  // ---------- measuring and drawing text ----------

  let measureCtx: CanvasRenderingContext2D | null = null;
  const setFont = (g: CanvasRenderingContext2D, px: number): void => {
    g.font = `${px}px ${PREVIEW_FAMILY}`;
    if ('fontKerning' in g) g.fontKerning = 'none';
  };
  /** A line's width in em in the preview face (pdf-lib measures the same advances when saving). */
  const widthEm = (line: string): number => {
    measureCtx ??= el('canvas').getContext('2d');
    if (!measureCtx) return line.length * 0.6;
    setFont(measureCtx, MEASURE_PX);
    return measureCtx.measureText(line).width / MEASURE_PX;
  };

  /** Re-measures a text item: smaller if it would not fit its page, then its box from its top-left corner. */
  function refit(it: TextItem): void {
    const info = it.page === pageStage.page ? pageStage.current() : undefined;
    if (info) it.size = fitSize(it.text, it.size, info.width, info.height, widthEm);
    it.box = textBox(it.box.x, it.box.y, it.text, it.size, widthEm);
  }

  /** The preview faces for `text`: the CSS once, then the slices it needs; the boxes are re-measured when they arrive. */
  function ensureFont(text: string): void {
    void loadHwpFonts()
      .then(() => document.fonts.load(`400 ${MEASURE_PX}px ${PREVIEW_FAMILY}`, text || PLACEHOLDER))
      .catch(() => [])
      .then(() => {
        if (state !== 'ready') return;
        for (const it of items) if (isText(it)) refit(it);
        pageStage.draw();
        updateUi();
      });
  }

  /**
   * A text item's lines from the canvas origin, `pxPerPt` canvas pixels per point. Drawn at the measuring size and scaled
   * down: small canvas text snaps its advances to whole pixels, which would make it wider or narrower than the PDF
   * (pdf-lib uses the font's exact advances, as measured here).
   */
  function paintLines(g: CanvasRenderingContext2D, it: TextItem, pxPerPt: number, placeholder: boolean): void {
    g.save();
    const k = (pxPerPt * it.size) / MEASURE_PX;
    g.scale(k, k);
    setFont(g, MEASURE_PX);
    g.textBaseline = 'alphabetic';
    if (!it.text.trim()) {
      if (placeholder) {
        g.fillStyle = '#80868b';
        g.fillText(PLACEHOLDER, 0, baselineOf(0, MEASURE_PX));
      }
    } else {
      g.fillStyle = CSS_COLOR[it.color];
      linesOf(it.text).forEach((line, i) => g.fillText(line, 0, baselineOf(i, MEASURE_PX)));
    }
    g.restore();
  }

  function renderText(it: TextItem, b: HTMLButtonElement, scale: number, shown: { w: number; h: number }): void {
    drawnW.set(it.id, shown.w);
    const c = el('canvas', 'edit-fill');
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(shown.w * scale * dpr));
    c.height = Math.max(1, Math.round(shown.h * scale * dpr));
    const g = c.getContext('2d');
    if (g) paintLines(g, it, scale * dpr, true);
    b.append(c);
  }

  // ---------- annotations (form fields, notes, stamps) under the items ----------

  /**
   * Annotation rectangles by page, as seen. Left out: Link and Popup, hidden or NoView ones (pdf.js `hidden`) and empty
   * rectangles: they draw nothing over the page.
   */
  const annots = new Map<number, Box[]>();
  const annotsLoading = new Map<number, Promise<void>>();
  /** Loads page `index`'s list once (the save awaits it for every page with an item). */
  function loadAnnots(index: number): Promise<void> {
    const doc = opened?.doc;
    if (!doc || annots.has(index)) return Promise.resolve();
    const running = annotsLoading.get(index);
    if (running) return running;
    const p = doc
      .getPage(index + 1)
      .then(async (page) => {
        const list = (await page.getAnnotations()) as { subtype?: string; rect?: number[]; hidden?: boolean }[];
        const vp = page.getViewport({ scale: 1 });
        const boxes = list
          .filter((a) => a.subtype !== 'Link' && a.subtype !== 'Popup' && !a.hidden && Array.isArray(a.rect) && a.rect.length === 4)
          .map((a) => {
            const [rx1 = 0, ry1 = 0, rx2 = 0, ry2 = 0] = a.rect!;
            const [x1 = 0, y1 = 0] = vp.convertToViewportPoint(rx1, ry1);
            const [x2 = 0, y2 = 0] = vp.convertToViewportPoint(rx2, ry2);
            return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
          })
          .filter((b) => b.w > 0 && b.h > 0);
        if (opened?.doc !== doc) return;
        annots.set(index, boxes);
        updateUi();
      })
      .catch(() => undefined)
      .finally(() => annotsLoading.delete(index));
    annotsLoading.set(index, p);
    return p;
  }
  const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  /** Whether the item lies over an annotation of its page (whose appearance viewers paint over the page content). */
  const onAnnot = (it: EditItem): boolean => (annots.get(it.page) ?? []).some((b) => overlaps(b, it.box));

  // The page preview and the item boxes on it (src/lib/pdf/page-stage.ts).
  const pageStage = createPageStage({
    el: stage,
    cls: 'sign',
    hintId: 'ed-stage-hint',
    hooks: {
      items: (index) => {
        const k = { text: 0, date: 0, white: 0 };
        return items
          .filter((it) => it.page === index)
          .map((it) => ({
            id: it.id,
            box: it.box,
            label: `${KIND_LABELS[it.kind]} ${++k[it.kind]}, ${formatPages(index + 1)}`,
            resizeMode: it.kind === 'white' ? ('free' as const) : ('aspect' as const),
            render: (b: HTMLButtonElement, scale: number, shown: { w: number; h: number }) => {
              if (isText(it)) renderText(it, b, scale, shown);
              else b.append(el('span', 'edit-fill edit-white'));
            },
          }));
      },
      boxOf: (id) => byId(id)?.box,
      store: (id, box) => {
        const it = byId(id);
        if (!it) return;
        it.box = box;
        // The 입력 칸 note follows the box.
        if (it.id === pageStage.selection) updateControls();
      },
      editable: () => state === 'ready',
      selected: () => updateControls(),
      moved: (id, resized) => {
        const it = byId(id);
        if (!it) return;
        if (resized && isText(it)) {
          // The corner scales the text: the size follows the new width, and the box is measured again.
          const before = drawnW.get(id) ?? it.box.w;
          it.size = clampSize((it.size * it.box.w) / before);
          lastSize = it.size;
          refit(it);
          pageStage.draw();
        }
        updateControls();
        status(resized ? (isText(it) ? `글자 크기를 ${it.size}로 바꿨습니다.` : '흰 상자 크기를 바꿨습니다.') : `${KIND_LABELS[it.kind]}를 옮겼습니다.`);
      },
      remove: () => removeSelected(),
      changed: () => updateUi(),
    },
  });
  const sel = (): EditItem | undefined => (pageStage.selection === null ? undefined : byId(pageStage.selection));

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

  function setState(next: State): void {
    state = next;
    root.dataset.state = next;
    const busy = next === 'working';
    if (busy) document.body.dataset.busy = 'pdf-edit';
    else delete document.body.dataset.busy;
    drop.hidden = next !== 'empty';
    card.hidden = next === 'empty' || next === 'done';
    pwForm.hidden = next !== 'locked';
    editor.hidden = next !== 'ready';
    actions.hidden = next === 'empty' || busy || next === 'done';
    runBtn.hidden = next !== 'ready';
    hint.hidden = next !== 'ready';
    progressBox.hidden = !busy;
    result.hidden = next !== 'done';
    if (next !== 'done') hideNextSteps(nextSlot);
    updateUi();
  }

  // ---------- the plan ----------

  /** Why saving cannot start yet, or null. */
  function blocker(): string | null {
    if (!items.length) return '「글자 넣기」, 「오늘 날짜」, 「흰 상자」로 넣을 것을 정해 주세요.';
    if (items.some((it) => isText(it) && !it.text.trim())) return '비어 있는 글자 칸이 있습니다. 글자를 쓰거나 그 칸을 빼 주세요.';
    const bad = [...new Set(items.flatMap(badChars))];
    if (bad.length) return `넣을 수 없는 글자가 있습니다: ${bad.join(' ')}. 그 글자를 지워 주세요.`;
    return null;
  }

  function updateUi(): void {
    if (state !== 'ready') return;
    const why = blocker();
    runBtn.disabled = why !== null;
    const pages = new Set(items.map((it) => it.page)).size;
    hint.textContent = why ?? `${formatPages(pages)}에 ${items.length.toLocaleString('ko-KR')}개를 넣어 저장합니다.`;
    const full = items.length >= MAX_ITEMS;
    for (const b of [addText, addDate, addWhite]) b.disabled = full;
    const hasWhite = items.some((it) => it.kind === 'white');
    whiteNote.hidden = !hasWhite;
    whiteNote.textContent = hasWhite ? WHITE_NOTE : '';
    flattenBox.hidden = !hasWhite;
    void loadAnnots(pageStage.page);
    const cur = pageStage.page;
    prevBtn.disabled = cur <= 0;
    nextBtn.disabled = cur >= pageCount - 1;
    if (document.activeElement !== gotoInput) gotoInput.value = String(cur + 1);
    pageCountEl.textContent = ` / ${formatPages(pageCount)}`;
    gotoInput.setAttribute('aria-label', `보는 쪽, 전체 ${formatPages(pageCount)}`);
    updateControls();
  }

  /** The controls of the chosen item: its text, date form, size and colour (a white box has only 빼기). */
  function updateControls(): void {
    const it = sel();
    controls.hidden = !it;
    if (!it) return;
    textBoxEl.hidden = !isText(it);
    removeBtn.textContent = `이 ${KIND_LABELS[it.kind]} 빼기`;
    const field = onAnnot(it) ? FIELD_NOTE[it.kind === 'white' ? 'white' : 'text'] : '';
    itemNote.hidden = !field;
    itemNote.textContent = field;
    if (!isText(it)) return;
    if (document.activeElement !== textInput && textInput.value !== it.text) textInput.value = it.text;
    const bad = badChars(it);
    textError.textContent = bad.length ? `넣을 수 없는 글자: ${bad.join(' ')}` : '';
    if (bad.length) textInput.setAttribute('aria-invalid', 'true');
    else textInput.removeAttribute('aria-invalid');
    formats.hidden = it.kind !== 'date';
    for (const r of formatChips.querySelectorAll('input')) r.checked = r.value === it.format;
    for (const r of colorChips.querySelectorAll('input')) r.checked = r.value === it.color;
    sizeInput.value = String(it.size);
    sizeOut.value = String(it.size);
    sizeInput.setAttribute('aria-valuetext', `글자 크기 ${it.size}`);
  }

  // ---------- items ----------

  function add(kind: EditItem['kind']): void {
    const info = pageStage.current();
    if (state !== 'ready' || !info) return;
    if (items.length >= MAX_ITEMS) {
      status(`한 문서에 ${MAX_ITEMS.toLocaleString('ko-KR')}개까지 넣을 수 있습니다.`);
      return;
    }
    // Upper left, each new one on this page a little lower and to the right.
    const here = items.filter((it) => it.page === pageStage.page).length % 12;
    const x = info.width * 0.1 + 12 * here;
    const y = info.height * 0.1 + 36 * here;
    const id = nextId++;
    let it: EditItem;
    if (kind === 'white') {
      it = { id, kind, page: pageStage.page, box: { x, y, w: Math.min(WHITE_W, info.width * 0.4), h: WHITE_H } };
    } else {
      const format: DateFormat = 'dot';
      const text = kind === 'date' ? formatDate(new Date(), format) : '';
      it = { id, kind, page: pageStage.page, box: { x, y, w: 0, h: 0 }, text, size: lastSize, color: lastColor, format };
      refit(it);
      ensureFont(text);
    }
    items.push(it);
    pageStage.setSelection(id);
    pageStage.draw(id);
    updateUi();
    if (isText(it)) {
      textInput.focus();
      textInput.select();
    }
    status(`${formatPages(pageStage.page + 1)}에 ${KIND_LABELS[kind]}를 놓았습니다. 끌거나 화살표 키로 옮기세요.`);
  }

  function removeSelected(): void {
    const it = sel();
    if (!it || state !== 'ready') return;
    items = items.filter((x) => x !== it);
    drawnW.delete(it.id);
    pageStage.setSelection(null);
    pageStage.draw();
    updateUi();
    addText.focus();
    status(`${KIND_LABELS[it.kind]}를 뺐습니다.`);
  }

  /** Applies a change to the chosen text item, then measures and draws it again. */
  function changeText(f: (it: TextItem) => void): void {
    const it = sel();
    if (!it || !isText(it) || state !== 'ready') return;
    f(it);
    refit(it);
    pageStage.draw();
    updateUi();
  }

  // ---------- opening ----------

  /** The faces' code point ranges (the face list the worker reads too); unknown on failure, so nothing is blocked. */
  let coverageLoad: Promise<void> | null = null;
  function startCoverage(): void {
    coverageLoad ??= loadCoverage()
      .then((ranges) => {
        coverage = ranges;
        updateUi();
      })
      .catch(() => {
        // Tried again with the next file; until then nothing is blocked (the worker still checks).
        coverageLoad = null;
      });
  }

  async function closeDoc(): Promise<void> {
    pageStage.clear();
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
    items = [];
    drawnW.clear();
    noGlyph.clear();
    annots.clear();
    flattenInput.checked = false;
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
    track({ e: 'pick', t: 'pdf-edit' });
    // The preview faces (the dynamic UI face comes with them) and the face list, while the file opens.
    void loadHwpFonts();
    startCoverage();
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
      pageStage.open(o.doc, pageCount);
      await pageStage.info(0).catch(() => undefined);
      if (id !== runId) return;
      await pageStage.show(0);
      if (id !== runId) return;
      addText.focus();
      status(`${file.name}, ${formatPages(pageCount)}. 「글자 넣기」, 「오늘 날짜」, 「흰 상자」로 넣을 것을 고르세요.`);
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

  /** The drawing plan: white boxes and text lines in PDF space, page by page. */
  async function plan(): Promise<EditDraw[]> {
    const draws: EditDraw[] = [];
    for (const it of items) {
      const info: PageInfo = await pageStage.info(it.page);
      if (it.kind === 'white') {
        draws.push({ kind: 'white', page: it.page, ...whiteRect(it.box, info) });
        continue;
      }
      const lines = linesOf(it.text).map((text, i) => {
        const o = textOrigin(it.box, info, ASCENT, it.size, i);
        return { text, x: o.x, y: o.y };
      });
      draws.push({ kind: 'text', page: it.page, lines, size: it.size, rgb: RGB[it.color], rotate: textOrigin(it.box, info, ASCENT, it.size).rotate });
    }
    return draws;
  }

  /** One request to a new edit worker (kept in `worker` so cancel and pagehide can stop it). */
  function inWorker(req: EditRequest, transfer: Transferable[]): Promise<{ bytes: Uint8Array; signed: boolean }> {
    stopWorker();
    const w = createEditWorker();
    worker = w;
    let answered = false;
    return new Promise((resolve, reject) => {
      w.onmessage = (ev: MessageEvent<EditResponse>) => {
        answered = true;
        const msg = ev.data;
        if (msg.type === 'done') resolve({ bytes: msg.bytes, signed: msg.signed });
        else if (msg.type === 'missing') reject(new MissingChars(msg.chars));
        else reject(new RunFailure(msg.code));
      };
      w.onerror = (ev) => {
        ev.preventDefault();
        reject(new RunFailure(answered ? 'unknown' : 'engine'));
      };
      w.postMessage(req, transfer);
    });
  }

  /**
   * Drawn over a converted page after pdf.js (annotations included): its white boxes, then its text items that sit on a
   * white box or an annotation, so the picture shows them as placed (E2 round 2, Arch).
   */
  function paintOver(index: number, info: PageInfo): (g: CanvasRenderingContext2D, scale: number) => void {
    const here = items.filter((it) => it.page === index);
    const whites = here.filter((it) => it.kind === 'white').map((it) => clampBox(it.box, info.width, info.height));
    return (g, scale) => {
      g.save();
      g.fillStyle = '#ffffff';
      for (const b of whites) g.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
      g.restore();
      for (const it of here) {
        if (!isText(it) || !(onAnnot(it) || whites.some((w) => overlaps(w, it.box)))) continue;
        const b = clampBox(it.box, info.width, info.height);
        g.save();
        g.translate(b.x * scale, b.y * scale);
        paintLines(g, it, scale, false);
        g.restore();
      }
    };
  }

  /** The pages of the saved PDF that get a white box, drawn as JPEGs (E2), one at a time. */
  async function drawFlat(saved: Uint8Array, pages: readonly number[]): Promise<FlatPage[]> {
    const { openPdf } = await loadInspect();
    const o = await openPdf(saved);
    if (!o) throw new RunFailure('unknown');
    try {
      const caps = RASTER_LIMITS[detectDevice()].caps;
      const out: FlatPage[] = [];
      for (const index of pages) out.push(await renderFlat(o.doc, index, caps, paintOver(index, await pageStage.info(index))));
      return out;
    } finally {
      await o.close().catch(() => undefined);
    }
  }

  async function run(): Promise<void> {
    if (state !== 'ready' || !file || !bytes) return;
    const why = blocker();
    if (why) {
      status(why);
      return;
    }
    clearAlert(root);
    const id = ++runId;
    const source = file;
    const pw = password;
    track({ e: 'start', t: 'pdf-edit', o: 'items', v: itemsValue(items) });
    setState('working');
    status('글자를 넣어 저장하는 중입니다.');
    cancelBtn.focus();
    try {
      // The annotation lists of every page with an item, before the plan, the picture and the result notes use them.
      await Promise.all([...new Set(items.map((it) => it.page))].map(loadAnnots));
      if (id !== runId) return;
      const draws = await plan();
      if (id !== runId) return;
      // pdf-lib takes the buffer it is given (transferred), so it gets a copy.
      const buffer = bytes.slice().buffer;
      let out = await inWorker({ type: 'edit', buffer, password: pw, draws, chain: FONT_CHAIN }, [buffer]);
      if (id !== runId) return;
      const flat = flattenBox.hidden || !flattenInput.checked ? [] : pagesToFlatten(items);
      if (flat.length) {
        status('흰 상자로 가린 쪽을 그림으로 바꾸는 중입니다.');
        const pages = await drawFlat(out.bytes, flat);
        if (id !== runId) return;
        const saved = out.bytes.slice().buffer;
        const flatReq: EditRequest = { type: 'flatten', buffer: saved, pages: pages.map((p) => ({ index: p.index, jpeg: new Uint8Array(p.jpeg), width: p.width, height: p.height })) };
        out = { bytes: (await inWorker(flatReq, [saved, ...pages.map((p) => p.jpeg)])).bytes, signed: out.signed };
        if (id !== runId) return;
      }
      stopWorker();
      finish(new Blob([out.bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), out.signed, source, flat);
    } catch (err) {
      if (id !== runId) return;
      stopWorker();
      setState('ready');
      pageStage.draw();
      if (err instanceof MissingChars) {
        // A face's range names the character but the face has no glyph for it: the item shows it, saving waits.
        for (const ch of err.chars) noGlyph.add(ch);
        updateUi();
        announce('alert', `넣을 수 없는 글자: ${[...err.chars].join(' ')}. 그 글자를 지우고 다시 저장해 주세요.`, root);
        return;
      }
      const code: WorkerErrorCode | 'font' | 'canvas' = err instanceof RunFailure ? err.code : err instanceof CanvasFailure ? 'canvas' : isOutOfMemory(err) ? 'oom' : 'unknown';
      if (code === 'engine') {
        usageFail('engine', 'process');
        void showEngineError();
        return;
      }
      usageFail(code, code === 'verify' ? 'save' : 'process');
      announce('alert', code === 'corrupt' || code === 'oom' || code === 'font' || code === 'canvas' ? MESSAGES[code] : MESSAGES.unknown, root);
      runBtn.focus();
    }
  }

  function cancel(): void {
    if (state !== 'working') return;
    runId++;
    stopWorker();
    setState('ready');
    pageStage.draw();
    runBtn.focus();
    status('저장을 취소했습니다. 넣은 글자와 상자는 그대로 있습니다.');
  }

  function finish(out: Blob, signed: boolean, source: File, flattened: readonly number[]): void {
    revokeBlob();
    blobUrl = URL.createObjectURL(out);
    track({ e: 'success', t: 'pdf-edit' });
    download.href = blobUrl;
    download.download = editName(source.name);
    headline.textContent = 'PDF가 준비되었습니다';
    const pages = new Set(items.map((it) => it.page)).size;
    summary.textContent = `${formatPages(pages)}에 ${items.length.toLocaleString('ko-KR')}개를 넣었습니다 · ${formatSize(out.size)}`;
    const lines: (string | HTMLLIElement)[] = signed ? [SIGNATURE_NOTE] : [];
    if (flattened.length) lines.push(`${formatPages(flattened.length)}을 그림으로 바꿔 저장했어요. 그 쪽의 글자는 복사할 수 없어요.`);
    else if (items.some((it) => it.kind === 'white')) lines.push(WHITE_RESULT_NOTE);
    // Items over a field on a page that stayed as it was (a converted page shows the boxes over the fields).
    if (items.some((it) => !flattened.includes(it.page) && onAnnot(it))) lines.push(FIELD_RESULT_NOTE);
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
    showNextSteps(nextSlot, 'pdf-edit', [{ blob: out, name: download.download }]);
    result.scrollIntoView({ block: 'start' });
    headline.focus({ preventScroll: true });
    status(`${headline.textContent}. ${summary.textContent}.${notes.textContent ? ` ${Array.from(notes.children, (li) => li.textContent).join(' ')}` : ''}`);
  }

  function again(): void {
    if (state !== 'done') return;
    revokeBlob();
    setState('ready');
    void pageStage.show(pageStage.page);
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

  for (const f of DATE_FORMATS) formatChips.append(chip('ed-format', f, formatDate(new Date(), f)));
  for (const c of TEXT_COLORS) colorChips.append(chip('ed-color', c, COLOR_LABELS[c]));

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
  bindPasswordToggle(must<HTMLButtonElement>('ed-pw-toggle'), pwInput);

  prevBtn.addEventListener('click', () => void pageStage.show(pageStage.page - 1));
  nextBtn.addEventListener('click', () => void pageStage.show(pageStage.page + 1));
  const goto = (): void => {
    const n = Number.parseInt(gotoInput.value.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(n)) void pageStage.show(n - 1);
    else gotoInput.value = String(pageStage.page + 1);
  };
  gotoInput.addEventListener('change', goto);
  gotoInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      goto();
    }
  });
  addText.addEventListener('click', () => add('text'));
  addDate.addEventListener('click', () => add('date'));
  addWhite.addEventListener('click', () => add('white'));
  removeBtn.addEventListener('click', removeSelected);
  textInput.addEventListener('input', () => {
    const clean = cleanText(textInput.value);
    // Over MAX_TEXT characters: the field shows what will be saved.
    if (Array.from(textInput.value).length > MAX_TEXT) textInput.value = clean;
    changeText((it) => {
      it.text = clean;
    });
    ensureFont(clean);
  });
  sizeInput.addEventListener('input', () =>
    changeText((it) => {
      it.size = clampSize(Number(sizeInput.value));
      lastSize = it.size;
    }),
  );
  formatChips.addEventListener('change', (ev) => {
    const r = ev.target as HTMLInputElement;
    if (!r.checked || !DATE_FORMATS.includes(r.value as DateFormat)) return;
    changeText((it) => {
      it.format = r.value as DateFormat;
      it.text = formatDate(new Date(), it.format);
    });
    const it = sel();
    if (it && isText(it)) textInput.value = it.text;
  });
  colorChips.addEventListener('change', (ev) => {
    const r = ev.target as HTMLInputElement;
    if (!r.checked || !TEXT_COLORS.includes(r.value as TextColor)) return;
    changeText((it) => {
      it.color = r.value as TextColor;
      lastColor = it.color;
    });
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
      if (state === 'ready') void pageStage.show(pageStage.page);
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
  download.addEventListener('click', () => track({ e: 'download', t: 'pdf-edit' }));

  setState('empty');
  // A file picked or dropped while this module loaded.
  const first = pending ?? Array.from(input.files ?? []);
  input.value = '';
  if (first.length) void openFiles(first);
  return { open: (files) => openFiles(files) };
}
