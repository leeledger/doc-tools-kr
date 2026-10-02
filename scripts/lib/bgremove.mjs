// 배경 지우기 release flag (Sprint C, C2; Arch ruling 5): PUBLIC_BG_REMOVE. With "0" nothing about
// /remove-background/ ships: no page (astro.config.mjs injects the route only when on), no sitemap entry, nav link,
// hub card, llms.txt line or share image (src/data/tools.ts drops the tool), no runtime or model files (copy-vendor),
// no COEP block (gen-headers) and no licence rows (gen-licenses). check-dist fails a flag-off build that carries any.
//
// DEFAULT is "0" until the owner's real-phone check is logged (brief C2 build order 9). Arch lifts it by setting
// PUBLIC_BG_REMOVE=1 in the Cloudflare build environment (and .env.example).
export const DEFAULT = '0';

/** True only for "1" (after trimming); an unset value takes DEFAULT. */
export function bgRemoveOn(value) {
  const v = typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT;
  return v === '1';
}

/** The path of the tool page. */
export const BG_PATH = '/remove-background/';
