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

/**
 * Site-wide "files never leave" claims (C2-cloud round 2, owner 2026-10-05). With the cloud path on, every claim
 * outside a local tool's own page needs the 배경 지우기 exception next to it: the approved exception wording, or the
 * cloud variant "배경 지우기를 빼면 …". With it off, none of that wording ships in any text file.
 * Round 3 (Arch): "works without the internet" counts too, as 배경 지우기 needs it by default in the cloud build.
 */
export const CLAIM_RE = /(밖으로|어디로도|어디에도|다른 곳으로|다른 곳의 컴퓨터로|인터넷으로) ?(안 ?나가|나가지 않|보내지 않|보내지지 않|전송되지 않)|안에서만|인터넷을 끊어도|인터넷 없이도/g;
/** The exception named next to a claim: EXCEPTION_RE or the cloud variant ("배경 지우기를 빼면", "배경 지우기 외엔"). */
export const QUALIFIER_RE = new RegExp(`${EXCEPTION_RE.source}|배경 지우기(를)? ?(빼면|빼고|외엔|외에는)`);
/** How far from a claim (characters of page text) the exception may stand: the footnote below, the heading above. */
export const QUALIFIER_BEFORE = 150;
export const QUALIFIER_AFTER = 80;
/**
 * Files whose claims are about one tool that never sends anything: the other tools' pages and the guide pages
 * (each about such tools). A new tool page is not listed until someone adds it here, so its claims get checked.
 */
export const LOCAL_SCOPE_RE = /^(pdf-merge|pdf-compress|photo-compress|id-photo|stamp-signature|hwp-to-pdf|hwp-viewer)\/|^guide\/[^/]+\/index\.html$/;
/** Text files checked for claims: pages, llms.txt, the sitemap, the manifest and any JSON. */
export const CLAIM_FILE_RE = /\.(html|txt|xml|json|webmanifest)$/;

const ENTITIES = { '&quot;': '"', '&#39;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };

/** The words of a text file as people and search engines read them: tags out, scripts out except JSON-LD. */
export function claimText(path, content) {
  if (!path.endsWith('.html')) return content.replace(/\s+/g, ' ');
  return content
    .replace(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>|<style[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<(meta|img)\b[^>]*?\b(content|alt)="([^"]*)"[^>]*>/g, ' $3 ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(quot|#39|amp|lt|gt|nbsp);/g, (e) => ENTITIES[e])
    .replace(/\s+/g, ' ');
}

/** The claims in `text` with no 배경 지우기 exception within QUALIFIER_BEFORE / QUALIFIER_AFTER characters. */
export function unqualifiedClaims(text) {
  const out = [];
  for (const m of text.matchAll(CLAIM_RE)) {
    const around = text.slice(Math.max(0, m.index - QUALIFIER_BEFORE), m.index + m[0].length + QUALIFIER_AFTER);
    if (!QUALIFIER_RE.test(around)) out.push(text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 10).trim());
  }
  return out;
}
