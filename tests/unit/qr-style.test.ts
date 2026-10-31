// QR1031: colors (WCAG 2.2 relative luminance and contrast ratio, 3:1 block, inverted block), the logo plate (odd,
// centered, never on a finder), the level-H version sweep with an adversarial picture on the plate (jsQR), the styled
// SVG and RGBA, and the default output byte-identical to main (sha256 taken from main 54a080e before the change).
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { QR_MAX_BYTES, QR_MAX_BYTES_H, encodeQr, type QrModules } from '../../src/lib/qr/encode';
import { logoPlate, logoSvg, plateRgba } from '../../src/lib/qr/logo-render';
import { QUIET, qrRgba, qrSvg } from '../../src/lib/qr/render';
import { colorRgba, colorSvg, type QrColors } from '../../src/lib/qr/styled';
import {
  DEFAULT_BG,
  DEFAULT_FG,
  LOGO_MIN_VERSION,
  MIN_CONTRAST,
  SCAN_LUMA_SHARE,
  checkColors,
  contrastRatio,
  luminance,
  parseHex,
  scanLuma,
} from '../../src/lib/qr/style';
import { decodeQrText } from '../helpers/qr-decode';

const sha = (b: string | Uint8ClampedArray): string => createHash('sha256').update(typeof b === 'string' ? b : new Uint8Array(b.buffer, b.byteOffset, b.byteLength)).digest('hex');
const H = (v = LOGO_MIN_VERSION) => ({ ecc: 'H' as const, minVersion: v });
const mods = (text: string, opts?: Parameters<typeof encodeQr>[1]): { modules: QrModules; version: number } => {
  const r = encodeQr(text, opts);
  if (!r.ok) throw new Error(r.code);
  return r;
};
const PNG_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const logo = { dataUrl: PNG_URL, width: 1, height: 1 };

/** #ffXXff on white: the last XX at >= 3:1 (pass) and the next one (fail). */
function ratioBoundary(): { pass: string; fail: string } {
  const c = (g: number): string => `#ff${g.toString(16).padStart(2, '0')}ff`;
  let g = 0;
  while (contrastRatio(c(g + 1), '#ffffff') >= 3) g++;
  return { pass: c(g), fail: c(g + 1) };
}

/** Logo RGBA with every plate module painted as a fg/bg checker (the worst picture), decoded with jsQR. */
function decodeWithChecker(m: QrModules, style: QrColors, px = 4): string | null {
  const { data, width, height } = plateRgba(colorRgba(m, px, style), m.length, px, style.bg);
  const { start, side } = logoPlate(m.length);
  const fg = [parseInt(style.fg.slice(1, 3), 16), parseInt(style.fg.slice(3, 5), 16), parseInt(style.fg.slice(5, 7), 16)];
  for (let my = start; my < start + side; my++) {
    for (let mx = start; mx < start + side; mx++) {
      if ((mx + my) % 2) continue;
      for (let y = (my + QUIET) * px; y < (my + QUIET + 1) * px; y++) {
        for (let x = (mx + QUIET) * px; x < (mx + QUIET + 1) * px; x++) {
          const i = (y * width + x) * 4;
          data[i] = fg[0]!;
          data[i + 1] = fg[1]!;
          data[i + 2] = fg[2]!;
        }
      }
    }
  }
  return decodeQrText(data, width, height);
}

