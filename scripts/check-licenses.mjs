// License gate: every production dependency must use an allowlisted license. GPL/MPL of any kind fails.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOW = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'Zlib', 'IJG', 'OFL-1.1']);
const FORBIDDEN = /GPL|MPL/i;

let tree;
try {
  tree = JSON.parse(execSync('npm ls --omit=dev --all --json', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }));
} catch (err) {
  // npm ls exits non-zero on extraneous/missing optional entries but still prints the tree.
  tree = JSON.parse(err.stdout);
}
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages ?? {};

function licenseOf(name) {
  const p = join(root, 'node_modules', ...name.split('/'), 'package.json');
  if (!existsSync(p)) return null;
  const pkg = JSON.parse(readFileSync(p, 'utf8'));
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ');
  return null;
}

function allowed(expr) {
  if (FORBIDDEN.test(expr)) return false;
  const clean = expr.replace(/[()]/g, ' ').trim();
  // "A OR B": one allowed alternative is enough; "A AND B": all must be allowed.
  return clean.split(/\s+OR\s+/i).some((alt) => alt.split(/\s+AND\s+/i).every((id) => ALLOW.has(id.trim())));
}

const seen = new Map();
const problems = [];
const walk = (deps = {}) => {
  for (const [name, node] of Object.entries(deps)) {
    const locked = lock[`node_modules/${name}`];
    const key = `${name}@${node.version ?? locked?.version}`;
    if (seen.has(key)) continue;
    // npm ls --omit=dev still lists dev-only packages it marks extraneous; the lockfile is the source of truth.
    if (node.extraneous && locked?.dev) continue;
    // Optional platform binaries for other OSes are not installed; their license comes from the lockfile.
    const lic = licenseOf(name) ?? locked?.license ?? null;
    seen.set(key, lic);
    if (!lic || !allowed(lic)) problems.push(`${key}: ${lic ?? 'no license field'}`);
    walk(node.dependencies);
  }
};
walk(tree.dependencies);

for (const [k, v] of [...seen].sort()) console.log(`  ${k.padEnd(48)} ${v}`);
if (problems.length) {
  console.error(`check:licenses FAIL\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`check:licenses OK — ${seen.size} production packages`);
