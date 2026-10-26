// vCard 3.0 serializer (CARD1026 C8): RFC 2426 types and text escaping, RFC 2425 §5.8.1 folding
// (handoff/sources/card1026/rfc2426.txt, rfc2425.txt, fetched 2026-10-26). UTF-8, no BOM, no CHARSET, CRLF after
// every line. The .vcf file is folded; the QR payload uses the same text unfolded.
import { normalizeUrl } from './payload';

export interface ContactFields {
  last: string; // 성
  first: string; // 이름
  org: string; // 회사
  dept: string; // 부서
  title: string; // 직함·직책
  mobile: string; // 휴대폰
  work: string; // 회사 전화
  fax: string; // FAX
  email: string; // 이메일
  url: string; // 홈페이지
  address: string; // 주소
  note: string; // 메모
}

/** Input maxLength of every field (C9); the all-max contact still fits one QR (unit test). */
export const CONTACT_MAX: Readonly<Record<keyof ContactFields, number>> = {
  last: 10,
  first: 20,
  org: 30,
  dept: 30,
  title: 20,
  mobile: 20,
  work: 20,
  fax: 20,
  email: 80,
  url: 100,
  address: 80,
  note: 100,
};

/** Longest physical line in the .vcf file, in UTF-8 octets without the CRLF. */
export const FOLD_OCTETS = 75;

/** RFC 2426 text value: backslash first, then ; and , and every line break as \n. */
export const escapeText = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

const LATIN_RE = /[A-Za-z]/;

/** 표시 이름: 「Gildong Hong」 when a Latin letter is in 성 or 이름, else 「홍길동」; 회사 when both are empty. */
export function displayName(last: string, first: string, org: string): string {
  const l = last.trim();
  const f = first.trim();
  if (!l && !f) return org.trim();
  return LATIN_RE.test(l + f) ? `${f} ${l}`.trim() : l + f;
}

// ; and , and \ are percent-encoded in the URL so the uri value reads the same with or without text unescaping.
const uriValue = (href: string): string => href.replace(/[\\;,]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const octets = (cp: number): number => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/** Folds one content line at 75 octets: CRLF + one space, never inside a UTF-8 character or a backslash pair. */
export function foldLine(line: string): string {
  const tokens: string[] = [];
  const chars = [...line];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '\\' && i + 1 < chars.length) {
      tokens.push(chars[i]! + chars[i + 1]!);
      i++;
    } else tokens.push(chars[i]!);
  }
  let out = '';
  let used = 0;
  for (const t of tokens) {
    let size = 0;
    for (const c of t) size += octets(c.codePointAt(0)!);
    if (used + size > FOLD_OCTETS) {
      out += '\r\n ';
      used = 1;
    }
    out += t;
    used += size;
  }
  return out;
}

/** RFC 2425 unfolding: CRLF followed by one space or tab is removed. */
export const unfold = (text: string): string => text.replace(/\r\n[ \t]/g, '');

/**
 * The vCard text. Expects validated fields (C9): a non-empty `url` must pass normalizeUrl, otherwise this throws.
 * Values are trimmed; empty fields leave their line out, except N and FN.
 */
export function vcard(fields: ContactFields, { fold }: { fold: boolean }): string {
  const v = Object.fromEntries(Object.entries(fields).map(([k, s]) => [k, s.trim()])) as unknown as ContactFields;
  const e = escapeText;
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${e(v.last)};${e(v.first)};;;`, `FN:${e(displayName(v.last, v.first, v.org))}`];
  if (v.org || v.dept) lines.push(`ORG:${e(v.org)};${e(v.dept)}`);
  if (v.title) lines.push(`TITLE:${e(v.title)}`);
  if (v.mobile) lines.push(`TEL;TYPE=CELL:${e(v.mobile)}`);
  if (v.work) lines.push(`TEL;TYPE=WORK,VOICE:${e(v.work)}`);
  if (v.fax) lines.push(`TEL;TYPE=WORK,FAX:${e(v.fax)}`);
  if (v.email) lines.push(`EMAIL;TYPE=INTERNET:${e(v.email)}`);
  if (v.url) {
    const href = normalizeUrl(v.url);
    if (!href) throw new RangeError('vcard: url did not pass normalizeUrl');
    lines.push(`URL:${uriValue(href)}`);
  }
  if (v.address) lines.push(`ADR;TYPE=WORK:;;${e(v.address)};;;;`);
  if (v.note) lines.push(`NOTE:${e(v.note)}`);
  lines.push('END:VCARD');
  return lines.map((l) => (fold ? foldLine(l) : l) + '\r\n').join('');
}
