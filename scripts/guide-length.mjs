// Prints the AdSense P1 length metric (scripts/lib/guide-length.mjs) of built guides: node scripts/guide-length.mjs [slug ...]
// Without slugs: every guide in dist/guide/. Reads the build output only.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { guideBodyChars } from './lib/guide-length.mjs';

const dir = join(import.meta.dirname, '..', 'dist', 'guide');
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
for (const slug of slugs) {
  const f = join(dir, slug, 'index.html');
  console.log(existsSync(f) ? `${slug}\t${guideBodyChars(readFileSync(f, 'utf8'))}` : `${slug}\t(not built)`);
}
