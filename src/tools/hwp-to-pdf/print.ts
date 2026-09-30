// Print path (brief Step 5 §3.2 "Print CSS", "Title swap", "After print"). Lazy chunk (with viewer.ts).
// One named @page per distinct page size, the first size as the default @page (engines without named pages),
// the title swapped to the file's base name for the PDF name, restored on afterprint.
import { sizeKey, type PageInfo } from '../../lib/hwp/engine';

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

/**
 * Waits for the fonts, swaps the title to `title` (Chrome and Edge use it as the default PDF name) and
 * opens the print dialog. `onAfter` runs once on afterprint, after the title is restored.
 */
export async function printDocument(title: string, onAfter: () => void): Promise<void> {
  await document.fonts.ready;
  const previous = document.title;
  const after = (): void => {
    window.removeEventListener('afterprint', after);
    document.title = previous;
    onAfter();
  };
  window.addEventListener('afterprint', after);
  document.title = title;
  window.print();
}
