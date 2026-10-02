// Builds src/generated/licenses.json from licenses.manifest.json and the license texts in node_modules.
// Fails if a listed package or license file (in node_modules or under licenses/third-party/) is missing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoframeOn } from './lib/autoframe.mjs';
import { bgRemoveOn } from './lib/bgremove.mjs';
import { publicEnv } from './lib/dist.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'licenses.manifest.json'), 'utf8'));
const errors = [];
const out = [];
// Entries marked "autoframe" (MediaPipe, Step 4) ship only when PUBLIC_ID_PHOTO_AUTOFRAME is on.
const autoframe = autoframeOn(publicEnv().PUBLIC_ID_PHOTO_AUTOFRAME);
// Entries marked "bgremove" (onnxruntime-web, BiRefNet; Sprint C, C2) ship only when PUBLIC_BG_REMOVE is on.
const bgremove = bgRemoveOn(publicEnv().PUBLIC_BG_REMOVE);
/** A license file already embedded by an earlier entry is referenced, not repeated (the page stays small). */
const embedded = new Map();

const readText = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n').trim();

/** `localFiles`: license texts committed under licenses/third-party/ (paths relative to the repo root). */
function localTexts(entry, label) {
  const texts = [];
  for (const f of entry.localFiles ?? []) {
    const p = join(root, f);
    if (!existsSync(p)) {
      errors.push(`${label}: missing local license file ${f}`);
      continue;
    }
    const file = f.replace(/^licenses\/third-party\//, '');
    if (embedded.has(f)) texts.push({ file, sameAs: embedded.get(f) });
    else {
      embedded.set(f, `${label} — ${file}`);
      texts.push({ file, text: readText(p) });
    }
  }
  return texts;
}

for (const entry of manifest.packages) {
  if (entry.autoframe && !autoframe) continue;
  if (entry.bgremove && !bgremove) continue;
  if (entry.component) {
    // Code compiled into another package: no npm package of its own, so every field is in the manifest.
    for (const k of ['version', 'license', 'use', 'homepage']) {
      if (!entry[k]) errors.push(`${entry.component}: manifest field "${k}" missing`);
    }
    if (!entry.localFiles?.length) errors.push(`${entry.component}: no localFiles`);
    out.push({
      name: entry.component,
      version: entry.version,
      license: entry.license,
      use: entry.use,
      homepage: entry.homepage,
      texts: localTexts(entry, entry.component),
    });
    continue;
  }
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
    texts.push({ file: f, text: readText(p) });
  }
  texts.push(...localTexts(entry, entry.name));
  if (!texts.length) errors.push(`${entry.name}: no license text`);
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const toHttp = (u) =>
    u ? u.replace(/^git\+/, '').replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '') : null;
  out.push({
    name: entry.name,
    version: pkg.version,
    license: pkg.license,
    use: entry.use,
    homepage: [entry.homepage, pkg.homepage, toHttp(repo)].find((u) => typeof u === 'string' && /^https:\/\//.test(u)) ?? null,
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
