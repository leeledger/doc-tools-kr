// node pagediff.mjs <a.pdf> <b.pdf> : pages whose content-character count differs (A − B).
import { readFileSync } from 'node:fs';
import { openPdf, pageText } from '../regress/lib.mjs';
const cnt = (t) => (t.normalize('NFKC').match(/[가-힣A-Za-z0-9]/g) ?? []).length;
const [A, B] = [await openPdf(new Uint8Array(readFileSync(process.argv[2]))), await openPdf(new Uint8Array(readFileSync(process.argv[3])))];
const out = [];
for (let i = 0; i < Math.min(A.numPages, B.numPages); i++) { const a = await pageText(A, i), b = await pageText(B, i); if (cnt(a) !== cnt(b)) out.push(`p${i + 1}: ${cnt(a)} vs ${cnt(b)}`); }
console.log(out.join('\n') || 'same');
