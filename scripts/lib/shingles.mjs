// Near-duplicate guard for the /guide/ pages (G2 A1): 5-character shingles of the rendered article (its FAQ
// included), Jaccard similarity of every pair. check-dist fails at or above DUP_LIMIT; the fixed threshold means a
// too-similar page is rewritten, never the limit raised.

export const DUP_LIMIT = 0.45;
export const SHINGLE = 5;

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&amp;': '&' };

/** The visible text of the page's <article> (whitespace removed), or '' when there is none. */
export function articleText(html) {
  const a = /<article[\s\S]*?<\/article>/.exec(html)?.[0] ?? '';
  return a
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ')
    .replace(/&(?:lt|gt|quot|#39|amp);/g, (m) => ENTITIES[m])
    .replace(/\s+/g, '');
}

/** The set of `n`-character substrings of `text`. */
export function shingles(text, n = SHINGLE) {
  const chars = [...text];
  const out = new Set();
  for (let i = 0; i + n <= chars.length; i++) out.add(chars.slice(i, i + n).join(''));
  return out;
}

export function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Every pair of pages: the most similar pair and every pair at or above `limit`.
 * @param {[string, string][]} pages [name, article text]
 */
export function duplicatePairs(pages, limit = DUP_LIMIT) {
  const sets = pages.map(([name, text]) => [name, shingles(text)]);
  let max = { a: '', b: '', j: 0 };
  const over = [];
  for (let i = 0; i < sets.length; i++) {
    for (let k = i + 1; k < sets.length; k++) {
      const j = jaccard(sets[i][1], sets[k][1]);
      if (j > max.j) max = { a: sets[i][0], b: sets[k][0], j };
      if (j >= limit) over.push({ a: sets[i][0], b: sets[k][0], j });
    }
  }
  return { max, over };
}
