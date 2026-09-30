// @vitest-environment jsdom
// DOM post-processing of page SVGs (brief Step 5 test map: svg-dom in jsdom).
import { describe, expect, it } from 'vitest';
import { addSpaces, danglingRefs, dropCellClips, ensureViewBox, fitFillImages, parsePageSvg, sanitize, slimRuns } from '../../src/lib/hwp/svg-dom';

const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';
const parse = (inner: string, attrs = 'width="100" height="200"'): SVGSVGElement => {
  const p = parsePageSvg(`<svg ${NS} ${attrs}>${inner}</svg>`);
  if (!p.svg) throw new Error('did not parse');
  return p.svg;
};

describe('parsePageSvg', () => {
  it('parses an SVG; a parsererror or a non-SVG root is `failed`', () => {
    expect(parsePageSvg(`<svg ${NS}><rect/></svg>`).failed).toBe(false);
    expect(parsePageSvg(`<svg ${NS}><rect></svg>`)).toEqual({ svg: null, failed: true });
    expect(parsePageSvg('<html xmlns="http://www.w3.org/1999/xhtml"/>').failed).toBe(true);
    expect(parsePageSvg('').failed).toBe(true);
  });
});

describe('sanitize', () => {
  it('removes each active element and counts it', () => {
    for (const tag of ['script', 'style', 'foreignObject', 'iframe', 'meta', 'link', 'form', 'object', 'embed', 'animate', 'set', 'animateTransform', 'animateMotion']) {
      const svg = parse(`<g><${tag}/></g><rect/>`);
      expect(sanitize(svg), tag).toBe(1);
      expect(svg.getElementsByTagName(tag).length).toBe(0);
      expect(svg.getElementsByTagName('rect').length).toBe(1);
    }
  });

  it('unwraps <a> keeping its children; drops on* attributes', () => {
    const svg = parse('<a href="https://evil.example/"><text>keep</text></a><rect onclick="x()" onload="y()" fill="red"/>');
    expect(sanitize(svg)).toBe(4);
    expect(svg.getElementsByTagName('a').length).toBe(0);
    expect(svg.getElementsByTagName('text')[0].textContent).toBe('keep');
    const rect = svg.getElementsByTagName('rect')[0];
    expect(rect.getAttribute('onclick')).toBeNull();
    expect(rect.getAttribute('fill')).toBe('red');
  });

  it('keeps #fragments and data:image on <image>; drops blob:, external and non-image data hrefs', () => {
    const svg = parse(
      '<use href="#p0_a"/><use xlink:href="#p0_b"/>' +
        '<image href="data:image/png;base64,iVBORw0KGgo="/><image href="data:image/svg+xml;base64,PHN2Zy8+"/><image href="blob:http://x/1"/>' +
        '<image href="https://evil.example/a.png"/><image xlink:href="javascript:alert(1)"/><use href="data:image/png;base64,AA=="/>',
    );
    expect(sanitize(svg)).toBe(4);
    const hrefs = Array.from(svg.querySelectorAll('image, use')).map((e) => e.getAttribute('href') ?? e.getAttribute('xlink:href'));
    expect(hrefs).toEqual(['#p0_a', '#p0_b', 'data:image/png;base64,iVBORw0KGgo=', 'data:image/svg+xml;base64,PHN2Zy8+', null, null, null, null]);
  });

  it('removes nothing from a clean rhwp-shaped page', () => {
    const svg = parse('<defs><clipPath id="p0_body-clip-3"><rect x="1" y="1" width="9" height="9"/></clipPath></defs><g clip-path="url(#p0_body-clip-3)"><text x="1" y="2" font-family="x">가</text></g>');
    expect(sanitize(svg)).toBe(0);
  });
});

describe('sanitize: elements outside the SVG namespace (Richard round 2, Should Fix 1)', () => {
  const XHTML = 'http://www.w3.org/1999/xhtml';
  it('an XHTML meta refresh is removed', () => {
    const svg = parse(`<g><meta xmlns="${XHTML}" http-equiv="refresh" content="0;url=https://evil.example/"/></g><rect/>`);
    expect(sanitize(svg)).toBe(1);
    expect(svg.getElementsByTagNameNS(XHTML, 'meta').length).toBe(0);
    expect(svg.getElementsByTagName('rect').length).toBe(1);
  });

  it('SVG and XHTML <style> are removed', () => {
    const svg = parse(`<style>body{display:none}</style><g><style xmlns="${XHTML}">body{background:red}</style></g><rect/>`);
    expect(sanitize(svg)).toBe(2);
    expect(svg.getElementsByTagName('style').length).toBe(0);
  });

  it('an XHTML <form> (and whatever it holds) and <link> are removed', () => {
    const svg = parse(`<g><form xmlns="${XHTML}" action="https://evil.example/"><input name="x"/></form><link xmlns="${XHTML}" rel="stylesheet" href="https://evil.example/x.css"/></g>`);
    expect(sanitize(svg)).toBe(2);
    expect(svg.getElementsByTagNameNS(XHTML, '*').length).toBe(0);
  });

  it('a style attribute with an external url() is dropped; a fragment url() stays', () => {
    const svg = parse('<rect style="fill:url(https://evil.example/x.png)"/><rect style="fill:url(#p0_g)"/><rect style="fill:red"/>');
    expect(sanitize(svg)).toBe(1);
    expect(Array.from(svg.querySelectorAll('rect')).map((r) => r.getAttribute('style'))).toEqual([null, 'fill:url(#p0_g)', 'fill:red']);
  });
});

