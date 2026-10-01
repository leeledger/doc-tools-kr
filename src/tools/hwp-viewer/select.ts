// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// Copying text from /hwp-viewer/ (G2 A0 build order 3, "select + copy"). rhwp draws one <text> per glyph, and
// browsers copy a selection of SVG <text> elements one glyph per line ("관\n세\n법"). The viewer writes the
// copied text itself: the selected glyphs in drawing order, a line break where the baseline moves, a space
// where the shared text layer put one (addSpaces) or where a gap between two glyphs is wider than 1.5 em (a
// table column, a tab).

export interface PlacedGlyph {
  text: string;
  x: number;
  y: number;
  /** Font size in the page's units (the em of the gap rule). */
  size: number;
}

export function joinGlyphs(glyphs: readonly PlacedGlyph[]): string {
  let out = '';
  let prev: PlacedGlyph | null = null;
  for (const g of glyphs) {
    if (prev) {
      const em = Math.max(1, prev.size);
      if (Math.abs(g.y - prev.y) > em * 0.5) out = `${out.replace(/ +$/, '')}\n`;
      else if (g.text !== ' ' && !out.endsWith(' ') && g.x - prev.x > em * 1.5) out += ' ';
    }
    if (g.text === ' ' && (out === '' || out.endsWith(' ') || out.endsWith('\n'))) continue;
    out += g.text;
    prev = g;
  }
  return out.replace(/ +$/, '');
}

const num = (e: Element, name: string, fallback: number): number => {
  const v = Number.parseFloat(e.getAttribute(name) ?? '');
  return Number.isFinite(v) ? v : fallback;
};

/** The text of the <text> elements `range` touches inside `root`, joined as above; null if it touches none. */
export function selectedText(root: Element, range: Range): string | null {
  const picked: PlacedGlyph[] = [];
  for (const t of Array.from(root.querySelectorAll('svg text'))) {
    if (!range.intersectsNode(t)) continue;
    picked.push({ text: t.textContent ?? '', x: num(t, 'x', 0), y: num(t, 'y', 0), size: num(t, 'font-size', 10) });
  }
  return picked.length ? joinGlyphs(picked) : null;
}
