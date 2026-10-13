// 무료 임베드 위젯 (REV5 R5.7): the check-dist rules for the widget pages (dist/embed/<tool>/index.html) and the
// _headers block that lets other sites frame them. Pure functions; tests/unit/embed.test.ts feeds them fixtures.
import { BEACON_SRC } from './analytics.mjs';
import { GA_LOADER } from './ga.mjs';

/** A widget page; dist/embed/index.html (the info page) is an ordinary page. */
export const EMBED_PAGE_RE = /^embed\/([a-z0-9-]+)\/index\.html$/;

/**
 * Problems of one widget page. `initialJs` is the text of its module scripts and their static imports; `sitemap` is
 * dist/sitemap.xml. A widget is noindex with the tool page as canonical, ships no link block, share, 이어서 하기 or ad,
 * no Google Analytics or Web Analytics tag, never registers the service worker and is not in the sitemap.
 * @param {string} path
 * @param {string} html
 * @param {{ initialJs: string, sitemap: string }} ctx
 */
export function embedPageProblems(path, html, { initialJs, sitemap }) {
  const slug = EMBED_PAGE_RE.exec(path)?.[1];
  if (!slug) return [];
  const out = [];
  const head = /<head[\s>][\s\S]*?<\/head>/i.exec(html)?.[0] ?? '';
  if (!/<meta name="robots" content="noindex">/.test(head)) out.push(`${path}: no meta robots noindex`);
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(head)?.[1];
  if (!canonical || new URL(canonical).pathname !== `/${slug}/`) out.push(`${path}: canonical ${canonical ?? '(none)'} is not the tool page /${slug}/`);
  for (const [re, what] of [
    [/\brel="[^"]*\bsponsored\b/, 'a sponsored link'],
    [/link\.coupang\.com/, 'a Coupang link'],
    [/\bdata-out=/, 'a 인화·사진관 or product link'],
    [/\bdata-share\b/, 'the share buttons'],
    [/\bclass="next-steps"/, '이어서 하기'],
    [/\bad-slot\b/, 'an ad slot'],
  ])
    if (re.test(html)) out.push(`${path}: ${what}`);
  if (html.includes(`src="${GA_LOADER}"`)) out.push(`${path}: the Google Analytics tag`);
  if (html.includes(BEACON_SRC)) out.push(`${path}: the Web Analytics beacon`);
  if (initialJs.includes('serviceWorker')) out.push(`${path}: its scripts touch the service worker (the widget never registers it)`);
  if (sitemap.includes(`/embed/${slug}/`)) out.push(`${path}: listed in the sitemap`);
  return out;
}

/** _headers as [{ pattern, lines }] (indented lines trimmed; host rules included). */
function blocks(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s/.test(line)) out.at(-1)?.lines.push(line.trim());
    else out.push({ pattern: line.trim(), lines: [] });
  }
  return out;
}

const directives = (csp) => csp.split(';').map((d) => d.trim()).filter(Boolean);

/**
 * Problems of the framing rules in a _headers file: the `/*` policy keeps frame-ancestors 'none'; exactly one block
 * allows framing, a widget block (/embed/<tool>/*), which first detaches the site-wide policy, then sets the same
 * policy with frame-ancestors * (every other directive identical), and sends X-Robots-Tag: noindex. Only a widget block
 * may detach the site-wide policy, a block that detaches sets a policy of its own, and every policy outside /* names
 * frame-ancestors: otherwise that block's pages would have no framing rule at all, i.e. be framable by anyone.
 * @param {string} text
 */
export function embedHeaderProblems(text) {
  const out = [];
  const all = blocks(text);
  const site = all.find((b) => b.pattern === '/*');
  const siteCsp = site?.lines.find((l) => l.startsWith('Content-Security-Policy:'))?.slice('Content-Security-Policy:'.length).trim();
  if (!siteCsp) return ['_headers: no Content-Security-Policy in the /* block'];
  if (!directives(siteCsp).includes("frame-ancestors 'none'")) out.push("_headers: the /* policy lacks frame-ancestors 'none'");
  const WIDGET = /^\/embed\/[a-z0-9-]+\/\*$/;
  for (const b of all) {
    const policies = b.lines.filter((l) => l.startsWith('Content-Security-Policy:'));
    if (b.lines.includes('! Content-Security-Policy')) {
      if (!WIDGET.test(b.pattern)) out.push(`_headers: ${b.pattern} detaches the site-wide policy (only a widget block /embed/<tool>/* may)`);
      if (!policies.length) out.push(`_headers: ${b.pattern} detaches the site-wide policy without setting its own`);
    }
    if (b.pattern === '/*') continue;
    for (const l of policies) if (!directives(l.slice('Content-Security-Policy:'.length)).some((d) => d.startsWith('frame-ancestors '))) out.push(`_headers: the ${b.pattern} policy has no frame-ancestors`);
  }
  const framing = all.filter((b) => b.lines.some((l) => l.startsWith('Content-Security-Policy:') && /frame-ancestors (?!'none')/.test(l)));
  if (framing.length !== 1) out.push(`_headers: ${framing.length} blocks allow framing (expected exactly one, the widget block)`);
  for (const b of framing) {
    if (!WIDGET.test(b.pattern)) {
      out.push(`_headers: ${b.pattern} allows framing (only a widget block /embed/<tool>/* may)`);
      continue;
    }
    const detach = b.lines.indexOf('! Content-Security-Policy');
    const cspAt = b.lines.findIndex((l) => l.startsWith('Content-Security-Policy:'));
    if (detach < 0 || detach > cspAt) out.push(`_headers: ${b.pattern} does not detach the site-wide policy before its own`);
    if (b.lines.filter((l) => l.startsWith('Content-Security-Policy:')).length !== 1) out.push(`_headers: ${b.pattern} sets more than one policy`);
    const csp = b.lines[cspAt].slice('Content-Security-Policy:'.length).trim();
    const want = directives(siteCsp).map((d) => (d === "frame-ancestors 'none'" ? 'frame-ancestors *' : d));
    if (directives(csp).join('; ') !== want.join('; ')) out.push(`_headers: the ${b.pattern} policy differs from the /* policy in more than frame-ancestors *`);
    if (!b.lines.includes('X-Robots-Tag: noindex')) out.push(`_headers: ${b.pattern} lacks X-Robots-Tag: noindex`);
  }
  return out;
}
