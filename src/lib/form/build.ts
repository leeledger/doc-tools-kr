// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// 양식 채우기 엔진 (FORM1020 D3 build.ts): FormSpec + values → an rhwp document, on rhwp's blank 2010 template
// (함초롬바탕 10 pt, A4). Pure: rhwp comes in as the document, so the unit tests run the real engine and a fake.
// Only calls proven in the spike and the F1 probes (handoff/sources/form1020/probe-f1*.out.txt, FORM1020 BUILD-LOG),
// in the one order that keeps rhwp 0.8.6's layout right (probed: other orders broke pages early or drew the tables
// below the text, in rhwp and in the saved file):
//   1. every paragraph top to bottom: insertText, applyParaFormat {alignment}, splitParagraph at its end (the new
//      paragraph inherits the template's body shapes: nothing is char-formatted yet);
//   2. tables in their empty paragraphs: createTableEx {treatAsChar: true, colWidths} (colWidths are honoured only
//      with treatAsChar; adds no paragraph), cells filled before mergeTableCells (cell index = row × cols + col
//      until then; the merged cell keeps index 0), setCellProperties {height} as the row's minimum height,
//      splitParagraphInCell for the lines of a multiline value (insertTextInCell does not break on a line feed);
//   3. applyCharFormat {fontSize: pt×100, bold} only on paragraphs before the first table: on a paragraph after a
//      table it breaks the page early (a 10 pt format there gave 3 pages). Everything after the first table is body
//      text (spec lint).
//   4. QUOTE1112: the seal picture, insertPicture inline at the end of its sign line (probe q1b: ok, loss 0, the
//      reloaded file draws it). The item grid is built in step 2 like a table, its cells padded ITEM_CELL_PAD.
// Any call that throws or answers ok:false → HwpError export (memory → oom). One code path.
import { classifyParseError } from '../hwp/engine';
import { HwpError } from '../hwp/errors';
import { BODY_PT, ITEM_COLUMNS, computedSlotIds, type Align, type ComputedSlot, type FormBlock, type FormField, type FormSpec, type FormValues } from './spec';
import { BLANK_DATE } from './values';
import { docText, groupQuantity } from './doc-text';
import { amountHangul } from './amount';
import { groupDigits } from './digits';
import { specLedger, type Ledger } from './ledger';

export { BLANK_DATE };

/** The part of rhwp's HwpDocument the builder uses. */
export interface FormDocument {
  createBlankDocument(): string;
  insertText(sec: number, para: number, offset: number, text: string): string;
  splitParagraph(sec: number, para: number, offset: number): string;
  applyCharFormat(sec: number, para: number, start: number, end: number, propsJson: string): string;
  applyParaFormat(sec: number, para: number, propsJson: string): string;
  createTableEx(optionsJson: string): string;
  insertTextInCell(sec: number, para: number, control: number, cell: number, cellPara: number, offset: number, text: string): string;
  splitParagraphInCell(sec: number, para: number, control: number, cell: number, cellPara: number, offset: number): string;
  applyParaFormatInCell(sec: number, para: number, control: number, cell: number, cellPara: number, propsJson: string): string;
  setCellProperties(sec: number, para: number, control: number, cell: number, json: string): string;
  mergeTableCells(sec: number, para: number, control: number, startRow: number, startCol: number, endRow: number, endCol: number): string;
  insertPicture(sec: number, para: number, offset: number, cellPathJson: string, data: Uint8Array, width: number, height: number, naturalWidthPx: number, naturalHeightPx: number, extension: string, description: string): string;
  pageCount(): number;
}

/** What an empty name slot or sign line leaves to write in by hand. */
export const BLANK_SLOT = ' '.repeat(16);
export const SIGN_MARK = '(서명 또는 인)';

/** QUOTE1112 Q4: a seal picture (PNG bytes, its pixel size), placed by a sign line with `seal`. */
export interface FormSeal {
  bytes: Uint8Array;
  w: number;
  h: number;
  ext: 'png';
}

export interface FormExtras {
  seal?: FormSeal;
}

/** The seal's box: 15 mm on the long side (HWPUNIT), the aspect kept. */
export const SEAL_HU = 4252;