describe('default output is byte-identical to main', () => {
  // [payload, version, sha256(modules JSON), sha256(qrSvg), sha256(qrRgba px 3)] from main 54a080e.
  const MAIN: [string, number, string, string, string][] = [
    ['https://docttak.com/', 2, '3024d649a9b07361ed29011cb4b92450649de76cbeb6feaf5ed97d8c498350bb', '9db94db1b169c16e0208f174de18e2d726d71c43a711250318db2aefab116983', 'b4f660173199632777a25c57bfd7ea0b6716c16a1656dcfd91aabb5e5f44219a'],
    ['홍길동 010-1234-5678', 2, 'b7c668dedf0414d8cebb1f93981d46b76a8009d80c977a42af899fca60887536', '0a7bcbcb7bb446161ac55089584eebf717a04e246b3fae4dbef04f7d0f06e1c3', 'f73a490b51b2a002252a6d6eea6ee50053e11f6ed3a32defad19b8e24ea68154'],
    ['WIFI:T:WPA;S:집;P:a;b;;', 2, '0c2b65287bf4ce19d008d34bf9eb1a02b4988b7e92d8461633ffb39edd22e9e0', 'badf17f13a7358939c14748f46ef4dcb9b6bc5e77f233eba634c1ce813a92c34', '84e3c2bf066a873529d5cea4b37e1a02c8b451105452d6bf7b21576a7650269f'],
    ['😀 문서딱', 1, 'af8e940574aa7492e662c76c3c832d769d4ca550208dc618fc80b2b47ceaa575', '03e71f819705a9e43f452ceb5d9957f0c13f4b1c5e5cfbbfe84c7a64b6c1b583', '1b476502f7206ccdd12398c120bc8f98ae73bd3a6af246fe570f4d2379c4ab4b'],
    ['a'.repeat(413), 16, '9ad42301a1b4da200825a15bbb707138c1044d48e66299e3804d8dcb2666fca3', 'eb364043f82297b8bb060f941f24403a65136f4f50a8a8d003c5166d1e99adc1', '7f37c43eb4f4a4c3d8eb7c55e9c196f6a3bf48f93308a240821222908d069d1e'],
    ['가'.repeat(777), 40, '18520d9c756ce4b3cb7651d15880a8b84f52fd201446984ce59f706b90899677', '6f9b39ebdf2f75b5b10bfcb33615a98776f1d4ac2f0abe69f863ac8b17ab377c', '2ea5e13964fd8127bdf12eff225aaa00aae2306a2dbf40302d2e61ee41d68144'],
  ];
  it('encodeQr(text), qrSvg(m), qrRgba(m, 3) and colorSvg / colorRgba in black on white', () => {
    const plain: QrColors = { fg: DEFAULT_FG, bg: DEFAULT_BG };
    for (const [text, version, m, svg, rgba] of MAIN) {
      const r = mods(text);
      expect(r.version).toBe(version);
      expect(sha(JSON.stringify(r.modules))).toBe(m);
      expect(sha(qrSvg(r.modules))).toBe(svg);
      expect(sha(colorSvg(r.modules, plain))).toBe(svg);
      expect(sha(qrRgba(r.modules, 3).data)).toBe(rgba);
      expect(sha(colorRgba(r.modules, 3, plain).data)).toBe(rgba);
    }
  });
});

