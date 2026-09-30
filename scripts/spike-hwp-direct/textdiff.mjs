import { readFileSync } from 'node:fs';
import { openPdf, pageText } from 'file:///C:/dev/doc-tools-kr-hwpdl/scripts/regress/lib.mjs';
const txt = async (p) => { const d = await openPdf(new Uint8Array(readFileSync(p))); let t = ''; for (let i = 0; i < d.numPages; i++) t += await pageText(d, i); return (t.normalize('NFKC').match(/[가-힣A-Za-z0-9]/g) ?? []); };
const [a, b] = [await txt(process.argv[2]), await txt(process.argv[3])];
const m = new Map(); for (const c of a) m.set(c, (m.get(c) ?? 0) + 1); for (const c of b) m.set(c, (m.get(c) ?? 0) - 1);
console.log('print-only:', [...m].filter(([, n]) => n > 0).map(([c, n]) => c + n).join(' '), '| ours-only:', [...m].filter(([, n]) => n < 0).map(([c, n]) => c + -n).join(' '));
