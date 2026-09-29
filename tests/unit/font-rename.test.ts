// Font-rename guard (Step 1 review follow-up): every name record and the raw name-table bytes are checked.
import { describe, expect, it } from 'vitest';
import { readAllNames, reservedNameProblems } from '../../scripts/font-rename.mjs';

interface Rec {
  platformID: number;
  encodingID: number;
  languageID: number;
  nameID: number;
  value: string;
}

const utf16 = (s: string): number[] => [...s].flatMap((c) => [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 0xff]);

/** A minimal sfnt with only a `name` table holding `records`. */
function sfnt(records: Rec[]): Uint8Array {
  const strings = records.map((r) => (r.platformID === 1 ? [...r.value].map((c) => c.charCodeAt(0)) : utf16(r.value)));
  const header = 6 + records.length * 12;
  const name: number[] = [0, 0, 0, records.length, header >> 8, header & 0xff];
  let off = 0;
  records.forEach((r, i) => {
    const len = strings[i]!.length;
    for (const v of [r.platformID, r.encodingID, r.languageID, r.nameID, len, off]) name.push(v >> 8, v & 0xff);
    off += len;
  });
  for (const s of strings) name.push(...s);
  const dirEnd = 12 + 16;
  const out = new Uint8Array(dirEnd + name.length);
  out.set([0, 1, 0, 0, 0, 1, 0, 16, 0, 0, 0, 0], 0);
  out.set([...'name'].map((c) => c.charCodeAt(0)), 12);
  const dv = new DataView(out.buffer);
  dv.setUint32(12 + 8, dirEnd);
  dv.setUint32(12 + 12, name.length);
  out.set(name, dirEnd);
  return out;
}

const win = (nameID: number, value: string): Rec => ({ platformID: 3, encodingID: 1, languageID: 0x409, nameID, value });
const mac = (nameID: number, value: string): Rec => ({ platformID: 1, encodingID: 0, languageID: 0, nameID, value });

describe('font-rename guard', () => {
  it('reads every record, including two records for the same nameID', () => {
    const recs = readAllNames(sfnt([win(1, 'Anolim UI Sans'), mac(1, 'Pretendard')]));
    expect(recs).toEqual([win(1, 'Anolim UI Sans'), mac(1, 'Pretendard')]);
  });

  it('rejects a Mac record with the reserved name even when the Windows record for that nameID is clean', () => {
    const problems = reservedNameProblems(sfnt([win(1, 'Anolim UI Sans'), mac(1, 'Pretendard')]), 'Pretendard');
    expect(problems.some((p) => p.includes('1/0/0x0 nameID 1'))).toBe(true);
    expect(problems).toContain('raw name table bytes contain the word (ASCII)');
  });

  it('is case-insensitive and catches the UTF-16BE form in the raw bytes', () => {
    const problems = reservedNameProblems(sfnt([win(4, 'my PRETENDARD copy')]), 'Pretendard');
    expect(problems.some((p) => p.includes('3/1/0x409 nameID 4'))).toBe(true);
    expect(problems).toContain('raw name table bytes contain the word (UTF-16BE)');
  });

  it('passes a clean table', () => {
    expect(reservedNameProblems(sfnt([win(1, 'Anolim UI Sans'), mac(1, 'Anolim UI Sans'), win(0, 'Copyright © 2023 Kil Hyung-jin')]), 'Pretendard')).toEqual([]);
  });
});
