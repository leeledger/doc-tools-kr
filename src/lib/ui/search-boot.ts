// SEARCH1031 D1/D4: the site search boot in the shared site script. No search code here: on the first focus, tap or
// key inside a [data-search] box (or on /search/ itself) it adds src/lib/search/ui.ts as a module script, once. Built
// via `?worker&url` like utm-land (an import() would pull Vite's preload helper into every page). Also turns the
// header 「찾기」 link to /search/ into a disclosure button for its overlay panel (the 도구 menu's pattern; each one's
// outside-click close shuts the other).
import searchUrl from '../search/ui?worker&url';

export function initSearch(doc: Document = document): void {
  let loading = false;
  const load = (): void => {
    if (loading) return;
    loading = true;
    const s = doc.createElement('script');
    s.type = 'module';
    s.src = searchUrl;
    s.onerror = () => {
      // Offline, or a chunk gone after a deploy: say so (never silent); the next interaction tries again.
      loading = false;
      s.remove();
      for (const f of doc.querySelectorAll<HTMLElement>('[data-ss-fail]')) f.hidden = false;
    };
    doc.head.append(s);
  };
  const inBox = (e: Event): void => {
    if ((e.target as Element | null)?.closest?.('[data-search]')) load();
  };
  // A key inside a box always follows its focusin, so these two cover D4's focus, tap and key (bubbling listeners: the
  // page's own capture-phase keydown handlers, such as the /pdf-merge/ drag's, stay the only ones).
  for (const type of ['focusin', 'pointerdown']) doc.addEventListener(type, inBox);
  if (location.pathname === '/search/') load();

  const box = doc.querySelector<HTMLElement>('[data-ssh]');
  const link = box?.querySelector<HTMLAnchorElement>('[data-ssh-toggle]');
  const panel = box?.querySelector<HTMLElement>('.ssh-panel');
  const input = panel?.querySelector<HTMLInputElement>('input');
  if (!box || !link || !panel || !input) return;
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = link.className;
  btn.append(...link.childNodes);
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', panel.id);
  link.replaceWith(btn);

  const set = (open: boolean, focusButton = false): void => {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      load();
      input.focus();
    } else if (focusButton) btn.focus();
  };
  btn.addEventListener('click', () => set(panel.hidden === true));
  // The search module takes the first Esc (it closes the result list and marks the event handled).
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden && !e.defaultPrevented) set(false, true);
  });
  doc.addEventListener('click', (e) => {
    if (!panel.hidden && !box.contains(e.target as Node)) set(false);
  });
  box.addEventListener('focusout', (e) => {
    const next = e.relatedTarget as Node | null;
    if (!panel.hidden && next && !box.contains(next)) set(false);
  });
}
