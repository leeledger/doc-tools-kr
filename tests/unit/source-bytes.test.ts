// Static guard (brief Step 5 §0): no source file carries a C0 control byte other than TAB, LF or CR.
// Root cause of the spike's dead word-boundary regex (a literal 0x08 where "\b" was meant) and of the
// Step 3 NUL byte.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const DIRS = ['src', 'scripts', 'tests'];
const TEXT = /\.(ts|mts|cts|mjs|cjs|js|astro|css|json|html|md|py)$/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return d.name === 'generated' || d.name === 'node_modules' ? [] : files(p);
    return TEXT.test(d.name) ? [p] : [];
  });
}

/** Offsets of C0 control bytes other than TAB (0x09), LF (0x0A) and CR (0x0D). */
export function controlBytes(buf: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) out.push(i);
  }
  return out;
}

describe('source bytes', () => {
  const all = DIRS.flatMap((d) => files(join(ROOT, d)));

  it('scans the source tree', () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it('finds a planted 0x08 and a NUL', () => {
    expect(controlBytes(Uint8Array.from([0x61, 0x08, 0x62, 0x00, 0x09, 0x0a, 0x0d]))).toEqual([1, 3]);
  });

  it('no file under src/, scripts/ or tests/ contains a C0 control byte other than TAB, LF or CR', () => {
    const bad = all
      .map((f) => ({ f: relative(ROOT, f).split('\\').join('/'), at: controlBytes(readFileSync(f)) }))
      .filter((x) => x.at.length > 0)
      .map((x) => `${x.f} @ ${x.at.slice(0, 3).join(',')}`);
    expect(bad).toEqual([]);
  });
});
