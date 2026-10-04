// 배경 지우기 cloud path flag (C2-cloud, brief handoff/ARCHITECT-BRIEF-C2-CLOUD.md §11 step 1): PUBLIC_BG_CLOUD.
// Independent of PUBLIC_BG_REMOVE, and it only takes effect when that one is on too (no page, no cloud path).
// With it on, the page sends a ≤ 1024 px copy to /api/remove-bg (same origin, Pages Function -> Worker docttak-bg)
// by default; the C2 on-device engine stays as the opt-in. DEFAULT "0".
//
// Privacy gate (brief §7.1): the cloud path needs the privacy policy's 개인정보 보호책임자 line, so a build with it on
// fails without PUBLIC_PRIVACY_OFFICER and a valid PUBLIC_CONTACT_EMAIL (astro.config.mjs and check-dist).
import { bgRemoveOn } from './bgremove.mjs';

export const DEFAULT = '0';

/** True only for "1" (after trimming); an unset value takes DEFAULT. */
export function bgCloudFlag(value) {
  const v = typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT;
  return v === '1';
}

/** The cloud path ships: PUBLIC_BG_CLOUD and PUBLIC_BG_REMOVE both on. `env`: the PUBLIC_* values. */
export function bgCloudOn(env) {
  return bgRemoveOn(env.PUBLIC_BG_REMOVE) && bgCloudFlag(env.PUBLIC_BG_CLOUD);
}

/** The endpoint the page posts to (same origin). */
export const API_PATH = '/api/remove-bg';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Problems of the privacy gate for this env (empty = fine, or the cloud path is off). */
export function privacyGate(env) {
  if (!bgCloudOn(env)) return [];
  const errors = [];
  if (!env.PUBLIC_PRIVACY_OFFICER?.trim()) errors.push('PUBLIC_BG_CLOUD is on but PUBLIC_PRIVACY_OFFICER is not set (the privacy policy must name the 개인정보 보호책임자)');
  const email = env.PUBLIC_CONTACT_EMAIL?.trim();
  if (!email || !EMAIL_RE.test(email)) errors.push('PUBLIC_BG_CLOUD is on but PUBLIC_CONTACT_EMAIL is not a valid address (the privacy policy must name a contact)');
  return errors;
}

/**
 * Wording that states the 배경 지우기 exception (brief §7.2). With the cloud path on it may appear only on the four
 * pages below; with it off, nowhere.
 */
export const EXCEPTION_RE = /배경 지우기(만|는)? ?(예외|제외)|Cloudflare\(미국 회사\)|사진을 보내지 않고 기기에서 처리/;
export const EXCEPTION_PAGES = ['index.html', 'privacy/index.html', 'terms/index.html', 'remove-background/index.html'];
