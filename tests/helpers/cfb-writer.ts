// Minimal Compound File Binary writer for tests (synthetic CFB files and patched copies of HWP fixtures).
// Streams under 4096 bytes go to the mini stream (as the format requires); `difatOnly` lists every FAT sector in a DIFAT
// sector chain instead of the header (exercises the reader's DIFAT path). Sibling order is a right-leaning
// chain, a valid binary tree; red-black colours are not maintained (readers ignore them).

export interface CfbWriteOptions {
  sectorSize?: 512 | 4096;
  difatOnly?: boolean;
}

export interface CfbLayout {
  bytes: Uint8Array;
  sectorSize: number;
  /** First sector of each regular (non-mini) stream. */
  starts: Map<string, number>;
  /** Byte offset of FAT entry 0 (the first FAT sector). */
  fatOffset: number;
  firstDirSector: number;
}

const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;
const FATSECT = 0xfffffffd;
const DIFSECT = 0xfffffffc;
const NOSTREAM = 0xffffffff;
const MINI_CUTOFF = 4096;
const MINI = 64;

interface Node {
  name: string;
  type: 1 | 2 | 5;
  data?: Uint8Array;
  children: Node[];
  id?: number;
  start?: number;
  size?: number;
}

export function writeCfb(streams: { path: string; data: Uint8Array }[], opts: CfbWriteOptions = {}): CfbLayout {
  const ss = opts.sectorSize ?? 512;
  const root: Node = { name: 'Root Entry', type: 5, children: [] };
  for (const s of streams) {
    const parts = s.path.split('/');
    let dir = root;
    for (const p of parts.slice(0, -1)) {
      let next = dir.children.find((c) => c.name === p && c.type === 1);
      if (!next) dir.children.push((next = { name: p, type: 1, children: [] }));
      dir = next;
    }
    dir.children.push({ name: parts[parts.length - 1], type: 2, data: s.data, children: [] });
  }
  const nodes: Node[] = [];
  const number = (n: Node): void => {
    n.id = nodes.length;
    nodes.push(n);
    for (const c of n.children) number(c);
  };
  number(root);

  // Mini stream.
  const mini: number[] = [];
  const miniChunks: Uint8Array[] = [];
  let miniSectors = 0;
  for (const n of nodes) {
    if (n.type !== 2 || !n.data) continue;
    n.size = n.data.length;
    if (n.data.length < MINI_CUTOFF && n.data.length > 0) {
      const count = Math.ceil(n.data.length / MINI);
      n.start = miniSectors;
      for (let i = 0; i < count; i++) mini.push(i === count - 1 ? ENDOFCHAIN : miniSectors + i + 1);
      const padded = new Uint8Array(count * MINI);
      padded.set(n.data);
      miniChunks.push(padded);
      miniSectors += count;
    } else if (n.data.length === 0) n.start = ENDOFCHAIN;
  }
  const miniStream = concat(miniChunks);

  // Regular sectors: big streams, mini stream container, mini FAT, directory, then DIFAT and FAT.
  const sectors: Uint8Array[] = [];
  const fat: number[] = [];
  const starts = new Map<string, number>();
  const pathOf = new Map<Node, string>();
  const walk = (n: Node, prefix: string): void => {
    for (const c of n.children) {
      const p = prefix ? `${prefix}/${c.name}` : c.name;
      pathOf.set(c, p);
      walk(c, p);
    }
  };
  walk(root, '');
  const alloc = (data: Uint8Array): number => {
    const count = Math.max(1, Math.ceil(data.length / ss));
    const first = sectors.length;
    for (let i = 0; i < count; i++) {
      const s = new Uint8Array(ss);
      s.set(data.subarray(i * ss, (i + 1) * ss));
      sectors.push(s);
      fat.push(i === count - 1 ? ENDOFCHAIN : first + i + 1);
    }
    return first;
  };
  for (const n of nodes) {
    if (n.type === 2 && n.data && n.start === undefined) {
      n.start = alloc(n.data);
      starts.set(pathOf.get(n)!, n.start);
    }
  }
  root.start = miniStream.length ? alloc(miniStream) : ENDOFCHAIN;
  root.size = miniStream.length;
  const miniFatBytes = new Uint8Array(Math.ceil((mini.length * 4) / ss) * ss).fill(0xff);
  const mfv = new DataView(miniFatBytes.buffer);
  mini.forEach((v, i) => mfv.setUint32(i * 4, v, true));
  const firstMiniFat = mini.length ? alloc(miniFatBytes) : ENDOFCHAIN;

  const dir = new Uint8Array(Math.ceil((nodes.length * 128) / ss) * ss);
  const dv = new DataView(dir.buffer);
  for (let i = nodes.length * 128; i < dir.length; i += 128) {
    dv.setUint32(i + 68, NOSTREAM, true);
    dv.setUint32(i + 72, NOSTREAM, true);
    dv.setUint32(i + 76, NOSTREAM, true);
  }
  for (const n of nodes) {
    const off = n.id! * 128;
    for (let i = 0; i < n.name.length; i++) dv.setUint16(off + i * 2, n.name.charCodeAt(i), true);
    dv.setUint16(off + 64, (n.name.length + 1) * 2, true);
    dv.setUint8(off + 66, n.type);
    dv.setUint8(off + 67, 1);
    dv.setUint32(off + 68, NOSTREAM, true);
    dv.setUint32(off + 72, NOSTREAM, true);
    dv.setUint32(off + 76, n.children.length ? n.children[0].id! : NOSTREAM, true);
    dv.setUint32(off + 116, n.start ?? 0, true);
    dv.setUint32(off + 120, n.size ?? 0, true);
  }
  // Right-sibling chains.
  for (const n of nodes) for (let i = 0; i + 1 < n.children.length; i++) dv.setUint32(n.children[i].id! * 128 + 72, n.children[i + 1].id!, true);
  const firstDir = alloc(dir);

  // FAT and DIFAT sizes depend on each other.
  const perFat = ss / 4;
  const perDifat = ss / 4 - 1;
  let nFat = 1;
  let nDifat = 0;
  for (;;) {
    const total = sectors.length + nFat + nDifat;
    const needFat = Math.ceil(total / perFat);
    const inHeader = opts.difatOnly ? 0 : 109;
    const needDifat = Math.max(0, Math.ceil((needFat - inHeader) / perDifat));
    if (needFat === nFat && needDifat === nDifat) break;
    nFat = needFat;
    nDifat = needDifat;
  }
  const difatStart = sectors.length;
  for (let i = 0; i < nDifat; i++) {
    sectors.push(new Uint8Array(ss));
    fat.push(DIFSECT);
  }
  const fatStart = sectors.length;
  for (let i = 0; i < nFat; i++) {
    sectors.push(new Uint8Array(ss));
    fat.push(FATSECT);
  }
  while (fat.length < nFat * perFat) fat.push(FREESECT);
  for (let k = 0; k < nFat; k++) {
    const v = new DataView(sectors[fatStart + k].buffer);
    for (let i = 0; i < perFat; i++) v.setUint32(i * 4, fat[k * perFat + i], true);
  }
  const fatIds = Array.from({ length: nFat }, (_, k) => fatStart + k);
  const headerIds = opts.difatOnly ? [] : fatIds.slice(0, 109);
  const restIds = opts.difatOnly ? fatIds : fatIds.slice(109);
  for (let d = 0; d < nDifat; d++) {
    const v = new DataView(sectors[difatStart + d].buffer);
    for (let i = 0; i < perDifat; i++) v.setUint32(i * 4, restIds[d * perDifat + i] ?? FREESECT, true);
    v.setUint32(perDifat * 4, d + 1 < nDifat ? difatStart + d + 1 : ENDOFCHAIN, true);
  }

  const header = new Uint8Array(ss);
  const hv = new DataView(header.buffer);
  header.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  hv.setUint16(24, 0x3e, true);
  hv.setUint16(26, ss === 4096 ? 4 : 3, true);
  hv.setUint16(28, 0xfffe, true);
  hv.setUint16(30, ss === 4096 ? 12 : 9, true);
  hv.setUint16(32, 6, true);
  hv.setUint32(40, ss === 4096 ? Math.ceil(dir.length / ss) : 0, true);
  hv.setUint32(44, nFat, true);
  hv.setUint32(48, firstDir, true);
  hv.setUint32(56, MINI_CUTOFF, true);
  hv.setUint32(60, firstMiniFat, true);
  hv.setUint32(64, mini.length ? miniFatBytes.length / ss : 0, true);
  hv.setUint32(68, nDifat ? difatStart : ENDOFCHAIN, true);
  hv.setUint32(72, nDifat, true);
  for (let i = 0; i < 109; i++) hv.setUint32(76 + i * 4, headerIds[i] ?? FREESECT, true);
  return { bytes: concat([header, ...sectors]), sectorSize: ss, starts, fatOffset: (fatStart + 1) * ss, firstDirSector: firstDir };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
