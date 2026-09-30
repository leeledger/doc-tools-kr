// @vitest-environment jsdom
// The vector writer (SPIKE-HWP-DIRECT §6.3, §6.9): rhwp-style SVG → PDF operators, read back with pdf.js.
import { PDFDocument } from '@cantoo/pdf-lib';
import fontkit from '@cantoo/fontkit';
import { describe, expect, it } from 'vitest';
import { SvgPdfWriter, parseTransform, type M } from '../../src/lib/hwp/pdf/svg-to-pdf';
import { parsePageSvg } from '../../src/lib/hwp/svg-dom';
import { FAMILY } from '../../src/lib/hwp/svg-string';
import { pageContent, testFaces } from '../helpers/hwp-pdf';
import { pageTexts } from '../helpers/pdf';

const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';
const SANS = `'${FAMILY.sans}','${FAMILY.fallback}',sans-serif`;
const svgOf = (inner: string, w = 200, h = 100): SVGSVGElement => {
  const p = parsePageSvg(`<svg ${NS} width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`);
  if (!p.svg) throw new Error('did not parse');
  return p.svg;
};

async function write(inner: string, w = 200, h = 100) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit as never);
  const writer = new SvgPdfWriter(doc, testFaces(), null);
  const { page, stats } = await writer.addPage(svgOf(inner, w, h), w, h, { mode: 'full' });
  const content = pageContent(doc, page);
  return { doc, stats, content, bytes: async () => doc.save({ useObjectStreams: true }) };
}

const glyphs = (s: string, x0 = 10, y = 50, extra = ''): string =>
  [...s].map((ch, i) => `<text x="${x0 + i * 8}" y="${y}" font-family="${SANS}" font-size="10"${extra}>${ch}</text>`).join('');

/** The Tm operands of every glyph, in order. */
const tms = (content: string): number[][] => [...content.matchAll(/((?:-?[\d.]+ ){6})Tm/g)].map((m) => m[1]!.trim().split(' ').map(Number));

describe('text', () => {
  it('a synthetic page round-trips exactly, word spaces included', async () => {
    // One run laid out by pen advance (rhwp's own one-glyph <text>s carry their exact x; spacing is not the point).
    const r = await write(`<text x="10" y="50" font-family="${SANS}" font-size="10">보고서 law05</text>`);
    expect(r.stats.missingGlyphs).toBe(0);
    expect(r.stats.unsupported).toEqual([]);
    const [text] = await pageTexts(await r.bytes());
    expect(text!.replace(/\s+/g, ' ').trim()).toBe('보고서 law05');
  });

  it('after an invisible glyph the next glyph is visible: 0 Tr follows 3 Tr', async () => {
    const r = await write(`<text x="10" y="50" font-family="${SANS}" font-size="10" fill-opacity="0">·</text>${glyphs('가', 20)}`);
    const tr = [...r.content.matchAll(/([0-3]) Tr/g)].map((m) => m[1]);
    expect(tr).toEqual(['3', '0']);
    expect(r.stats.invisibleGlyphs).toBe(1);
    expect(r.stats.glyphs).toBe(2);
  });

  it('textLength becomes a horizontal scale', async () => {
    const plain = tms((await write(glyphs('가'))).content)[0]!;
    const wide = tms((await write(glyphs('가', 10, 50, ' textLength="20" lengthAdjust="spacingAndGlyphs"'))).content)[0]!;
    expect(plain[0]).toBe(10);
    // Noto Sans KR 가 advances 0.92 em: 20 / (0.92 × 10) of the font size.
    expect(wide[0]).toBeCloseTo((10 * 20) / 9.2, 2);
    expect(wide[3]).toBe(-10);
  });

  it('text-anchor="middle" shifts by half the run width', async () => {
    const start = tms((await write(glyphs('가', 50))).content)[0]!;
    const mid = tms((await write(glyphs('가', 50, 50, ' text-anchor="middle"'))).content)[0]!;
    expect(start[4]).toBe(50);
    expect(mid[4]).toBeCloseTo(50 - 9.2 / 2, 2);
  });

  it('transform translate()+scale() (장평) and rotate(90,cx,cy) reach the glyph matrix', async () => {
    const t = tms((await write(`<text x="0" y="0" transform="translate(20,30) scale(0.5,1)" font-family="${SANS}" font-size="10">가</text>`)).content)[0]!;
    expect(t).toEqual([5, 0, 0, -10, 20, 30]);
    const r = tms((await write(`<text x="50" y="50" transform="rotate(90,50,50)" font-family="${SANS}" font-size="10">가</text>`)).content)[0]!;
    expect(r.map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 10, 10, 0, 50, 50]);
  });

  it('tspan dx places each character by pen advance', async () => {
    const r = await write(`<text x="10" y="50" font-family="${SANS}" font-size="10"><tspan dx="0 5">ab</tspan></text>`);
    const [a, b] = tms(r.content);
    const advA = b![4]! - a![4]! - 5;
    expect(a![4]).toBe(10);
    expect(advA).toBeGreaterThan(4);
    expect(advA).toBeLessThan(7);
  });

  it('a synthetic bold (a family without a 700 face) strokes the glyph and returns to fill', async () => {
    const r = await write(glyphs('가', 10, 50, ' font-weight="700"'));
    expect(r.content).toMatch(/2 Tr 0\.3 w [\d. ]+RG\n[^\n]*Tj\n0 Tr/);
  });

  it('a private-use code point is skipped and never counted missing', async () => {
    const r = await write(`<text x="10" y="50" font-family="${SANS}" font-size="10">\u{F0124}</text>`);
    expect(r.stats.missingGlyphs).toBe(0);
  });
});

