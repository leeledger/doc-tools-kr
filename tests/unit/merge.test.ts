import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFTextField } from '@cantoo/pdf-lib';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PdfCorruptError, PdfNotPdfError, PdfPasswordRequiredError, PdfWrongPasswordError } from '../../src/lib/pdf/errors';
import { PRODUCER, mergePlus } from '../../src/lib/pdf/mergePlus';
import { verifyOutput } from '../../src/lib/pdf/verify';
import { makeRuntimeFixtures } from '../fixtures/build.mjs';
import { fixture, outlineCount, pageCount, pageTexts } from '../helpers/pdf';

const law = fixture('kr_law_form.pdf');
const fw9 = fixture('irs_fw9.pdf');
const links = fixture('gen_links_outline.pdf');
const rotated = fixture('gen_landscape_rotated.pdf');

let tmp: string;
let rt: Record<'encrypted_userpw_1234' | 'damaged_badxref' | 'truncated' | 'not_a_pdf', string>;
const rtBytes = (k: keyof typeof rt): Uint8Array => new Uint8Array(readFileSync(rt[k]));

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'anollim-'));
  rt = await makeRuntimeFixtures(tmp);
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const N = (s: string) => PDFName.of(s);

/** Number of /Type /Page objects in the file (catches orphan page copies). */
function pageObjectCount(doc: PDFDocument): number {
  let n = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(N('Type')) === N('Page')) n++;
  }
  return n;
}

/** Explicit link destinations per output page: list of target page indices. */
function linkTargets(doc: PDFDocument): { page: number; target: number }[] {
  const refs = doc.getPages().map((p) => p.ref.toString());
  const res: { page: number; target: number }[] = [];
  doc.getPages().forEach((p, i) => {
    const annots = p.node.lookupMaybe(N('Annots'), PDFArray);
    annots?.asArray().forEach((a) => {
      const d = doc.context.lookup(a);
      if (!(d instanceof PDFDict)) return;
      const dest = d.lookupMaybe(N('Dest'), PDFArray);
      const first = dest?.get(0);
      if (first instanceof PDFRef) res.push({ page: i, target: refs.indexOf(first.toString()) });
    });
  });
  return res;
}

