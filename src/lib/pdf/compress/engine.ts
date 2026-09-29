// PDF compression pipeline (brief Step 2 "Flow"; spike lib.mjs `compress`):
//   1 normalize  qpdf --decrypt --object-streams=disable   (fails → pdf-lib repair → qpdf again)
//   2 pdf-lib    strip /PieceInfo /Thumb, dedupe streams, detect signatures, recompress images
//   3 optimize   qpdf object streams + Flate 9 (6 above 30 MB) + drop unreferenced resources
//   4 verify     reload, page count must match
// Never returns partial output. An output of ≥ 99 % of the input returns the input itself.
import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { PdfCorruptError, PdfError, PdfPasswordRequiredError, PdfWrongPasswordError, assertPdfHeader, isOutOfMemory } from '../errors';
import type { CompressDeps, QpdfResult } from './deps';
import { dedupeStreams } from './dedupe';
import { recompressImages, type ImagePassHooks } from './images';
import { FLATE6_ABOVE, KEEP_ORIGINAL_RATIO, rungLevel, type RungName } from './levels';
import type { CompressReport, Phase, Progress } from './report';
import { hasSignature } from './signature';

export interface CompressOptions {
  /** A level, or a 목표 용량 rung (target mode only). */
  level: RungName;
  /** The user password, only when the user gave one. Used for the qpdf call only. */
  password?: string;
  /** Page count from the pdf.js inspection of the input. The output must have exactly this many. */
  expectedPages: number;
  onProgress?: (p: Progress) => void;
  /** Test seam for the image pass. */
  imageHooks?: Pick<ImagePassHooks, 'placements'>;
}

export interface CompressResult {
  bytes: Uint8Array;
  keptOriginal: boolean;
  report: CompressReport;
}

const N = (s: string): PDFName => PDFName.of(s);
const now = (): number => performance.now();

export function normalizeArgs(password?: string): string[] {
  return ['--decrypt', ...(password ? [`--password=${password}`] : []), '--object-streams=disable', 'in.pdf', 'out.pdf'];
}

export function optimizeArgs(inputBytes: number): string[] {
  return [
    '--object-streams=generate',
    '--compress-streams=y',
    '--recompress-flate',
    `--compression-level=${inputBytes > FLATE6_ABOVE ? 6 : 9}`,
    '--remove-unreferenced-resources=yes',
    'in.pdf',
    'out.pdf',
  ];
}

/** qpdf exit code 0 (ok) or 3 (ok with warnings), with an output file. */
export const qpdfOk = (r: QpdfResult): r is QpdfResult & { out: Uint8Array } => r.out !== null && (r.code === 0 || r.code === 3);

/** Maps a failed qpdf run to an error code. The log text itself never leaves this function. */
export function qpdfFailure(r: QpdfResult, passwordGiven: boolean): PdfError {
  if (r.logs.some((l) => /invalid password/i.test(l))) {
    return passwordGiven ? new PdfWrongPasswordError() : new PdfPasswordRequiredError();
  }
  return new PdfCorruptError('qpdf could not read the file');
}

const ENCRYPT = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74]; // "/Encrypt"

/** True if the file has an /Encrypt entry (as a whole key, not /EncryptMetadata). */
export function hasEncryptKey(bytes: Uint8Array): boolean {
  const last = bytes.length - ENCRYPT.length;
  outer: for (let i = bytes.indexOf(0x2f); i >= 0 && i <= last; i = bytes.indexOf(0x2f, i + 1)) {
    for (let k = 1; k < ENCRYPT.length; k++) if (bytes[i + k] !== ENCRYPT[k]) continue outer;
    const next = bytes[i + ENCRYPT.length];
    if (next === undefined || !/[A-Za-z0-9_.#-]/.test(String.fromCharCode(next))) return true;
  }
  return false;
}

async function loadLenient(bytes: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
  } catch (err) {
    if (isOutOfMemory(err)) throw err;
    throw new PdfCorruptError('pdf-lib could not read the normalized file');
  }
}

export async function compressPdf(input: Uint8Array, opts: CompressOptions, deps: CompressDeps): Promise<CompressResult> {
  assertPdfHeader(input);
  const level = rungLevel(opts.level);
  const progress = (phase: Phase, done = 0, total = 1): void => opts.onProgress?.({ phase, done, total });
  const passwordGiven = Boolean(opts.password);
  const report: CompressReport = {
    level: opts.level,
    inBytes: input.length,
    outBytes: input.length,
    keptOriginal: false,
    pages: opts.expectedPages,
    imagesSeen: 0,
    imagesReplaced: 0,
    skipped: {},
    minImageSsim: null,
    signed: false,
    ownerRestrictionRemoved: !passwordGiven && hasEncryptKey(input),
    ms: {},
  };

  // 1. normalize
  let t = now();
  progress('normalize');
  let r = await deps.qpdf(normalizeArgs(opts.password), input);
  if (!qpdfOk(r)) {
    const failure = qpdfFailure(r, passwordGiven);
    if (failure.code !== 'corrupt') throw failure;
    // qpdf-wasm cannot reconstruct a broken xref table; pdf-lib parses objects linearly and can.
    let repaired: Uint8Array;
    try {
      const doc = await PDFDocument.load(input, { password: opts.password ?? '', updateMetadata: false, throwOnInvalidObject: false });
      repaired = await doc.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false });
    } catch (err) {
      if (isOutOfMemory(err)) throw err;
      throw new PdfCorruptError('repair failed');
    }
    report.repairedBy = 'pdf-lib';
    r = await deps.qpdf(normalizeArgs(), repaired);
    if (!qpdfOk(r)) throw new PdfCorruptError('qpdf could not read the repaired file');
  }
  let mid: Uint8Array = r.out;
  report.ms.normalize = Math.round(now() - t);

  // 2. pdf-lib pass
  t = now();
  const doc = await loadLenient(mid);
  if (doc.getPageCount() !== opts.expectedPages) throw new PdfCorruptError('page count changed while normalizing');
  for (const p of doc.getPages()) {
    for (const k of ['PieceInfo', 'Thumb']) p.node.delete(N(k));
  }
  dedupeStreams(doc);
  report.signed = hasSignature(doc);
  const images = await recompressImages(doc, level, deps, {
    placements: opts.imageHooks?.placements,
    onImage: (done, total) => progress('images', done, total),
  });
  report.imagesSeen = images.seen;
  report.imagesReplaced = images.replaced;
  report.skipped = images.skipped;
  report.minImageSsim = images.minSsim;
  mid = await doc.save({ useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false });
  report.ms.images = Math.round(now() - t);

  // 3. optimize
  t = now();
  progress('optimize');
  const o = await deps.qpdf(optimizeArgs(input.length), mid);
  if (!qpdfOk(o)) throw new PdfError('unknown', 'qpdf could not optimize our own output');
  const out = o.out;
  report.ms.optimize = Math.round(now() - t);

  // 4. verify
  t = now();
  progress('verify');
  const check = await loadLenient(out);
  if (check.getPageCount() !== opts.expectedPages) throw new PdfCorruptError('page count changed while optimizing');
  report.ms.verify = Math.round(now() - t);

  if (out.length >= KEEP_ORIGINAL_RATIO * input.length) {
    report.keptOriginal = true;
    report.keptReason = 'no-gain';
    return { bytes: input, keptOriginal: true, report };
  }
  report.outBytes = out.length;
  return { bytes: out, keptOriginal: false, report };
}
