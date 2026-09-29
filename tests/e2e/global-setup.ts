import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeBigFixture, makeRuntimeFixtures } from '../fixtures/build.mjs';
import { RUNTIME_DIR } from './paths';

export default async function globalSetup(): Promise<void> {
  if (!existsSync(join(process.cwd(), 'dist', 'index.html'))) {
    throw new Error('e2e runs against the production build. Run `npm run build` first.');
  }
  await makeRuntimeFixtures(RUNTIME_DIR);
  await makeBigFixture(RUNTIME_DIR, 51);
}