/**
 * Item grid cells: 140 HWPUNIT left and right padding (rhwp's default is 510). With it every widest amount stays on
 * one line in the grid's columns (handoff/sources/quote1112/probe-a1.out.txt §6).
 */
export const ITEM_CELL_PAD = 140;

/** The item grid's header and its 합계 label (document text). */
export const ITEM_HEADER = ['번호', '품명', '규격', '수량', '단가', '공급가액', '세액'] as const;
export const ITEM_TOTAL = '합 계';

interface ParaPlan {
  text: string;
  align: Align;
  size: number;
  bold: boolean;
  table?: Extract<FormBlock, { type: 'table' }>;
  items?: Extract<FormBlock, { type: 'items' }>;
  /** A sign line with `seal`: the build's seal picture goes at the end of `text` (which then has no mark). */
  seal?: boolean;
}

type Json = Record<string, unknown>;

const SEC = 0;

/** Runs one rhwp call; a throw or `{"ok":false}` becomes HwpError export (memory: oom). */
function call(what: string, fn: () => string | number): Json {
  let r: string | number;
  try {
    r = fn();
  } catch (err) {
    throw new HwpError(classifyParseError(err, { distribution: false }) === 'oom' ? 'oom' : 'export', `rhwp ${what} failed`, { cause: err });
  }
  if (typeof r !== 'string' || !r.startsWith('{')) return {};
  let j: unknown;
  try {
    j = JSON.parse(r);
  } catch {
    return {};
  }
  if (j && typeof j === 'object' && (j as Json).ok === false) throw new HwpError('export', `rhwp ${what}: ${r.slice(0, 200)}`);
  return j as Json;
}

