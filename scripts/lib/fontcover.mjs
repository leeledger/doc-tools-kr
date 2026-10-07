// UI font coverage (LCP fix after TOOLS4): the preloaded core faces must cover every character a built page can
// show before interaction. check-dist compares the visible text of each page with the core faces' unicode-range;
// text inside elements the CSS renders in the system font (guide prose, docs/COPY.md) is exempt, and the
// exemption is read from the shipped CSS itself, so it cannot drift from what the browser does.

const ENTITIES = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', nbsp: ' ' };

/** Code points of a CSS unicode-range value ("U+20-7e, U+ac00"). */
export function rangeSet(value) {
  const set = new Set();
  for (const m of value.matchAll(/U\+([0-9a-f]+)(?:-([0-9a-f]+))?/gi)) {
    const a = parseInt(m[1], 16);
    const b = m[2] ? parseInt(m[2], 16) : a;
    for (let cp = a; cp <= b; cp++) set.add(cp);
  }
  return set;
}

/** One compound selector: optional tag, classes, optional Astro scope attribute ("h2.a.b[data-astro-cid-x]"). */
const COMPOUND = /^([a-z][\w-]*)?((?:\.[\w-]+)*)(?:\[(data-astro-cid-[\w-]+)\])?$/i;

/**
 * Selectors whose rules set a system-font stack (font-family starting with -apple-system), from CSS text, as
 * descendant chains of compounds: ".a h2[data-astro-cid-x]" → [{ classes: ["a"] }, { tag: "h2", attr: "…" }].
 * Any other selector shape throws, so a new exemption gets a real implementation instead of a silent pass.
 */
export function systemFontSelectors(css) {
  const out = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/font-family\s*:\s*-apple-system/.test(m[2])) continue;
    for (const sel of m[1].split(',').map((s) => s.trim())) {
      out.push(
        sel.split(/\s+/).map((part) => {
          const c = COMPOUND.exec(part);
          if (!c || (!c[1] && !c[2])) throw new Error(`fontcover: unsupported system-font selector "${sel}"`);
          return { tag: c[1]?.toLowerCase(), classes: c[2] ? c[2].slice(1).split('.') : [], attr: c[3] };
        }),
      );
    }
  }
  return out;
}

/** [start, end) of every element in html[from, to) that matches `compound` (balanced on its tag name). */
function elementSpans(html, compound, from = 0, to = html.length) {
  const spans = [];
  const open = /<([a-z][\w-]*)\b([^>]*)>/gi;
  open.lastIndex = from;
  for (let m = open.exec(html); m && m.index < to; m = open.exec(html)) {
    const tag = m[1].toLowerCase();
    const classes = (/\bclass="([^"]*)"/.exec(m[2])?.[1] ?? '').split(/\s+/);
    if (compound.tag && compound.tag !== tag) continue;
    if (!compound.classes.every((c) => classes.includes(c))) continue;
    if (compound.attr && !new RegExp(`\\s${compound.attr}(?=[\\s=/]|$)`).test(m[2])) continue;
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
    re.lastIndex = open.lastIndex;
    let depth = 1;
    let end = html.length;
    for (let t = re.exec(html); t; t = re.exec(html)) {
      depth += t[1] ? -1 : 1;
      if (!depth) {
        end = re.lastIndex;
        break;
      }
    }
    spans.push([m.index, end]);
    open.lastIndex = end;
  }
  return spans;
}

/** Spans matched by a descendant chain (the last compound's elements inside the earlier ones). */
function chainSpans(html, chain) {
  let spans = [[0, html.length]];
  for (const compound of chain) spans = spans.flatMap(([a, b]) => elementSpans(html, compound, a, b));
  return spans;
}

/**
 * The text a page can show: the <body> without scripts, styles, comments and system-font elements, plus the
 * alt, placeholder, title and value attributes, entities decoded.
 */
export function visibleText(html, exempt = []) {
  let body = /<body\b[\s\S]*<\/body>/i.exec(html)?.[0] ?? html;
  body = body.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ');
  const spans = exempt.flatMap((chain) => chainSpans(body, chain)).sort((x, y) => x[0] - y[0]);
  let kept = '';
  let at = 0;
  for (const [a, b] of spans) {
    if (a > at) kept += body.slice(at, a) + ' ';
    at = Math.max(at, b);
  }
  body = kept + body.slice(at);
  const attrs = [...body.matchAll(/\s(?:alt|placeholder|title|value)="([^"]*)"/gi)].map((m) => m[1]);
  return [body.replace(/<[^>]+>/g, ' '), ...attrs]
    .join(' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (e, n) =>
      n[0] === '#' ? String.fromCodePoint(n[1] === 'x' || n[1] === 'X' ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10)) : (ENTITIES[n.toLowerCase()] ?? e),
    );
}

/** Characters of `text` (no controls or whitespace) that are not in `covered`, in first-seen order. */
export function uncovered(text, covered) {
  const out = new Set();
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp > 0x20 && !/\s/.test(ch) && !covered.has(cp)) out.add(ch);
  }
  return [...out];
}
