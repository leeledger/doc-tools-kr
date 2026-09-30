// Routing and limits (brief Step 5 §3.4): every boundary on both devices, the reason order, guard combinations.
import { describe, expect, it } from 'vitest';
import { LIMITS, MB_DEC, MIB, overHardLimit } from '../../src/lib/hwp/limits';
import { route, type RouteInput } from '../../src/lib/hwp/route';
import type { Device } from '../../src/lib/ui/device';

const base = (device: Device): RouteInput => ({ device, fileBytes: 1000, pages: 10, wasmBytes: 8 * MIB, imageBytes: 0, equations: 0, textboxes: 0 });

describe('limits', () => {
  it('the brief numbers', () => {
    expect(LIMITS.desktop).toEqual({ hardBytes: 150 * MB_DEC, capBytes: 80 * MB_DEC, capPages: 300, capWasmBytes: 1024 * MIB, capImageBytes: 60 * MB_DEC });
    expect(LIMITS.mobile).toEqual({ hardBytes: 25 * MB_DEC, capBytes: 10 * MB_DEC, capPages: 60, capWasmBytes: 256 * MIB, capImageBytes: 8 * MB_DEC });
  });

  it.each(['desktop', 'mobile'] as Device[])('hard limit on %s: at the limit ok, one byte above too large', (d) => {
    expect(overHardLimit(d, LIMITS[d].hardBytes)).toBe(false);
    expect(overHardLimit(d, LIMITS[d].hardBytes + 1)).toBe(true);
  });
});

describe('route', () => {
  it.each(['desktop', 'mobile'] as Device[])('caps on %s: the value at the limit converts, one above is viewer-only', (d) => {
    const l = LIMITS[d];
    const cases: [keyof RouteInput, number, string][] = [
      ['fileBytes', l.capBytes, 'bytes'],
      ['pages', l.capPages, 'pages'],
      ['wasmBytes', l.capWasmBytes, 'wasm'],
      ['imageBytes', l.capImageBytes, 'images'],
    ];
    for (const [field, limit, kind] of cases) {
      const at = route({ ...base(d), [field]: limit });
      // pages at the cap may still be ≥ 100 (guard), but never viewer-only
      expect(at.mode, `${field} at the limit`).not.toBe('viewer-only');
      const over = route({ ...base(d), [field]: limit + 1 });
      expect(over.mode, `${field} over`).toBe('viewer-only');
      expect(over.reasons[0]).toEqual({ kind, limit, value: limit + 1 });
    }
  });

  it('guard: pages 99 converts, 100 is viewer-first; equations 1; text boxes 2 converts, 3 is viewer-first', () => {
    expect(route({ ...base('desktop'), pages: 99 }).mode).toBe('convert');
    expect(route({ ...base('desktop'), pages: 100 })).toEqual({ mode: 'viewer-first', reasons: [{ kind: 'long', value: 100 }] });
    expect(route({ ...base('desktop'), equations: 1 })).toEqual({ mode: 'viewer-first', reasons: [{ kind: 'equations', value: 1 }] });
    expect(route({ ...base('desktop'), textboxes: 2 }).mode).toBe('convert');
    expect(route({ ...base('desktop'), textboxes: 3 })).toEqual({ mode: 'viewer-first', reasons: [{ kind: 'textboxes', value: 3 }] });
    expect(route({ ...base('mobile'), pages: 60, equations: 0 }).mode).toBe('convert');
  });

  it('reason order: caps in table order, then equations, text boxes, long; caps win over the guard', () => {
    const r = route({ device: 'mobile', fileBytes: 11 * MB_DEC, pages: 128, wasmBytes: 300 * MIB, imageBytes: 9 * MB_DEC, equations: 2, textboxes: 5 });
    expect(r.mode).toBe('viewer-only');
    expect(r.reasons.map((x) => x.kind)).toEqual(['bytes', 'pages', 'wasm', 'images', 'equations', 'textboxes', 'long']);
    const g = route({ ...base('desktop'), pages: 128, equations: 3, textboxes: 4 });
    expect(g.mode).toBe('viewer-first');
    expect(g.reasons.map((x) => x.kind)).toEqual(['equations', 'textboxes', 'long']);
  });

  it('adm28 (128 p, 1 equation, 10 text boxes): viewer-first on desktop, viewer-only on mobile', () => {
    const adm28 = { fileBytes: 238_366, pages: 128, wasmBytes: 30 * MIB, imageBytes: 41 * 1024, equations: 1, textboxes: 10 };
    expect(route({ device: 'desktop', ...adm28 }).mode).toBe('viewer-first');
    expect(route({ device: 'mobile', ...adm28 }).mode).toBe('viewer-only');
  });
});
