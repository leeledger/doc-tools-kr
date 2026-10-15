// /stamp-maker/ controller (STAMP1015). Paints the 12 static tiles and builds the fine-tune panel (its labels are late copy), loads the
// HWP faces the text needs (fonts.ts), lays every style out (layout.ts) and paints the tiles, the large preview and the
// PNG from the same draw list (render.ts). Nothing typed is stored, put in a URL, a file name or the title.
import { announce, clearAlert } from '../../lib/ui/announce';
import { HANDOFF_FAILED, sendToPdfSign } from '../../lib/ui/sign-handoff';
import { track } from '../../lib/ui/usage';
import { facesFor, loadFaces } from './fonts';
import { applyInk } from './ink';
import {
  DEFAULT_OPTIONS,
  badChar,
  dotDate,
  emInk,
  fontOf,
  graphemes,
  layoutStamp,
  normalize,
  scriptOf,
  todayDot,
  type Face,
  type Ink,
  type LayoutResult,
  type Line,
  type Measure,
  type StampLayout,
  type StampOptions,
  type Suffix,
  type Weight,
} from './layout';
import { CENTER_MAX, DEBOUNCE_MS, PPI_1X, PPI_2X, REF_EM, SIZES_MM, mmToPx, type SizeMm } from './limits';
import { withPhys } from './png';
import { COLORS, paintStamp, pixelSize, type ColorId } from './render';
import { DATE_LABELS, SAMPLE_CORP, SAMPLE_PERSONAL, STYLES, STYLE_IDS, type DateLabel, type StyleId, type StyleKind } from './styles';

/** Late copy (controller text: any glyph). Tool-internal states are in 해요체 like the brief's notes (docs/COPY.md). */
const COPY = {
  bad: (c: string): string => `도장에 넣을 수 없는 글자: ${c}`,
  badCenter: (c: string): string => `가운데 글자에 넣을 수 없는 글자: ${c}`,
  // Shown without interaction: preloaded UI-font glyphs only (no 「홍」).
  sample: '예시 글자로 보여 드려요. 위에 글자를 쓰면 바뀌어요.',
  font: '글꼴을 받지 못해 기본 글꼴로 보여 드려요. 인터넷 연결을 확인해 주세요.',
  legal: '이 그림은 인감으로 신고한 도장이 아니에요. 인감이 꼭 필요한 서류는 받는 곳에 먼저 물어보세요.',
  needText: '도장에 넣을 글자를 먼저 써 주세요.',
  tooLong: '글자가 많아 이 모양에는 넣지 못해요. 글자를 줄이거나 다른 모양을 골라 주세요.',
  canvas: '도장 그림을 만들지 못했어요. 다른 앱이나 PC에서 다시 해 주세요.',
  encoder: 'PNG 파일을 만들지 못했어요. 「2배로 선명하게」를 끄거나 크기를 줄여 다시 해 주세요.',
  saved: (name: string): string => `PNG를 저장했어요: ${name}`,
  copied: '복사했어요. 한글·워드에 붙여 넣으세요.',
  copyFailed: '복사하지 못했어요. PNG 저장을 써 주세요.',
  picked: (name: string): string => `${name} 모양을 골랐어요.`,
  size: (mm: number, w: number, h: number): string => `${mm} mm (${w.toLocaleString('ko-KR')}×${h.toLocaleString('ko-KR')}픽셀)`,
};

const FACE_LABELS: Record<Face, string> = { serif: '명조', sans: '고딕', myeongjo: '나눔명조', gothic: '나눔고딕' };
const WEIGHT_LABELS: Record<Weight, string> = { light: '가늘게', regular: '보통', heavy: '굵게' };
const COLOR_LABELS: Record<ColorId, string> = { red: '인주 빨강', orange: '주황', black: '검정', blue: '파랑' };
const LINE_LABELS: Record<Line, string> = { thin: '얇게', normal: '보통', thick: '두껍게' };
const SUFFIX_LABELS: Record<Suffix, string> = { auto: '자동', none: '붙이지 않음', in: '인', jiin: '지인' };
const ORIENT_LABELS = { v: '세로', h: '가로' } as const;

