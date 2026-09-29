// Postbuild (brief Polish P.2): deploy carry-forward of hashed assets, zero backend.
//
// A tab opened before a deploy still asks for the previous deploy's chunks, workers and wasm. Cloudflare
// Pages serves only the new deploy, so those requests would 404. On the CF builder this script fetches the
// live /deploy-manifest.json and copies the previous deploys' immutable files (_astro/, vendor/, fonts/)
// into dist/, verified by SHA-256. It always writes the new dist/deploy-manifest.json (P.1 and P.3 read it).
//
// - Enabled only when CF_PAGES=1 or CARRY_ASSETS=1 (local, CI and e2e builds are unchanged). The source is
//   CARRY_FROM, else PUBLIC_SITE_URL, else https://doc-tools-kr.pages.dev.
// - Retention: a file missing from the fresh build is carried while currentGen − gen ≤ 2 (the last two
//   deploys). A carried file keeps its gen; it never overwrites a fresh file.
// - Integrity: path allowlist; each download's length must equal the manifest's and its SHA-256 must match;
//   at most 400 files / 60 MB per build (declared and actually downloaded), < 25 MiB per file; the
//   manifest itself is refused above 1 MB.
// - Fails open: an unreachable manifest, a network error or the 60 s total timeout logs
//   `carry: skipped (<reason>)` and the build still succeeds. This is the only place the build continues
//   after a network error, and it is logged, never silent.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { distDir, publicEnv, readBuildId, walkFiles } from './lib/dist.mjs';

export const IMMUTABLE = /^(_astro|vendor|fonts)\//;
export const PATH_RE = /^(_astro|vendor|fonts)\/[A-Za-z0-9._@/-]+$/;
export const KEEP_GENERATIONS = 2;
export const MAX_FILES = 400;
export const MAX_BYTES = 60 * 1024 * 1024;
export const MAX_FILE_BYTES = 25 * 1024 * 1024 - 1;
export const TIMEOUT_MS = 60_000;
/** The live manifest is refused above this size (it lists a few hundred paths; ~60 KB today). */
export const MAX_MANIFEST_BYTES = 1024 * 1024;
export const DEFAULT_SOURCE = 'https://doc-tools-kr.pages.dev';
const PARALLEL = 6;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** A safe relative path under the immutable folders: no `..`, no empty segment, no absolute path. */
export function safePath(p) {
  return typeof p === 'string' && PATH_RE.test(p) && !p.split('/').some((s) => s === '..' || s === '.' || s === '');
}

/** The fresh build's immutable files with their hashes. */
function freshFiles(dist) {
  const out = {};
  for (const f of walkFiles(dist)) {
    if (!IMMUTABLE.test(f.path)) continue;
    const buf = readFileSync(join(dist, f.path));
    out[f.path] = { sha256: sha256(buf), bytes: buf.length };
  }
  return out;
}

function validManifest(m) {
  return m && typeof m === 'object' && Number.isInteger(m.gen) && m.gen > 0 && m.files && typeof m.files === 'object';
}

/**
 * Builds dist/deploy-manifest.json and, when enabled, carries the previous deploys' files into `dist`.
 * Resolves to { manifest, carried, skipped, reason } and never rejects on a network problem.
 */
