// Contact field checks (CARD1026 C9), shared by the /qr-code/ 연락처 tab and /business-card/ (src/components/
// ContactFields.astro renders the fields): one place decides what a valid contact is. Pure; the messages are late copy.
import { normalizePhone, normalizeUrl } from './payload';
import type { ContactFields } from './vcard';

export type ContactError = 'need' | 'phone' | 'email' | 'url';

export const CONTACT_ERROR_TEXT: Readonly<Record<ContactError, string>> = {
  need: '이름이나 회사 중 하나는 써 주세요.',
  phone: '전화번호는 숫자로 써 주세요.',
  email: '이메일 주소를 확인해 주세요.',
  url: '인터넷 주소를 확인해 주세요.',
};

/** Field order on the page (the first invalid one gets the focus). */
export const CONTACT_KEYS: readonly (keyof ContactFields)[] = ['last', 'first', 'org', 'dept', 'title', 'mobile', 'work', 'fax', 'email', 'url', 'address', 'note'];

const PHONES: readonly (keyof ContactFields)[] = ['mobile', 'work', 'fax'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when every field is blank. */
export const contactEmpty = (f: ContactFields): boolean => CONTACT_KEYS.every((k) => !f[k].trim());

/**
 * Problems per field (empty = valid). 「need」 sits on 성 when 성, 이름 and 회사 are all blank; phones follow the 전화
 * rule (C7), the email a plain a@b.c shape, the 홈페이지 the 인터넷 주소 rule. Blank optional fields are fine.
 */
export function checkContact(f: ContactFields): Partial<Record<keyof ContactFields, ContactError>> {
  const out: Partial<Record<keyof ContactFields, ContactError>> = {};
  if (!f.last.trim() && !f.first.trim() && !f.org.trim()) out.last = 'need';
  for (const k of PHONES) if (f[k].trim() && !normalizePhone(f[k])) out[k] = 'phone';
  if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) out.email = 'email';
  if (f.url.trim() && !normalizeUrl(f.url)) out.url = 'url';
  return out;
}
