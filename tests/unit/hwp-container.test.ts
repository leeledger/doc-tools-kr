// HWP containers (brief Step 5 test map: sniff, cfb, zipdir, inflate cap).
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { openCfb } from '../../src/lib/hwp/cfb';
import { CorruptError, UnsupportedError } from '../../src/lib/hwp/errors';
import { InflateCapError, inflateRawCapped } from '../../src/lib/hwp/inflate';
import { sniffContainer } from '../../src/lib/hwp/sniff';
import { readEntry, readZipDir } from '../../src/lib/hwp/zipdir';
import { deflateSync } from 'fflate';
import { writeCfb } from '../helpers/cfb-writer';
import { cfbStreams, hwpFixture } from '../helpers/hwp';

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe('sniff', () => {
  it('CFB, PK, HWP 3.0 magic', () => {
    expect(sniffContainer(hwpFixture('law05.hwp').subarray(0, 64))).toBe('cfb');
    expect(sniffContainer(hwpFixture('adm02.hwpx').subarray(0, 64))).toBe('zip');
    expect(sniffContainer(ascii('HWP Document File V3.00 \x1a\x01\x02\x03\x04\x05'))).toBe('hwp3');
  });

  it('.hml (XML with HWPML) is unsupported, in UTF-8 and UTF-16', () => {
    const hml = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?><HWPML Style="embed" SubVersion="8.0.0.0" Version="2.8">';
    expect(sniffContainer(ascii(hml))).toBe('unsupported');
    expect(sniffContainer(Uint8Array.from([0xef, 0xbb, 0xbf, ...ascii(hml)]))).toBe('unsupported');
    const u16 = [0xff, 0xfe, ...[...hml].flatMap((c) => [c.charCodeAt(0), 0])];
    expect(sniffContainer(Uint8Array.from(u16))).toBe('unsupported');
    expect(sniffContainer(ascii('<?xml version="1.0"?><html></html>'))).toBe('unknown');
  });

  it('an empty file and a 3-byte file are unknown', () => {
    expect(sniffContainer(new Uint8Array(0))).toBe('unknown');
    expect(sniffContainer(Uint8Array.from([0xd0, 0xcf, 0x11]))).toBe('unknown');
    expect(sniffContainer(ascii('abc'))).toBe('unknown');
  });
});

describe('cfb', () => {
  it('reads the fixtures (512-byte sectors, mini stream)', () => {
    const cfb = openCfb(hwpFixture('law05.hwp'));
    const paths = cfb.listStreams().map((s) => s.path);
    expect(paths).toContain('FileHeader');
    expect(paths).toContain('BodyText/Section0');
    const header = cfb.readStream('FileHeader')!;
    expect(new TextDecoder().decode(header.subarray(0, 17))).toBe('HWP Document File');
    expect(cfb.streamSize('FileHeader')).toBe(header.length);
    expect(cfb.readStream('Nope')).toBeNull();
  });

  it('round-trips through the writer at 512 and 4096 bytes, mini stream included, and a DIFAT chain', () => {
    const src = cfbStreams(hwpFixture('law10.hwp'));
    for (const opts of [{ sectorSize: 512 as const }, { sectorSize: 4096 as const }, { difatOnly: true }, { sectorSize: 4096 as const, difatOnly: true }]) {
      const cfb = openCfb(writeCfb(src, opts).bytes);
      for (const s of src) expect(cfb.readStream(s.path), `${JSON.stringify(opts)} ${s.path}`).toEqual(s.data);
    }
  });

  it('a FAT cycle, an out-of-range sector and a truncated header are CorruptError', () => {
    const big = new Uint8Array(20_000).fill(7);
    const layout = writeCfb([{ path: 'A', data: big }]);
    const start = layout.starts.get('A')!;
    const loop = layout.bytes.slice();
    new DataView(loop.buffer).setUint32(layout.fatOffset + (start + 2) * 4, start, true);
    expect(() => openCfb(loop).readStream('A')).toThrow(CorruptError);

    const out = layout.bytes.slice();
    new DataView(out.buffer).setUint32(layout.fatOffset + start * 4, 0x00ffffff, true);
    expect(() => openCfb(out).readStream('A')).toThrow(CorruptError);

    expect(() => openCfb(layout.bytes.subarray(0, 300))).toThrow(CorruptError);
    const badShift = layout.bytes.slice();
    badShift[30] = 7;
    expect(() => openCfb(badShift)).toThrow(CorruptError);
  });

  it('never throws anything but CorruptError: 500 seeded truncations and bit flips of law05', () => {
    const law05 = hwpFixture('law05.hwp');
    let seed = 0x5eed;
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    let other = 0;
    for (let k = 0; k < 500; k++) {
      let b: Uint8Array;
      if (k % 2 === 0) b = law05.subarray(0, rnd(law05.length));
      else {
        b = law05.slice();
        for (let f = 0; f < 1 + rnd(8); f++) b[rnd(b.length)] ^= 1 << rnd(8);
      }
      try {
        const cfb = openCfb(b);
        for (const s of cfb.listStreams()) cfb.readStream(s.path);
      } catch (err) {
        if (!(err instanceof CorruptError)) other++;
      }
    }
    expect(other).toBe(0);
  });
});

