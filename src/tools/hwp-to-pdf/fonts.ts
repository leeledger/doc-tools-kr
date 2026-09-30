// The document faces (brief Step 5 §3.5): one CSS file (scripts/gen-hwp-fonts.mjs) plus the Pretendard
// dynamic subset, requested with the first page; slices then load by unicode-range. `hwpFontsReady()` waits
// for the stylesheet itself before document.fonts.ready (which resolves at once while the CSS is still in
// flight, before any face is pending).
import hwpFonts from '../../generated/hwp-fonts.json';
import { loadDynamicFont } from '../../lib/ui/font';

const LINK_ID = 'hwp-fonts';
let loaded: Promise<void> | null = null;

export function loadHwpFonts(): Promise<void> {
  loadDynamicFont();
  if (loaded) return loaded;
  const link = document.createElement('link');
  link.id = LINK_ID;
  link.rel = 'stylesheet';
  link.href = hwpFonts.css;
  // An error (offline) resolves too: the pages then print with the fallback faces rather than never.
  loaded = new Promise<void>((resolve) => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
  });
  document.head.append(link);
  return loaded;
}

const frame = (): Promise<void> => new Promise((r) => {
  const t = setTimeout(r, 100);
  requestAnimationFrame(() => {
    clearTimeout(t);
    r();
  });
});

/**
 * document.fonts.ready, repeated until no face is loading. WebKit resolves `ready` and then starts more slice
 * loads on the next layout, so one await is not enough there (bounded: 50 rounds).
 */
export async function fontsSettled(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await document.fonts.ready;
    await frame();
    if (document.fonts.status === 'loaded') return;
  }
}

/**
 * Starts the downloads of every face and slice the pages under `root` use, while they are still hidden:
 * one document.fonts.load() per (family chain, weight) with that family's characters. Slices then arrive in
 * parallel instead of one layout round at a time after the pages are shown.
 */
export async function preloadFacesFor(root: ParentNode): Promise<void> {
  await loadHwpFonts();
  const wanted = new Map<string, Set<string>>();
  for (const t of Array.from(root.querySelectorAll('text'))) {
    const family = t.getAttribute('font-family');
    if (!family) continue;
    const key = `${t.getAttribute('font-weight') === '700' || t.getAttribute('font-weight') === 'bold' ? 700 : 400}|${family}`;
    let set = wanted.get(key);
    if (!set) wanted.set(key, (set = new Set()));
    for (const ch of t.textContent ?? '') set.add(ch);
  }
  await Promise.all(
    [...wanted].map(([key, chars]) => {
      const [weight, family] = key.split('|');
      return document.fonts.load(`${weight} 16px ${family}`, [...chars].join('')).catch(() => []);
    }),
  );
}

export async function hwpFontsReady(): Promise<void> {
  await loadHwpFonts();
  await fontsSettled();
}