/** A number the call must answer with (an offset, an index), else export. */
function num(j: Json, key: string, what: string): number {
  const v = j[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new HwpError('export', `rhwp ${what}: no ${key}`);
  return v;
}

/** A field's document text (./values docText; LOAN1022). */
const docOf = (spec: FormSpec, values: FormValues, id: string): string => {
  const field: FormField | undefined = spec.fields.find((f) => f.id === id);
  return field ? docText(field, values[id] ?? '') : (values[id] ?? '');
};

/** QUOTE1112 Q6: the computed slots' text (a ledger with no priced row: the blank form's room to write by hand). */
export function computedText(ledger: Ledger | null, slot: ComputedSlot): string {
  if (!ledger?.priced) return slot === 'vatNote' ? '' : BLANK_SLOT;
  if (slot === 'totalHangul') return amountHangul(ledger.total);
  if (slot === 'totalDigits') return groupDigits(ledger.total);
  return ledger.mode === 'none' ? '(부가세 없음)' : '(부가세 포함)';
}

/** The document's paragraphs, top to bottom. `sealed`: the build has a seal picture. */
export function planParagraphs(spec: FormSpec, values: FormValues, sealed = false): ParaPlan[] {
  const ledger = specLedger(spec, values);
  const fill = (doc: string): string => {
    const s = doc.replace(/\{([A-Za-z][\w-]*)\}/g, (_, id: string) => docOf(spec, values, id) || BLANK_SLOT);
    // An empty vatNote at the end leaves no trailing space.
    return computedSlotIds(doc).length ? s.replace(/\{=([A-Za-z][\w-]*)\}/g, (_, id: ComputedSlot) => computedText(ledger, id)).trimEnd() : s;
  };
  const out: ParaPlan[] = [];
  for (const b of spec.blocks) {
    if (b.type === 'title') out.push({ text: b.doc, align: 'center', size: b.size, bold: true });
    else if (b.type === 'para') {
      if (b.onlyIf && !values[b.onlyIf]) continue;
      out.push({ text: fill(b.doc), align: b.align ?? 'justify', size: b.size ?? BODY_PT, bold: b.bold ?? false });
    } else if (b.type === 'table') out.push({ text: '', align: 'center', size: BODY_PT, bold: false, table: b });
    else if (b.type === 'items') out.push({ text: '', align: 'center', size: BODY_PT, bold: false, items: b });
    else if (b.type === 'dateLine') out.push({ text: docOf(spec, values, b.field) || BLANK_DATE, align: b.align ?? 'center', size: BODY_PT, bold: false });
    else if (b.type === 'signLine') {
      const seal = sealed && b.seal === true;
      const head = `${b.docLabel}  ${docOf(spec, values, b.field) || BLANK_SLOT}  `;
      out.push({ text: seal ? head : head + (b.mark ?? SIGN_MARK), align: b.align ?? 'right', size: BODY_PT, bold: false, ...(seal ? { seal: true } : {}) });
    } else out.push({ text: ' ', align: 'left', size: b.size, bold: false });
  }
  return out;
}

/** The text of every grid cell, row by row (header, the item rows, the 합계 row); the alignment per column. */
export function itemGrid(block: Extract<FormBlock, { type: 'items' }>, ledger: Ledger): string[][] {
  const rows: string[][] = [[...ITEM_HEADER]];
  for (let i = 0; i < block.rows; i++) {
    const r = ledger.rows[i];
    rows.push(r ? [String(r.n), r.name, r.spec, r.qty ? groupQuantity(r.qty) : '', r.price ? groupDigits(r.price) : '', r.supply ? groupDigits(r.supply) : '', r.tax ? groupDigits(r.tax) : ''] : ['', '', '', '', '', '', '']);
  }
  rows.push([ITEM_TOTAL, '', '', '', '', ledger.supply ? groupDigits(ledger.supply) : '', ledger.tax ? groupDigits(ledger.tax) : '']);
  return rows;
}

const ITEM_ALIGN: readonly Align[] = ['center', 'left', 'left', 'right', 'right', 'right', 'right'];

/** Builds the item grid `b` in the empty paragraph `paraIdx` (cells filled before the 합계 row's merge). */
function buildItems(doc: FormDocument, b: Extract<FormBlock, { type: 'items' }>, ledger: Ledger, paraIdx: number): void {
  const grid = itemGrid(b, ledger);
  const cols = ITEM_COLUMNS;
  const created = call('createTableEx', () => doc.createTableEx(JSON.stringify({ sectionIdx: SEC, paraIdx, charOffset: 0, rowCount: grid.length, colCount: cols, treatAsChar: true, colWidths: b.colWidths })));
  const para = num(created, 'paraIdx', 'createTableEx');
  const control = num(created, 'controlIdx', 'createTableEx');
  const cell = JSON.stringify({ height: b.rowHeight, paddingLeft: ITEM_CELL_PAD, paddingRight: ITEM_CELL_PAD, applyInnerMargin: true });
  grid.forEach((row, r) => {
    row.forEach((t, c) => {
      const i = r * cols + c;
      call('setCellProperties', () => doc.setCellProperties(SEC, para, control, i, cell));
      const head = r === 0 || r === grid.length - 1;
      if (t) cellText(doc, para, control, i, t, head && c < 5 ? 'center' : ITEM_ALIGN[c]);
    });
  });
  call('mergeTableCells', () => doc.mergeTableCells(SEC, para, control, grid.length - 1, 0, grid.length - 1, 4));
}

/** The seal's size in HWPUNIT: SEAL_HU on the long side, the aspect kept. */
export function sealSize(w: number, h: number): { width: number; height: number } {
  const long = Math.max(w, h);
  return { width: Math.max(1, Math.round((SEAL_HU * w) / long)), height: Math.max(1, Math.round((SEAL_HU * h) / long)) };
}

/** Writes `text` (lines split by "\n") into a cell, one cell paragraph per line, with `align`. */
function cellText(doc: FormDocument, para: number, control: number, cell: number, text: string, align?: Align): void {
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    let end = 0;
    if (line) end = num(call('insertTextInCell', () => doc.insertTextInCell(SEC, para, control, cell, i, 0, line)), 'charOffset', 'insertTextInCell');
    if (i < lines.length - 1) {
      const s = call('splitParagraphInCell', () => doc.splitParagraphInCell(SEC, para, control, cell, i, end));
      if (num(s, 'cellParaIndex', 'splitParagraphInCell') !== i + 1) throw new HwpError('export', 'rhwp splitParagraphInCell: unexpected paragraph');
    }
    if (align) call('applyParaFormatInCell', () => doc.applyParaFormatInCell(SEC, para, control, cell, i, JSON.stringify({ alignment: align })));
  });
}

