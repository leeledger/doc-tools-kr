// TOOLS5 U4 spike (report only, never shipped): HWPX → HWP with the vendored rhwp engine in Node.
// Per input: open with rhwp, exportHwpVerify, exportHwpWithReport (bytes + content-loss report), reload the
// produced HWP with rhwp, compare page count and the SVG text of every page (multiset recall of content
// characters, source vs output, and both vs the official PDF text where tests/corpus/hwp/expected.json has it),
// check the CFB container with Python olefile when present, and log bytes, time and peak memory.
// Usage: node scripts/spike/hwpx-to-hwp.mjs [--out DIR] [file.hwpx ...]   (default: the 4 HWPX fixtures)
// Output: <out>/<key>.hwp per input and <out>/results.json.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import init, { HwpDocument } from '@rhwp/core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : join(root, 'regress-out', 'hwpx-to-hwp'));
const inputs = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1));
const fixtures = join(root, 'tests', 'corpus', 'hwp');
const files = inputs.length ? inputs.map((f) => resolve(f)) : ['adm02', 'adm14', 'adm19', 'adm28'].map((k) => join(fixtures, `${k}.hwpx`));
const expected = JSON.parse(readFileSync(join(fixtures, 'expected.json'), 'utf8')).files;

// Same deterministic estimate as the worker's fallback (Node has no canvas).
globalThis.measureTextWidth = (font, text) => {
  const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    w += (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3000 && cp <= 0x9fff) || (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xff00 && cp <= 0xffef) ? px : px * 0.55;
  }
  return w;
};

const wasmPath = join(root, 'node_modules', '@rhwp', 'core', 'rhwp_bg.wasm');
const wasm = await init({ module_or_path: readFileSync(wasmPath) });

const CONTENT_RE = /[가-힣A-Za-z0-9]/g;
const content = (s) => s.normalize('NFKC').match(CONTENT_RE) ?? [];
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const svgText = (svg) => {
  let s = '';
  for (const m of svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)) s += decode(m[1].replace(/<[^>]+>/g, ''));
  return s;
};
const multiset = (arr) => {
  const m = new Map();
  for (const c of arr) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
};
/** |a ∩ b| / |a| over content-character multisets. */
const recall = (a, b) => {
  const ma = multiset(a);
  const mb = multiset(b);
  let inter = 0;
  for (const [c, n] of ma) inter += Math.min(n, mb.get(c) ?? 0);
  return a.length ? inter / a.length : 1;
};
const docText = (doc) => {
  const pages = doc.pageCount();
  const per = [];
  for (let i = 0; i < pages; i++) per.push(svgText(doc.renderPageSvg(i)));
  return per;
};

let rssPeak = 0;
const sample = () => (rssPeak = Math.max(rssPeak, process.memoryUsage().rss));
const timer = setInterval(sample, 20);

function olefileCheck(path) {
  const py = `import olefile,sys,zlib
p=sys.argv[1]
print('isOle', olefile.isOleFile(p))
o=olefile.OleFileIO(p)
print('streams', ';'.join('/'.join(s) for s in o.listdir()))
h=o.openstream('FileHeader').read()
print('sig', h[:17].decode('ascii','replace'), 'ver', '.'.join(str(b) for b in h[32:36][::-1]), 'flags', int.from_bytes(h[36:40],'little'))
`;
  const r = spawnSync('python', ['-c', py, path], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : `olefile error: ${(r.stderr || r.error?.message || '').trim().split('\n').pop()}`;
}

mkdirSync(outDir, { recursive: true });
const results = [];
for (const file of files) {
  const key = basename(file).replace(/\.hwpx$/i, '');
  const r = { key, file, inBytes: 0 };
  results.push(r);
  try {
    const bytes = new Uint8Array(readFileSync(file));
    r.inBytes = bytes.length;
    rssPeak = 0;
    sample();
    const t0 = performance.now();
    const src = new HwpDocument(bytes);
    r.sourceFormat = src.getSourceFormat();
    r.pagesIn = src.pageCount();
    r.msOpen = Math.round(performance.now() - t0);
    const textIn = docText(src);
    r.msRenderIn = Math.round(performance.now() - t0 - r.msOpen);

    let t = performance.now();
    try {
      r.verify = JSON.parse(src.exportHwpVerify());
    } catch (err) {
      r.verifyError = String(err?.message ?? err);
    }
    r.msVerify = Math.round(performance.now() - t);

    t = performance.now();
    const exp = src.exportHwpWithReport();
    r.contentLoss = JSON.parse(exp.contentLoss());
    const out = exp.takeBytes();
    exp.free();
    r.msExport = Math.round(performance.now() - t);
    r.outBytes = out.length;
    const outPath = join(outDir, `${key}.hwp`);
    writeFileSync(outPath, out);
    src.free();

    t = performance.now();
    const back = new HwpDocument(new Uint8Array(out));
    r.reloadFormat = back.getSourceFormat();
    r.pagesOut = back.pageCount();
    const textOut = docText(back);
    r.msReload = Math.round(performance.now() - t);
    back.free();

    sample();
    r.rssPeakMB = Math.round(rssPeak / 1048576);
    r.wasmHeapMB = Math.round(wasm.memory.buffer.byteLength / 1048576);

    const cin = content(textIn.join(''));
    const cout = content(textOut.join(''));
    r.charsIn = cin.length;
    r.charsOut = cout.length;
    r.recallOutVsIn = +recall(cin, cout).toFixed(4);
    r.precisionOutVsIn = +recall(cout, cin).toFixed(4);
    const first = (a) => content(a[0] ?? '');
    const last = (a) => content(a[a.length - 1] ?? '');
    r.page1Recall = +recall(first(textIn), first(textOut)).toFixed(4);
    r.lastPageRecall = +recall(last(textIn), last(textOut)).toFixed(4);
    r.pagesTextEqual = textIn.filter((p, i) => p === textOut[i]).length;
    const off = expected[key];
    if (off?.officialText) {
      const o = content(off.officialText);
      r.officialPages = off.officialPages;
      r.recallInVsOfficial = +recall(o, cin).toFixed(4);
      r.recallOutVsOfficial = +recall(o, cout).toFixed(4);
    }
    r.ole = olefileCheck(outPath);
  } catch (err) {
    r.error = String(err?.stack ?? err?.message ?? err).split('\n').slice(0, 3).join(' | ');
  }
  console.log(JSON.stringify(r));
}
clearInterval(timer);
writeFileSync(join(outDir, 'results.json'), JSON.stringify({ rhwp: '0.8.6', wasmBytes: readFileSync(wasmPath).length, node: process.version, results }, null, 1));
console.log(`wrote ${join(outDir, 'results.json')}`);
