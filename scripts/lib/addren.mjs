// 영문주소 변환기 flag (ADDREN1016, brief handoff/ARCHITECT-BRIEF-ADDREN1016.md decisions 2-3): PUBLIC_ADDR_EN.
// With "0" nothing about /english-address/ ships: no page, no tools-list entry, no menu or home card, no sitemap,
// llms.txt, RSS, share-image or manifest line, and the string /api/addr-en in no dist file (check-dist).
// With "1" the page posts the typed address to the same-origin Pages Function /api/addr-en, which asks the
// 행정안전부 영문주소 검색 API with the secret JUSO_EN_KEY (a Pages secret, never in a build). DEFAULT "0".
//
// Privacy gate (decision 3): an address is personal data, so a build with the flag on fails without
// PUBLIC_PRIVACY_OFFICER and a valid PUBLIC_CONTACT_EMAIL (astro.config.mjs and check-dist), as for the cloud path.

export const DEFAULT = '0';

/** True only for "1" (after trimming); an unset value takes DEFAULT. */
export function addrEnFlag(value) {
  const v = typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT;
  return v === '1';
}

/** The tool ships. `env`: the PUBLIC_* values. */
export function addrEnOn(env) {
  return addrEnFlag(env.PUBLIC_ADDR_EN);
}

/** The endpoint the page posts to (same origin). */
export const API_PATH = '/api/addr-en';
/** The path of the tool page. */
export const ADDR_EN_PATH = '/english-address/';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Problems of the privacy gate for this env (empty = fine, or the tool is off). */
export function privacyGate(env) {
  if (!addrEnOn(env)) return [];
  const errors = [];
  if (!env.PUBLIC_PRIVACY_OFFICER?.trim()) errors.push('PUBLIC_ADDR_EN is on but PUBLIC_PRIVACY_OFFICER is not set (the privacy policy must name the 개인정보 보호책임자)');
  const email = env.PUBLIC_CONTACT_EMAIL?.trim();
  if (!email || !EMAIL_RE.test(email)) errors.push('PUBLIC_ADDR_EN is on but PUBLIC_CONTACT_EMAIL is not a valid address (the privacy policy must name a contact)');
  return errors;
}