describe('mergePlus', () => {
  it('concatenates pages in order and keeps the text of every page byte-identical (incl. Korean)', async () => {
    const { bytes, report } = await mergePlus([{ bytes: law }, { bytes: fw9 }]);
    expect(report.pageCount).toBe(13);
    expect(await pageCount(bytes)).toBe(13);
    const [a, b, out] = await Promise.all([pageTexts(law), pageTexts(fw9), pageTexts(bytes)]);
    expect(out).toEqual([...a, ...b]);
    expect(a.join('')).toMatch(/[가-힣]/);
    await verifyOutput(bytes, 13);
  });

  it('respects the input order', async () => {
    const { bytes } = await mergePlus([{ bytes: fw9 }, { bytes: law }]);
    const [a, b, out] = await Promise.all([pageTexts(fw9), pageTexts(law), pageTexts(bytes)]);
    expect(out).toEqual([...a, ...b]);
  });

  it('sets only the Producer metadata', async () => {
    const { bytes } = await mergePlus([{ bytes: law }, { bytes: links }]);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getProducer()).toBe(PRODUCER);
    expect(doc.getCreator()).toBeUndefined();
  });

  it('merges the same form twice: fields double, second copy renamed _2, both fillable', async () => {
    const first = (await PDFDocument.load(fw9)).getForm().getFields().map((f) => f.getName());
    const { bytes, report } = await mergePlus([{ bytes: fw9 }, { bytes: fw9 }]);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const names = doc.getForm().getFields().map((f) => f.getName());
    expect(names.length).toBe(first.length * 2);
    expect(new Set(names).size).toBe(names.length);
    expect(report.renamedFields).toBeGreaterThan(0);
    // Fully qualified names: the clashing top-level field of the second copy ends in _2.
    const second = first.map((n) => n.replace(/^([^.]+)/, '$1_2'));
    expect(new Set(names)).toEqual(new Set([...first, ...second]));
    const text = doc.getForm().getFields().find((f) => f instanceof PDFTextField) as PDFTextField;
    const partner = text.getName().replace(/^([^.]+)/, '$1_2');
    doc.getForm().getTextField(text.getName()).setText('x');
    doc.getForm().getTextField(partner).setText('y');
    const again = await PDFDocument.load(await doc.save());
    expect(again.getForm().getTextField(text.getName()).getText()).toBe('x');
    expect(again.getForm().getTextField(partner).getText()).toBe('y');
    expect(pageObjectCount(again)).toBe(12);
  });

  it('outline: source entries plus one per file with addFileBookmarks, source entries only without', async () => {
    const src = await outlineCount(links);
    expect(src).toBe(3);
    const withRoots = await mergePlus([{ bytes: links }, { bytes: law }], { addFileBookmarks: true });
    expect(await outlineCount(withRoots.bytes)).toBe(src + 2);
    const without = await mergePlus([{ bytes: links }, { bytes: law }], { addFileBookmarks: false });
    expect(await outlineCount(without.bytes)).toBe(src);
  });

  it('remaps internal links to the right output pages without orphan page copies', async () => {
    const { bytes, report } = await mergePlus([{ bytes: fw9 }, { bytes: links }]);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const t = linkTargets(doc);
    // gen_links_outline p1 (output index 6): /Dest -> src p3 (out 8), /A named -> src p4 (out 9).
    expect(t).toEqual(expect.arrayContaining([{ page: 6, target: 8 }, { page: 6, target: 9 }]));
    expect(t.every((x) => x.target >= 0)).toBe(true);
    expect(report.remappedLinkDests).toBe(2);
    expect(report.droppedLinkDests).toBe(0);
    expect(pageObjectCount(doc)).toBe(doc.getPageCount());
  });

  it('subset pages:[2,0] drops links to removed pages and copies no orphan pages', async () => {
    const { bytes, report } = await mergePlus([{ bytes: links, pages: [2, 0] }, { bytes: law }]);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(2 + 7);
    expect(report.pageCount).toBe(9);
    expect(report.droppedLinkDests).toBeGreaterThan(0);
    expect(pageObjectCount(doc)).toBe(9);
    // Remaining link: src p1 (out 1) -> src p3 (out 0).
    expect(linkTargets(doc)).toEqual([{ page: 1, target: 0 }]);
    const srcText = await pageTexts(links, undefined, [2, 0]);
    expect(await pageTexts(bytes, undefined, [0, 1])).toEqual(srcText);
  });

  it('rotate adds to the existing /Rotate', async () => {
    const { bytes } = await mergePlus([{ bytes: rotated, pages: [0, 1], rotate: [90, 90] }, { bytes: law }]);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    expect(doc.getPage(1).getRotation().angle).toBe(180);
    expect(doc.getPage(2).getRotation().angle).toBe(0);
  });

  it('encrypted input: no password -> PdfPasswordRequiredError, wrong -> PdfWrongPasswordError, 1234 -> text of kr_law_form', async () => {
    const enc = rtBytes('encrypted_userpw_1234');
    await expect(mergePlus([{ bytes: enc }, { bytes: law }])).rejects.toBeInstanceOf(PdfPasswordRequiredError);
    await expect(mergePlus([{ bytes: enc, password: 'nope' }, { bytes: law }])).rejects.toBeInstanceOf(PdfWrongPasswordError);
    const { bytes } = await mergePlus([{ bytes: enc, password: '1234' }, { bytes: law }]);
    const lawText = await pageTexts(law);
    expect(await pageTexts(bytes)).toEqual([...lawText, ...lawText]);
    // The output carries no password.
    await expect(PDFDocument.load(bytes)).resolves.toBeTruthy();
  });

  it('a bad xref still merges', async () => {
    const { bytes } = await mergePlus([{ bytes: rtBytes('damaged_badxref') }, { bytes: fw9 }]);
    expect(await pageCount(bytes)).toBe(13);
    expect((await pageTexts(bytes)).slice(0, 7)).toEqual(await pageTexts(law));
  });

  it('a truncated file throws PdfCorruptError with its file index and never returns output', async () => {
    const err = await mergePlus([{ bytes: law }, { bytes: rtBytes('truncated') }]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfCorruptError);
    expect((err as PdfCorruptError).fileIndex).toBe(1);
  });

  it('PNG bytes throw PdfNotPdfError', async () => {
    const err = await mergePlus([{ bytes: rtBytes('not_a_pdf') }, { bytes: law }]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfNotPdfError);
    expect((err as PdfNotPdfError).fileIndex).toBe(0);
  });

  it('reports progress after each file', async () => {
    const seen: string[] = [];
    await mergePlus([{ bytes: law }, { bytes: links }, { bytes: rotated }], {
      onProgress: (d, t) => seen.push(`${d}/${t}`),
    });
    expect(seen).toEqual(['1/3', '2/3', '3/3']);
  });
});

