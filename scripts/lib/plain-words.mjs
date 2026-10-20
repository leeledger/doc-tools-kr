// Plain language on the built pages (Polish Q, docs/COPY.md): ordinary users do not know these words. Where a number must
// be read or typed, "픽셀(px)" may appear once per page. ADS1020 round 2 (Review): check-dist runs this on every page of
// every build, so the GA, AdSense and cloud sections of /privacy/ are checked too (the unit test only saw the default
// build). tests/unit/postbuild.test.ts uses the same functions.

export const JARGON = /업로드|서버|브라우저|네트워크|메모리|개발자 도구|(?<![A-Za-z])(?:px|dpi|exif)(?![A-Za-z])/gi;
/** /licenses/ lists software as its authors name it. */
export const PLAIN_EXEMPT_RE = /^licenses\//;

/**
 * What a user reads on a page: the title, the meta/og texts, alt/aria-label/placeholder/title attributes and the body
 * text. A <pre> block is code to copy, not prose (REV5: the /embed/ snippet keeps its CSS max-width:720px).
 */
export function userText(html) {
  return [
    html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '',
    ...[...html.matchAll(/\s(?:content|alt|aria-label|placeholder|title)="([^"]*)"/g)].map((m) => m[1]),
    html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<pre[\s>][\s\S]*?<\/pre>|<[^>]+>/g, ' '),
  ].join('\n');
}

/** Problems (strings) of one page `html` at dist path `path`: "픽셀(px)" more than once, or any jargon word. */
export function plainWordProblems(path, html) {
  if (PLAIN_EXEMPT_RE.test(path)) return [];
  const text = userText(html);
  const out = [];
  if ((text.match(/픽셀\(px\)/g) ?? []).length > 1) out.push(`${path}: "픽셀(px)" more than once`);
  for (const m of text.replace(/픽셀\(px\)/g, '').matchAll(JARGON)) out.push(`${path}: plain language (docs/COPY.md): …${text.slice(Math.max(0, m.index - 30), m.index + 20).replace(/\s+/g, ' ')}…`);
  return out;
}
