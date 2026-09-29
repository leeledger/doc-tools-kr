import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FIXTURES = join(process.cwd(), 'tests', 'fixtures');
/** Edge-case files generated at test time, outside the repo (never committed). */
export const RUNTIME_DIR = join(tmpdir(), 'anollim-e2e-fixtures');

export const fixturePath = (name: string): string => join(FIXTURES, name);
export const runtimePath = (name: string): string => join(RUNTIME_DIR, `${name}.pdf`);

export const PHOTO_FIXTURES = join(FIXTURES, 'photo');
/** Photo edge-case files generated at test time (tests/fixtures/build-photo.mjs), never committed. */
export const PHOTO_RUNTIME_DIR = join(RUNTIME_DIR, 'photo');
export const photoFixture = (name: string): string => join(PHOTO_FIXTURES, name);
export const photoRuntime = (name: string): string => join(PHOTO_RUNTIME_DIR, name);
