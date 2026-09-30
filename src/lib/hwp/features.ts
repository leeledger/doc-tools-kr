// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
//
// Static feature scan (brief Step 5 §2): a port of the guard fields of spikes/hwp/scripts/features.py, with
// the same semantics bit for bit, so our routing matches the gate run. Pure; runs in the worker (and Node).
// - HWP 5: FileHeader flags; each BodyText/Section* is raw-inflated when compressed (a stream that fails to
//   inflate sets decodeError and is skipped); record walk; equations = tag 88 + ctrl 'eqed';
//   textboxes = shape components '$rec' + '$ell' + '$pol'; imageBytes = sum of the BinData stream sizes.
// - HWPX: mimetype must be application/hwp+zip; section XML regexes; imageBytes = BinData uncompressed sizes.
// - HWP 3.0: format only.
// Everything inflated is walked as it streams out of the inflater and is never held whole: the total output
// of a file is capped (512 MB desktop, 128 MB phone; Arch, Step 5 round 3) and a zip bomb is stopped at the
// cap with only a few MB in memory (Richard, round 2, Should Fix 3).
// Throws HwpError: not-hwp, password, unsupported (ZIP64) or corrupt (structure, inflate cap).
import { openCfb, type Cfb } from './cfb';
import { CorruptError, HwpError, UnsupportedError } from './errors';
import { INFLATE_CAP, InflateCapError, inflateRawStream } from './inflate';
import { sniffContainer } from './sniff';
import { readEntry, readZipDir, streamEntry } from './zipdir';

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

export interface ScanOptions {
  /** Total inflated bytes allowed for the whole file (LIMITS[device].inflateCap). */
  inflateCap?: number;
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

export interface Counts {
  tag88: number;
  eqed: number;
  textboxes: number;
}

const u32 = (b: Uint8Array): number => (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;

/**
 * features.py `records()` over one decoded stream fed in chunks, counting only the guard fields. Same result
 * as walking the whole buffer: a record header is 4 bytes (tag = h & 0x3FF, size = h >> 20; 0xFFF means the
 * size is the next u32), and only the first 4 payload bytes of tags 71 and 76 are looked at.
 */
export class RecordWalker {
  readonly counts: Counts = { tag88: 0, eqed: 0, textboxes: 0 };
  private readonly head = new Uint8Array(8);
  private headLen = 0;
  private tag = 0;
  private size = 0;
  /** Payload bytes still to skip in the current record (-1: reading a header). */
  private left = -1;
  private readonly first = new Uint8Array(4);
  private firstLen = 0;
  private records = 0;
  private done = false;

  constructor(private readonly maxRecords: number = MAX_RECORDS) {}

  push(chunk: Uint8Array): void {
    let i = 0;
    const n = chunk.length;
    while (i < n && !this.done) {
      if (this.left < 0) {
        // Header: 4 bytes, plus 4 more when the size field is 0xFFF.
        if (this.records >= this.maxRecords) {
          this.done = true;
          return;
        }
        this.head[this.headLen++] = chunk[i++];
        if (this.headLen === 4) {
          const h = u32(this.head);
          this.tag = h & 0x3ff;
          this.size = h >>> 20;
          if (this.size !== 0xfff) this.startPayload();
        } else if (this.headLen === 8) {
          this.size = u32(this.head.subarray(4));
          this.startPayload();
        }
        continue;
      }
      const take = Math.min(this.left, n - i);
      if (this.firstLen < 4 && (this.tag === TAG_CTRL_HEADER || this.tag === TAG_SHAPE_COMPONENT)) {
        const want = Math.min(4 - this.firstLen, take);
        this.first.set(chunk.subarray(i, i + want), this.firstLen);
        this.firstLen += want;
        if (this.firstLen === 4) this.countFirst();
      }
      i += take;
      this.left -= take;
      if (this.left === 0) this.left = -1;
    }
  }

  private startPayload(): void {
    this.headLen = 0;
    this.records++;
    if (this.tag === TAG_EQEDIT) this.counts.tag88++;
    this.firstLen = 0;
    this.left = this.size === 0 ? -1 : this.size;
  }

  private countFirst(): void {
    const id = cid(u32(this.first));
    if (this.tag === TAG_CTRL_HEADER && id === 'eqed') this.counts.eqed++;
    else if (this.tag === TAG_SHAPE_COMPONENT && TEXTBOX_IDS.has(id)) this.counts.textboxes++;
  }
}

/** The walk over one whole buffer (tests and uncompressed streams). */
export function walkRecords(buf: Uint8Array, counts: Counts, maxRecords: number = MAX_RECORDS): void {
  const w = new RecordWalker(maxRecords);
  w.push(buf);
  counts.tag88 += w.counts.tag88;
  counts.eqed += w.counts.eqed;
  counts.textboxes += w.counts.textboxes;
}

const isWordByte = (b: number): boolean => (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) || b === 0x5f;

/**
 * Counts `<prefix>` followed by a word boundary in UTF-8 bytes fed in chunks: exactly what the features.py
 * regex (`<hp:equation\b` on the decoded text) counts, because the prefix is ASCII, a UTF-8 decoder never
 * turns other bytes into ASCII, and JS `\b` (no u flag) treats every non-ASCII character as a non-word
 * character. Works on bytes so a zip bomb produces no strings at all. The next byte decides the boundary, so
 * a match that ends a chunk is settled by the next chunk or by `end()`.
 */
export class ByteCounter {
  private readonly pat: Uint8Array;
  /** How many bytes of the pattern the stream currently ends with (a KMP-free restart is safe: '<' occurs once). */
  private matched = 0;
  /** A full match waiting for the next byte (or the end) to decide the word boundary. */
  private pending = false;
  count = 0;

  constructor(prefix: string) {
    this.pat = Uint8Array.from(prefix, (c) => c.charCodeAt(0));
  }

  push(chunk: Uint8Array): void {
    const pat = this.pat;
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i];
      if (this.pending) {
        this.pending = false;
        if (!isWordByte(b)) this.count++;
      }
      if (b === pat[this.matched]) {
        this.matched++;
        if (this.matched === pat.length) {
          this.pending = true;
          this.matched = 0;
        }
      } else this.matched = b === pat[0] ? 1 : 0;
    }
  }