/** A one-page PDF with one text field per name. */
async function formPdf(names: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const page = doc.addPage([595, 842]);
  const form = doc.getForm();
  names.forEach((n, i) => form.createTextField(n).addToPage(page, { x: 50, y: 700 - i * 40, width: 200, height: 24 }));
  return doc.save();
}

async function fieldNamesOf(bytes: Uint8Array): Promise<string[]> {
  return (await PDFDocument.load(bytes, { updateMetadata: false })).getForm().getFields().map((f) => f.getName());
}

describe('mergePlus field renaming never produces duplicate names', () => {
  it('file 1 {a, a_2} + file 2 {a}: the new name skips a_2', async () => {
    const { bytes, report } = await mergePlus([{ bytes: await formPdf(['a', 'a_2']) }, { bytes: await formPdf(['a']) }]);
    const names = await fieldNamesOf(bytes);
    expect(names).toEqual(['a', 'a_2', 'a_2_2']);
    expect(report.renamedFields).toBe(1);
  });

  it('3-way: A {a}, B {a}, C {a_2} gives unique names, and every field stays fillable', async () => {
    const { bytes, report } = await mergePlus([
      { bytes: await formPdf(['a']) },
      { bytes: await formPdf(['a']) },
      { bytes: await formPdf(['a_2']) },
    ]);
    const names = await fieldNamesOf(bytes);
    expect(names).toEqual(['a', 'a_2', 'a_2_3']);
    expect(report.renamedFields).toBe(2);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    names.forEach((n, i) => doc.getForm().getTextField(n).setText(`v${i}`));
    const again = await PDFDocument.load(await doc.save());
    expect(names.map((n) => again.getForm().getTextField(n).getText())).toEqual(['v0', 'v1', 'v2']);
  });

  it('a file whose own names collide with the rename candidate keeps its own names', async () => {
    const { bytes } = await mergePlus([{ bytes: await formPdf(['a']) }, { bytes: await formPdf(['a', 'a_2']) }]);
    const names = await fieldNamesOf(bytes);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(['a', 'a_2_2', 'a_2']);
  });
});

describe('verifyOutput', () => {
  it('passes on the right page count and throws PdfCorruptError on a mismatch', async () => {
    const { bytes } = await mergePlus([{ bytes: law }, { bytes: links }]);
    await expect(verifyOutput(bytes, 11)).resolves.toBeUndefined();
    await expect(verifyOutput(bytes, 12)).rejects.toBeInstanceOf(PdfCorruptError);
  });

  it('throws PdfCorruptError on unreadable output', async () => {
    await expect(verifyOutput(new Uint8Array([1, 2, 3]), 1)).rejects.toBeInstanceOf(PdfCorruptError);
  });
});
