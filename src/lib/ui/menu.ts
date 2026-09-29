// Header tools menu (brief Polish P.9). Server-rendered as a plain link to /#tools, so without JS it keeps
// today's behaviour; this turns it into a disclosure button for the #tools-menu panel.
export function initMenu(doc: Document = document): void {
  const box = doc.querySelector<HTMLElement>('[data-menu]');
  const link = box?.querySelector<HTMLAnchorElement>('[data-menu-toggle]');
  const panel = box?.querySelector<HTMLElement>('.menu-panel');
  if (!box || !link || !panel) return;
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = link.className;
  btn.textContent = link.textContent;
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', panel.id);
  link.replaceWith(btn);

  const set = (open: boolean, focusButton = false): void => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (!open && focusButton) btn.focus();
  };
  btn.addEventListener('click', () => set(panel.hidden === true));
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) set(false, true);
  });
  // A click outside closes it; so does following a link inside (an anchor on the same page does not navigate).
  doc.addEventListener('click', (e) => {
    if (!panel.hidden && !box.contains(e.target as Node)) set(false);
  });
  panel.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) set(false);
  });
  // Tab past the last item (focus leaves the menu) closes it.
  box.addEventListener('focusout', (e) => {
    const next = e.relatedTarget as Node | null;
    if (!panel.hidden && next && !box.contains(next)) set(false);
  });
}
