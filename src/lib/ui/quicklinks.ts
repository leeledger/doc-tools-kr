// Deep links in the page (Growth G.5, G.6): keeps the address bar equal to the chosen option (replaceState, never
// pushState, so the back button is not flooded) and applies "자주 쓰는 규격" links in place, so a loaded file
// stays. Without JS the links are plain navigations to the same page with the param.
import { announce } from './announce';
import { josa } from './josa';
import { parse, serialize, type DeepSlug, type DeepState } from './deeplink';

/** Writes pathname + the serialized option (whitelisted params only) into the address bar. */
export function writeUrl(slug: DeepSlug, state: DeepState | null): void {
  const next = `${location.pathname}${serialize(slug, state)}${location.hash}`;
  if (next !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(history.state, '', next);
}

/** The option in the address bar at load, and the address rewritten to its clean form (unknown params dropped). */
export function readUrl(slug: DeepSlug): DeepState | null {
  const state = parse(slug, location.search);
  writeUrl(slug, state);
  return state;
}

/**
 * Every `a[data-deeplink]` to this page: a plain click applies the option in place (`apply` returns false when it
 * cannot right now, e.g. while a run is working) and announces "○○ 규격으로 바꿨어요".
 */
export function bindQuickLinks(slug: DeepSlug, apply: (state: DeepState) => boolean, root: ParentNode, doc: ParentNode = document): void {
  for (const a of doc.querySelectorAll<HTMLAnchorElement>('a[data-deeplink]')) {
    a.addEventListener('click', (ev) => {
      if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const url = new URL(a.href, location.href);
      if (url.pathname !== location.pathname) return;
      const state = parse(slug, url.searchParams);
      if (!state) return;
      ev.preventDefault();
      if (!apply(state)) return;
      writeUrl(slug, state);
      announce('status', `${josa(`${a.dataset.name ?? a.textContent ?? ''} 규격`, '으로/로')} 바꿨어요`, root);
    });
  }
}
