// Prints the AdSense P1 length metrics (scripts/lib/guide-length.mjs) of a build. Reads dist/ only.
//   node scripts/guide-length.mjs [slug ...]   guides and hubs (every dist/guide/<slug>/ without slugs), bar GUIDE_MIN_CHARS
//   node scripts/guide-length.mjs --tools       the Korean tool pages (a root page with section.tool), bar TOOL_MIN_CHARS
// A page under its bar prints FAIL; the exit code stays 0 (check-dist gates).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GUIDE_MIN_CHARS, TOOL_MIN_CHARS, guideBodyChars, toolBodyChars } from './lib/guide-length.mjs';

const dist = join(import.meta.dirname, '..', 'dist');
const args = process.argv.slice(2);
const tools = args.includes('--tools');
const dirs = (d) => readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

const line = (key, n, bar) => {
  if (n === null) return `${key}\t(not built)`;
  return `${key}\t${n}\t${n >= bar ? 'ok' : 'FAIL'}`;
};

if (tools) {
  for (const slug of dirs(dist)) {
    const f = join(dist, slug, 'index.html');
    if (!existsSync(f)) continue;
    const html = readFileSync(f, 'utf8');
    if (!html.includes('<section class="tool"')) continue;
    console.log(line(`/${slug}/`, toolBodyChars(html), TOOL_MIN_CHARS));
  }
} else {
  const dir = join(dist, 'guide');
  const slugs = args.filter((a) => !a.startsWith('--'));
  for (const slug of slugs.length ? slugs : dirs(dir)) {
    const f = join(dir, slug, 'index.html');
    console.log(line(slug, existsSync(f) ? guideBodyChars(readFileSync(f, 'utf8')) : null, GUIDE_MIN_CHARS));
  }
}
