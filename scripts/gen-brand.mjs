// Prebuild (brief Polish P.10): favicon.ico, the PWA icons and the OG image, drawn with @napi-rs/canvas
// from the same logo as the SVG favicon in Base.astro (a rounded rect with the document-check path).
// Output is deterministic (fixed canvas sizes, no timestamps) and git-ignored: public/favicon.ico and
// public/brand/*. A canvas that fails to load fails the build: the site never ships without icons.
import { createCanvas, GlobalFonts, Path2D } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BRAND = '#0f766e';
export const OG_ALT = '문서딱 — 용량·규격에 딱 맞추는 문서 도구';

const FONT_DIR = join(root, 'node_modules', 'pretendard', 'dist', 'public', 'static');
const FAMILY_BOLD = 'AnolimBrandBold';
const FAMILY_XBOLD = 'AnolimBrandExtraBold';
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const ok =
    GlobalFonts.registerFromPath(join(FONT_DIR, 'Pretendard-Bold.otf'), FAMILY_BOLD) &&
    GlobalFonts.registerFromPath(join(FONT_DIR, 'Pretendard-ExtraBold.otf'), FAMILY_XBOLD);
  if (!ok) throw new Error(`gen-brand: could not register the Pretendard fonts from ${FONT_DIR}`);
  fontsReady = true;
}

// The favicon SVG in Base.astro, in its 32-unit viewBox.
const DOC = 'M10 9h8l4 4v10H10z';
const CHECK = 'M13 18l2.5 2.5L20 16';

/** Draws the 32-unit logo at (x, y) with side `size`: a rounded square in `bg`, the strokes in `ink`. */
function drawLogo(ctx, x, y, size, bg, ink) {
  const s = size / 32;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, 32, 32, 8);
    ctx.fill();
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(DOC));
  ctx.lineCap = 'round';
  ctx.stroke(new Path2D(CHECK));
  ctx.restore();
}

function png(canvas) {
  return canvas.toBuffer('image/png');
}

/** The square icon: the logo edge to edge (transparent corners). */
function icon(size) {
  const c = createCanvas(size, size);
  drawLogo(c.getContext('2d'), 0, 0, size, BRAND, '#ffffff');
  return png(c);
}

/** Maskable icon: full-bleed brand colour, the strokes inside the 80 % safe zone. */
function maskable(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, size, size);
  // The strokes span about 15 × 17 of the 32 units (diagonal ≈ 22.7) around the centre, so at 90 % of the icon
  // their diagonal is ≈ 0.64 of it: well inside the safe circle (diameter 80 %).
  const side = Math.round(size * 0.9);
  drawLogo(ctx, (size - side) / 2, (size - side) / 2, side, null, '#ffffff');
  return png(c);
}

/** 1200×630: logo, "문서딱" and the tagline on the brand colour (the design of the old og.png). */
function og() {
  registerFonts();
  const c = createCanvas(1200, 630);
  const ctx = c.getContext('2d');
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, 1200, 630);
  const left = 96;
  const top = 196;
  drawLogo(ctx, left, top, 120, '#ffffff', BRAND);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.font = `132px ${FAMILY_XBOLD}`;
  ctx.fillText('문서딱', left + 120 + 28, top + 60);
  ctx.textBaseline = 'alphabetic';
  ctx.font = `52px ${FAMILY_BOLD}`;
  ctx.globalAlpha = 0.95;
  ctx.fillText('용량·규격에 딱 맞추는 문서 도구', left, top + 120 + 40 + 52);
  return png(c);
}

/** An ICO container with PNG entries (Vista+ format; every current browser reads it). */
export function buildIco(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

/** Every output, keyed by its path under public/. */
export function renderBrand() {
  return {
    'favicon.ico': buildIco([16, 32, 48].map((size) => ({ size, data: icon(size) }))),
    'brand/apple-touch-icon.png': icon(180),
    'brand/icon-192.png': icon(192),
    'brand/icon-512.png': icon(512),
    'brand/icon-maskable-512.png': maskable(512),
    'brand/og.png': og(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pub = join(root, 'public');
  mkdirSync(join(pub, 'brand'), { recursive: true });
  const out = renderBrand();
  for (const [path, data] of Object.entries(out)) writeFileSync(join(pub, path), data);
  console.log(`gen-brand: ${Object.entries(out).map(([p, d]) => `${p} ${(d.length / 1024).toFixed(1)} KiB`).join(', ')}`);
}
