// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
//
// Read-only Compound File Binary (OLE2 / MS-CFB) reader for HWP 5.x files (brief Step 5 §2). Pure, no
// dependency. Every offset is bounds-checked and every sector chain has a cycle guard; the only error it
// ever throws is CorruptError. Supports 512- and 4096-byte sectors, the DIFAT chain, the FAT, the mini FAT
// and mini stream, and the red-black directory tree (walked as a plain binary tree, with a visited set).
import { CorruptError } from './errors';

const MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;
const NOSTREAM = 0xffffffff;
const MAX_REGSECT = 0xfffffffa;
const HEADER_DIFAT = 109;
const DIR_ENTRY = 128;

interface Entry {
  name: string;
  type: number;
  left: number;
  right: number;
  child: number;
  start: number;
  size: number;
}

export interface CfbStream {
  path: string;
  size: number;
}

export class Cfb {
  private readonly buf: Uint8Array;
  private readonly view: DataView;
  private readonly sectorSize: number;
  private readonly miniSectorSize: number;
  private readonly miniCutoff: number;
  private readonly fat: Uint32Array;
  private readonly entries: Entry[];
  private readonly paths = new Map<string, Entry>();
  private miniFat: Uint32Array | null = null;
  private miniStream: Uint8Array | null = null;
  private readonly firstMiniFat: number;

  constructor(bytes: Uint8Array) {
    this.buf = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 512) throw new CorruptError('cfb: shorter than its header');
    for (let i = 0; i < MAGIC.length; i++) if (bytes[i] !== MAGIC[i]) throw new CorruptError('cfb: bad signature');
    const shift = this.u16(30);
    const miniShift = this.u16(32);
    if (shift !== 9 && shift !== 12) throw new CorruptError(`cfb: sector shift ${shift}`);
    if (miniShift !== 6) throw new CorruptError(`cfb: mini sector shift ${miniShift}`);
    this.sectorSize = 1 << shift;
    this.miniSectorSize = 1 << miniShift;
    this.miniCutoff = this.u32(56);
    const numFat = this.u32(44);
    const firstDir = this.u32(48);
    this.firstMiniFat = this.u32(60);
    const firstDifat = this.u32(68);
    const numDifat = this.u32(72);
    const sectors = this.sectorCount();
    if (numFat > sectors + 1) throw new CorruptError('cfb: FAT sector count beyond the file');

    // DIFAT: 109 ids in the header, then a chain of DIFAT sectors (last u32 of each = next DIFAT sector).
    const fatIds: number[] = [];
    for (let i = 0; i < HEADER_DIFAT && fatIds.length < numFat; i++) {
      const id = this.u32(76 + i * 4);
      if (id <= MAX_REGSECT) fatIds.push(id);
    }
    const perDifat = this.sectorSize / 4 - 1;
    const seenDifat = new Set<number>();
    let d = firstDifat;
    for (let n = 0; fatIds.length < numFat && d !== ENDOFCHAIN && d !== FREESECT; n++) {
      if (n > numDifat || seenDifat.has(d) || d > MAX_REGSECT) throw new CorruptError('cfb: DIFAT chain loops or runs out');
      seenDifat.add(d);
      const off = this.sectorOffset(d);
      for (let i = 0; i < perDifat && fatIds.length < numFat; i++) {
        const id = this.u32(off + i * 4);
        if (id <= MAX_REGSECT) fatIds.push(id);
      }
      d = this.u32(off + perDifat * 4);
    }
    if (fatIds.length < numFat) throw new CorruptError('cfb: fewer FAT sectors than declared');

    const perSector = this.sectorSize / 4;
    this.fat = new Uint32Array(fatIds.length * perSector);
    fatIds.forEach((id, k) => {
      const off = this.sectorOffset(id);
      for (let i = 0; i < perSector; i++) this.fat[k * perSector + i] = this.u32(off + i * 4);
    });

