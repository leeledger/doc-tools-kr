import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FIXTURES = join(process.cwd(), 'tests', 'fixtures');
/** Edge-case files generated at test time, outside the repo (never committed). */
export const RUNTIME_DIR = join(tmpdir(), 'anollim-e2e-fixtures');

export const fixturePath = (name: string): string => join(FIXTURES, name);
export const runtimePath = (name: string): string => join(RUNTIME_DIR, `${name}.pdf`);
