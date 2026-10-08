// Writes scripts/lib/guide-titles.json ({ slug: title } of published guides and hubs) for the /admin/ tables and the
// weekly report, which run without the content collection (Pages Function, ops script). Run after adding or
// renaming a guide: `node scripts/gen-guide-titles.mjs`. tests/unit/visits.test.ts fails when it is stale.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, isMain } from './ops/lib/common.mjs';
import { guideTitles } from './ops/lib/guides.mjs';

export const serialize = (titles) => `${JSON.stringify(titles, null, 2)}\n`;

if (isMain(import.meta)) {
  const titles = guideTitles();
  writeFileSync(join(ROOT, 'scripts', 'lib', 'guide-titles.json'), serialize(titles));
  console.log(`gen-guide-titles: wrote ${Object.keys(titles).length} titles to scripts/lib/guide-titles.json`);
}
