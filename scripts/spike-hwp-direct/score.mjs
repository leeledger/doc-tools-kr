// SPIKE-HWP-DIRECT scorer. For every PDF of a run (regress-out/direct/<tag>/results.json):
// - valid: pdf.js opens it and renders every scored page; no NaN/Infinity operand in any content stream
// - recall: content recall (Hangul/Latin/digits multiset, NFKC) vs the official PDF text (regress:hwp metric)
// - recallVsPrint: the same vs the print baseline's text (what the current tool produces)
// - ssim: per page, vs the print baseline (Chromium page.pdf of the production print path), both rendered by
//   pdf.js at 100 dpi, grey, 8×8 windows stride 4 (Wang et al. constants); ≤ 40 pages per file (evenly sampled)
// - size vs official
// Usage: node scripts/spike-hwp-direct/score.mjs <tag> [--only regex] [--print print]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { openPdf, pageText, renderRgba, unitSize } from '../regress/lib.mjs';
import { gray } from '../regress/hwp-ink.mjs';
import { ssim } from './metrics.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const tag = args[0];
const arg = (n, d = null) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const only = arg('--only') ? new RegExp(arg('--only')) : null;
const printTag = arg('--print', 'print');
const corpus = resolve(process.env.CORPUS_DIR ?? 'C:/dev/doc-tools-kr/spikes/hwp/corpus');
const dir = join(root, 'regress-out', 'direct', tag);
const results = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'));
const expected = JSON.parse(readFileSync(join(root, 'tests', 'corpus', 'hwp', 'expected.json'), 'utf8')).files;
const scorePath = join(dir, 'scores.json');
const scores = existsSync(scorePath) && !args.includes('--force') ? JSON.parse(readFileSync(scorePath, 'utf8')) : {};
const SCALE = 100 / 72;
const MAX_SSIM_PAGES = 40;

const CONTENT_RE = /[가-힣A-Za-z0-9]/g;
const content = (s) => s.normalize('NFKC').match(CONTENT_RE) ?? [];
function recallOf(ref, ours) {
  const m = new Map();
  for (const c of ours) m.set(c, (m.get(c) ?? 0) + 1);
  const r = new Map();
  for (const c of ref) r.set(c, (r.get(c) ?? 0) + 1);
  let inter = 0;
  for (const [c, n] of r) inter += Math.min(n, m.get(c) ?? 0);
  return ref.length ? inter / ref.length : 1;
}

function badNumbers(bytes) {
  const buf = Buffer.from(bytes);
  let bad = 0;
  let i = 0;
  for (;;) {
    const s = buf.indexOf('stream', i);
    if (s < 0) break;
    let start = s + 6;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const e = buf.indexOf('endstream', start);
    if (e < 0) break;
    try {
      const txt = inflateSync(buf.subarray(start, e)).toString('latin1');
      if (/(^|[\s\[])-?(NaN|Infinity)\b/.test(txt)) bad++;
    } catch {
      // not a flate stream (image, font)
    }
    i = e + 9;
  }
  if (/-Infinity|NaN/.test(buf.toString('latin1').replace(/stream[\s\S]*?endstream/g, ''))) bad++;
  return bad;
}

const printCache = new Map();
async function printInfo(key) {
  if (printCache.has(key)) return printCache.get(key);
  const p = join(root, 'regress-out', 'direct', printTag, 'chromium-P', `${key}.pdf`);
  if (!existsSync(p)) return null;
  const doc = await openPdf(new Uint8Array(readFileSync(p)));
  let text = '';
  for (let i = 0; i < doc.numPages; i++) text += await pageText(doc, i);
  const info = { doc, text: content(text), pages: doc.numPages, bytes: readFileSync(p).length };
  printCache.set(key, info);
  return info;
}

const officialCache = new Map();
async function officialText(key) {
  if (officialCache.has(key)) return officialCache.get(key);
  const twin = join(corpus, `${key}.pdf`);
  let out = null;
  if (existsSync(twin)) {
    const d = await openPdf(new Uint8Array(readFileSync(twin)));
    let t = '';
    for (let i = 0; i < d.numPages; i++) t += await pageText(d, i);
    await d.close();
    out = { text: content(t), bytes: readFileSync(twin).length };
  } else if (expected[key]?.officialText) out = { text: [...expected[key].officialText], bytes: null };
  officialCache.set(key, out);
  return out;
}

const ids = Object.keys(results).filter((id) => results[id].ok && (!only || only.test(id)));
for (const id of ids) {
  if (scores[id]) continue;
  const r = results[id];
  const pdfPath = join(dir, `${r.browser}-${r.approach}`, `${r.key}.pdf`);
  const s = { id, key: r.key, browser: r.browser, approach: r.approach };
  try {
    const bytes = new Uint8Array(readFileSync(pdfPath));
    s.bytes = bytes.length;
    s.badNumbers = badNumbers(bytes);
    const doc = await openPdf(bytes);
    s.pages = doc.numPages;
    let text = '';
    for (let i = 0; i < doc.numPages; i++) text += await pageText(doc, i);
    const ours = content(text);
    const off = await officialText(r.key);
    if (off) {
      s.recall = recallOf(off.text, ours);
      s.officialBytes = off.bytes;
    }
    const pr = await printInfo(r.key);
    if (pr) {
      s.recallVsPrint = recallOf(pr.text, ours);
      s.printBytes = pr.bytes;
      s.printPages = pr.pages;
      const n = Math.min(pr.pages, doc.numPages);
      const pick = n <= MAX_SSIM_PAGES ? [...Array(n).keys()] : [...Array(MAX_SSIM_PAGES).keys()].map((i) => Math.round((i * (n - 1)) / (MAX_SSIM_PAGES - 1)));
      const vals = [];
      for (const i of pick) {
        const a = gray(await renderRgba(pr.doc, i, SCALE));
        const ua = await unitSize(pr.doc, i), ub = await unitSize(doc, i);
        const b = gray(await renderRgba(doc, i, SCALE)); void ua; void ub;
        vals.push([i, ssim(a, b)]);
      }
      s.ssim = vals.map(([i, v]) => [i, Number(v.toFixed(4))]);
      s.ssimMean = vals.reduce((x, [, v]) => x + v, 0) / vals.length;
      s.ssimMin = Math.min(...vals.map(([, v]) => v));
    }
    s.valid = s.badNumbers === 0;
    await doc.close();
  } catch (err) {
    s.valid = false;
    s.error = String(err?.message ?? err).slice(0, 300);
  }
  scores[id] = s;
  console.log(id, s.valid ? 'valid' : `INVALID ${s.error ?? `bad numbers ${s.badNumbers}`}`, `recall=${s.recall?.toFixed(4) ?? '-'} vsPrint=${s.recallVsPrint?.toFixed(4) ?? '-'} ssim=${s.ssimMean?.toFixed(3) ?? '-'}/${s.ssimMin?.toFixed(3) ?? '-'} MB=${(s.bytes / 1e6).toFixed(2)} off=${s.officialBytes ? (s.bytes / s.officialBytes).toFixed(2) + 'x' : '-'}`);
  writeFileSync(scorePath, JSON.stringify(scores, null, 1));
}
process.exit(0);