describe('colors (WCAG 2.2)', () => {
  it('relative luminance and contrast ratio: black/white 21, #777/#fff ≈ 4.48, symmetric', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 10);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#ffffff', '#777777')).toBe(contrastRatio('#777777', '#ffffff'));
    expect(contrastRatio('#123456', '#123456')).toBe(1);
  });

  it('ok / low / inverted; 3:1 is a threshold, never rounded', () => {
    expect(MIN_CONTRAST).toBe(3);
    expect(checkColors('#000000', '#ffffff')).toBe('ok');
    expect(checkColors('#1a4d8f', '#fff8e1')).toBe('ok');
    expect(checkColors('#ff0000', '#ffffff')).toBe('ok'); // 4.0:1, luma share 0.21
    expect(checkColors('#cccccc', '#ffffff')).toBe('low');
    expect(checkColors('#ffff00', '#ffffff')).toBe('low');
    expect(checkColors('#ffffff', '#000000')).toBe('inverted');
    expect(checkColors('#ffffff', '#ffffff')).toBe('inverted');
    expect(checkColors('#000000', '#000000')).toBe('inverted');
    // #ffXXff on white: the last step at >= 3:1 is ok (its luma share is far under 0.45), the next is under 3:1.
    const { pass, fail } = ratioBoundary();
    expect(contrastRatio(pass, '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(pass, '#ffffff')).toBeLessThan(3.05);
    expect(contrastRatio(fail, '#ffffff')).toBeLessThan(3);
    expect(checkColors(pass, '#ffffff')).toBe('ok');
    expect(checkColors(fail, '#ffffff')).toBe('low');
  });

  it('the luma rule: a gray over 0.45 of the background luma is low even above 3:1 (jsQR loses it in big modules)', () => {
    expect(SCAN_LUMA_SHARE).toBe(0.45);
    expect(scanLuma('#ffffff')).toBeCloseTo(255, 10);
    expect(scanLuma('#000000')).toBe(0);
    // #949494 on white is 3.03:1 but jsQR reads it only at 2 px per module, never at the PNG's 8 px or more.
    expect(contrastRatio('#949494', '#ffffff')).toBeGreaterThan(3);
    expect(checkColors('#949494', '#ffffff')).toBe('low');
    for (const px of [4, 8, 41]) {
      const m = mods('https://docttak.com/qr-code/').modules;
      const p = colorRgba(m, px, { fg: '#949494', bg: '#ffffff' });
      expect(decodeQrText(p.data, p.width, p.height)).toBeNull();
    }
    // The lightest allowed gray on white (#727272, 114 <= 0.45 × 255) and the first blocked one.
    expect(checkColors('#727272', '#ffffff')).toBe('ok');
    expect(checkColors('#737373', '#ffffff')).toBe('low');
  });

  it('the boundary pairs decode with jsQR at 4, 8 and 41 px per module, with and without a logo (checker plate)', () => {
    const text = 'https://docttak.com/qr-code/';
    const plain = mods(text).modules;
    const withLogo = mods(text, H()).modules;
    for (const [fg, bg] of [[ratioBoundary().pass, '#ffffff'], ['#727272', '#ffffff'], ['#1a4d8f', '#fff8e1']] as const) {
      expect(checkColors(fg, bg)).toBe('ok');
      for (const px of [4, 8, 41]) {
        const p = colorRgba(plain, px, { fg, bg });
        expect(decodeQrText(p.data, p.width, p.height)).toBe(text);
        expect(decodeWithChecker(withLogo, { fg, bg }, px)).toBe(text);
      }
    }
  });

  it('random allowed pairs decode (jsQR, 8 and 41 px per module)', () => {
    let seed = 2026;
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const hex = (): string => `#${[0, 0, 0].map(() => Math.floor(rnd() * 256).toString(16).padStart(2, '0')).join('')}`;
    const text = 'https://docttak.com/qr-code/';
    const m = mods(text).modules;
    let n = 0;
    while (n < 60) {
      const fg = hex();
      const bg = hex();
      if (checkColors(fg, bg) !== 'ok') continue;
      n++;
      for (const px of [8, 41]) {
        const p = colorRgba(m, px, { fg, bg });
        expect(decodeQrText(p.data, p.width, p.height), `${fg} on ${bg} at ${px} px`).toBe(text);
      }
    }
  });

  it('a value that is not #rrggbb is the default (never enters the SVG)', () => {
    for (const bad of ['', 'red', '#fff', '#00000g', '#0000000', '"><script>', 'rgb(0,0,0)', null, undefined]) {
      expect(parseHex(bad, DEFAULT_FG)).toBe(DEFAULT_FG);
    }
    expect(parseHex('#1A4D8F', DEFAULT_FG)).toBe('#1a4d8f');
    const m = mods('x').modules;
    const svg = colorSvg(m, { fg: '"/><script>alert(1)</script>', bg: 'url(#x)' });
    expect(svg).toBe(qrSvg(m));
  });

  it('styled SVG and RGBA carry the chosen colors', () => {
    const m = mods('https://docttak.com/').modules;
    const svg = colorSvg(m, { fg: '#1a4d8f', bg: '#fff8e1' });
    expect(svg).toContain('fill="#fff8e1"/>');
    expect(svg).toContain('<path fill="#1a4d8f" d="');
    expect(svg).not.toContain('<image');
    const { data, width, height } = colorRgba(m, 4, { fg: '#1a4d8f', bg: '#fff8e1' });
    expect([...data.slice(0, 4)]).toEqual([0xff, 0xf8, 0xe1, 255]);
    const q = QUIET * 4;
    const i = (q * width + q) * 4;
    expect([...data.slice(i, i + 4)]).toEqual([0x1a, 0x4d, 0x8f, 255]);
    expect(decodeQrText(data, width, height)).toBe('https://docttak.com/');
  });
});