export async function carryAssets({ dist, enabled, source, fetchImpl = fetch, timeoutMs = TIMEOUT_MS, maxFiles = MAX_FILES, maxBytes = MAX_BYTES, log = console.log }) {
  const build = readBuildId(dist);
  const fresh = freshFiles(dist);
  const files = {};
  const carried = [];
  const skipped = [];
  let gen = 1;
  let reason = null;

  if (!enabled) {
    reason = 'disabled (not CF_PAGES=1 or CARRY_ASSETS=1)';
  } else {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const base = source.replace(/\/+$/, '');
    try {
      let prev = null;
      try {
        const res = await fetchImpl(`${base}/deploy-manifest.json`, { signal: ctrl.signal, cache: 'no-store' });
        const declared = Number(res.headers?.get?.('content-length') ?? 0);
        if (!res.ok) reason = `no live manifest (HTTP ${res.status})`;
        else if (declared > MAX_MANIFEST_BYTES) reason = `the live manifest is over ${MAX_MANIFEST_BYTES} bytes`;
        else {
          const raw = Buffer.from(await res.arrayBuffer());
          let m = null;
          if (raw.length > MAX_MANIFEST_BYTES) reason = `the live manifest is over ${MAX_MANIFEST_BYTES} bytes`;
          else {
            try {
              m = JSON.parse(raw.toString('utf8'));
            } catch {
              m = null;
            }
            if (validManifest(m)) prev = m;
            else reason = 'the live manifest is not valid';
          }
        }
      } catch (err) {
        reason = ctrl.signal.aborted ? 'timeout' : `manifest unreachable: ${err instanceof Error ? err.message : err}`;
      }
      if (prev) {
        gen = prev.gen + 1;
        const queue = [];
        let bytes = 0;
        for (const [path, e] of Object.entries(prev.files)) {
          if (fresh[path]) continue; // never overwrite a fresh file
          if (!safePath(path)) {
            skipped.push(`${path}: path not allowed`);
            continue;
          }
          if (!e || !Number.isInteger(e.gen) || typeof e.sha256 !== 'string' || !Number.isInteger(e.bytes)) {
            skipped.push(`${path}: bad manifest entry`);
            continue;
          }
          if (gen - e.gen > KEEP_GENERATIONS) continue; // older than the last two deploys
          if (e.bytes > MAX_FILE_BYTES) {
            skipped.push(`${path}: ${e.bytes} bytes is over the per-file limit`);
            continue;
          }
          if (queue.length >= maxFiles || bytes + e.bytes > maxBytes) {
            skipped.push(`${path}: over the carry cap (${maxFiles} files / ${Math.round(maxBytes / 1048576)} MB)`);
            continue;
          }
          bytes += e.bytes;
          queue.push([path, e]);
        }
        let downloaded = 0;
        const worker = async () => {
          for (let item = queue.shift(); item; item = queue.shift()) {
            const [path, e] = item;
            if (ctrl.signal.aborted) {
              skipped.push(`${path}: timeout`);
              continue;
            }
            try {
              const res = await fetchImpl(`${base}/${path}`, { signal: ctrl.signal });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const declaredLength = res.headers?.get?.('content-length');
              if (declaredLength !== null && declaredLength !== undefined && !res.headers.get('content-encoding') && Number(declaredLength) !== e.bytes) {
                throw new Error(`length ${declaredLength} is not the manifest's ${e.bytes}`);
              }
              const buf = Buffer.from(await res.arrayBuffer());
              // The manifest is not trusted for sizes: the bytes actually received count against the caps.
              if (buf.length !== e.bytes) throw new Error(`length ${buf.length} is not the manifest's ${e.bytes}`);
              if (downloaded + buf.length > maxBytes) throw new Error(`over the carry cap (${Math.round(maxBytes / 1048576)} MB downloaded)`);
              downloaded += buf.length;
              if (sha256(buf) !== e.sha256) throw new Error('SHA-256 mismatch');
              const target = join(dist, ...path.split('/'));
              mkdirSync(dirname(target), { recursive: true });
              writeFileSync(target, buf);
              files[path] = { sha256: e.sha256, bytes: buf.length, gen: e.gen };
              carried.push(path);
            } catch (err) {
              skipped.push(`${path}: ${ctrl.signal.aborted ? 'timeout' : err instanceof Error ? err.message : err}`);
            }
          }
        };
        await Promise.all(Array.from({ length: PARALLEL }, worker));
        if (ctrl.signal.aborted) reason = 'timeout';
      }
    } finally {
      clearTimeout(timer);
    }
  }

  for (const [path, e] of Object.entries(fresh)) files[path] = { ...e, gen };
  const manifest = { build, gen, generatedAt: new Date().toISOString(), files };
  writeFileSync(join(dist, 'deploy-manifest.json'), `${JSON.stringify(manifest)}\n`);
  for (const s of skipped) log(`carry: warning: skipped ${s}`);
  if (reason) log(`carry: skipped (${reason})`);
  log(`carry: gen ${gen}, ${Object.keys(fresh).length} fresh file(s), ${carried.length} carried, build ${build}`);
  return { manifest, carried, skipped, reason };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const enabled = process.env.CF_PAGES === '1' || process.env.CARRY_ASSETS === '1';
  const source = process.env.CARRY_FROM || publicEnv().PUBLIC_SITE_URL || DEFAULT_SOURCE;
  await carryAssets({ dist: distDir(), enabled, source });
}
