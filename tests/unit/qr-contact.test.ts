// CARD1026 C9: the shared contact check (src/lib/qr/contact.ts) used by /qr-code/ 연락처 and /business-card/.
import { describe, expect, it } from 'vitest';
import { CONTACT_ERROR_TEXT, CONTACT_KEYS, checkContact, contactEmpty } from '../../src/lib/qr/contact';
import { CONTACT_MAX, type ContactFields } from '../../src/lib/qr/vcard';

const EMPTY: ContactFields = { last: '', first: '', org: '', dept: '', title: '', mobile: '', work: '', fax: '', email: '', url: '', address: '', note: '' };
const f = (x: Partial<ContactFields>): ContactFields => ({ ...EMPTY, ...x });

describe('checkContact', () => {
  it('a name or a company is enough; 「need」 sits on 성 when all three are blank (spaces count as blank)', () => {
    expect(checkContact(f({ last: '홍' }))).toEqual({});
    expect(checkContact(f({ first: '길동' }))).toEqual({});
    expect(checkContact(f({ org: '문서딱' }))).toEqual({});
    expect(checkContact(f({ last: ' ', first: '\t', org: '  ', mobile: '010-1234-5678' }))).toEqual({ last: 'need' });
  });

  it('phones follow the 전화 rule: separators allowed, letters and too few digits are not', () => {
    expect(checkContact(f({ last: '홍', mobile: '010-1234-5678', work: '(02) 123.4567', fax: '+82 2 1234 5678' }))).toEqual({});
    expect(checkContact(f({ last: '홍', mobile: '010-abcd', work: '12', fax: '내선 3' }))).toEqual({ mobile: 'phone', work: 'phone', fax: 'phone' });
  });

  it('email a@b.c shape; 홈페이지 the 인터넷 주소 rule (no scheme ok, javascript: and dotless hosts not)', () => {
    expect(checkContact(f({ org: 'a', email: 'hong@example.com', url: 'docttak.com' }))).toEqual({});
    expect(checkContact(f({ org: 'a', email: 'hong@example', url: 'javascript:alert(1)' }))).toEqual({ email: 'email', url: 'url' });
    expect(checkContact(f({ org: 'a', email: 'ho ng@example.com', url: 'localhost' }))).toEqual({ email: 'email', url: 'url' });
  });

  it('blank optional fields pass; every error code has its message; keys are the page order and match the limits', () => {
    expect(checkContact(f({ last: '홍', email: '  ', url: '' }))).toEqual({});
    expect(Object.keys(CONTACT_ERROR_TEXT).sort()).toEqual(['email', 'need', 'phone', 'url']);
    expect(CONTACT_ERROR_TEXT.need).toBe('이름이나 회사 중 하나는 써 주세요.');
    expect(CONTACT_ERROR_TEXT.phone).toBe('전화번호는 숫자로 써 주세요.');
    expect([...CONTACT_KEYS].sort()).toEqual(Object.keys(CONTACT_MAX).sort());
  });

  it('contactEmpty: true only when every field is blank', () => {
    expect(contactEmpty(EMPTY)).toBe(true);
    expect(contactEmpty(f({ note: '  ' }))).toBe(true);
    expect(contactEmpty(f({ note: '메모' }))).toBe(false);
  });
});
