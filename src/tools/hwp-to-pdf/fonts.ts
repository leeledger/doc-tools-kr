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

export async function hwpFontsReady(): Promise<void> {
  await loadHwpFonts();
  await document.fonts.ready;
}
