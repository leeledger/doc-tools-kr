// Generates the committed synthetic fixtures (run: node tests/fixtures/build.mjs) and,
// via makeRuntimeFixtures(), the edge-case files that are created at test time and never committed.
import { PDFDocument, PDFHexString, PDFName, StandardFonts, degrees } from '@cantoo/pdf-lib';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = dirname(fileURLToPath(import.meta.url));

const N = (s) => PDFName.of(s);

/** 4 pages; outline with 3 entries; 2 GoTo links on page 1 (one /Dest, one /A); 1 named destination. */
async function buildLinksOutline() {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = [1, 2, 3, 4].map((n) => {
    const p = doc.addPage([595, 842]);
    p.drawText(`Links and outline fixture page ${n}`, { x: 60, y: 760, size: 20, font });
    return p;
  });
  const ctx = doc.context;
  const [p1, p2, p3, p4] = pages;

  // Named destination "chap4" -> page 4.
  const destsArray = ctx.obj([PDFHexString.fromText('chap4'), [p4.ref, 'XYZ', 0, 842, null]]);
  const destsTree = ctx.obj({ Names: destsArray });
  doc.catalog.set(N('Names'), ctx.obj({ Dests: ctx.register(destsTree) }));

  // Link 1: explicit /Dest -> page 3. Link 2: /A GoTo with the named destination -> page 4.
  p1.drawText('Go to page 3', { x: 60, y: 700, size: 14, font });
  p1.drawText('Go to page 4 (named)', { x: 60, y: 660, size: 14, font });
  const link1 = ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [55, 695, 200, 715], Border: [0, 0, 0], Dest: [p3.ref, 'Fit'] });
  const link2 = ctx.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [55, 655, 240, 675],
    Border: [0, 0, 0],
    A: { S: 'GoTo', D: PDFHexString.fromText('chap4') },
  });
  p1.node.set(N('Annots'), ctx.obj([ctx.register(link1), ctx.register(link2)]));

  // Outline: 3 entries (explicit /Dest, /A GoTo explicit, named destination).
  const olRef = ctx.nextRef();
  const refs = [ctx.nextRef(), ctx.nextRef(), ctx.nextRef()];
  const items = [
    { title: 'Chapter 1', Dest: [p1.ref, 'Fit'] },
    { title: 'Chapter 2', A: { S: 'GoTo', D: [p2.ref, 'XYZ', 0, 842, null] } },
    { title: 'Chapter 4', Dest: PDFHexString.fromText('chap4') },
  ];
  items.forEach((it, i) => {
    const d = ctx.obj({ Title: PDFHexString.fromText(it.title), Parent: olRef });
    if (it.Dest) d.set(N('Dest'), ctx.obj(it.Dest));
    if (it.A) d.set(N('A'), ctx.obj(it.A));
    if (i > 0) d.set(N('Prev'), refs[i - 1]);
    if (i < items.length - 1) d.set(N('Next'), refs[i + 1]);
    ctx.assign(refs[i], d);
  });
  ctx.assign(olRef, ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs[2], Count: 3 }));
  doc.catalog.set(N('Outlines'), olRef);
  return doc.save({ useObjectStreams: false });
}

/** Page 1: A4 landscape. Page 2: A4 portrait with /Rotate 90. */
async function buildLandscapeRotated() {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const a = doc.addPage([842, 595]);
  a.drawText('Landscape page', { x: 60, y: 520, size: 24, font });
  const b = doc.addPage([595, 842]);
  b.drawText('Rotated page', { x: 60, y: 760, size: 24, font });
  b.setRotation(degrees(90));
  return doc.save({ useObjectStreams: false });
}

// 1×1 PNG.
const PNG_BYTES = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
);

/**
 * Writes the never-committed edge-case fixtures into `dir` and returns their paths.
 * @param {string} dir
 * @returns {Promise<Record<'encrypted_userpw_1234' | 'damaged_badxref' | 'truncated' | 'not_a_pdf', string>>}
 */
export async function makeRuntimeFixtures(dir) {
  mkdirSync(dir, { recursive: true });
  const law = readFileSync(join(FIXTURES, 'kr_law_form.pdf'));
  const fw9 = readFileSync(join(FIXTURES, 'irs_fw9.pdf'));

  // kr_law_form is PDF/A, which forbids encryption, so its pages go into a fresh document first.
  const lawDoc = await PDFDocument.load(law, { updateMetadata: false });
  const encDoc = await PDFDocument.create({ updateMetadata: false });
  for (const p of await encDoc.copyPages(lawDoc, lawDoc.getPageIndices())) encDoc.addPage(p);
  encDoc.encrypt({ userPassword: '1234', ownerPassword: 'owner-only-1234' });
  const encrypted = await encDoc.save({ useObjectStreams: false });

  // startxref set to 999 (same recipe as the spike corpus).
  const text = Buffer.from(law).toString('latin1');
  const at = text.lastIndexOf('startxref');
  const badxref = Buffer.from(text.slice(0, at) + text.slice(at).replace(/startxref\s+\d+/, 'startxref\n999'), 'latin1');

  const files = {
    encrypted_userpw_1234: encrypted,
    damaged_badxref: badxref,
    truncated: fw9.subarray(0, Math.floor(fw9.length * 0.6)),
    not_a_pdf: PNG_BYTES,
  };
  /** @type {Record<string, string>} */
  const paths = {};
  for (const [name, bytes] of Object.entries(files)) {
    paths[name] = join(dir, `${name}.pdf`);
    writeFileSync(paths[name], bytes);
  }
  return paths;
}

/**
 * A valid 1-page PDF just over `megabytes` MB: the size comes from an unreferenced stream of random bytes,
 * which a merge does not copy. Used to exercise the mobile soft limit (50 MB) in e2e.
 */
export async function makeBigFixture(dir, megabytes = 51) {
  mkdirSync(dir, { recursive: true });
  const doc = await PDFDocument.create({ updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([595, 842]).drawText('Large file fixture', { x: 60, y: 760, size: 20, font });
  doc.context.register(doc.context.stream(randomBytes(megabytes * 1024 * 1024)));
  const path = join(dir, `big_${megabytes}mb.pdf`);
  writeFileSync(path, await doc.save({ useObjectStreams: false }));
  return path;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(FIXTURES, 'gen_links_outline.pdf'), await buildLinksOutline());
  writeFileSync(join(FIXTURES, 'gen_landscape_rotated.pdf'), await buildLandscapeRotated());
  console.log('fixtures: gen_links_outline.pdf, gen_landscape_rotated.pdf');
}
