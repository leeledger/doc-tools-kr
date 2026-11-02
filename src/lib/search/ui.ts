// SEARCH1031 D4/D9/D10: the site search combobox. Built as its own file (`?worker&url` in src/lib/ui/search-boot.ts)
// and added as a module script on the first focus, tap or key inside a [data-search] box, so no page pays for it at
// load. Fetches /search-index.json once (a fixed URL: nothing typed is ever sent), then searches on the device.
// ARIA 1.2 combobox: the input owns a listbox of grouped options; Down/Up move, Enter opens, Esc closes the list.
// /search/ keeps the query in its URL fragment (#q=), which is never part of a request.
import { search, type GuideDoc, type SearchIndex, type ToolDoc } from './match';

const INDEX_URL = '/search-index.json';
const SEARCH_PATH = '/search/';
const NONE = (q: string): string => `「${q}」에 맞는 도구를 찾지 못했어요. 다른 말로 찾아보거나 많이 찾는 도구에서 골라 보세요.`;

let indexPromise: Promise<SearchIndex> | null = null;

function loadIndex(): Promise<SearchIndex> {
  indexPromise ??= fetch(INDEX_URL, { credentials: 'same-origin' })
    .then((r) => {
      if (!r.ok) throw new Error(`search index HTTP ${r.status}`);
      return r.json() as Promise<SearchIndex>;
    })
    .then((ix) => {
      if (ix?.v !== 1 || !Array.isArray(ix.t) || !Array.isArray(ix.g)) throw new Error('search index shape');
      return ix;
    })
    .catch((e: unknown) => {
      // Retry on the next focus.
      indexPromise = null;
      throw e;
    });
  return indexPromise;
}

const queryOfHash = (): string => {
  const m = /^#q=(.*)$/.exec(location.hash);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]!.replace(/\+/g, ' '));
  } catch {
    return '';
  }
};

interface Option {
  u: string;
  el: HTMLElement;
}

