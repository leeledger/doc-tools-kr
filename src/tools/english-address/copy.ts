// 영문주소 변환기: copy one value (ADDREN1016 decision 12). The clipboard API first; then a hidden textarea and
// execCommand('copy') (older iOS, in-app browsers); else the value on the page is selected so a long press copies it.

/** Selects the text of `el` (the shown value) for a manual copy. */
function selectText(el: Element): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
}

function execCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  ta.style.inset = '0 auto auto 0';
  document.body.append(ta);
  const active = document.activeElement as HTMLElement | null;
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  active?.focus({ preventScroll: true });
  return ok;
}

/** 'copied', or 'manual' when the text was selected on the page for the visitor to copy. */
export async function copyText(text: string, shown: Element): Promise<'copied' | 'manual'> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    // Denied (in-app browser, no user activation): try the older way.
  }
  if (execCopy(text)) return 'copied';
  selectText(shown);
  return 'manual';
}