describe('zipdir', () => {
  it('lists and reads the HWPX fixtures', () => {
    const bytes = hwpFixture('adm02.hwpx');
    const entries = readZipDir(bytes);
    const mime = entries.find((e) => e.name === 'mimetype')!;
    expect(new TextDecoder().decode(readEntry(bytes, mime))).toBe('application/hwp+zip');
    const sec = entries.find((e) => e.name === 'Contents/section0.xml')!;
    const data = readEntry(bytes, sec);
    const xml = new TextDecoder().decode(data);
    expect(data.length).toBe(sec.size);
    expect(xml.startsWith('<?xml')).toBe(true);
  });

  it('a truncated EOCD is CorruptError; a ZIP64 marker is UnsupportedError', () => {
    const bytes = hwpFixture('adm02.hwpx');
    expect(() => readZipDir(bytes.subarray(0, bytes.length - 10))).toThrow(CorruptError);
    expect(() => readZipDir(new Uint8Array(10))).toThrow(CorruptError);
    const z = zipSync({ a: strToU8('x') }).slice();
    const dv = new DataView(z.buffer);
    const eocd = z.length - 22;
    dv.setUint16(eocd + 10, 0xffff, true);
    expect(() => readZipDir(z)).toThrow(UnsupportedError);
    const withLocator = new Uint8Array(z.length + 20);
    withLocator.set(zipSync({ a: strToU8('x') }).subarray(0, eocd));
    new DataView(withLocator.buffer).setUint32(eocd, 0x07064b50, true);
    withLocator.set(zipSync({ a: strToU8('x') }).subarray(eocd), eocd + 20);
    expect(() => readZipDir(withLocator)).toThrow(UnsupportedError);
  });

  it('the inflate cap stops a zip bomb (CorruptError from readEntry, InflateCapError from the inflater)', () => {
    const bomb = new Uint8Array(3_000_000);
    const z = zipSync({ 'Contents/section0.xml': [bomb, { level: 9 }] });
    const e = readZipDir(z)[0];
    expect(() => readEntry(z, e, 1_000_000)).toThrow(CorruptError);
    expect(readEntry(z, e, 3_000_000).length).toBe(3_000_000);
    expect(() => inflateRawCapped(deflateSync(bomb), 100_000)).toThrow(InflateCapError);
  });

  it('a truncated deflate stream fails to inflate', () => {
    const d = deflateSync(strToU8('hello world '.repeat(1000)));
    expect(() => inflateRawCapped(d.subarray(0, d.length >> 1))).toThrow();
  });
});
