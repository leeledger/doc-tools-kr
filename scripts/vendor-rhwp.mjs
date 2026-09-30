// Prebuild (brief Step 5 §1): vendors the rhwp WebAssembly engine (@rhwp/core, MIT) into
// public/vendor/rhwp/<version>/rhwp_bg.wasm (git-ignored, served as immutable) and writes
// src/generated/rhwp.json ({version, bytes, sha256}); the worker's progress bar divides by `bytes`.
// The wasm must match the SHA-256 pinned below, or the build fails.
//
// Every rhwp upgrade re-runs `npm run regress:hwp` on the full 120-file corpus before merge
// (CORPUS_DIR=spikes/hwp/corpus), then updates RHWP_VERSION and RHWP_SHA256 here together.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RHWP_VERSION = '0.8.6';
/** SHA-256 of node_modules/@rhwp/core/rhwp_bg.wasm 0.8.6, computed once from the installed file (2026-09-30). */
export const RHWP_SHA256 = '8000e4ce320b7994dca6bcd58be0c862144c7b805576504e523a420439da658b';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', '@rhwp', 'core');
const installed = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
if (installed !== RHWP_VERSION) throw new Error(`vendor-rhwp: @rhwp/core is ${installed}, expected ${RHWP_VERSION}`);

const wasm = readFileSync(join(pkgDir, 'rhwp_bg.wasm'));
const sha256 = createHash('sha256').update(wasm).digest('hex');
if (sha256 !== RHWP_SHA256) {
  console.error(`vendor-rhwp: FAIL rhwp_bg.wasm SHA-256 ${sha256} does not match the pinned ${RHWP_SHA256}`);
  process.exit(1);
}

rmSync(join(root, 'public', 'vendor', 'rhwp'), { recursive: true, force: true });
const out = join(root, 'public', 'vendor', 'rhwp', RHWP_VERSION, 'rhwp_bg.wasm');
mkdirSync(dirname(out), { recursive: true });
copyFileSync(join(pkgDir, 'rhwp_bg.wasm'), out);

const gen = join(root, 'src', 'generated');
mkdirSync(gen, { recursive: true });
writeFileSync(join(gen, 'rhwp.json'), `${JSON.stringify({ version: RHWP_VERSION, bytes: wasm.length, sha256 })}\n`);
console.log(`vendor-rhwp: @rhwp/core ${RHWP_VERSION}, rhwp_bg.wasm ${(wasm.length / 1048576).toFixed(2)} MiB, SHA-256 OK`);
