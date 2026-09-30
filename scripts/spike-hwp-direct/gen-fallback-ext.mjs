// SPIKE-HWP-DIRECT: extended "Anolim HWP Fallback" faces (all SIL OFL 1.1, notofonts) covering the symbols the four
// bundled families lack. Found in the 40-file run: ∼ ․ ═ ･ ｢｣ ▪ ▸ ➔ ➂ ∙ ⋅ ∅ ∎ ▢ ⎯ ㊲ 〫 ˝ ̊ (the print path shows
// them only through OS fonts). One face per source, each with its own unicode-range; resolution tries them in
// this order, like the browser would with overlapping ranges.
// Usage: node scripts/spike-hwp-direct/gen-fallback-ext.mjs <dir with NotoSansCJKkr-Regular.otf, NotoSansMath-
//        Regular.ttf, NotoSansSymbols2-Regular.ttf, NotoSans-Regular.ttf>  → regress-out/direct/fonts/fb-*.woff2|woff
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import subsetFont from 'subset-font';
import { FACES } from './fallback-faces.mjs';
if (process.argv[2]) {
  let total = 0;
  for (const f of FACES) {
    const src = readFileSync(join(process.argv[2], f.src));
    let text = '';
    for (const [a, b] of f.ranges) for (let c = a; c <= b; c++) text += String.fromCodePoint(c);
    for (const fmt of ['woff2', 'woff']) {
      const out = await subsetFont(src, text, { targetFormat: fmt });
      writeFileSync(`regress-out/direct/fonts/fb-${f.id}.${fmt}`, out);
      if (fmt === 'woff2') total += out.length;
      console.log(f.id, fmt, (out.length / 1024).toFixed(1), 'KiB');
    }
  }
  console.log('woff2 total', (total / 1024).toFixed(1), 'KiB');
}
