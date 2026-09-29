// Shared helpers of the postbuild scripts (check-dist, gen-headers, carry-assets, gen-sw) and smoke-assets.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { loadEnv } from 'vite';

export const ROOT = join(import.meta.dirname, '..', '..');

/** `--dist <dir>` (tests build elsewhere), else ./dist. */
export function distDir(argv = process.argv) {
  const i = argv.indexOf('--dist');
  return i > 0 && argv[i + 1] ? argv[i + 1] : join(ROOT, 'dist');
}

/** Every file under `dir` as { path (posix, relative), size }. */
export function walkFiles(dir) {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push({ path: relative(dir, p).split(sep).join('/'), size: statSync(p).size });
    }
  };
  walk(dir);
  return files;
}

/** A module's static import closure (dynamic import() is lazy), as dist-relative paths. */
export function staticClosure(dist, entry) {
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

/** The module script entries of an HTML page (dist-relative). */
export function moduleEntries(html) {
  return [...html.matchAll(/<script[^>]*type="module"[^>]*src="\/([^"]+)"/g)].map((m) => m[1]);
}

/** The build id the pages carry (<meta name="build-id">), read back from dist/index.html. */
export function readBuildId(dist) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const m = html.match(/<meta name="build-id" content="([^"]+)"/);
  if (!m) throw new Error('dist/index.html has no <meta name="build-id">');
  return m[1];
}

/** PUBLIC_* values from the environment and .env files, read the way Astro reads them. */
export function publicEnv() {
  return loadEnv('production', ROOT, 'PUBLIC_');
}