describe('geometry', () => {
  it('path: every command, relative forms and an arc, all finite', async () => {
    const r = await write('<path d="M10 10 L20 10 H30 V20 C30 30 40 30 40 20 S50 10 50 20 Q60 30 70 20 T90 20 A10 5 30 0 1 100 30 m5 5 l5 0 h5 v5 c1 1 2 2 3 3 s1 1 2 2 q1 1 2 2 t2 2 a3 3 0 1 0 5 5 Z" fill="none" stroke="#000"/>');
    expect(r.stats.unsupported).toEqual([]);
    expect(r.content).not.toMatch(/NaN|Infinity/);
    const ops = [...r.content.matchAll(/(?:^| )(m|l|c|h)$/gm)].map((x) => x[1]);
    expect(ops.filter((o) => o === 'm')).toHaveLength(2);
    expect(ops.filter((o) => o === 'c').length).toBeGreaterThanOrEqual(8);
    expect(ops.filter((o) => o === 'h')).toHaveLength(1);
  });

  it('fill-rule="evenodd" fills with f*', async () => {
    const r = await write('<path d="M0 0 H50 V50 H0 Z M10 10 H40 V40 H10 Z" fill="#f00" fill-rule="evenodd"/>');
    expect(r.content).toMatch(/1 0 0 rg\n[\s\S]*f\*\n/);
  });

  it('marker-end draws the marker at the line end, rotated with the line', async () => {
    const r = await write('<defs><marker id="m" viewBox="0 0 10 10" markerWidth="4" markerHeight="4" refX="0" refY="5" orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="#000"/></marker></defs><line x1="10" y1="10" x2="10" y2="60" stroke="#000" stroke-width="2" marker-end="url(#m)"/>');
    expect(r.stats.shapes).toBe(2);
    // The marker tip (10,5) in marker units → 90° rotation at (10,60), scale 2 × 4/10: (10, 60 + 8).
    expect(r.content).toMatch(/10 68 l/);
  });

  it('a nested svg applies its viewBox and clips to its viewport', async () => {
    const r = await write('<svg x="20" y="20" width="40" height="40" viewBox="0 0 10 10"><rect x="0" y="0" width="5" height="5" fill="#00f"/></svg>');
    expect(r.content).toMatch(/q\n20 20 40 40 re\nW n\n/);
    expect(r.content).toMatch(/20 20 m 40 20 l 40 40 l 20 40 l h\n/);
  });

  it('parseTransform composes left to right', () => {
    const m: M = parseTransform('translate(10,20) scale(2)');
    expect(m).toEqual([2, 0, 0, 2, 10, 20]);
  });
});

describe('vocabulary', () => {
  it('an SVG picture (data:image/svg+xml) of supported elements is drawn as vector', async () => {
    const pic = `<svg ${NS} viewBox="0 0 10 10"><rect width="10" height="10" fill="#0f0"/><text x="1" y="8" font-family="바탕" font-size="5"><tspan dx="0 1">가나</tspan></text></svg>`;
    const r = await write(`<image x="10" y="10" width="50" height="50" href="data:image/svg+xml;base64,${Buffer.from(pic).toString('base64')}"/>`);
    expect(r.stats.unsupported).toEqual([]);
    expect(r.stats.images).toBe(1);
    expect(r.stats.glyphs).toBe(2);
    expect(r.content).toMatch(/0 1 0 rg/);
  });

  it('<use> is recorded as unsupported (the page then goes to the raster fallback)', async () => {
    const r = await write('<defs><rect id="r" width="5" height="5"/></defs><use href="#r"/>');
    expect(r.stats.unsupported).toEqual(['use']);
  });

  it('never writes NaN or Infinity: x="NaN" and a degenerate textLength', async () => {
    const r = await write(`<text x="NaN" y="Infinity" font-family="${SANS}" font-size="10" textLength="1e400">가</text><rect x="0" y="0" width="1e400" height="5"/><line x1="0" y1="0" x2="1e999" y2="5" stroke="#000"/>`);
    expect(r.content).not.toMatch(/NaN|Infinity/);
    const bytes = await r.bytes();
    expect(new TextDecoder('latin1').decode(bytes)).not.toMatch(/NaN|Infinity/);
  });
});
