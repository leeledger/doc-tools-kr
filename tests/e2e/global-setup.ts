import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeBigFixture, makeRuntimeFixtures, makeScanMultiFixture } from '../fixtures/build.mjs';
import { makePhotoRuntimeFixtures } from '../fixtures/build-photo.mjs';
import { PHOTO_RUNTIME_DIR, RUNTIME_DIR } from './paths';
import { makeHwpRuntimeFixtures, makeHwpxRuntimeFixtures } from './hwp-fixtures';

export default async function globalSetup(): Promise<void> {
  if (!existsSync(join(process.cwd(), 'dist', 'index.html'))) {
    throw new Error('e2e runs against the production build. Run `npm run build` first.');
  }
  await makeRuntimeFixtures(RUNTIME_DIR);
  await makeBigFixture(RUNTIME_DIR, 51);
  await makeBigFixture(RUNTIME_DIR, 21);
  // 목표 용량 (Polish P.13): 24 pages hit 1 MB at rung 3; 40 pages cannot reach 0.5 MB (smallest ≈ 532 KB).
  await makeScanMultiFixture(RUNTIME_DIR, 24);
  await makeScanMultiFixture(RUNTIME_DIR, 40);
  // A text file for the non-PDF checks (Polish P.15).
  writeFileSync(join(RUNTIME_DIR, 'notes.txt'), '회의 메모: PDF가 아닌 파일입니다.\n');
  await makePhotoRuntimeFixtures(PHOTO_RUNTIME_DIR);
  makeHwpRuntimeFixtures();
  await makeHwpxRuntimeFixtures();
}