/** Tile and preview sizes in CSS pixels (stamp-maker.css). */
const TILE_CSS = 88;
const PREVIEW_CSS = 220;
/** Share of a tile / the preview the stamp's long edge takes. */
const FILL = 0.92;

interface State {
  style: StyleId | null;
  face: Face;
  weight: Weight;
  color: ColorId;
  line: Line;
  suffix: Suffix;
  center: string;
  label: DateLabel;
  date: string;
  /** 가로/세로 per style, when the person changed it. */
  orient: Partial<Record<StyleId, boolean>>;
  /** Size per kind of stamp, when the person changed it. */
  size: Partial<Record<StyleKind, SizeMm>>;
  double: boolean;
  texture: boolean;
  seed: number;
}

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

function select<V extends string>(id: string, label: string, options: Record<V, string>, value: V, onChange: (v: V) => void): { field: HTMLDivElement; input: HTMLSelectElement } {
  const input = el('select', { id, className: 'select' });
  for (const [v, text] of Object.entries(options) as [V, string][]) input.append(el('option', { value: v, textContent: text, selected: v === value }));
  input.addEventListener('change', () => onChange(input.value as V));
  const field = el('div', { className: 'sm-field' }, el('label', { htmlFor: id, textContent: label }), input);
  return { field, input };
}

function check(id: string, label: string, on: boolean, onChange: (v: boolean) => void): { field: HTMLLabelElement; input: HTMLInputElement } {
  const input = el('input', { id, type: 'checkbox', checked: on });
  input.addEventListener('change', () => onChange(input.checked));
  return { field: el('label', { className: 'check' }, input, ` ${label}`), input };
}

