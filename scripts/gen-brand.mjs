// Prebuild (brief Polish P.10): favicon.ico, the PWA icons and the OG image, drawn with @napi-rs/canvas
// from the same logo as the SVG favicon in Base.astro (a rounded rect with the document-check path).
// Output is deterministic (fixed canvas sizes, no timestamps) and git-ignored: public/favicon.ico and
// public/brand/*. A canvas that fails to load fails the build: the site never ships without icons.
import { createCanvas, GlobalFonts, Path2D } from '@napi-rs/canvas';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The repository root. When the guide share images import these helpers, Astro bundles this file into
// dist/.prerender, where the relative path no longer points at the repository: the build runs from the root.
const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = existsSync(join(here, 'src', 'data', 'og.json')) ? here : process.cwd();
export const BRAND = '#0f766e';

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

/** The share-preview copy (src/data/og.json): one image per entry in `images`. */
export const OG = JSON.parse(readFileSync(join(root, 'src', 'data', 'og.json'), 'utf8'));
export const BRAND_NAME = '문서딱';
const OG_W = 1200;
const OG_H = 630;
/**
 * The central safe area: KakaoTalk crops a large preview to about 1:1 (the middle 630 px) or 2:1, so the
 * name, the title and the line all stay inside x 285–915 (a 600 px column with a small margin).
 */
export const OG_SAFE = { left: 300, right: 900 };

/** The domain printed on the images: PUBLIC_SITE_URL's host unless it is a preview host, else og.json's. */
export function ogDomain(siteUrl = process.env.PUBLIC_SITE_URL) {
  try {
    const host = siteUrl ? new URL(siteUrl).host : '';
    return host && !host.endsWith('.pages.dev') ? host : OG.domain;
  } catch {
    return OG.domain;
  }
}

/** Splits `text` into lines no wider than `max` at spaces (keep-all), shrinking the font down to `minPx`. */
function fitLines(ctx, text, family, startPx, minPx, max, maxLines) {
  for (let px = startPx; px >= minPx; px -= 2) {
    ctx.font = `${px}px ${family}`;
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(next).width <= max || !cur) cur = next;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    lines.push(cur);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= max)) return { px, lines };
  }
  throw new Error(`gen-brand: "${text}" does not fit ${max} px in ${maxLines} line(s)`);
}

/**
 * The plain line: one row if it fits at 28 px or more; else (guides only) two rows split at the " · " that
 * balances them best, or at spaces when there is no such separator.
 */
function fitLine(ctx, text, max, maxLines) {
  try {
    return fitLines(ctx, text, FAMILY_BOLD, 36, 28, max, 1);
  } catch (err) {
    if (maxLines < 2) throw err;
  }
  const segs = text.split(' · ');
  if (segs.length < 2) return fitLines(ctx, text, FAMILY_BOLD, 36, 28, max, maxLines);
  for (let px = 36; px >= 28; px -= 2) {
    ctx.font = `${px}px ${FAMILY_BOLD}`;
    let best = null;
    for (let i = 1; i < segs.length; i++) {
      const lines = [segs.slice(0, i).join(' · '), segs.slice(i).join(' · ')];
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (w <= max && (!best || w < best.w)) best = { w, lines };
    }
    if (best) return { px, lines: best.lines };
  }
  throw new Error(`gen-brand: "${text}" does not fit ${max} px in ${maxLines} line(s)`);
}

/**
 * 1200×630 share image: the 문서딱 wordmark and icon, a large title, the plain line, the domain. All centred.
 * Exported for the guide images (src/pages/og/guide/[slug].png.ts, Growth G.1): their line may take two rows.
 */
export function ogImage(image, domain, { lineMaxLines = 1 } = {}) {
  registerFonts();
  const c = createCanvas(OG_W, OG_H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = BRAND;
  ctx.fillRect(0, 0, OG_W, OG_H);
  const cx = OG_W / 2;
  const max = OG_SAFE.right - OG_SAFE.left;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Wordmark: icon + 문서딱, centred as a group.
  ctx.font = `56px ${FAMILY_XBOLD}`;
  const nameW = ctx.measureText(BRAND_NAME).width;
  const icon = 64;
  const gap = 16;
  const groupLeft = cx - (icon + gap + nameW) / 2;
  drawLogo(ctx, groupLeft, 58, icon, '#ffffff', BRAND);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(BRAND_NAME, groupLeft + icon + gap, 58 + icon / 2 + 2);
  ctx.textAlign = 'center';

  // Title: up to two lines, 88 px down to 60 px.
  const title = fitLines(ctx, image.title, FAMILY_XBOLD, 88, 60, max, 2);
  const titleLead = title.px * 1.2;
  const titleTop = 250 - ((title.lines.length - 1) * titleLead) / 2;
  ctx.font = `${title.px}px ${FAMILY_XBOLD}`;
  title.lines.forEach((l, i) => ctx.fillText(l, cx, titleTop + i * titleLead));

  // The plain line: split at " — " into its two halves, each fitted.
  const parts = image.line.split(' — ');
  ctx.globalAlpha = 0.95;
  let y = titleTop + (title.lines.length - 1) * titleLead + title.px * 0.6 + 58;
  for (const part of parts) {
    const f = fitLine(ctx, part, max, lineMaxLines);
    ctx.font = `${f.px}px ${FAMILY_BOLD}`;
    for (const l of f.lines) {
      ctx.fillText(l, cx, y);
      y += 50;
    }
  }

  // Domain, small, at the bottom.
  ctx.globalAlpha = 0.85;
  ctx.font = `30px ${FAMILY_BOLD}`;
  ctx.fillText(domain, cx, 578);
  ctx.globalAlpha = 1;
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
export function renderBrand(domain = ogDomain()) {
  const ogImages = Object.fromEntries(Object.entries(OG.images).map(([name, image]) => [`brand/og-${name}.png`, ogImage(image, domain)]));
  return {
    'favicon.ico': buildIco([16, 32, 48].map((size) => ({ size, data: icon(size) }))),
    'brand/apple-touch-icon.png': icon(180),
    'brand/icon-192.png': icon(192),
    'brand/icon-512.png': icon(512),
    'brand/icon-maskable-512.png': maskable(512),
    ...ogImages,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pub = join(root, 'public');
  mkdirSync(join(pub, 'brand'), { recursive: true });
  const out = renderBrand();
  // A share image whose page entry was removed (or the old single og.png) must not ship.
  for (const f of readdirSync(join(pub, 'brand'))) if (/^og.*\.png$/.test(f) && !(`brand/${f}` in out)) rmSync(join(pub, 'brand', f));
  for (const [path, data] of Object.entries(out)) writeFileSync(join(pub, path), data);
  console.log(`gen-brand: ${Object.entries(out).map(([p, d]) => `${p} ${(d.length / 1024).toFixed(1)} KiB`).join(', ')}`);
}
