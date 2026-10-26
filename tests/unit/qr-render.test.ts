// CARD1026 C5/C6: renderers keep a 4-module white quiet zone, the SVG path is exactly the encoder matrix, the RGBA
// image decodes (jsQR) to the exact UTF-8 text, and the PNG module size follows max(8, floor(1200 / (n + 8))).
import { describe, expect, it } from 'vitest';
import { encodeQr, type QrModules } from '../../src/lib/qr/encode';
import { PNG_TARGET, QUIET, pngModulePx, qrRgba, qrSvg } from '../../src/lib/qr/render';
import { decodeQrText } from '../helpers/qr-decode';

const modulesOf = (text: string): QrModules => {
  const r = encodeQr(text);
  if (!r.ok) throw new Error(r.code);
  return r.modules;
};

/** Rebuilds the module matrix (quiet zone removed) from the SVG path. */
function svgMatrix(svg: string, n: number): boolean[][] {
  const m = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
  const d = /<path fill="#000" d="([^"]*)"/.exec(svg)![1]!;
  const cmds = d.match(/M\d+ \d+h\d+v1h-\d+z/g) ?? [];
  expect(cmds.join('')).toBe(d);
  for (const c of cmds) {
    const [, x, y, w, back] = /M(\d+) (\d+)h(\d+)v1h-(\d+)z/.exec(c)!.map(Number);
    expect(back).toBe(w);
    for (let i = 0; i < w!; i++) m[y! - QUIET]![x! - QUIET + i] = true;
  }
  return m;
}

describe('qrSvg', () => {
  it('viewBox in modules with the quiet zone, white background, title and role, crisp edges', () => {
    const mods = modulesOf('https://docttak.com/');
    const total = mods.length + 8;
    const svg = qrSvg(mods);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${total} ${total}"`);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('<title>QR 코드</title>');
    expect(svg).toContain(`<rect width="${total}" height="${total}" fill="#fff"/>`);
    expect(svg.match(/<path/g)).toHaveLength(1);
  });

  it('the path is exactly the encoder matrix, nothing drawn in the quiet zone', () => {
    for (const text of ['홍길동', 'a'.repeat(413), 'WIFI:T:WPA;S:x;P:a\\;b;;']) {
      const mods = modulesOf(text);
      expect(svgMatrix(qrSvg(mods), mods.length)).toEqual(mods.map((r) => [...r]));
    }
  });
});

describe('qrRgba', () => {
  it('4 white modules on every side, black and white only', () => {
    const mods = modulesOf('quiet zone');
    const px = 3;
    const { data, width, height } = qrRgba(mods, px);
    expect(width).toBe((mods.length + 8) * px);
    expect(height).toBe(width);
    const q = QUIET * px;
    const at = (x: number, y: number) => data[(y * width + x) * 4]!;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = at(x, y);
        expect(v === 0 || v === 255).toBe(true);
        if (x < q || y < q || x >= width - q || y >= height - q) expect(v).toBe(255);
      }
    }
    // The finder pattern's top-left module is dark, right at the quiet zone edge.
    expect(at(q, q)).toBe(0);
    expect(data[3]).toBe(255);
  });

  it('decodes with jsQR to the exact UTF-8 text (Hangul, emoji, URL, multi-line)', () => {
    for (const text of ['홍길동', '😀 문서딱', 'https://xn--3e0b707e.com/%EA%B0%80', '첫 줄\n둘째 줄']) {
      const { data, width, height } = qrRgba(modulesOf(text), 4);
      expect(decodeQrText(data, width, height)).toBe(text);
    }
  });
});

describe('pngModulePx', () => {
  it('max(8, floor(1200 / (n + 8))): about 1,200 px wide, never wider, 8 px floor for big versions', () => {
    expect(pngModulePx(21)).toBe(41); // version 1: 29 modules → 1,189 px
    expect(pngModulePx(21) * 29).toBeLessThanOrEqual(PNG_TARGET);
    expect(pngModulePx(81)).toBe(13); // version 16
    expect(pngModulePx(177)).toBe(8); // version 40: floor(1200 / 185) = 6 → 8
    for (let v = 1; v <= 40; v++) {
      const n = 17 + 4 * v;
      const s = pngModulePx(n);
      expect(Number.isInteger(s)).toBe(true);
      if (s > 8) expect(s * (n + 8)).toBeLessThanOrEqual(PNG_TARGET);
    }
  });
});