describe('logo', () => {
  it('H cap 1,273 bytes (qrcode.com version 40-H binary); M stays 2,331', () => {
    expect(QR_MAX_BYTES_H).toBe(1273);
    expect(QR_MAX_BYTES).toBe(2331);
    const max = encodeQr('a'.repeat(1273), H());
    expect(max.ok && max.version).toBe(40);
    expect(encodeQr('a'.repeat(1274), H())).toEqual({ ok: false, code: 'tooLong' });
    expect(encodeQr('a'.repeat(1274)).ok).toBe(true);
  });

  it('level H from version 5: a short text is version 5 (37 modules) and decodes', () => {
    const r = mods('hi', H());
    expect(r.version).toBe(5);
    expect(r.modules.length).toBe(37);
    const { data, width, height } = qrRgba(r.modules, 4);
    expect(decodeQrText(data, width, height)).toBe('hi');
    // Level H holds less than M at the same version (version 5: 84 bytes at M, 44 at H).
    expect(mods('a'.repeat(84)).version).toBe(5);
    expect(mods('a'.repeat(44), H()).version).toBe(5);
    expect(mods('a'.repeat(45), H()).version).toBe(6);
  });

  it('plate: largest odd count <= 22 % of the side, centered on the grid, clear of the finders (v1–v40)', () => {
    expect(logoPlate(37)).toEqual({ start: 15, side: 7 });
    expect(logoPlate(177)).toEqual({ start: 70, side: 37 });
    for (let v = LOGO_MIN_VERSION; v <= 40; v++) {
      const n = 17 + 4 * v;
      const { start, side } = logoPlate(n);
      expect(side % 2).toBe(1);
      expect(side).toBeLessThanOrEqual(n * 0.22);
      expect(side + 2).toBeGreaterThan(n * 0.22);
      expect(Number.isInteger(start)).toBe(true);
      expect(start * 2 + side).toBe(n);
      // Finder patterns + separators: 8 modules in from three corners.
      expect(start).toBeGreaterThanOrEqual(8);
      expect(start + side).toBeLessThanOrEqual(n - 8);
      // 3.4 % (version 8) to 4.8 % (version 31) of the symbol, under 0.22² by construction.
      expect((side * side) / (n * n)).toBeLessThanOrEqual(0.0484);
    }
  });

  it('version sweep v5–v40 with a fg/bg checker on the whole plate decodes (jsQR): no version cap needed (D8)', () => {
    const text = 'https://docttak.com/qr-code/';
    const pass: number[] = [];
    for (const v of [5, 7, 10, 15, 20, 25, 30, 35, 40]) {
      const r = mods(text, H(v));
      expect(r.version).toBe(v);
      for (const style of [
        { fg: DEFAULT_FG, bg: DEFAULT_BG },
        { fg: '#1a4d8f', bg: '#fff8e1' },
      ]) {
        if (decodeWithChecker(r.modules, style) !== text) throw new Error(`v${v} ${style.fg}: no decode`);
      }
      pass.push(v);
    }
    expect(pass).toEqual([5, 7, 10, 15, 20, 25, 30, 35, 40]);
  });

  it('a near-full level-H symbol with the checker plate decodes (1,273 bytes, version 40)', () => {
    const text = 'a'.repeat(1273);
    const r = mods(text, H());
    expect(r.version).toBe(40);
    expect(decodeWithChecker(r.modules, { fg: DEFAULT_FG, bg: DEFAULT_BG })).toBe(text);
  });

  it('SVG: exactly one <image> only with a logo, inside a background plate; no modules under the plate in RGBA', () => {
    const m = mods('https://docttak.com/', H()).modules;
    const svg = logoSvg(colorSvg(m, { fg: '#1a4d8f', bg: '#fff8e1' }), m.length, '#fff8e1', logo);
    expect(svg.match(/<image /g)).toHaveLength(1);
    expect(svg).toContain(`<rect x="19" y="19" width="7" height="7" fill="#fff8e1"/><image href="${PNG_URL}" x="20" y="20" width="5" height="5" preserveAspectRatio="xMidYMid meet"/></svg>`);
    expect(colorSvg(m, { fg: '#1a4d8f', bg: '#fff8e1' })).not.toContain('<image');
    // A data URL that is not a base64 PNG never enters the SVG (the plate stays).
    const bad = logoSvg(qrSvg(m), m.length, DEFAULT_BG, { dataUrl: 'data:image/svg+xml,<svg onload=x>', width: 1, height: 1 });
    expect(bad).not.toContain('<image');
    expect(bad).toContain('<rect x="19" y="19" width="7" height="7" fill="#ffffff"/></svg>');
    // A plate color that is not #rrggbb is white.
    expect(logoSvg(qrSvg(m), m.length, '"/><script>', logo)).toContain('<rect x="19" y="19" width="7" height="7" fill="#ffffff"/>');
    const px = 2;
    const { data, width } = plateRgba(qrRgba(m, px), m.length, px, DEFAULT_BG);
    const { start, side } = logoPlate(m.length);
    for (let y = (start + QUIET) * px; y < (start + side + QUIET) * px; y++) {
      for (let x = (start + QUIET) * px; x < (start + side + QUIET) * px; x++) expect(data[(y * width + x) * 4]).toBe(255);
    }
  });
});
