// 무료 임베드 위젯 (REV5 Decision 1): the snippet a host site pastes. Plain HTML, no host-side script, no sandbox
// attribute (downloads in a sandboxed frame vary by browser), a fixed height. The second line is the backlink: a link
// inside our frame is not a link on the host page.
import { SITE } from './site';

/** The frame height in CSS pixels; the widget scrolls inside below it (no host script resizes it). */
export const EMBED_HEIGHT = 820;

/** The two lines for the id-photo widget, with absolute URLs on `site`. */
export function embedSnippet(site: URL | string): string {
  const frame = new URL('/embed/id-photo/', site).href;
  const page = new URL('/id-photo/', site).href;
  return [
    `<iframe src="${frame}" title="증명사진 규격 맞추기 (${SITE.name})" width="100%" height="${EMBED_HEIGHT}" style="border:0;max-width:720px" loading="lazy"></iframe>`,
    `<p><a href="${page}">증명사진 규격 맞추기</a> · ${SITE.name} 제공</p>`,
  ].join('\n');
}