    const dir = this.readChain(firstDir, this.fat, (id) => this.sector(id), this.sectorSize, Number.POSITIVE_INFINITY);
    this.entries = [];
    for (let off = 0; off + DIR_ENTRY <= dir.length; off += DIR_ENTRY) this.entries.push(parseEntry(dir, off));
    if (!this.entries.length || this.entries[0].type !== 5) throw new CorruptError('cfb: no root entry');
    this.walk();
  }

  /** Every stream with its full path ("BodyText/Section0"), in tree order. */
  listStreams(): CfbStream[] {
    const out: CfbStream[] = [];
    for (const [path, e] of this.paths) if (e.type === 2) out.push({ path, size: e.size });
    return out;
  }

  streamSize(path: string): number | null {
    const e = this.paths.get(path);
    return e && e.type === 2 ? e.size : null;
  }

  /** The stream's bytes, or null when the path is not a stream. */
  readStream(path: string): Uint8Array | null {
    return corruptOnly(() => this.readStreamInner(path));
  }

  private readStreamInner(path: string): Uint8Array | null {
    const e = this.paths.get(path);
    if (!e || e.type !== 2) return null;
    if (e.size === 0) return new Uint8Array(0);
    if (e.size < this.miniCutoff) {
      const mini = this.mini();
      return this.readChain(e.start, mini.fat, (id) => {
        const off = id * this.miniSectorSize;
        if (off + this.miniSectorSize > mini.stream.length) {
          if (off >= mini.stream.length) throw new CorruptError('cfb: mini sector beyond the mini stream');
          return mini.stream.subarray(off);
        }
        return mini.stream.subarray(off, off + this.miniSectorSize);
      }, this.miniSectorSize, e.size);
    }
    return this.readChain(e.start, this.fat, (id) => this.sector(id), this.sectorSize, e.size);
  }

  private mini(): { fat: Uint32Array; stream: Uint8Array } {
    if (!this.miniFat || !this.miniStream) {
      const fatBytes = this.firstMiniFat === ENDOFCHAIN ? new Uint8Array(0) : this.readChain(this.firstMiniFat, this.fat, (id) => this.sector(id), this.sectorSize, Number.POSITIVE_INFINITY);
      const fat = new Uint32Array(Math.floor(fatBytes.length / 4));
      const dv = new DataView(fatBytes.buffer, fatBytes.byteOffset, fatBytes.byteLength);
      for (let i = 0; i < fat.length; i++) fat[i] = dv.getUint32(i * 4, true);
      const root = this.entries[0];
      const stream = root.start === ENDOFCHAIN || root.size === 0 ? new Uint8Array(0) : this.readChain(root.start, this.fat, (id) => this.sector(id), this.sectorSize, root.size);
      this.miniFat = fat;
      this.miniStream = stream;
    }
    return { fat: this.miniFat, stream: this.miniStream };
  }

  /**
   * Follows a chain from `start` in `table`, concatenating the units `unit(id)` returns. `size` is the
   * stream size (Infinity: read the whole chain). The chain can never be longer than the table (cycle guard).
   */
  private readChain(start: number, table: Uint32Array, unit: (id: number) => Uint8Array, unitSize: number, size: number): Uint8Array {
    const ids: number[] = [];
    const seen = new Set<number>();
    let id = start;
    const need = Number.isFinite(size) ? Math.ceil(size / unitSize) : Number.POSITIVE_INFINITY;
    while (id !== ENDOFCHAIN && ids.length < need) {
      if (id > MAX_REGSECT || id >= table.length) throw new CorruptError('cfb: chain points outside its table');
      if (seen.has(id)) throw new CorruptError('cfb: chain loops');
      seen.add(id);
      ids.push(id);
      id = table[id];
    }
    if (Number.isFinite(size) && ids.length * unitSize < size) throw new CorruptError('cfb: chain shorter than the stream');
    const parts = ids.map(unit);
    const total = Number.isFinite(size) ? size : parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) {
      if (pos >= total) break;
      const take = Math.min(p.length, total - pos);
      out.set(p.subarray(0, take), pos);
      pos += take;
    }
    if (pos < total) throw new CorruptError('cfb: stream runs past the end of the file');
    return out;
  }

  private walk(): void {
    const visited = new Set<number>();
    const visit = (i: number, prefix: string, depth: number): void => {
      // Iterative over siblings would be nicer; the depth cap bounds recursion on hostile trees.
      if (i === NOSTREAM) return;
      if (i >= this.entries.length || visited.has(i) || depth > 4096) throw new CorruptError('cfb: bad directory tree');
      visited.add(i);
      const e = this.entries[i];
      visit(e.left, prefix, depth + 1);
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.type === 1 || e.type === 2) this.paths.set(path, e);
      if (e.type === 1) visit(e.child, path, depth + 1);
      visit(e.right, prefix, depth + 1);
    };
    visit(this.entries[0].child, '', 0);
  }

  private sectorCount(): number {
    return Math.max(0, Math.ceil((this.buf.length - this.sectorSize) / this.sectorSize));
  }

  private sectorOffset(id: number): number {
    const off = (id + 1) * this.sectorSize;
    if (id > MAX_REGSECT || off + 4 > this.buf.length) throw new CorruptError(`cfb: sector ${id} beyond the file`);
    return off;
  }

  /** A sector's bytes; the last sector of a file may be short. */
  private sector(id: number): Uint8Array {
    const off = this.sectorOffset(id);
    return this.buf.subarray(off, Math.min(off + this.sectorSize, this.buf.length));
  }

  private u16(off: number): number {
    if (off + 2 > this.buf.length) throw new CorruptError('cfb: read past the end');
    return this.view.getUint16(off, true);
  }

  private u32(off: number): number {
    if (off + 4 > this.buf.length) throw new CorruptError('cfb: read past the end');
    return this.view.getUint32(off, true);
  }
}

function parseEntry(dir: Uint8Array, off: number): Entry {
  const dv = new DataView(dir.buffer, dir.byteOffset + off, DIR_ENTRY);
  const nameLen = Math.min(dv.getUint16(64, true), 64);
  let name = '';
  // Name length is in bytes and counts the terminating NUL.
  for (let i = 0; i + 2 <= nameLen; i += 2) {
    const c = dv.getUint16(i, true);
    if (c === 0) break;
    name += String.fromCharCode(c);
  }
  return {
    name,
    type: dv.getUint8(66),
    left: dv.getUint32(68, true),
    right: dv.getUint32(72, true),
    child: dv.getUint32(76, true),
    start: dv.getUint32(116, true),
    // Version 3 files may leave garbage in the high half; the low 32 bits are the size.
    size: dv.getUint32(120, true),
  };
}

/** Runs `fn`; any error other than CorruptError (a RangeError from a hostile size, say) becomes one. */
function corruptOnly<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof CorruptError) throw err;
    throw new CorruptError(`cfb: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Opens a CFB file; throws CorruptError only. */
export function openCfb(bytes: Uint8Array): Cfb {
  return corruptOnly(() => new Cfb(bytes));
}
