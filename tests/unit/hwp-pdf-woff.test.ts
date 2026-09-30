// WOFF 1.0 → SFNT for the PDF fonts (SPIKE-HWP-DIRECT §6.9).
import { readFileSync } from 'node:fs';
import fontkit from '@cantoo/fontkit';
import { describe, expect, it } from 'vitest';
import { woffToSfnt } from '../../src/lib/hwp/pdf/woff';
import { FB_SANS_WOFF } from '../helpers/hwp-pdf';

type Font = { numGlyphs: number; hasGlyphForCodePoint(cp: number): boolean };

describe('woffToSfnt', () => {
  it('the committed fb-sans.woff unwraps to a font fontkit parses: same glyph count, maps U+2024', () => {
    const woff = new Uint8Array(readFileSync(FB_SANS_WOFF));
    const sfnt = woffToSfnt(woff);
    expect([0x00010000, 0x4f54544f]).toContain(new DataView(sfnt.buffer).getUint32(0));
    const fromSfnt = fontkit.create(sfnt as never) as unknown as Font;
    const fromWoff = fontkit.create(woff as never) as unknown as Font;
    expect(fromSfnt.numGlyphs).toBe(fromWoff.numGlyphs);
    expect(fromSfnt.numGlyphs).toBeGreaterThan(100);
    expect(fromSfnt.hasGlyphForCodePoint(0x2024)).toBe(true);
  });

  it('a bad signature or a truncated file throws', () => {
    const woff = new Uint8Array(readFileSync(FB_SANS_WOFF));
    const bad = woff.slice();
    bad[0] = 0;
    expect(() => woffToSfnt(bad)).toThrow('not WOFF');
    expect(() => woffToSfnt(woff.subarray(0, 40))).toThrow();
    expect(() => woffToSfnt(woff.subarray(0, 2000))).toThrow();
  });
});
