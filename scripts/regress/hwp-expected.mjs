// One-time generator (brief Step 5 "Fixtures"): tests/corpus/hwp/expected.json from the local spike corpus.
// Per fixture: our engine's page count (spike run.bundled.json), the official page count (and 2-up flag) with
// the explained cause where they differ, and the content text of the official PDF (Hangul syllables, Latin
// letters and digits only, NFKC, in pdf.js order) and its word count, so no official PDF is committed.
// Usage: node scripts/regress/hwp-expected.mjs [spikeDir=spikes/hwp]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openPdf, pageText } from './lib.mjs';

const root = join(import.meta.dirname, '..', '..');
const spike = resolve(root, process.argv[2] ?? 'spikes/hwp');
const fixtures = join(root, 'tests', 'corpus', 'hwp');
const run = JSON.parse(readFileSync(join(spike, 'results', 'run.bundled.json'), 'utf8'));
const compare = JSON.parse(readFileSync(join(spike, 'results', 'compare.bundled.json'), 'utf8'));

/** Why our page count differs from the official PDF (spike SPIKE-HWP.md V2.4). */
const CAUSES = {
  adm02: 'R8: a table row that fits on p4 in Hancom is pushed whole to p5 (+1 page)',
  adm14: 'official PDF is printed 2-up (5 sheets = 10 pages); R11: line heights run slightly taller (+1 page)',
};

export const CONTENT_RE = /[가-힣A-Za-z0-9]/g;
export const contentText = (s) => (s.normalize('NFKC').match(CONTENT_RE) ?? []).join('');

const out = {};
for (const f of readdirSync(fixtures).filter((x) => /\.hwpx?$/.test(x)).sort()) {
  const key = f.replace(/\.hwpx?$/, '');
  const doc = await openPdf(new Uint8Array(readFileSync(join(spike, 'corpus', `${key}.pdf`))));
  let text = '';
  for (let i = 0; i < doc.numPages; i++) text += `${await pageText(doc, i)}\n`;
  const official = doc.numPages;
  await doc.close();
  const c = compare[key];
  out[key] = {
    file: f,
    pages: run[key].pages,
    officialPages: official,
    twoUp: Boolean(c?.twoup),
    cause: CAUSES[key] ?? null,
    officialWords: text.split(/\s+/).filter(Boolean).length,
    officialText: contentText(text),
  };
  console.log(key, run[key].pages, official, out[key].officialText.length);
}
writeFileSync(join(fixtures, 'expected.json'), `${JSON.stringify({ $comment: 'Generated once by scripts/regress/hwp-expected.mjs from the spike corpus (2026-09-30). officialText = content characters of the official PDF twin; officialWords = its whitespace-separated word count (pdf.js).', files: out }, null, 1)}\n`);