/** Builds table `t` in the empty paragraph `paraIdx`. */
function buildTable(doc: FormDocument, spec: FormSpec, values: FormValues, t: Extract<FormBlock, { type: 'table' }>, paraIdx: number): void {
  const cols = t.docSection ? 3 : 2;
  const rows = t.rows.length;
  const created = call('createTableEx', () => doc.createTableEx(JSON.stringify({ sectionIdx: SEC, paraIdx, charOffset: 0, rowCount: rows, colCount: cols, treatAsChar: true, colWidths: t.colWidths })));
  const para = num(created, 'paraIdx', 'createTableEx');
  const control = num(created, 'controlIdx', 'createTableEx');
  const labelCol = cols - 2;
  t.rows.forEach((id, r) => {
    const field = spec.fields.find((f) => f.id === id)!;
    const height = t.rowHeight * Math.max(1, field.rowLines ?? 1);
    for (let c = 0; c < cols; c++) call('setCellProperties', () => doc.setCellProperties(SEC, para, control, r * cols + c, JSON.stringify({ height })));
    cellText(doc, para, control, r * cols + labelCol, field.docLabel ?? '', 'center');
    const v = docText(field, values[id] ?? '');
    if (v) cellText(doc, para, control, r * cols + labelCol + 1, v, 'left');
  });
  if (t.docSection) {
    if (rows > 1) call('mergeTableCells', () => doc.mergeTableCells(SEC, para, control, 0, 0, rows - 1, 0));
    cellText(doc, para, control, 0, t.docSection, 'center');
  }
}

/**
 * Builds `spec` with `values` into `doc` (an HwpDocument.createEmpty()). Returns rhwp's page count (the in-memory
 * one: a reloaded file does not paginate tables, QUOTE1112 A1). A spec with an items block whose ledger has a problem
 * is not built (the page blocks it first). extras.seal goes at the end of the sign line with `seal`, as step 4.
 */
export function buildForm(doc: FormDocument, spec: FormSpec, values: FormValues, extras: FormExtras = {}): number {
  const ledger = specLedger(spec, values);
  if (ledger?.problems.length) throw new HwpError('export', `ledger: ${ledger.problems.map((p) => p.kind).join(',')}`);
  call('createBlankDocument', () => doc.createBlankDocument());
  const plan = planParagraphs(spec, values, !!extras.seal);
  const ends: number[] = [];
  plan.forEach((p, i) => {
    const end = p.text ? num(call('insertText', () => doc.insertText(SEC, i, 0, p.text)), 'charOffset', 'insertText') : 0;
    ends.push(end);
    call('applyParaFormat', () => doc.applyParaFormat(SEC, i, JSON.stringify({ alignment: p.align })));
    if (i < plan.length - 1) {
      const s = call('splitParagraph', () => doc.splitParagraph(SEC, i, end));
      if (num(s, 'paraIdx', 'splitParagraph') !== i + 1) throw new HwpError('export', 'rhwp splitParagraph: unexpected paragraph');
    }
  });
  plan.forEach((p, i) => {
    if (p.table) buildTable(doc, spec, values, p.table, i);
    if (p.items && ledger) buildItems(doc, p.items, ledger, i);
  });
  const firstTable = plan.findIndex((p) => p.table || p.items);
  plan.forEach((p, i) => {
    if (p.table || p.items || (p.size === BODY_PT && !p.bold)) return;
    if (firstTable >= 0 && i > firstTable) throw new HwpError('export', 'a character shape after a table');
    if (ends[i]! > 0) call('applyCharFormat', () => doc.applyCharFormat(SEC, i, 0, ends[i]!, JSON.stringify({ fontSize: Math.round(p.size * 100), bold: p.bold })));
  });
  const seal = extras.seal;
  if (seal) {
    const at = plan.findIndex((p) => p.seal);
    if (at >= 0) {
      const { width, height } = sealSize(seal.w, seal.h);
      call('insertPicture', () => doc.insertPicture(SEC, at, ends[at]!, '', seal.bytes, width, height, seal.w, seal.h, seal.ext, '직인'));
    }
  }
  let pages: number;
  try {
    pages = doc.pageCount();
  } catch (err) {
    throw new HwpError('export', 'rhwp pageCount failed', { cause: err });
  }
  if (!(pages >= 1)) throw new HwpError('export', 'the form has no pages');
  return pages;
}
