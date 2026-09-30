// Feature scan parity with spikes/hwp/scripts/features.py and the scan's error codes (brief Step 5 test map).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { HwpError } from '../../src/lib/hwp/errors';
import { cid, scanFeatures, walkRecords } from '../../src/lib/hwp/features';
import { writeCfb } from '../helpers/cfb-writer';
import { DISTRIBUTION_BIT, HWP_CORPUS, PASSWORD_BIT, docxLikeZip, hwpFixture, patchHwpFlags } from '../helpers/hwp';

interface Expected {
  format: string;
  equations: number;
  textboxes: number;
  compressed?: boolean;
  password?: boolean;
  distribution?: boolean;
  bindata_total_kb: number;
}
const expected = JSON.parse(readFileSync(join(HWP_CORPUS, 'features.expected.json'), 'utf8')).files as Record<string, Expected>;

const code = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof HwpError ? err.code : `not an HwpError: ${String(err)}`;
  }
};

describe('features: parity with features.py on every fixture', () => {
  it.each(Object.keys(expected))('%s', (key) => {
    const file = readFileSync(join(HWP_CORPUS, `${key}.${expected[key].format === 'hwpx' ? 'hwpx' : 'hwp'}`));
    const f = scanFeatures(new Uint8Array(file));
    const e = expected[key];
    expect(f.format).toBe(e.format);
    expect(f.equations).toBe(e.equations);
    expect(f.textboxes).toBe(e.textboxes);
    expect(Math.floor(f.imageBytes / 1024)).toBe(e.bindata_total_kb);
    if (e.format === 'hwp5') {
      expect(f.compressed).toBe(e.compressed);
      expect(f.password).toBe(e.password);
      expect(f.distribution).toBe(e.distribution);
    }
    expect(f.decodeError).toBe(false);
  });
});

describe('features: flags and errors', () => {
  it('a password-patched law05 is `password` (rhwp is never reached)', () => {
    expect(code(() => scanFeatures(patchHwpFlags(hwpFixture('law05.hwp'), PASSWORD_BIT)))).toBe('password');
  });

  it('a distribution-patched law05 scans with distribution = true (rhwp decides)', () => {
    const f = scanFeatures(patchHwpFlags(hwpFixture('law05.hwp'), DISTRIBUTION_BIT));
    expect(f.distribution).toBe(true);
    expect(f.format).toBe('hwp5');
  });

  it('HWP 3.0 gives the format only', () => {
    const b = new Uint8Array(256);
    b.set(strToU8('HWP Document File V3.00 \x1a\x01\x02\x03\x04\x05'));
    expect(scanFeatures(b)).toMatchObject({ format: 'hwp3', equations: 0, textboxes: 0, imageBytes: 0 });
  });

  it('a CFB without the HWP signature (a renamed .doc) and a .docx-style zip are not-hwp', () => {
    const doc = writeCfb([{ path: 'WordDocument', data: new Uint8Array(5000) }, { path: 'FileHeader', data: strToU8('Microsoft Word 97'.padEnd(64, ' ')) }]).bytes;
    expect(code(() => scanFeatures(doc))).toBe('not-hwp');
    expect(code(() => scanFeatures(writeCfb([{ path: 'WordDocument', data: new Uint8Array(100) }]).bytes))).toBe('not-hwp');
    expect(code(() => scanFeatures(docxLikeZip()))).toBe('not-hwp');
    expect(code(() => scanFeatures(zipSync({ mimetype: strToU8('application/epub+zip') })))).toBe('not-hwp');
  });

  it('truncated files are corrupt; unknown bytes are not-hwp; .hml is unsupported', () => {
    const law05 = hwpFixture('law05.hwp');
    expect(code(() => scanFeatures(law05.subarray(0, law05.length >> 1)))).toBe('corrupt');
    const adm02 = hwpFixture('adm02.hwpx');
    expect(code(() => scanFeatures(adm02.subarray(0, adm02.length >> 1)))).toBe('corrupt');
    expect(code(() => scanFeatures(strToU8('hello')))).toBe('not-hwp');
    expect(code(() => scanFeatures(strToU8('<?xml version="1.0"?><HWPML Version="2.8">')))).toBe('unsupported');
  });

  it('a zip bomb in the section XML is corrupt (512 MB inflate cap, exercised with a smaller file via the same path)', () => {
    // 600 MB of zeros deflates to ~600 KB; the scan must stop at the cap, not allocate 600 MB.
    const zeros = new Uint8Array(1_000_000);
    const parts: Record<string, Uint8Array | [Uint8Array, { level: 0 | 9 }]> = { mimetype: [strToU8('application/hwp+zip'), { level: 0 }] };
    for (let i = 0; i < 600; i++) parts[`Contents/section${i}.xml`] = [zeros, { level: 9 }];
    const z = zipSync(parts as Parameters<typeof zipSync>[0]);
    expect(code(() => scanFeatures(z))).toBe('corrupt');
  });

  it('record walk: tag 88 and ctrl eqed count as equations; $rec/$ell/$pol as text boxes; 0xFFF extended sizes', () => {
    const rec = (tag: number, payload: number[]): number[] => {
      const h = (tag & 0x3ff) | (payload.length << 20);
      return [h & 255, (h >>> 8) & 255, (h >>> 16) & 255, h >>> 24, ...payload];
    };
    const id = (s: string): number[] => [s.charCodeAt(3), s.charCodeAt(2), s.charCodeAt(1), s.charCodeAt(0)];
    const ext = (tag: number, payload: number[]): number[] => {
      const h = (tag & 0x3ff) | (0xfff << 20);
      const n = payload.length;
      return [h & 255, (h >>> 8) & 255, (h >>> 16) & 255, h >>> 24, n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24, ...payload];
    };
    const buf = Uint8Array.from([...rec(88, [1, 2]), ...rec(71, id('eqed')), ...rec(71, id('tbl ')), ...rec(76, id('$rec')), ...ext(76, id('$ell')), ...rec(76, id('$pol')), ...rec(76, id('$pic'))]);
    const counts = { tag88: 0, eqed: 0, textboxes: 0 };
    walkRecords(buf, counts);
    expect(counts).toEqual({ tag88: 1, eqed: 1, textboxes: 3 });
    expect(cid(0x65716564)).toBe('eqed');
  });

  it('stops at the record cap', () => {
    // Record 1 is empty (tag 0), record 2 is an equation: a cap of 1 record never reaches it, 2 does.
    const buf = Uint8Array.from([0, 0, 0, 0, 88, 0, 0, 0]);
    const one = { tag88: 0, eqed: 0, textboxes: 0 };
    walkRecords(buf, one, 1);
    expect(one.tag88).toBe(0);
    const two = { tag88: 0, eqed: 0, textboxes: 0 };
    walkRecords(buf, two, 2);
    expect(two.tag88).toBe(1);
  });
});

