// 양식 채우기 엔진 (FORM1020 D3): the declarative form a page fills and the HWP worker builds (./build). A form is
// data only: fields (what the visitor types) and blocks (the document, top to bottom). Document text sits under
// the keys `doc`, `docLabel`, `docSection`, `docTemplate`, `docBlank` and `docZero`; it is drawn in the document's own
// faces (HWP/PDF), never in the UI font, so scripts/lib/ui-font-chars.mjs leaves those strings out of the UI glyph sets.

/** Body text size (points): the template's own. Everything after a form's first table is body text (./build). */
export const BODY_PT = 10;

/**
 * text: one line. multiline: up to maxLines lines. date: an ISO date (YYYY-MM-DD) or empty. amount: whole 원, 1–12
 * digits (LOAN1022). number: a decimal, up to 3 digits and 2 decimals (LOAN1022).
 */
export type FieldKind = 'text' | 'multiline' | 'date' | 'amount' | 'number';

export interface FormField {
  id: string;
  /** The page's label (plain words). */
  label: string;
  /** The label in the document (table rows). A field placed by a dateLine has none. */
  docLabel?: string;
  kind: FieldKind;
  /** In code points, newlines included (./values). */
  maxLength: number;
  /** multiline only. */
  maxLines?: number;
  placeholder?: string;
  /** Row height in table rows: rowHeight × rowLines (room to write by hand on the blank form). Default 1. */
  rowLines?: number;
  /** number only: the document text of a value, with `{v}` for it (「연 {v}%」). */
  docTemplate?: string;
  /** amount, number or date: the document text of an empty value (room to write by hand). */
  docBlank?: string;
  /** number only: the document text of the value 0 (「없음」). */
  docZero?: string;
}

export type Align = 'left' | 'center' | 'right' | 'justify';

export type FormBlock =
  /** The document title. size in points. */
  | { type: 'title'; doc: string; size: number }
  /** A paragraph; `{fieldId}` slots take the value (empty → spaces). onlyIf: left out when that field is empty. */
  | { type: 'para'; doc: string; align?: Align; onlyIf?: string; size?: number; bold?: boolean }
  /**
   * Rows of [docLabel, value]; docSection (optional) is a label merged down a left column. colWidths in HWPUNIT
   * (1/7200 inch), one per column; rowHeight in HWPUNIT (a row grows with its text).
   */
  | { type: 'table'; docSection?: string; rows: string[]; colWidths: number[]; rowHeight: number }
  /** 「2026년 10월 20일」 from a date field; empty → 「     년     월     일」. */
  | { type: 'dateLine'; field: string; align?: Align }
  /** 「위임인  홍길동  (서명 또는 인)」: docLabel, the field's value (empty → spaces), the sign mark. */
  | { type: 'signLine'; docLabel: string; field: string; align?: Align }
  /** An empty line of `size` points (spacing between blocks). */
  | { type: 'gap'; size: number };

export interface FormSpec {
  id: string;
  /** The downloaded files: `${fileBase}.hwp`, `${fileBase}.pdf`. */
  fileBase: string;
  /** The page's name of the form. */
  title: string;
  fields: FormField[];
  blocks: FormBlock[];
}

/** Text values by field id, after ./values normalize (every field present; '' = empty). */
export type FormValues = Record<string, string>;

/** `{id}` slots of a paragraph. */
export const slotIds = (doc: string): string[] => [...doc.matchAll(/\{([A-Za-z][\w-]*)\}/g)].map((m) => m[1]!);

/** The fields a block puts on the page as their home (a table row or a date line), in order. */
export function homeFields(block: FormBlock): string[] {
  if (block.type === 'table') return block.rows;
  if (block.type === 'dateLine') return [block.field];
  return [];
}

/** The fields a block only refers to (slots, sign line name, onlyIf). */
export function referredFields(block: FormBlock): string[] {
  if (block.type === 'para') return [...slotIds(block.doc), ...(block.onlyIf ? [block.onlyIf] : [])];
  if (block.type === 'signLine') return [block.field];
  return [];
}

/**
 * Spec rules (FORM1020 test map "spec lint"): ids unique; every field has exactly one home; table fields have a
 * docLabel; every reference names a field; maxLength set; multiline has maxLines; table widths match its columns;
 * after the first table (and right before it) only body text (./build: rhwp breaks pages on a char format there);
 * a dateLine names a date field (a date may also sit in a table row, LOAN1022); docTemplate has `{v}`; docTemplate and
 * docZero only on number fields, docBlank only on amount, number and date fields.
 * Returns the problems (empty = valid).
 */
export function lintSpec(spec: FormSpec): string[] {
  const out: string[] = [];
  const ids = new Map<string, FormField>();
  for (const f of spec.fields) {
    if (ids.has(f.id)) out.push(`duplicate field ${f.id}`);
    ids.set(f.id, f);
    if (!(Number.isInteger(f.maxLength) && f.maxLength > 0)) out.push(`${f.id}: maxLength`);
    if (f.kind === 'multiline' && !(Number.isInteger(f.maxLines) && f.maxLines! > 0)) out.push(`${f.id}: maxLines`);
    if (!f.label.trim()) out.push(`${f.id}: label`);
    if (f.docTemplate !== undefined && !f.docTemplate.includes('{v}')) out.push(`${f.id}: docTemplate needs {v}`);
    if ((f.docTemplate !== undefined || f.docZero !== undefined) && f.kind !== 'number') out.push(`${f.id}: docTemplate and docZero are for number fields`);
    if (f.docBlank !== undefined && !['amount', 'number', 'date'].includes(f.kind)) out.push(`${f.id}: docBlank is for amount, number and date fields`);
  }
  const homes = new Map<string, number>();
  const firstTable = spec.blocks.findIndex((b) => b.type === 'table');
  const body = (b: FormBlock | undefined): boolean => !b || (b.type === 'gap' ? b.size === BODY_PT : b.type === 'para' ? (b.size ?? BODY_PT) === BODY_PT && !b.bold : b.type !== 'title');
  if (firstTable >= 0) {
    if (!body(spec.blocks[firstTable - 1])) out.push('the block before the first table must be body text');
    spec.blocks.forEach((b, i) => {
      if (i > firstTable && !body(b)) out.push(`block ${i} after the first table must be body text`);
    });
  }
  spec.blocks.forEach((b) => {
    for (const id of homeFields(b)) homes.set(id, (homes.get(id) ?? 0) + 1);
    for (const id of [...homeFields(b), ...referredFields(b)]) if (!ids.has(id)) out.push(`unknown field ${id}`);
    if (b.type === 'table') {
      const cols = b.docSection ? 3 : 2;
      if (b.colWidths.length !== cols) out.push(`table ${b.rows[0]}: ${b.colWidths.length} widths for ${cols} columns`);
      for (const id of b.rows) if (!ids.get(id)?.docLabel?.trim()) out.push(`${id}: docLabel`);
    }
    if (b.type === 'dateLine' && ids.get(b.field) && ids.get(b.field)!.kind !== 'date') out.push(`${b.field}: dateLine needs a date field`);
  });
  for (const f of spec.fields) {
    const n = homes.get(f.id) ?? 0;
    if (n !== 1) out.push(`${f.id}: placed ${n} times`);
  }
  return out;
}
