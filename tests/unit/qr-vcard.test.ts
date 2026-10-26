// CARD1026 C8/C9: vCard 3.0 text (RFC 2426) and folding (RFC 2425 §5.8.1). Line order, N/FN rules, text escaping,
// CRLF on every line, no BOM, octet-aware folding that never splits a UTF-8 character or a backslash pair,
// unfold(fold) = unfolded, a parse round trip, and the all-max contact still fitting one QR (decoded with jsQR).
import { describe, expect, it } from 'vitest';
import { encodeQr } from '../../src/lib/qr/encode';
import { qrRgba } from '../../src/lib/qr/render';
import { CONTACT_MAX, FOLD_OCTETS, displayName, escapeText, foldLine, unfold, vcard, type ContactFields } from '../../src/lib/qr/vcard';
import { decodeQrText } from '../helpers/qr-decode';

const EMPTY: ContactFields = { last: '', first: '', org: '', dept: '', title: '', mobile: '', work: '', fax: '', email: '', url: '', address: '', note: '' };
const card = (f: Partial<ContactFields>, fold = false) => vcard({ ...EMPTY, ...f }, { fold });
const octets = (s: string) => new TextEncoder().encode(s).length;

/** Minimal parser for the round trip: unfold, split lines, split name/value at the first unescaped colon. */
function parse(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of unfold(text).split('\r\n').filter(Boolean)) {
    const i = line.indexOf(':');
    out.set(line.slice(0, i), line.slice(i + 1));
  }
  return out;
}
/** Splits a structured value at raw semicolons and unescapes each component. */
function components(value: string): string[] {
  const parts: string[] = [];
  let cur = '';
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (c === '\\') {
      const n = value[++i]!;
      cur += n === 'n' || n === 'N' ? '\n' : n;
    } else if (c === ';') {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  return parts;
}

const SAMPLE: ContactFields = {
  last: '홍',
  first: '길동',
  org: '예시상사, 서울; 본점',
  dept: '영업부',
  title: '팀장',
  mobile: '010-1234-5678',
  work: '02-123-4567',
  fax: '02-123-4568',
  email: 'gildong@example.com',
  url: 'example.com/a;b,c',
  address: '서울특별시 중구 세종대로 110',
  note: '첫 줄\n둘째 줄\\끝',
};

describe('vcard', () => {
  it('every line in the C8 order, CRLF after each (the last too), no BOM, no CHARSET', () => {
    const v = vcard(SAMPLE, { fold: false });
    expect(v.split('\r\n')).toEqual([
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:홍;길동;;;',
      'FN:홍길동',
      'ORG:예시상사\\, 서울\\; 본점;영업부',
      'TITLE:팀장',
      'TEL;TYPE=CELL:010-1234-5678',
      'TEL;TYPE=WORK,VOICE:02-123-4567',
      'TEL;TYPE=WORK,FAX:02-123-4568',
      'EMAIL;TYPE=INTERNET:gildong@example.com',
      'URL:https://example.com/a%3Bb%2Cc',
      'ADR;TYPE=WORK:;;서울특별시 중구 세종대로 110;;;;',
      'NOTE:첫 줄\\n둘째 줄\\\\끝',
      'END:VCARD',
      '',
    ]);
    expect(v.endsWith('END:VCARD\r\n')).toBe(true);
    expect(v.charCodeAt(0)).not.toBe(0xfeff);
    expect(v).not.toMatch(/CHARSET/i);
    expect(v.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('name only: N and FN, nothing else; values trimmed', () => {
    expect(card({ last: ' 홍 ', first: '길동 ' })).toBe('BEGIN:VCARD\r\nVERSION:3.0\r\nN:홍;길동;;;\r\nFN:홍길동\r\nEND:VCARD\r\n');
  });

  it('company only: FN is the company, N keeps its empty components; dept alone still makes ORG', () => {
    expect(card({ org: '문서딱' })).toBe('BEGIN:VCARD\r\nVERSION:3.0\r\nN:;;;;\r\nFN:문서딱\r\nORG:문서딱;\r\nEND:VCARD\r\n');
    expect(card({ first: '길동', dept: '영업부' })).toContain('\r\nORG:;영업부\r\n');
  });

  it('FN order: Latin letters → 「이름 성」, otherwise 「성이름」', () => {
    expect(displayName('Hong', 'Gildong', '')).toBe('Gildong Hong');
    expect(displayName('', 'Gildong', 'x')).toBe('Gildong');
    expect(displayName('홍', 'Gil', '')).toBe('Gil 홍');
    expect(displayName('남궁', '민수', '')).toBe('남궁민수');
    expect(displayName(' ', ' ', ' 회사 ')).toBe('회사');
  });

  it('escapes backslash first, then ; and , and every line break kind', () => {
    expect(escapeText('a\\b;c,d')).toBe('a\\\\b\\;c\\,d');
    expect(escapeText('\\;')).toBe('\\\\\\;');
    expect(escapeText('1\r\n2\n3\r4')).toBe('1\\n2\\n3\\n4');
    expect(escapeText('a:b"c')).toBe('a:b"c');
  });

  it('a non-empty url that fails normalizeUrl throws (the validator runs first)', () => {
    expect(() => card({ first: 'x', url: 'javascript:alert(1)' })).toThrow(RangeError);
  });

  it('round trip: every structured component and text value parses back to what was typed', () => {
    const p = parse(vcard(SAMPLE, { fold: true }));
    expect(components(p.get('N')!)).toEqual(['홍', '길동', '', '', '']);
    expect(components(p.get('ORG')!)).toEqual([SAMPLE.org, SAMPLE.dept]);
    expect(components(p.get('ADR;TYPE=WORK')!)).toEqual(['', '', SAMPLE.address, '', '', '', '']);
    expect(components(p.get('NOTE')!)).toEqual([SAMPLE.note]);
    expect(p.get('URL')).toBe('https://example.com/a%3Bb%2Cc');
  });
});

describe('folding', () => {
  it('no physical line over 75 octets; continuation = CRLF + one space; unfold(fold) equals the unfolded card', () => {
    const long: ContactFields = { ...SAMPLE, address: '가'.repeat(80), note: 'a\\;'.repeat(40) };
    const folded = vcard(long, { fold: true });
    expect(unfold(folded)).toBe(vcard(long, { fold: false }));
    for (const line of folded.split('\r\n')) expect(octets(line)).toBeLessThanOrEqual(FOLD_OCTETS);
    expect(folded).toMatch(/\r\n [^ ]/);
    expect(folded.endsWith('\r\n')).toBe(true);
  });

  it('never splits a Hangul character at the boundary', () => {
    // 'NOTE:' is 5 octets; 23 Hangul (69) → 74; the 24th would make 77, so it starts the next line.
    const line = 'NOTE:' + '가'.repeat(30);
    const [first, second] = foldLine(line).split('\r\n');
    expect(octets(first!)).toBe(74);
    expect(second).toBe(' ' + '가'.repeat(7));
  });

  it('never splits a backslash escape pair at the boundary', () => {
    // 74 ASCII octets then '\;': splitting would leave the backslash at the end of a line.
    const line = 'NOTE:' + 'a'.repeat(69) + '\\;' + 'b';
    const [first, second] = foldLine(line).split('\r\n');
    expect(first).toBe('NOTE:' + 'a'.repeat(69));
    expect(second).toBe(' \\;b');
    // Exactly 75 octets is not folded.
    expect(foldLine('x'.repeat(75))).toBe('x'.repeat(75));
    expect(foldLine('x'.repeat(76))).toBe('x'.repeat(75) + '\r\n x');
  });

  it('4-byte characters stay whole too', () => {
    const folded = foldLine('NOTE:' + '😀'.repeat(30));
    for (const l of folded.split('\r\n')) {
      expect(octets(l)).toBeLessThanOrEqual(FOLD_OCTETS);
      expect(l).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    }
    expect(unfold(folded)).toBe('NOTE:' + '😀'.repeat(30));
  });
});

describe('all-max contact fits one QR', () => {
  it('every field at its maxLength with the worst bytes per field still encodes (unfolded) and decodes', () => {
    // Worst case per field: Hangul (3 bytes per character, more than any escape pair) in free text; ASCII digits in
    // phones (the validator only lets digits through); a Hangul URL path (9 bytes per character after %-encoding).
    const h = (n: number) => '가'.repeat(n);
    const max: ContactFields = {
      last: h(CONTACT_MAX.last),
      first: h(CONTACT_MAX.first),
      org: h(CONTACT_MAX.org),
      dept: h(CONTACT_MAX.dept),
      title: h(CONTACT_MAX.title),
      mobile: '0'.repeat(CONTACT_MAX.mobile),
      work: '0'.repeat(CONTACT_MAX.work),
      fax: '0'.repeat(CONTACT_MAX.fax),
      email: h(CONTACT_MAX.email - 4) + '@a.b',
      url: 'a.kr/' + h(CONTACT_MAX.url - 5),
      address: h(CONTACT_MAX.address),
      note: h(CONTACT_MAX.note),
    };
    const payload = vcard(max, { fold: false });
    const r = encodeQr(payload);
    expect(r.ok, `${octets(payload)} bytes`).toBe(true);
    if (!r.ok) return;
    const { data, width, height } = qrRgba(r.modules, 4);
    expect(decodeQrText(data, width, height)).toBe(payload);
  });

  it('maximal escapes (every free-text field all semicolons) also fit', () => {
    const s = (n: number) => ';'.repeat(n);
    const max: ContactFields = { ...EMPTY, last: s(10), first: s(20), org: s(30), dept: s(30), title: s(20), address: s(80), note: s(100), email: s(76) + '@a.b' };
    expect(encodeQr(vcard(max, { fold: false })).ok).toBe(true);
  });
});
