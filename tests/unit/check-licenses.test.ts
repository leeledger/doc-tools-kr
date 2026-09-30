// check-licenses (brief Step 4 "Licenses"): the one Eigen exception passes; any other MPL/GPL still fails.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXCEPTIONS, allowed, componentProblems } from '../../scripts/check-licenses.mjs';

const manifest = JSON.parse(readFileSync(join(__dirname, '..', '..', 'licenses.manifest.json'), 'utf8'));
type Entry = { component?: string; name?: string; license?: string; version?: string; autoframe?: boolean };
const withEntry = (e: Entry) => ({ packages: [...manifest.packages, e] });

describe('check-licenses', () => {
  it('has exactly one exception: Eigen MPL-2.0 in the MediaPipe wasm', () => {
    expect(EXCEPTIONS).toEqual([{ component: 'Eigen', license: 'MPL-2.0', scope: 'vendor/mediapipe wasm', decided: '2026-09-29' }]);
  });

  it('the listed Eigen entry passes', () => {
    const eigen = manifest.packages.filter((e: Entry) => e.component === 'Eigen');
    expect(eigen).toHaveLength(1);
    const r = componentProblems({ packages: eigen }, { autoframe: true });
    expect(r.problems).toEqual([]);
    expect(r.used).toEqual(EXCEPTIONS);
  });

  it('an unlisted MPL entry fails, even next to Eigen', () => {
    const r = componentProblems(withEntry({ component: 'Other', version: '1', license: 'MPL-2.0' }), { autoframe: true });
    expect(r.problems).toContain('Other 1: MPL-2.0');
    const renamed = componentProblems({ packages: [{ component: 'Eigen3', version: '1', license: 'MPL-2.0' }] }, { autoframe: true });
    expect(renamed.problems).toEqual(['Eigen3 1: MPL-2.0']);
    const gpl = componentProblems({ packages: [{ component: 'Eigen', version: '1', license: 'LGPL-3.0' }] }, { autoframe: true });
    expect(gpl.problems).toEqual(['Eigen 1: LGPL-3.0']);
  });

  it('MediaPipe entries are judged only when they ship', () => {
    const off = componentProblems(manifest, { autoframe: false });
    expect(off).toEqual({ problems: [], used: [] });
  });

  it('SPDX expressions: OR, AND, WITH', () => {
    expect(allowed('MIT OR NCSA')).toBe(true);
    expect(allowed('Apache-2.0 WITH LLVM-exception')).toBe(true);
    expect(allowed('GPL-2.0 WITH Classpath-exception-2.0')).toBe(false);
    expect(allowed('MIT WITH Unknown-exception')).toBe(false);
    expect(allowed('IJG AND BSD-3-Clause AND Zlib')).toBe(true);
    expect(allowed('MPL-2.0 OR MIT')).toBe(false);
    expect(allowed('LicenseRef-Ooura')).toBe(false);
  });
});