  end(): void {
    if (this.pending) this.count++;
    this.pending = false;
    this.matched = 0;
  }
}

class Budget {
  constructor(public left: number) {}
}

function hwp5(bytes: Uint8Array, budget: Budget): Features {
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
    // Counts of a stream count only if the whole stream decodes (features.py skips a failing stream).
    const walker = new RecordWalker();
    if (compressed) {
      try {
        budget.left -= inflateRawStream(raw, budget.left, (c) => walker.push(c));
      } catch (err) {
        if (err instanceof InflateCapError) throw new HwpError('corrupt', 'the sections inflate past the cap');
        decodeError = true;
        continue;
      }
    } else walker.push(raw);
    counts.tag88 += walker.counts.tag88;
    counts.eqed += walker.counts.eqed;
    counts.textboxes += walker.counts.textboxes;
  }
  let imageBytes = 0;
  for (const s of streams) if (s.path.split('/')[0] === 'BinData') imageBytes += s.size;
  return { format: 'hwp5', equations: counts.tag88 + counts.eqed, textboxes: counts.textboxes, imageBytes, compressed, password, distribution, decodeError };
}

const SECTION_RE = /^Contents\/section\d+\.xml/;
const utf8 = new TextDecoder('utf-8');

function hwpx(bytes: Uint8Array, budget: Budget): Features {
  const entries = readZipDir(bytes);
  const mime = entries.find((e) => e.name === 'mimetype');
  if (!mime) throw new HwpError('not-hwp', 'zip without a mimetype entry');
  const mimeText = utf8.decode(readEntry(bytes, mime, 1024)).trim();
  if (mimeText !== HWPX_MIME) throw new HwpError('not-hwp', `zip mimetype ${mimeText.slice(0, 40)}`);
  let equations = 0;
  let textboxes = 0;
  for (const e of entries) {
    if (!SECTION_RE.test(e.name)) continue;
    // Section by section (features.py decodes each entry on its own), streamed as bytes.
    const eq = new ByteCounter('<hp:equation');
    const tb = new ByteCounter('<hp:drawText');
    budget.left -= streamEntry(bytes, e, budget.left, (chunk) => {
      eq.push(chunk);
      tb.push(chunk);
    });
    eq.end();
    tb.end();
    equations += eq.count;
    textboxes += tb.count;
  }
  let imageBytes = 0;
  for (const e of entries) if (e.name.startsWith('BinData/')) imageBytes += e.size;
  return { format: 'hwpx', equations, textboxes, imageBytes, compressed: true, password: false, distribution: false, decodeError: false };
}

/** Scans a whole file. HwpError on every failure (never anything else). */
export function scanFeatures(bytes: Uint8Array, opts: ScanOptions = {}): Features {
  const budget = new Budget(opts.inflateCap ?? INFLATE_CAP);
  try {
    const kind = sniffContainer(bytes.subarray(0, 1024));
    if (kind === 'hwp3') return { format: 'hwp3', equations: 0, textboxes: 0, imageBytes: 0, compressed: false, password: false, distribution: false, decodeError: false };
    if (kind === 'cfb') return hwp5(bytes, budget);
    if (kind === 'zip') return hwpx(bytes, budget);
    if (kind === 'unsupported') throw new HwpError('unsupported');
    throw new HwpError('not-hwp');
  } catch (err) {
    if (err instanceof HwpError) throw err;
    if (err instanceof UnsupportedError) throw new HwpError('unsupported', err.message);
    if (err instanceof CorruptError) throw new HwpError('corrupt', err.message);
    throw new HwpError('corrupt', err instanceof Error ? err.message : String(err), { cause: err });
  }
}
