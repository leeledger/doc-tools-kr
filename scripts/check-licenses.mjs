// License gate: every production dependency and every component compiled into a shipped package
// (licenses.manifest.json `component` entries) must use an allowlisted license. GPL/MPL of any kind fails,
// except the explicit EXCEPTIONS below (brief Step 4 "Licenses", Arch decision).
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { autoframeOn } from './lib/autoframe.mjs';
import { publicEnv } from './lib/dist.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ALLOW = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'Zlib', 'IJG', 'OFL-1.1']);
/** SPDX license exceptions that only add permissions (`X WITH e` is allowed when X is). */
export const ALLOW_WITH = new Set(['LLVM-exception']);
export const FORBIDDEN = /GPL|MPL/i;

/**
 * The only licenses outside the allowlist that may ship, each limited to one component and one scope.
 * Eigen (MPL-2.0, file-level copyleft) is allowed only as unmodified upstream code compiled into the
 * @mediapipe/tasks-vision wasm (Arch, 2026-09-29). Any other GPL/MPL match still fails.
 */
export const EXCEPTIONS = [{ component: 'Eigen', license: 'MPL-2.0', scope: 'vendor/mediapipe wasm', decided: '2026-09-29' }];

export function allowed(expr) {
  if (FORBIDDEN.test(expr)) return false;
  const clean = expr.replace(/[()]/g, ' ').trim();
  const idOk = (id) => {
    const [base, exception] = id.trim().split(/\s+WITH\s+/i);
    return ALLOW.has(base.trim()) && (exception === undefined || ALLOW_WITH.has(exception.trim()));
  };
  // "A OR B": one allowed alternative is enough; "A AND B": all must be allowed.
  return clean.split(/\s+OR\s+/i).some((alt) => alt.split(/\s+AND\s+/i).every(idOk));
}

/**
 * Problems among the manifest's compiled-in components. `autoframe` entries (MediaPipe) are judged only when
 * they ship. An exception matches on the exact component name and license.
 */
export function componentProblems(manifest, { autoframe, exceptions = EXCEPTIONS }) {
  const problems = [];
  const used = [];
  for (const e of manifest.packages) {
    if (!e.component || (e.autoframe && !autoframe)) continue;
    if (allowed(e.license)) continue;
    const ex = exceptions.find((x) => x.component === e.component && x.license === e.license);
    if (ex) used.push(ex);
    else problems.push(`${e.component} ${e.version}: ${e.license}`);
  }
  return { problems, used };
}

function npmProblems() {
  let tree;
  try {
    tree = JSON.parse(execSync('npm ls --omit=dev --all --json', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }));
  } catch (err) {
    // npm ls exits non-zero on extraneous/missing optional entries but still prints the tree.
    tree = JSON.parse(err.stdout);
  }
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages ?? {};
  const licenseOf = (name) => {
    const p = join(root, 'node_modules', ...name.split('/'), 'package.json');
    if (!existsSync(p)) return null;
    const pkg = JSON.parse(readFileSync(p, 'utf8'));
    if (typeof pkg.license === 'string') return pkg.license;
    if (pkg.license?.type) return pkg.license.type;
    if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ');
    return null;
  };
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
  return { seen, problems };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { seen, problems } = npmProblems();
  for (const [k, v] of [...seen].sort()) console.log(`  ${k.padEnd(48)} ${v}`);
  const manifest = JSON.parse(readFileSync(join(root, 'licenses.manifest.json'), 'utf8'));
  const autoframe = autoframeOn(publicEnv().PUBLIC_ID_PHOTO_AUTOFRAME);
  const comp = componentProblems(manifest, { autoframe });
  const components = manifest.packages.filter((e) => e.component && (!e.autoframe || autoframe));
  for (const e of components) console.log(`  [component] ${`${e.component} ${e.version}`.padEnd(36)} ${e.license}`);
  for (const x of comp.used) console.log(`  exception: ${x.component} ${x.license} (scope ${x.scope}, decided ${x.decided})`);
  const all = [...problems, ...comp.problems];
  if (all.length) {
    console.error(`check:licenses FAIL\n  ${all.join('\n  ')}`);
    process.exit(1);
  }
  console.log(
    `check:licenses OK — ${seen.size} production packages, ${components.length} compiled-in components, ${comp.used.length} exception(s)${autoframe ? '' : ' (auto-framing off: MediaPipe not shipped)'}`,
  );
}