describe('streaming scan (Richard round 2, Should Fix 3; Arch caps 512 MB desktop, 128 MB phone)', () => {
  it('ByteCounter matches the features.py regex on the decoded text, for every split point', async () => {
    const { ByteCounter } = await import('../../src/lib/hwp/features');
    const text = `<hp:equation x/><hp:equationX/><hp:equation_/><hp:drawText/> <<hp:equation${String.fromCharCode(10)}<hp:equation가<hp:equation`;
    const re = new RegExp('<hp:equation' + String.fromCharCode(92) + 'b', 'g');
    const whole = (text.match(re) ?? []).length;
    expect(whole).toBe(4);
    const bytes = new TextEncoder().encode(text);
    for (let cut = 0; cut <= bytes.length; cut++) {
      for (const cut2 of [cut, Math.min(bytes.length, cut + 5)]) {
        const c = new ByteCounter('<hp:equation');
        c.push(bytes.subarray(0, cut));
        c.push(bytes.subarray(cut, cut2));
        c.push(bytes.subarray(cut2));
        c.end();
        expect(c.count, `cuts ${cut}/${cut2}`).toBe(whole);
      }
    }
  });

  it('RecordWalker fed one byte at a time counts what the whole-buffer walk counts', async () => {
    const { RecordWalker } = await import('../../src/lib/hwp/features');
    const rec = (tag: number, payload: number[]): number[] => {
      const h = (tag & 0x3ff) | (payload.length << 20);
      return [h & 255, (h >>> 8) & 255, (h >>> 16) & 255, h >>> 24, ...payload];
    };
    const id = (s: string): number[] => [s.charCodeAt(3), s.charCodeAt(2), s.charCodeAt(1), s.charCodeAt(0)];
    const ext = (tag: number, payload: number[]): number[] => {
      const h = (tag & 0x3ff) | (0xfff << 20);
      const n = payload.length;
      return [h & 255, (h >>> 8) & 255, (h >>> 16) & 255, h >>> 24, n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24, ...payload];
    };
    const buf = Uint8Array.from([...rec(88, []), ...rec(71, id('eqed')), ...ext(76, [...id('$rec'), 1, 2, 3]), ...rec(76, [1, 2]), ...rec(76, id('$pol')), ...rec(71, id('eq'))]);
    const whole = new RecordWalker();
    whole.push(buf);
    const bytewise = new RecordWalker();
    for (const b of buf) bytewise.push(Uint8Array.of(b));
    expect(whole.counts).toEqual({ tag88: 1, eqed: 1, textboxes: 2 });
    expect(bytewise.counts).toEqual(whole.counts);
  });

  it('a 150 MB section passes the desktop cap and is corrupt under the 128 MB phone cap', async () => {
    const { hwpxZipBomb } = await import('../helpers/hwp');
    const { LIMITS } = await import('../../src/lib/hwp/limits');
    const bomb = hwpxZipBomb(150_000_000);
    expect(bomb.length).toBeLessThan(1_000_000);
    expect(scanFeatures(bomb, { inflateCap: LIMITS.desktop.inflateCap }).format).toBe('hwpx');
    expect(code(() => scanFeatures(bomb, { inflateCap: LIMITS.mobile.inflateCap }))).toBe('corrupt');
  });
});
