// Postbuild, first (owner 2026-10-08): writes dist/ga.js, the Google Analytics 4 loader, when PUBLIC_GA_ID is set
// (scripts/lib/ga.mjs); unset, makes sure no dist/ga.js ships. An invalid ID writes nothing: check-dist then fails
// the build with the reason.
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { distDir, publicEnv } from './lib/dist.mjs';
import { GA_ID_RE, loaderSource } from './lib/ga.mjs';

const file = join(distDir(), 'ga.js');
const id = (publicEnv().PUBLIC_GA_ID ?? '').trim();
if (id && GA_ID_RE.test(id)) {
  writeFileSync(file, loaderSource(id));
  console.log(`gen-ga: ga.js for ${id}`);
} else {
  if (existsSync(file)) rmSync(file);
  console.log(id ? 'gen-ga: PUBLIC_GA_ID is not valid, no ga.js (check-dist reports it)' : 'gen-ga: PUBLIC_GA_ID not set, no ga.js');
}
