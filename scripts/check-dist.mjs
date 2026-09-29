// Dist gate: Cloudflare Pages limits with headroom, no source maps, and the bundle budgets
// (brief Step 2 §6 and Step 3 §4, gzip -9 sizes). Prints the budget table.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const MAX_FILE = 24 * 1024 * 1024;
const MAX_FILES = 15000;
const KB = 1024;

const files = [];
const walk = (dir) => {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) walk(p);
    else files.push({ path: relative(dist, p).split(sep).join('/'), size: statSync(p).size });
  }
};
walk(dist);

const errors = [];
for (const f of files) {
  if (f.size >= MAX_FILE) errors.push(`${f.path} is ${(f.size / 1048576).toFixed(1)} MiB (limit < 24 MiB)`);
  if (f.path.endsWith('.map')) errors.push(`${f.path}: source maps must not ship`);
}
if (files.length > MAX_FILES) errors.push(`${files.length} files (limit ${MAX_FILES})`);

const gz = (path) => gzipSync(readFileSync(join(dist, path)), { level: 9 }).length;

// Initial JS of a page: its module scripts plus their static imports (dynamic import() is lazy).
function staticClosure(entry) {
  const seen = new Set();
  const visit = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    const code = readFileSync(join(dist, path), 'utf8');
    for (const m of code.matchAll(/(?:^|[;\s}])import\s*(?:[\w${},\s*]+from\s*)?["']([^"']+)["']/g)) {
      const spec = m[1];
      if (!spec.startsWith('.') && !spec.startsWith('/')) continue;
      visit(spec.startsWith('/') ? spec.slice(1) : posix.join(posix.dirname(path), spec));
    }
  };
  visit(entry);
  return [...seen];
}

const rows = [];
const budget = (label, paths, limit) => {
  if (!paths.length) {
    errors.push(`${label}: no file found`);
    return;
  }
  const size = paths.reduce((a, p) => a + gz(p), 0);
  rows.push({ label, size, limit });
  if (size > limit) errors.push(`${label} (${paths.join(' + ')}) is ${(size / KB).toFixed(1)} KB gzip, budget ${limit / KB} KB`);
};

for (const html of files.filter((f) => f.path.endsWith('.html'))) {
  const text = readFileSync(join(dist, html.path), 'utf8');
  const entries = [...text.matchAll(/<script[^>]*type="module"[^>]*src="\/([^"]+)"/g)].map((m) => m[1]);
  const js = [...new Set(entries.flatMap(staticClosure))];
  if (js.length) budget(`initial JS /${html.path.replace(/index\.html$/, '')}`, js, 30 * KB);
}
const match = (re) => files.filter((f) => re.test(f.path)).map((f) => f.path);
budget('compress.worker*.js', match(/^_astro\/compress\.worker[^/]*\.js$/), 330 * KB);
budget('vendor/qpdf/*/qpdf.wasm', match(/^vendor\/qpdf\/[^/]+\/qpdf\.wasm$/), 480 * KB);
budget('MozJPEG enc + dec wasm', match(/^_astro\/mozjpeg_(enc|dec)[^/]*\.wasm$/), 140 * KB);
budget('resize wasm', match(/^_astro\/squoosh_resize[^/]*\.wasm$/), 30 * KB);
budget('photo.worker*.js', match(/^_astro\/photo\.worker[^/]*\.js$/), 60 * KB);
for (const glue of match(/^_astro\/webp_enc[^/]*\.js$/)) budget(`WebP glue ${glue.slice(7)}`, [glue], 20 * KB);
for (const wasm of match(/^_astro\/webp_enc[^/]*\.wasm$/)) budget(`WebP wasm ${wasm.slice(7)}`, [wasm], 130 * KB);
budget('fflate chunk (zip*.js)', match(/^_astro\/zip[.-][^/]*\.js$/), 12 * KB);

// Both workers share one MozJPEG encoder; each WebP build ships once.
const count = (re, want, label) => {
  const n = match(re).length;
  if (n !== want) errors.push(`${label}: ${n} file(s), expected exactly ${want}`);
};
count(/^_astro\/mozjpeg_enc[^/]*\.wasm$/, 1, 'mozjpeg_enc*.wasm');
count(/^_astro\/webp_enc-[^/]*\.wasm$/, 1, 'webp_enc*.wasm');
count(/^_astro\/webp_enc_simd-[^/]*\.wasm$/, 1, 'webp_enc_simd*.wasm');

console.log('check-dist: budgets (gzip -9)');
for (const r of rows) console.log(`  ${r.label.padEnd(40)} ${(r.size / KB).toFixed(1).padStart(7)} KB  / ${r.limit / KB} KB`);

const largest = files.reduce((a, f) => (f.size > a.size ? f : a), { path: '-', size: 0 });
if (errors.length) {
  console.error(`check-dist: FAIL\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-dist: OK — ${files.length} files, largest ${largest.path} ${(largest.size / 1048576).toFixed(2)} MiB`);
