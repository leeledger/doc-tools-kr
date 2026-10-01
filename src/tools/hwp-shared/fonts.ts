// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// The preview's document faces (brief Step 5 §3.5): one CSS file (scripts/gen-hwp-fonts.mjs) plus the
// Pretendard dynamic subset, injected when the scan arrives (with the engine, SPIKE-HWP-DIRECT §6.7); slices
// then load by unicode-range. The PDF embeds its own copies of the same faces (lib/hwp/pdf/font-source.ts).
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
  // An error (offline) resolves too: the pages then show with the fallback faces rather than never.
  loaded = new Promise<void>((resolve) => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
  });
  document.head.append(link);
  return loaded;
}

/**
 * Starts the downloads of every face and slice the pages under `root` use (the first page, before it is
 * shown): one document.fonts.load() per (family chain, weight) with that family's characters. Slices then
 * arrive in parallel instead of one layout round at a time.
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
