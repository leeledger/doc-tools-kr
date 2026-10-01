// "링크 보내기 / 링크 복사" (Growth G.7). Shares the page address only: a tool page's path with its whitelisted
// option (?preset= or ?target=), or a guide's canonical URL. Never a file, a blob: URL or a file name: the payload
// is built here from the location and the element's data attributes, and nothing else is passed in.
// No SDK and no third-party script: the Web Share API where the device has it, else the clipboard, else a
// read-only field with the address selected.

export interface SharePayload {
  title: string;
  text: string;
  url: string;
}

interface ShareEnv {
  navigator: Pick<Navigator, 'share' | 'clipboard'> | undefined;
  location: Pick<Location, 'origin' | 'pathname' | 'search'>;
}

/** The only query a shared tool link may carry (src/lib/ui/deeplink.ts writes it with replaceState). */
const SAFE_QUERY = /^\?(?:preset|target)=[a-z0-9_.]{1,20}$/;

/** The address to share: `data-url` (a guide's canonical), else this tool page with its whitelisted option. */
export function shareUrl(el: HTMLElement, loc: ShareEnv['location']): string {
  if (el.dataset.url) return el.dataset.url;
  return `${loc.origin}${loc.pathname}${SAFE_QUERY.test(loc.search) ? loc.search : ''}`;
}

/** Exactly title, text and url. */
export function sharePayload(el: HTMLElement, loc: ShareEnv['location']): SharePayload {
  return { title: el.dataset.title ?? '', text: el.dataset.text ?? '', url: shareUrl(el, loc) };
}

const COPIED_MS = 2000;

/** Wires one [data-share] block. Returns nothing; every failure ends in a path the user can finish. */
export function initShare(el: HTMLElement, env: ShareEnv = { navigator: globalThis.navigator, location: globalThis.location }): void {
  const send = el.querySelector<HTMLButtonElement>('[data-share-send]');
  const copy = el.querySelector<HTMLButtonElement>('[data-share-copy]');
  const fallback = el.querySelector<HTMLElement>('[data-share-fallback]');
  const field = el.querySelector<HTMLInputElement>('[data-share-field]');
  const status = el.querySelector<HTMLElement>('[data-share-status]');
  if (!send || !copy || !fallback || !field || !status) return;
  const nav = env.navigator;
  const say = (msg: string): void => {
    status.textContent = '';
    requestAnimationFrame(() => (status.textContent = msg));
  };

  function showField(url: string): void {
    field!.value = url;
    fallback!.hidden = false;
    field!.focus();
    field!.select();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  async function copyLink(): Promise<void> {
    const url = shareUrl(el, env.location);
    try {
      if (!nav?.clipboard?.writeText) throw new Error('no clipboard');
      await nav.clipboard.writeText(url);
    } catch {
      showField(url);
      return;
    }
    fallback!.hidden = true;
    say('링크를 복사했어요');
    copy!.textContent = '복사했어요';
    clearTimeout(timer);
    timer = setTimeout(() => (copy!.textContent = '링크 복사'), COPIED_MS);
  }

  if (typeof nav?.share === 'function') {
    send.hidden = false;
    send.addEventListener('click', async () => {
      try {
        await nav.share!(sharePayload(el, env.location));
      } catch (err) {
        // The user closed the share sheet: nothing to do. Anything else (no user gesture, a desktop policy): copy.
        if (err instanceof Error && err.name === 'AbortError') return;
        await copyLink();
      }
    });
  }
  copy.addEventListener('click', () => void copyLink());
}

/** Every share block on the page. */
export function initShareAll(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-share]')) initShare(el);
}
