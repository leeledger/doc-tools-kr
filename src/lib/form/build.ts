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
// Any call that throws or answers ok:false → HwpError export (memory → oom). One code path.
import { classifyParseError } from '../hwp/engine';
import { HwpError } from '../hwp/errors';
import { BODY_PT, type Align, type FormBlock, type FormSpec, type FormValues } from './spec';

import { formatDate } from './values';

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
  pageCount(): number;
}

/** What an empty name slot or sign line leaves to write in by hand. */
export const BLANK_SLOT = ' '.repeat(16);
/** The date line of the blank form (D5). */
export const BLANK_DATE = '     년     월     일';
export const SIGN_MARK = '(서명 또는 인)';

interface ParaPlan {
  text: string;
  align: Align;
  size: number;
  bold: boolean;
  table?: Extract<FormBlock, { type: 'table' }>;
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

const fill = (doc: string, values: FormValues): string => doc.replace(/\{([A-Za-z][\w-]*)\}/g, (_, id: string) => values[id] || BLANK_SLOT);

/** The document's paragraphs, top to bottom. */
export function planParagraphs(spec: FormSpec, values: FormValues): ParaPlan[] {
  const out: ParaPlan[] = [];
  for (const b of spec.blocks) {
    if (b.type === 'title') out.push({ text: b.doc, align: 'center', size: b.size, bold: true });
    else if (b.type === 'para') {
      if (b.onlyIf && !values[b.onlyIf]) continue;
      out.push({ text: fill(b.doc, values), align: b.align ?? 'justify', size: b.size ?? BODY_PT, bold: b.bold ?? false });
    } else if (b.type === 'table') out.push({ text: '', align: 'center', size: BODY_PT, bold: false, table: b });
    else if (b.type === 'dateLine') out.push({ text: formatDate(values[b.field] ?? '') || BLANK_DATE, align: b.align ?? 'center', size: BODY_PT, bold: false });
    else if (b.type === 'signLine') out.push({ text: `${b.docLabel}  ${values[b.field] || BLANK_SLOT}  ${SIGN_MARK}`, align: b.align ?? 'right', size: BODY_PT, bold: false });
    else out.push({ text: ' ', align: 'left', size: b.size, bold: false });
  }
  return out;
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
    const v = values[id] ?? '';
    if (v) cellText(doc, para, control, r * cols + labelCol + 1, v, 'left');
  });
  if (t.docSection) {
    if (rows > 1) call('mergeTableCells', () => doc.mergeTableCells(SEC, para, control, 0, 0, rows - 1, 0));
    cellText(doc, para, control, 0, t.docSection, 'center');
  }
}

/** Builds `spec` with `values` into `doc` (an HwpDocument.createEmpty()). Returns rhwp's page count. */
export function buildForm(doc: FormDocument, spec: FormSpec, values: FormValues): number {
  call('createBlankDocument', () => doc.createBlankDocument());
  const plan = planParagraphs(spec, values);
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
  });
  const firstTable = plan.findIndex((p) => p.table);
  plan.forEach((p, i) => {
    if (p.table || (p.size === BODY_PT && !p.bold)) return;
    if (firstTable >= 0 && i > firstTable) throw new HwpError('export', 'a character shape after a table');
    if (ends[i]! > 0) call('applyCharFormat', () => doc.applyCharFormat(SEC, i, 0, ends[i]!, JSON.stringify({ fontSize: Math.round(p.size * 100), bold: p.bold })));
  });
  let pages: number;
  try {
    pages = doc.pageCount();
  } catch (err) {
    throw new HwpError('export', 'rhwp pageCount failed', { cause: err });
  }
  if (!(pages >= 1)) throw new HwpError('export', 'the form has no pages');
  return pages;
}