/** 이미지 복사 is offered only where the page may write a PNG to the clipboard (probe d). */
function canCopyPng(): boolean {
  const CI = (window as Window & { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (!CI || typeof navigator.clipboard?.write !== 'function') return false;
  const supports = (CI as unknown as { supports?: (type: string) => boolean }).supports;
  return typeof supports !== 'function' || supports('image/png');
}

const dpr = (): number => Math.min(3, Math.max(1, window.devicePixelRatio || 1));

/** YYYYMMDD of today (local), for the file name. */
function stamp8(now = new Date()): string {
  return todayDot(now).replaceAll('.', '');
}

let lastUrl: string | null = null;

function saveBlob(blob: Blob, name: string): void {
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(blob);
  const a = el('a', { href: lastUrl, download: name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
}

export function initStampMaker(pending?: StyleId): void {
  const root = must<HTMLDivElement>('sm-tool');
  if (root.dataset.ready) return;
  root.dataset.ready = '1';
  const input = must<HTMLInputElement>('sm-text');
  const grid = must<HTMLDivElement>('sm-grid');
  const sample = must<HTMLParagraphElement>('sm-sample');
  const note = must<HTMLParagraphElement>('sm-note');
  const panel = must<HTMLDivElement>('sm-panel');

  const today = todayDot();
  const st: State = {
    style: null,
    face: DEFAULT_OPTIONS.face,
    weight: DEFAULT_OPTIONS.weight,
    color: 'red',
    line: DEFAULT_OPTIONS.line,
    suffix: DEFAULT_OPTIONS.suffix,
    center: DEFAULT_OPTIONS.center,
    label: DEFAULT_OPTIONS.label,
    date: today,
    orient: {},
    size: {},
    double: false,
    texture: false,
    seed: 1,
  };

  // ---------- measuring ----------
  const mctx = document.createElement('canvas').getContext('2d');
  const inks = new Map<string, Ink>();
  const measure: Measure = (text, face, weight) => {
    const key = `${weight}|${face}|${text}`;
    const hit = inks.get(key);
    if (hit) return hit;
    let ink: Ink = emInk(REF_EM * text.length);
    if (mctx) {
      mctx.font = fontOf(face, weight, REF_EM);
      const m = mctx.measureText(text);
      const a = m.actualBoundingBoxAscent;
      const d = m.actualBoundingBoxDescent;
      // Probe b: where the ink box is missing, the em box of the advance width.
      ink = Number.isFinite(a) && Number.isFinite(d) && a + d > 0 ? { left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight, ascent: a, descent: d } : emInk(m.width);
    }
    inks.set(key, ink);
    return ink;
  };

  // ---------- tiles (static in the page: names, empty canvases; painted here) ----------
  const tiles = new Map<StyleId, { btn: HTMLButtonElement; canvas: HTMLCanvasElement; over: HTMLSpanElement; sample: HTMLImageElement | null }>();
  for (const id of STYLE_IDS) {
    const btn = grid.querySelector<HTMLButtonElement>(`.sm-tile[data-style="${id}"]`);
    const canvas = btn?.querySelector('canvas');
    const over = btn?.querySelector<HTMLSpanElement>('.sm-tile-over');
    if (!btn || !canvas || !over) throw new Error(`tile ${id} missing`);
    btn.addEventListener('click', () => pick(id));
    tiles.set(id, { btn, canvas, over, sample: btn.querySelector('img') });
  }

  const enabled = (): StyleId[] => STYLE_IDS.filter((id) => tiles.get(id)!.btn.getAttribute('aria-disabled') !== 'true');
  grid.addEventListener('keydown', (ev) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(ev.key) || grid.getAttribute('aria-disabled') === 'true') return;
    const list = enabled();
    if (!list.length) return;
    ev.preventDefault();
    const cur = (ev.target as HTMLElement).closest<HTMLElement>('.sm-tile')?.dataset.style as StyleId | undefined;
    const at = cur ? list.indexOf(cur) : -1;
    const next =
      ev.key === 'Home' ? list[0]! : ev.key === 'End' ? list[list.length - 1]! : ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? list[(at + 1) % list.length]! : list[(at - 1 + list.length) % list.length]!;
    pick(next);
    tiles.get(next)!.btn.focus();
  });

  // ---------- fine-tune panel ----------
  const previewCanvas = el('canvas', { width: PREVIEW_CSS, height: PREVIEW_CSS });
  previewCanvas.setAttribute('aria-hidden', 'true');
  const sizeInfo = el('p', { className: 'sm-size-info', id: 'sm-size-info' });
  const sizeOptions = Object.fromEntries(SIZES_MM.map((mm) => [String(mm), `${mm} mm`])) as Record<string, string>;
  const fFace = select<Face>('sm-face', '글꼴', FACE_LABELS, st.face, (v) => set({ face: v }));
  const fWeight = select<Weight>('sm-weight', '굵기', WEIGHT_LABELS, st.weight, (v) => set({ weight: v }));
  const fColor = select<ColorId>('sm-color', '색', COLOR_LABELS, st.color, (v) => set({ color: v }));
  const fOrient = select<'v' | 'h'>('sm-orient', '글자 방향', ORIENT_LABELS, 'v', (v) => {
    if (st.style) st.orient[st.style] = v === 'v';
    void refresh();
  });
  const fSuffix = select<Suffix>('sm-suffix', '붙이는 글자', SUFFIX_LABELS, st.suffix, (v) => set({ suffix: v }));
  const fLine = select<Line>('sm-line', '선 두께', LINE_LABELS, st.line, (v) => set({ line: v }));
  const fSize = select<string>('sm-size', '문서에 찍힐 크기', sizeOptions, '15', (v) => {
    if (st.style) st.size[STYLES[st.style].kind] = Number(v) as SizeMm;
    paintSelected();
  });
  const fLabel = select<DateLabel>('sm-label', '위 글자', Object.fromEntries(DATE_LABELS.map((l) => [l, l])) as Record<DateLabel, string>, st.label, (v) => set({ label: v }));
  const centerInput = el('input', { id: 'sm-center', className: 'num-input', type: 'text', maxLength: CENTER_MAX, value: st.center, autocomplete: 'off', spellcheck: false });
  const fCenter = el('div', { className: 'sm-field' }, el('label', { htmlFor: 'sm-center', textContent: '가운데 글자' }), centerInput);
  const dateInput = el('input', { id: 'sm-date', className: 'num-input', type: 'date', value: today.replaceAll('.', '-') });
  const fDate = el('div', { className: 'sm-field' }, el('label', { htmlFor: 'sm-date', textContent: '날짜' }), dateInput);
  const cDouble = check('sm-double', '2배로 선명하게', st.double, (v) => {
    st.double = v;
    paintSelected();
  });
  const cTexture = check('sm-texture', '인주 질감', st.texture, (v) => {
    st.texture = v;
    reseed.hidden = !v;
    paintAll();
  });
  const reseed = el('button', { type: 'button', className: 'btn ghost', id: 'sm-reseed', textContent: '질감 다시 만들기', hidden: true });
  reseed.addEventListener('click', () => {
    st.seed++;
    paintAll();
  });
  const saveBtn = el('button', { type: 'button', className: 'btn primary', id: 'sm-save', textContent: 'PNG 저장' });
  const copyBtn = el('button', { type: 'button', className: 'btn ghost', id: 'sm-copy', textContent: '이미지 복사', hidden: !canCopyPng() });
  const pdfBtn = el('button', { type: 'button', className: 'btn ghost', id: 'sm-pdf', textContent: 'PDF에 찍기' });
  const signLink = el('a', { className: 'btn ghost', id: 'sm-sign', href: '/stamp-signature/', textContent: '서명도 만들기' });
  const actions = el('div', { className: 'row sm-actions' }, saveBtn, copyBtn, pdfBtn, signLink);
  const panelNote = el('p', { className: 'hint', id: 'sm-panel-note', hidden: true });
  panel.append(
    el('div', { className: 'sm-preview' }, previewCanvas, sizeInfo),
    el('div', { className: 'sm-controls' }, fFace.field, fWeight.field, fColor.field, fOrient.field, fSuffix.field, fLine.field, fSize.field, fCenter, fLabel.field, fDate),
    el('div', { className: 'sm-checks' }, cDouble.field, cTexture.field, reseed),
    actions,
    panelNote,
    el('p', { className: 'sm-legal', textContent: COPY.legal }),
  );

  let centerTimer = 0;
  centerInput.addEventListener('input', () => {
    window.clearTimeout(centerTimer);
    centerTimer = window.setTimeout(() => set({ center: centerInput.value }), DEBOUNCE_MS);
  });
  dateInput.addEventListener('change', () => set({ date: dotDate(dateInput.value) ?? today }));

  function set(p: Partial<State>): void {
    Object.assign(st, p);
    void refresh();
  }

  // ---------- layout + paint ----------
  const results = new Map<StyleId, LayoutResult>();
  let blocked = false;
  let typed = false;

  const optsFor = (id: StyleId): StampOptions => ({
    face: st.face,
    weight: st.weight,
    vertical: st.orient[id] ?? null,
    suffix: st.suffix,
    line: st.line,
    center: st.center,
    label: st.label,
    date: st.date,
  });
  const textFor = (id: StyleId): string => (typed ? input.value : STYLES[id].kind === 'corp' ? SAMPLE_CORP : SAMPLE_PERSONAL);
  const sizeOf = (id: StyleId): SizeMm => st.size[STYLES[id].kind] ?? STYLES[id].defaultMm;

  /** Paints `l` centred in `canvas` (square, `css` CSS pixels), worn when 인주 질감 is on. */
  function paintInto(canvas: HTMLCanvasElement, l: StampLayout, css: number): void {
    const px = Math.round(css * dpr());
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    const long = Math.round(px * FILL);
    const { w, h } = pixelSize(l, long);
    const x = Math.round((px - w) / 2);
    const y = Math.round((px - h) / 2);
    ctx.translate(x, y);
    paintStamp(ctx, l, long, COLORS[st.color]);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (st.texture) {
      const img = ctx.getImageData(x, y, w, h);
      applyInk(img, st.seed);
      ctx.putImageData(img, x, y);
    }
  }

  function paintAll(): void {
    for (const id of STYLE_IDS) {
      const r = results.get(id);
      const t = tiles.get(id)!;
      const ok = !!r?.ok;
      t.over.hidden = ok || r?.reason !== 'too-long';
      t.btn.setAttribute('aria-disabled', String(!ok));
      if (r?.ok) paintInto(t.canvas, r.layout, TILE_CSS);
      else t.canvas.getContext('2d')?.clearRect(0, 0, t.canvas.width, t.canvas.height);
      // The build-time sample picture gives way to the live tile.
      if (t.sample) t.sample.hidden = true;
    }
    paintSelected();
  }

  function paintSelected(): void {
    const id = st.style;
    if (!id) return;
    const def = STYLES[id];
    fOrient.field.hidden = !def.orient;
    fOrient.input.value = (st.orient[id] ?? def.vertical) ? 'v' : 'h';
    fSuffix.field.hidden = !def.suffix;
    fCenter.hidden = id !== 'corp-round';
    fLabel.field.hidden = fDate.hidden = id !== 'date-round';
    const mm = sizeOf(id);
    fSize.input.value = String(mm);
    const r = results.get(id);
    const can = !blocked && typed && !!r?.ok;
    saveBtn.disabled = copyBtn.disabled = pdfBtn.disabled = !can;
    panelNote.hidden = can || blocked;
    panelNote.textContent = !typed ? COPY.needText : r && !r.ok ? COPY.tooLong : '';
    if (r?.ok) {
      paintInto(previewCanvas, r.layout, PREVIEW_CSS);
      const { w, h } = pixelSize(r.layout, mmToPx(mm, st.double ? PPI_2X : PPI_1X));
      sizeInfo.textContent = COPY.size(mm, w, h);
    } else {
      previewCanvas.getContext('2d')?.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      sizeInfo.textContent = '';
    }
  }

  let run = 0;
  let paints = 0;
  let fontReported = false;
  let started = false;

  async function refresh(): Promise<void> {
    const id = ++run;
    const raw = input.value;
    typed = normalize(raw, false).length > 0;
    const bad = badChar(raw);
    const badC = badChar(st.center);
    blocked = !!(bad || badC);
    grid.setAttribute('aria-disabled', String(blocked));
    if (blocked) {
      input.setAttribute('aria-invalid', String(!!bad));
      announce('alert', bad ? COPY.bad(bad) : COPY.badCenter(badC!), root);
      paintSelected();
      return;
    }
    input.removeAttribute('aria-invalid');
    clearAlert(root);
    sample.hidden = typed;
    sample.textContent = typed ? '' : COPY.sample;
    // Only the slices the painted text needs (D5): 印之 only for a Hanja name, 인지 otherwise.
    const suffixChars = typed && scriptOf(graphemes(normalize(raw, false))) === 'hanja' ? '印之' : '인지';
    const texts = [textFor('round'), textFor('corp-round'), suffixChars, st.center, st.label, st.date];
    const weight = st.weight === 'light' ? 400 : 700;
    const { ok, late } = await loadFaces(facesFor(texts, st.face, weight));
    if (id !== run) return;
    if (!ok) {
      // Slow: repaint in the web face when it still arrives. Failed: report once (a late success is not a failure).
      void late.then((arrived) => {
        if (arrived) {
          if (id === run) void refresh();
        } else if (!fontReported) {
          fontReported = true;
          track({ e: 'fail', t: 'stamp-maker', c: 'font', p: 'load' });
        }
      });
    }
    inks.clear();
    note.hidden = ok;
    note.textContent = ok ? '' : COPY.font;
    for (const s of STYLE_IDS) results.set(s, layoutStamp(s, textFor(s), optsFor(s), measure));
    paintAll();
    // For the tests: a finished paint and whether the web faces were used.
    root.dataset.fonts = ok ? 'ok' : 'system';
    root.dataset.painted = String(++paints);
  }

  function pick(id: StyleId): void {
    if (blocked || tiles.get(id)!.btn.getAttribute('aria-disabled') === 'true') return;
    const first = st.style === null;
    st.style = id;
    for (const [s, t] of tiles) {
      t.btn.setAttribute('aria-checked', String(s === id));
      t.btn.tabIndex = s === id ? 0 : -1;
    }
    panel.hidden = false;
    const aff = document.getElementById('sm-aff');
    if (aff) aff.hidden = false;
    paintSelected();
    // D8: one start per page view, with the style id only.
    if (!started) track({ e: 'start', t: 'stamp-maker', o: 'style', v: id });
    started = true;
    announce('status', COPY.picked(STYLES[id].name), root);
    if (first) panel.scrollIntoView?.({ block: 'nearest' });
  }

  // ---------- PNG ----------
  async function makePng(): Promise<Blob | null> {
    const id = st.style;
    const r = id ? results.get(id) : undefined;
    if (!id || !r?.ok) return null;
    const ppi = st.double ? PPI_2X : PPI_1X;
    const long = mmToPx(sizeOf(id), ppi);
    const { w, h } = pixelSize(r.layout, long);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      track({ e: 'fail', t: 'stamp-maker', c: 'canvas', p: 'process' });
      announce('alert', COPY.canvas, root);
      return null;
    }
    try {
      paintStamp(ctx, r.layout, long, COLORS[st.color]);
      if (st.texture) {
        const img = ctx.getImageData(0, 0, w, h);
        applyInk(img, st.seed);
        ctx.putImageData(img, 0, 0);
      }
    } catch {
      track({ e: 'fail', t: 'stamp-maker', c: 'canvas', p: 'process' });
      announce('alert', COPY.canvas, root);
      return null;
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) {
      track({ e: 'fail', t: 'stamp-maker', c: 'encoder', p: 'save' });
      announce('alert', COPY.encoder, root);
      return null;
    }
    let png: Blob;
    try {
      png = new Blob([withPhys(new Uint8Array(await blob.arrayBuffer()), ppi) as Uint8Array<ArrayBuffer>], { type: 'image/png' });
    } catch {
      track({ e: 'fail', t: 'stamp-maker', c: 'unknown', p: 'save' });
      announce('alert', COPY.encoder, root);
      return null;
    }
    clearAlert(root);
    track({ e: 'success', t: 'stamp-maker' });
    return png;
  }

  const fileName = (): string => `도장_${st.style}_${stamp8()}.png`;

  saveBtn.addEventListener('click', async () => {
    const png = await makePng();
    if (!png) return;
    const name = fileName();
    saveBlob(png, name);
    track({ e: 'download', t: 'stamp-maker' });
    announce('status', COPY.saved(name), root);
  });

  // 이미지 복사: the ClipboardItem gets the PNG as a promise, so Safari keeps the click's permission while it is made.
  copyBtn.addEventListener('click', async () => {
    let noPng = false;
    try {
      const png = makePng().then((b) => {
        if (b) return b;
        noPng = true;
        throw new Error('no PNG');
      });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      track({ e: 'download', t: 'stamp-maker' });
      announce('status', COPY.copied, root);
    } catch {
      // A PNG that could not be made has its own alert; a refused or failing clipboard gets this one.
      if (!noPng) announce('alert', COPY.copyFailed, root);
    }
  });

  // PDF에 찍기 (D7): the PNG goes to /pdf-sign/ in this tab's sessionStorage, with the tool name.
  pdfBtn.addEventListener('click', async () => {
    const png = await makePng();
    if (png && !(await sendToPdfSign(png, 'stamp-maker'))) announce('alert', HANDOFF_FAILED, root);
  });

  // ---------- input ----------
  let timer = 0;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void refresh(), DEBOUNCE_MS);
  });
  window.addEventListener('pagehide', () => {
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = null;
  });
  void refresh().then(() => {
    // A tile pressed while this module loaded.
    if (pending) pick(pending);
  });
}
