// Digital Asset Links fingerprints (TWA brief step 2). public/.well-known/assetlinks.json ships with an EMPTY
// sha256_cert_fingerprints list until a real certificate exists; nobody types or invents a fingerprint.
//
//   npm run fingerprint                 Phase A: reads the upload key's SHA-256 with keytool (keystore path and alias
//                                       from twa-manifest.json; password from BUBBLEWRAP_KEYSTORE_PASSWORD, passed to
//                                       keytool as -storepass:env, so it never appears in argv or on disk).
//   npm run fingerprint -- --add <SHA>  Phase B: adds the Play App Signing SHA-256 copied from Play Console
//                                       (앱 무결성 > 앱 서명).
//   --dry-run                           prints the result, writes nothing.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TWA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ASSETLINKS = join(TWA_DIR, '..', 'public', '.well-known', 'assetlinks.json');
export const TWA_MANIFEST = join(TWA_DIR, 'twa-manifest.json');
export const RELATION = 'delegate_permission/common.handle_all_urls';
export const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
export const PASSWORD_ENV = 'BUBBLEWRAP_KEYSTORE_PASSWORD';

/** Uppercase colon-hex; accepts lowercase and the 64-hex form without colons. Throws on anything else. */
export function normalizeFingerprint(input) {
  const hex = String(input).trim().replace(/:/g, '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hex)) throw new Error(`fingerprint: "${input}" is not a SHA-256 certificate fingerprint`);
  return hex.match(/../g).join(':');
}

/** The SHA-256 fingerprint in `keytool -list -v` output. Throws when there is none. */
export function parseKeytool(output) {
  const m = /SHA-?256:\s*((?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2})/.exec(output);
  if (!m) throw new Error('fingerprint: no SHA-256 line in the keytool output');
  return normalizeFingerprint(m[1]);
}

/** A copy of `statements` with `fp` in the statement for `pkg` (created when missing); no duplicates. */
export function addFingerprint(statements, pkg, fp) {
  const value = normalizeFingerprint(fp);
  const out = structuredClone(statements);
  let st = out.find((s) => s.target?.namespace === 'android_app' && s.target.package_name === pkg);
  if (!st) {
    st = { relation: [RELATION], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: [] } };
    out.push(st);
  }
  const list = st.target.sha256_cert_fingerprints;
  if (!list.includes(value)) list.push(value);
  return out;
}

function readKeystoreFingerprint(signingKey) {
  if (process.env[PASSWORD_ENV] === undefined) {
    throw new Error(`fingerprint: set ${PASSWORD_ENV} in this terminal first (see README.md)`);
  }
  const args = ['-list', '-v', '-keystore', signingKey.path, '-alias', signingKey.alias, '-storepass:env', PASSWORD_ENV];
  const r = spawnSync('keytool', args, { encoding: 'utf8' });
  if (r.error) throw new Error(`fingerprint: keytool did not start (${r.error.message}); is the JDK on PATH?`);
  if (r.status !== 0) throw new Error(`fingerprint: keytool failed: ${(r.stderr || r.stdout).trim()}`);
  return parseKeytool(r.stdout);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const argv = process.argv.slice(2);
    const dry = argv.includes('--dry-run');
    const at = argv.indexOf('--add');
    const manifest = JSON.parse(readFileSync(TWA_MANIFEST, 'utf8'));
    const fp = at >= 0 ? normalizeFingerprint(argv[at + 1] ?? '') : readKeystoreFingerprint(manifest.signingKey);
    const next = addFingerprint(JSON.parse(readFileSync(ASSETLINKS, 'utf8')), manifest.packageId, fp);
    const text = `${JSON.stringify(next, null, 2)}\n`;
    if (dry) process.stdout.write(text);
    else writeFileSync(ASSETLINKS, text);
    console.log(`fingerprint: ${fp} ${dry ? '(dry run, nothing written)' : `-> ${ASSETLINKS}`}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
