// Print path (brief Step 5 §3.2 "Print CSS", "Title swap", "After print"). Lazy chunk (with viewer.ts).
// One named @page per distinct page size, the first size as the default @page (engines without named pages),
// the title swapped to the file's base name for the PDF name, restored on afterprint.
import { sizeKey, type PageInfo } from '../../lib/hwp/engine';
import { fontsSettled } from './fonts';

const STYLE_ID = 'hwp-page-style';
const PT_PER_PX = 0.75;

/** The @page CSS for these pages (pure; unit-tested). */
export function pageCss(infos: PageInfo[]): string {
  if (!infos.length) return '';
  const seen = new Set<string>();
  const first = infos[0];
  const out = [`@page{size:${first.w * PT_PER_PX}pt ${first.h * PT_PER_PX}pt;margin:0}`];
  for (const p of infos) {
    const key = sizeKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`@page ${key}{size:${p.w * PT_PER_PX}pt ${p.h * PT_PER_PX}pt;margin:0}`);
    out.push(`@media print{#hwp-print-root .${key}{page:${key};width:${p.w}px;height:${p.h}px}}`);
  }
  return out.join('\n');
}

export function installPageStyle(infos: PageInfo[]): void {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.append(el);
  }
  el.textContent = pageCss(infos);
}

export function removePageStyle(): void {
  document.getElementById(STYLE_ID)?.remove();
}

/** When neither afterprint nor a return to the page ends the swap (some mobile engines), restore after this. */
export const PRINT_FALLBACK_MS = 60_000;

interface Swap {
  original: string;
  end: (notify: boolean) => void;
}
let current: Swap | null = null;

/**
 * Waits for the fonts, swaps the title to `title` (Chrome and Edge use it as the default PDF name) and
 * opens the print dialog. The title is restored and `onAfter` runs once, on afterprint, or when the page
 * becomes visible again after print() returned, or after PRINT_FALLBACK_MS (afterprint never fires on some
 * mobile engines). A second call first ends a pending swap, so the original title is never lost (Richard,
 * Step 5 round 2, Should Fix 6).
 */
export async function printDocument(title: string, onAfter: () => void, fallbackMs: number = PRINT_FALLBACK_MS): Promise<void> {
  await fontsSettled();
  current?.end(false);
  const original = document.title;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onAfterPrint = (): void => swap.end(true);
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') swap.end(true);
  };
  const swap: Swap = {
    original,
    end(notify) {
      if (current !== swap) return;
      current = null;
      window.removeEventListener('afterprint', onAfterPrint);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer !== undefined) clearTimeout(timer);
      document.title = original;
      if (notify) onAfter();
    },
  };
  current = swap;
  window.addEventListener('afterprint', onAfterPrint);
  document.title = title;
  window.print();
  if (current === swap) {
    document.addEventListener('visibilitychange', onVisible);
    timer = setTimeout(() => swap.end(true), fallbackMs);
  }
}