describe('ensureViewBox', () => {
  it('adds viewBox from width/height only when missing', () => {
    const a = parse('');
    expect(ensureViewBox(a)).toBe(true);
    expect(a.getAttribute('viewBox')).toBe('0 0 100 200');
    const b = parse('', 'width="100" height="200" viewBox="0 0 5 5"');
    expect(ensureViewBox(b)).toBe(false);
    expect(b.getAttribute('viewBox')).toBe('0 0 5 5');
    expect(ensureViewBox(parse('', ''))).toBe(false);
  });
});

describe('dropCellClips', () => {
  it('removes cell clips only; body and fill clips stay', () => {
    const svg = parse('<g clip-path="url(#p0_body-clip-3)"><g clip-path="url(#p0_cell-clip-6)"/><g clip-path="url(#p0_fill-clip-1)"/><g clip-path="url(#p0_cell-clip-10)"/></g>');
    expect(dropCellClips(svg)).toBe(2);
    expect(Array.from(svg.querySelectorAll('[clip-path]')).map((g) => g.getAttribute('clip-path'))).toEqual(['url(#p0_body-clip-3)', 'url(#p0_fill-clip-1)']);
  });
});

describe('fitFillImages', () => {
  const page = (w: number, h: number): SVGSVGElement =>
    parse(
      `<defs><clipPath id="p0_fill-clip-1"><rect x="79.4" y="98.3" width="211.8" height="55"/></clipPath></defs>` +
        `<g clip-path="url(#p0_fill-clip-1)"><image x="79.4" y="98.3" width="${w}" height="${h}" preserveAspectRatio="none" href="data:image/png;base64,AA=="/></g>`,
    );
  it('the kr08 shape: a 1211 x 355 logo is fitted into its 211.8 x 55 cell, centred, aspect kept', () => {
    const svg = page(1211, 355);
    expect(fitFillImages(svg)).toBe(1);
    const im = svg.querySelector('image')!;
    expect([im.getAttribute('x'), im.getAttribute('y'), im.getAttribute('width'), im.getAttribute('height'), im.getAttribute('preserveAspectRatio')]).toEqual(['79.4', '98.3', '211.8', '55', 'xMidYMid meet']);
  });
  it('an image within 5 % of its cell is untouched', () => {
    const svg = page(222, 57);
    expect(fitFillImages(svg)).toBe(0);
    expect(svg.querySelector('image')!.getAttribute('width')).toBe('222');
  });
  it('an image outside a fill clip is untouched', () => {
    const svg = parse('<image width="5000" height="5000" href="data:image/png;base64,AA=="/>');
    expect(fitFillImages(svg)).toBe(0);
  });
});

describe('addSpaces', () => {
  it('inserts a space glyph after the glyph before each space, at the run char x; a leading space is skipped', () => {
    const svg = parse('<text x="10" y="20" font-family="f">가</text><text x="20" y="20" font-family="f">나</text><text x="40" y="20" font-family="f">다</text>');
    const runs = slimRuns([{ text: ' 가나 다', x: 5, y: 8, h: 12, charX: [0, 5, 15, 25, 35, 45], fontFamily: 'f' }]);
    const added = addSpaces(svg, runs);
    expect(added).toBe(1);
    const texts = Array.from(svg.querySelectorAll('text'));
    expect(texts.map((t) => t.textContent)).toEqual(['가', '나', ' ', '다']);
    expect(texts[2].getAttribute('x')).toBe('30');
    expect(texts[2].getAttribute('font-family')).toBe('f');
    expect(texts[2].getAttribute('xml:space')).toBe('preserve');
  });

  it('a glyph farther than 0.75 px from the run x is not an anchor', () => {
    const svg = parse('<text x="11" y="20">가</text><text x="30" y="20">나</text>');
    expect(addSpaces(svg, [{ text: '가 나', x: 10, y: 8, h: 12, charX: [0, 10, 20, 30] }])).toBe(0);
  });

  it('slimRuns keeps only runs with a space and the fields addSpaces reads', () => {
    expect(slimRuns([{ text: 'ab', x: 1, y: 1, h: 1, charX: [0] }, { text: 'a b', x: 1, y: 2, h: 3, charX: [0, 1, 2, 3], bold: true }, null, 'x'])).toEqual([{ text: 'a b', x: 1, y: 2, h: 3, charX: [0, 1, 2, 3] }]);
    expect(slimRuns(undefined)).toEqual([]);
  });
});

describe('danglingRefs', () => {
  it('counts url(#…) and href="#…" targets that do not exist', () => {
    const svg = parse('<clipPath id="a"/><g clip-path="url(#a)"/><g clip-path="url(#missing)"/><use href="#gone"/>');
    expect(danglingRefs(svg)).toBe(2);
  });
});
