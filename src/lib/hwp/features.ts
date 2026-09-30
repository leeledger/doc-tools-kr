// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
//
// Static feature scan (brief Step 5 §2): a port of the guard fields of spikes/hwp/scripts/features.py, with
// the same semantics bit for bit, so our routing matches the gate run. Pure; runs in the worker (and Node).
// - HWP 5: FileHeader flags; each BodyText/Section* is raw-inflated when compressed (a stream that fails to
//   inflate sets decodeError and is skipped); record walk; equations = tag 88 + ctrl 'eqed';
//   textboxes = shape components '$rec' + '$ell' + '$pol'; imageBytes = sum of the BinData stream sizes.
// - HWPX: mimetype must be application/hwp+zip; section XML regexes; imageBytes = BinData uncompressed sizes.
// - HWP 3.0: format only.
// Throws HwpError: not-hwp, password, unsupported (ZIP64) or corrupt (structure, inflate cap).
import { openCfb, type Cfb } from './cfb';
import { CorruptError, HwpError, UnsupportedError } from './errors';
import { INFLATE_CAP, InflateCapError, inflateRawCapped } from './inflate';
import { sniffContainer } from './sniff';
import { readEntry, readZipDir } from './zipdir';

export type HwpFormat = 'hwp5' | 'hwpx' | 'hwp3';

export interface Features {
  format: HwpFormat;
  equations: number;
  textboxes: number;
  imageBytes: number;
  compressed: boolean;
  password: boolean;
  distribution: boolean;
  /** A BodyText stream did not inflate (it was skipped, as in the spike scan). */
  decodeError: boolean;
}

/** Record-walk bound per stream (brief: 5 M records). */
export const MAX_RECORDS = 5_000_000;
const HWP5_SIGNATURE = 'HWP Document File';
const TAG_CTRL_HEADER = 71;
const TAG_SHAPE_COMPONENT = 76;
const TAG_EQEDIT = 88;
const TEXTBOX_IDS = new Set(['$rec', '$ell', '$pol']);
const HWPX_MIME = 'application/hwp+zip';

/** features.py `cid()`: a u32 read little-endian, written out as 4 chars from its most significant byte. */
export function cid(v: number): string {
  return String.fromCharCode((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
}

interface Counts {
  tag88: number;
  eqed: number;
  textboxes: number;
}

/** features.py `records()` over one decoded stream, counting only the guard fields. */
export function walkRecords(buf: Uint8Array, counts: Counts, maxRecords: number = MAX_RECORDS): void {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = buf.length;
  let i = 0;
  for (let r = 0; i + 4 <= n && r < maxRecords; r++) {
    const h = dv.getUint32(i, true);
    i += 4;
    const tag = h & 0x3ff;
    let size = h >>> 20;
    if (size === 0xfff) {
      if (i + 4 > n) break;
      size = dv.getUint32(i, true);
      i += 4;
    }
    const len = Math.max(0, Math.min(size, n - i));
    if (tag === TAG_EQEDIT) counts.tag88++;
    if (tag === TAG_CTRL_HEADER && len >= 4) {
      if (cid(dv.getUint32(i, true)) === 'eqed') counts.eqed++;
    } else if (tag === TAG_SHAPE_COMPONENT && len >= 4) {
      if (TEXTBOX_IDS.has(cid(dv.getUint32(i, true)))) counts.textboxes++;
    }
    i += size;
  }
}

function inflateOrNull(raw: Uint8Array): Uint8Array | null {
  try {
    return inflateRawCapped(raw, INFLATE_CAP);
  } catch (err) {
    if (err instanceof InflateCapError) throw new HwpError('corrupt', 'a section inflates past the cap');
    return null;
  }
}

function hwp5(bytes: Uint8Array): Features {
  const cfb: Cfb = openCfb(bytes);
  const header = cfb.readStream('FileHeader');
  if (!header || header.length < 40) throw new HwpError('not-hwp', 'CFB without an HWP FileHeader');
  let sig = '';
  for (let i = 0; i < HWP5_SIGNATURE.length; i++) sig += String.fromCharCode(header[i]);
  if (sig !== HWP5_SIGNATURE) throw new HwpError('not-hwp', 'CFB without the HWP signature');
  const dv = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const props = dv.getUint32(36, true);
  const compressed = (props & 1) !== 0;
  const password = (props & 2) !== 0;
  const distribution = (props & 4) !== 0;
  if (password) throw new HwpError('password');

  const streams = cfb.listStreams();
  const counts: Counts = { tag88: 0, eqed: 0, textboxes: 0 };
  let decodeError = false;
  for (const s of streams) {
    if (s.path.split('/')[0] !== 'BodyText') continue;
    const raw = cfb.readStream(s.path);
    if (!raw) continue;
    const data = compressed ? inflateOrNull(raw) : raw;
    if (!data) {
      decodeError = true;
      continue;
    }
    walkRecords(data, counts);
  }
  let imageBytes = 0;
  for (const s of streams) if (s.path.split('/')[0] === 'BinData') imageBytes += s.size;
  return { format: 'hwp5', equations: counts.tag88 + counts.eqed, textboxes: counts.textboxes, imageBytes, compressed, password, distribution, decodeError };
}

const SECTION_RE = /^Contents\/section\d+\.xml/;
const utf8 = new TextDecoder('utf-8');

function hwpx(bytes: Uint8Array): Features {
  const entries = readZipDir(bytes);
  const mime = entries.find((e) => e.name === 'mimetype');
  if (!mime) throw new HwpError('not-hwp', 'zip without a mimetype entry');
  const mimeText = utf8.decode(readEntry(bytes, mime, 1024)).trim();
  if (mimeText !== HWPX_MIME) throw new HwpError('not-hwp', `zip mimetype ${mimeText.slice(0, 40)}`);
  let equations = 0;
  let textboxes = 0;
  let budget = INFLATE_CAP;
  for (const e of entries) {
    if (!SECTION_RE.test(e.name)) continue;
    const data = readEntry(bytes, e, budget);
    budget -= data.length;
    // Section by section: the regexes cannot match across a section boundary (each starts with '<').
    const xml = utf8.decode(data);
    equations += (xml.match(/<hp:equation\b/g) ?? []).length;
    textboxes += (xml.match(/<hp:drawText\b/g) ?? []).length;
  }
  let imageBytes = 0;
  for (const e of entries) if (e.name.startsWith('BinData/')) imageBytes += e.size;
  return { format: 'hwpx', equations, textboxes, imageBytes, compressed: true, password: false, distribution: false, decodeError: false };
}

/** Scans a whole file. HwpError on every failure (never anything else). */
export function scanFeatures(bytes: Uint8Array): Features {
  try {
    const kind = sniffContainer(bytes.subarray(0, 1024));
    if (kind === 'hwp3') return { format: 'hwp3', equations: 0, textboxes: 0, imageBytes: 0, compressed: false, password: false, distribution: false, decodeError: false };
    if (kind === 'cfb') return hwp5(bytes);
    if (kind === 'zip') return hwpx(bytes);
    if (kind === 'unsupported') throw new HwpError('unsupported');
    throw new HwpError('not-hwp');
  } catch (err) {
    if (err instanceof HwpError) throw err;
    if (err instanceof UnsupportedError) throw new HwpError('unsupported', err.message);
    if (err instanceof CorruptError) throw new HwpError('corrupt', err.message);
    throw new HwpError('corrupt', err instanceof Error ? err.message : String(err), { cause: err });
  }
}
