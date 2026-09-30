// SPIKE-HWP-DIRECT: aggregate results.json + scores.json of one or more tags into markdown tables.
// Usage: node scripts/spike-hwp-direct/report.mjs desktop [mobile]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const tags = process.argv.slice(2);
const PAGE_BAD = 0.9;
const out = [];
const p = (s = '') => out.push(s);
const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
const f2 = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const printRes = JSON.parse(readFileSync(join(root, 'regress-out', 'direct', 'print', 'results.json'), 'utf8'));

for (const tag of tags) {
  const dir = join(root, 'regress-out', 'direct', tag);
  const R = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'));
  const S = existsSync(join(dir, 'scores.json')) ? JSON.parse(readFileSync(join(dir, 'scores.json'), 'utf8')) : {};
  const groups = new Map();
  for (const [id, r] of Object.entries(R)) {
    const g = `${r.browser}|${r.approach}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ r, s: S[id] ?? {} });
  }
  p(`## ${tag}`);
  p('');
  p('| browser | approach | files ok | valid PDFs | recall vs official: min / median / files < 0.99 | recall vs print: min | SSIM vs print: mean / min page | pages < 0.90 (files) | size ÷ official: median / max / files > 3× | total MB | fallback pages | missing glyphs |');
  p('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [g, rows] of [...groups].sort()) {
    const [b, a] = g.split('|');
    const ok = rows.filter((x) => x.r.ok);
    const valid = ok.filter((x) => x.s.valid);
    const rec = ok.map((x) => x.s.recall).filter(Number.isFinite);
    const recP = ok.map((x) => x.s.recallVsPrint).filter(Number.isFinite);
    const ss = ok.flatMap((x) => (x.s.ssim ?? []).map(([, v]) => v));
    const badPages = ok.flatMap((x) => (x.s.ssim ?? []).filter(([, v]) => v < PAGE_BAD).map(([i]) => `${x.r.key}p${i + 1}`));
    const badFiles = [...new Set(badPages.map((k) => k.replace(/p\d+$/, '')))];
    const ratios = ok.filter((x) => x.s.officialBytes).map((x) => ({ k: x.r.key, v: x.s.bytes / x.s.officialBytes }));
    p(`| ${b} | ${a} | ${ok.length}/${rows.length}${rows.length - ok.length ? ` (${rows.filter((x) => !x.r.ok).map((x) => x.r.key).join(' ')})` : ''} | ${valid.length}/${ok.length} | ${f2(Math.min(...rec), 4)} / ${f2(med(rec), 4)} / ${rec.filter((x) => x < 0.99).length}${rec.some((x) => x < 0.99) ? ` (${ok.filter((x) => x.s.recall < 0.99).map((x) => `${x.r.key} ${f2(x.s.recall, 3)}`).join(', ')})` : ''} | ${f2(Math.min(...recP), 4)} | ${f2(ss.reduce((x, y) => x + y, 0) / ss.length, 3)} / ${f2(Math.min(...ss), 3)} | ${badPages.length} (${badFiles.join(' ')}) | ${f2(med(ratios.map((x) => x.v)))} / ${f2(Math.max(...ratios.map((x) => x.v)))} / ${ratios.filter((x) => x.v > 3).length}${ratios.some((x) => x.v > 3) ? ` (${ratios.filter((x) => x.v > 3).map((x) => `${x.k} ${f2(x.v, 1)}×`).join(', ')})` : ''} | ${f2(ok.reduce((x, y) => x + (y.r.pdfBytes ?? 0), 0) / 1e6, 1)} | ${ok.reduce((x, y) => x + (y.r.fallbackPages ?? 0), 0)} | ${ok.reduce((x, y) => x + (y.r.missingGlyphs ?? 0), 0)} |`);
  }
  p('');
  p('Time (ms, file open → PDF bytes) and memory (browser process tree working-set peak − idle, MB):');
  p('');
  const keys = ['law10', 'adm28', 'adm11', 'adm04', 'adm16', 'kr01', 'kr17'];
  p(`| browser | approach | ${keys.map((k) => `${k}`).join(' | ')} |`);
  p(`|---|---|${keys.map(() => '---').join('|')}|`);
  const pr = (k) => printRes[`chromium-P-${k}`];
  p(`| chromium | print (current) | ${keys.map((k) => (pr(k)?.ok ? `${Math.round(pr(k).totalMs)} / ${Math.round(pr(k).memDeltaMB)}` : '-')).join(' | ')} |`);
  for (const [g, rows] of [...groups].sort()) {
    const [b, a] = g.split('|');
    p(`| ${b} | ${a} | ${keys.map((k) => { const x = rows.find((y) => y.r.key === k)?.r; return x ? (x.ok ? `${Math.round(x.totalMs)} / ${Math.round(x.memDeltaMB ?? NaN)}` : 'FAIL') : '-'; }).join(' | ')} |`);
  }
  p('');
  const worst = [];
  for (const [id, s] of Object.entries(S)) for (const [i, v] of s.ssim ?? []) if (v < PAGE_BAD) worst.push([id, i + 1, v]);
  worst.sort((x, y) => x[2] - y[2]);
  p(`Pages with SSIM < ${PAGE_BAD} (worst 40): ${worst.slice(0, 40).map(([id, pg, v]) => `${id} p${pg} ${v.toFixed(3)}`).join('; ') || 'none'}`);
  p('');
  const fails = Object.entries(R).filter(([, r]) => !r.ok);
  p(`Failures: ${fails.map(([id, r]) => `${id}: ${r.error}`).join(' | ') || 'none'}`);
  p('');
}
writeFileSync(join(root, 'regress-out', 'direct', `report-${tags.join('-')}.md`), out.join('\n'));
console.log(out.join('\n'));
