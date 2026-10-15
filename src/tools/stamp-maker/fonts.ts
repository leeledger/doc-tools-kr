// 도장 만들기 (STAMP1015 D5): the HWP faces the HWP tools already serve. The font CSS (src/generated/hwp-fonts.json) is
// injected once on first need, then document.fonts.load per used (face, weight) with the text, so only the unicode-range
// slices that text needs are fetched. Never a preload; no new font file. A face that has not loaded within
// FONT_TIMEOUT_MS, or failed (offline, 404), reports false: the caller paints with the system face (the generic family in
// fontOf) and says so, and repaints if the slow load still succeeds.
import hwpFonts from '../../generated/hwp-fonts.json';
import { FACE_FAMILY, faceFor, type Face } from './layout';
import { FONT_TIMEOUT_MS } from './limits';

const LINK_ID = 'hwp-fonts';
let css: Promise<boolean> | null = null;

/** Adds the HWP font CSS once; true when it loaded. */
function injectCss(): Promise<boolean> {
  if (css) return css;
  const link = document.createElement('link');
  link.id = LINK_ID;
  link.rel = 'stylesheet';
  link.href = hwpFonts.css;
  css = new Promise<boolean>((resolve) => {
    link.addEventListener('load', () => resolve(true), { once: true });
    link.addEventListener('error', () => resolve(false), { once: true });
  });
  document.head.append(link);
  return css;
}

/** (face, weight) -> the characters painted in it, for `texts` in `face` (Hanja may go to another face: faceFor). */
export function facesFor(texts: readonly string[], face: Face, weight: 400 | 700): Map<string, string> {
  const out = new Map<string, Set<string>>();
  for (const t of texts) {
    for (const ch of t) {
      if (!ch.trim()) continue;
      const key = `${weight}|${faceFor(face, ch)}`;
      let set = out.get(key);
      if (!set) out.set(key, (set = new Set()));
      set.add(ch);
    }
  }
  return new Map([...out].map(([k, v]) => [k, [...v].join('')]));
}

/**
 * Loads the slices `need` uses. `ok`: every one arrived within FONT_TIMEOUT_MS. `late`: the same load without the time
 * limit (a slow phone gets the web face repainted when it arrives).
 */
export async function loadFaces(need: Map<string, string>): Promise<{ ok: boolean; late: Promise<boolean> }> {
  const work = (async (): Promise<boolean> => {
    if (!(await injectCss())) return false;
    const done = await Promise.all(
      [...need].map(async ([key, chars]) => {
        const [weight, face] = key.split('|') as [string, Face];
        const font = `${weight} 16px "${FACE_FAMILY[face]}"`;
        try {
          const faces = await document.fonts.load(font, chars);
          return faces.length > 0 && faces.every((f) => f.status === 'loaded') && document.fonts.check(font, chars);
        } catch {
          return false;
        }
      }),
    );
    return done.every(Boolean);
  })();
  const ok = await Promise.race([work, new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), FONT_TIMEOUT_MS))]);
  return { ok, late: work };
}
