// Builds src/generated/licenses.json from licenses.manifest.json and the license texts in node_modules.
// Fails if a listed package or license file is missing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'licenses.manifest.json'), 'utf8'));
const errors = [];
const out = [];

for (const entry of manifest.packages) {
  const dir = join(root, 'node_modules', ...entry.name.split('/'));
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) {
    errors.push(`${entry.name}: package not installed`);
    continue;
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const texts = [];
  for (const f of entry.files) {
    const p = join(dir, f);
    if (!existsSync(p)) {
      errors.push(`${entry.name}: missing license file ${f}`);
      continue;
    }
    texts.push({ file: f, text: readFileSync(p, 'utf8').replace(/\r\n/g, '\n').trim() });
  }
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const toHttp = (u) =>
    u ? u.replace(/^git\+/, '').replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '') : null;
  out.push({
    name: entry.name,
    version: pkg.version,
    license: pkg.license,
    use: entry.use,
    homepage: [pkg.homepage, toHttp(repo)].find((u) => typeof u === 'string' && /^https:\/\//.test(u)) ?? null,
    texts,
  });
}

if (errors.length) {
  console.error(`gen-licenses: ${errors.length} problem(s)\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
mkdirSync(join(root, 'src', 'generated'), { recursive: true });
writeFileSync(join(root, 'src', 'generated', 'licenses.json'), JSON.stringify(out, null, 1));
console.log(`gen-licenses: ${out.length} packages`);