function setup(root: HTMLElement): void {
  if (root.dataset.searchReady) return;
  root.dataset.searchReady = '1';
  const input = root.querySelector<HTMLInputElement>('[data-ss-input]');
  const pop = root.querySelector<HTMLElement>('[data-ss-pop]');
  const list = root.querySelector<HTMLElement>('[data-ss-list]');
  const none = root.querySelector<HTMLElement>('[data-ss-none]');
  const status = root.querySelector<HTMLElement>('[data-ss-status]');
  const fail = root.querySelector<HTMLElement>('[data-ss-fail]');
  const form = root.querySelector<HTMLFormElement>('form');
  if (!input || !pop || !list || !none || !status || !fail) return;
  const base = list.id;
  // The /search/ page's own box keeps the fragment; the header box on that page does not.
  const onSearchPage = location.pathname === SEARCH_PATH && root.classList.contains('site-search-page');
  let options: Option[] = [];
  let active = -1;
  let index: SearchIndex | null = null;
  // True between compositionstart and compositionend (a Korean syllable is still being typed).
  let composing = false;
  // The last list shown has real matches (not only 많이 찾는 도구): Enter may open its first option.
  let matched = false;

  const setActive = (i: number): void => {
    options[active]?.el.setAttribute('aria-selected', 'false');
    active = i;
    const o = options[i];
    if (o) {
      o.el.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', o.el.id);
      o.el.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };

  const close = (): void => {
    setActive(-1);
    pop.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };

  const group = (key: string, title: string, items: (ToolDoc | GuideDoc)[], tool: boolean): HTMLElement => {
    const g = document.createElement('div');
    g.setAttribute('role', 'group');
    g.className = 'ss-group';
    const h = document.createElement('div');
    h.setAttribute('role', 'presentation');
    h.className = 'ss-head';
    h.id = `${base}-${key}`;
    h.textContent = title;
    g.setAttribute('aria-labelledby', h.id);
    g.append(h);
    for (const d of items) {
      const o = document.createElement('div');
      o.setAttribute('role', 'option');
      o.setAttribute('aria-selected', 'false');
      o.id = `${base}-o${options.length}`;
      o.className = 'ss-opt';
      const n = document.createElement('span');
      n.className = 'ss-n';
      n.textContent = d.n;
      o.append(n);
      if (tool) {
        const s = document.createElement('span');
        s.className = 'ss-s';
        s.textContent = (d as ToolDoc).s;
        o.append(s);
      }
      options.push({ u: d.u, el: o });
      g.append(o);
    }
    return g;
  };

  const render = (): void => {
    if (!index) return;
    const q = input.value.trim();
    const r = search(index, q);
    const missed = q !== '' && !r.tools.length && !r.guides.length;
    // A miss while a syllable is still composing keeps the list shown (no 「찾지 못했어요」 flash, no announcement);
    // compositionend renders again.
    if (missed && composing) return;
    matched = r.tools.length > 0 || r.guides.length > 0;
    options = [];
    active = -1;
    input.removeAttribute('aria-activedescendant');
    const groups: HTMLElement[] = [];
    if (r.tools.length) groups.push(group('t', '도구', r.tools, true));
    if (r.guides.length) groups.push(group('g', '안내', r.guides, false));
    if (r.popular.length) groups.push(group('p', '많이 찾는 도구', r.popular, true));
    list.replaceChildren(...groups);
    none.hidden = !missed;
    none.textContent = missed ? NONE(q) : '';
    status.textContent = !q ? '' : missed ? NONE(q) : `도구 ${r.tools.length}개, 안내 ${r.guides.length}개를 찾았어요`;
    pop.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  const showFail = (): void => {
    fail.hidden = false;
    close();
  };

  const ensure = (): void => {
    if (index) return;
    loadIndex().then(
      (ix) => {
        index = ix;
        fail.hidden = true;
        if (document.activeElement === input || input.value.trim()) render();
      },
      showFail,
    );
  };

  const go = (o: Option | undefined): void => {
    if (!o) return;
    close();
    location.href = o.u;
  };

  const syncHash = (): void => {
    if (!onSearchPage) return;
    const q = input.value.trim();
    history.replaceState(history.state, '', q ? `#q=${encodeURIComponent(q)}` : location.pathname);
  };

  input.addEventListener('focus', () => {
    ensure();
    if (index) render();
  });
  input.addEventListener('input', () => {
    syncHash();
    ensure();
    render();
  });
  input.addEventListener('compositionstart', () => {
    composing = true;
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    render();
  });
  input.addEventListener('keydown', (e) => {
    const open = !pop.hidden;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) render();
      if (!options.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(active < 0 ? (step > 0 ? 0 : options.length - 1) : (active + step + options.length) % options.length);
    } else if (e.key === 'Escape' && open) {
      // Handled here: the header panel closes only on a second Esc (search-boot.ts reads defaultPrevented).
      e.preventDefault();
      close();
    } else if (e.key === 'Enter') {
      // Also while a Korean syllable is still composing: the value already holds it, and Chrome sends no second Enter.
      e.preventDefault();
      if (!index) return;
      if (composing) {
        // The list may still show the state before the syllable; search what the box holds now.
        composing = false;
        render();
      } else if (!open) render();
      // Only an option the user moved to, or the first real match: never a 많이 찾는 도구 entry on a miss or an empty box.
      go(options[active] ?? (matched ? options[0] : undefined));
    }
  });
  form?.addEventListener('submit', (e) => e.preventDefault());
  // Keep the focus in the input while an option is pressed; the click then opens it.
  list.addEventListener('mousedown', (e) => {
    if ((e.target as Element).closest('[role="option"]')) e.preventDefault();
  });
  list.addEventListener('click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[role="option"]');
    go(options.find((o) => o.el === el));
  });
  root.addEventListener('focusout', (e) => {
    const next = e.relatedTarget as Node | null;
    if (!next || !root.contains(next)) close();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !root.contains(e.target as Node)) close();
  });

  if (onSearchPage) {
    const q = queryOfHash();
    if (q && !input.value) input.value = q;
  }
  // Text typed (or a box focused) before this module arrived is searched now.
  if (document.activeElement === input || input.value.trim()) ensure();
}

function init(): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-search]')) setup(root);
}

init();
