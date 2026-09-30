// 404 suggestion (Growth G.3, ≤ 1 KB gzip): a word in the missing address that names a tool or a guide gets
// "혹시 이 페이지를 찾으셨나요?" with that link. The map is written at build from live tools and published guides
// only; with no match nothing extra is shown.
interface Entry {
  tokens: string[];
  href: string;
  name: string;
}

export function suggest(path: string, map: readonly Entry[]): Entry | null {
  let p = path;
  try {
    p = decodeURIComponent(path);
  } catch {
    // A malformed escape: match the raw path.
  }
  p = p.toLowerCase();
  return map.find((e) => e.tokens.some((t) => p.includes(t))) ?? null;
}

const data = document.getElementById('nf-map');
const box = document.getElementById('nf-suggest');
const link = box?.querySelector('a');
if (data && box && link) {
  const hit = suggest(location.pathname, JSON.parse(data.textContent ?? '[]') as Entry[]);
  if (hit && hit.href !== location.pathname) {
    link.href = hit.href;
    link.textContent = hit.name;
    box.hidden = false;
  }
}
