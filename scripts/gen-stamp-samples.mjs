// 도장 만들기 sample tiles (STAMP1015 round 2, review Must Fix 1): the 12 tiles show these images until the controller paints
// them live, so the grid is never empty before the first user signal. Drawn with the page's own layout.ts and render.ts on
// @napi-rs/canvas with the same HWP font slices (tests/helpers/stamp-fonts.ts), at 176 px for an 88 px tile, sample text
// 「홍길동」 (「문서딱」 for the corp styles). One colour, so each file is a 4-bit indexed PNG whose palette is the 인주
// red at 16 alpha steps (the colour exact, the edge softness in 16 steps; about 2 KB each). The output is committed (the Pages build never runs Skia):
//   public/stamp-samples/<style>.<hash>.png  and  src/tools/stamp-maker/samples.json { hash, files, bytes }.
// hash = SHA-256 of styles.ts, layout.ts, render.ts and limits.ts (line endings normalised); tests/unit/stamp-maker.test.ts
// fails when those sources change and this script was not run again. Usage: npm run gen:stamp-samples
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { build } from 'esbuild';

const ROOT = resolve(import.meta.dirname, '..');
export const SAMPLE_SOURCES = ['styles.ts', 'layout.ts', 'render.ts', 'limits.ts'].map((f) => `src/tools/stamp-maker/${f}`);
const OUT_DIR = join(ROOT, 'public', 'stamp-samples');
const MANIFEST = join(ROOT, 'src', 'tools', 'stamp-maker', 'samples.json');
const PX = 176;
/** Share of the tile the stamp's long edge takes (controller.ts FILL). */
const FILL = 0.92;
/** A fixed date for 날짜 도장 (the live tile shows today). */
const SAMPLE_DATE = '2026.01.01';

/** The sources hash the staleness test compares (CRLF checkouts hash like LF ones). */
export function samplesHash(root = ROOT) {
  const h = createHash('sha256');
  for (const f of SAMPLE_SOURCES) h.update(readFileSync(join(root, f), 'utf8').replace(/\r\n/g, '\n'));
  return h.digest('hex').slice(0, 12);
}

let table;
function crc32(bytes) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Alpha levels kept (4-bit palette): at 2x and shown at half size the steps are not visible; files stay small. */
export const LEVELS = 16;

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * Indexed PNG, bit depth 4: palette = `rgb` at LEVELS alpha steps (index 0 transparent, LEVELS - 1 opaque), pixel index =
 * the alpha rounded to its step; each row takes the PNG filter with the smallest absolute sum (the usual heuristic).
 */
export function alphaPng(alpha, w, h, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 4;
  ihdr[9] = 3;
  const plte = Buffer.alloc(LEVELS * 3);
  const trns = Buffer.alloc(LEVELS);
  for (let i = 0; i < LEVELS; i++) {
    plte[i * 3] = rgb[0];
    plte[i * 3 + 1] = rgb[1];
    plte[i * 3 + 2] = rgb[2];
    trns[i] = Math.round((i * 255) / (LEVELS - 1));
  }
  const stride = Math.ceil(w / 2);
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(stride);
    for (let x = 0; x < w; x++) {
      const v = Math.round((alpha[y * w + x] * (LEVELS - 1)) / 255);
      row[x >> 1] |= x & 1 ? v : v << 4;
    }
    rows.push(row);
  }
  const out = [];
  for (let y = 0; y < h; y++) {
    const cur = rows[y];
    const up = y ? rows[y - 1] : Buffer.alloc(stride);
    let best = null;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const line = Buffer.alloc(stride + 1);
      line[0] = f;
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i ? cur[i - 1] : 0;
        const b = up[i];
        const c = i ? up[i - 1] : 0;
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (cur[i] - pred) & 0xff;
        line[i + 1] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = line;
      }
    }
    out.push(best);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('tRNS', trns), chunk('IDAT', deflateSync(Buffer.concat(out), { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

async function main() {
  // Bundle the TypeScript modules once (esbuild is already a dependency), with the canvas binding external.
  // Inside node_modules so the bundle resolves @napi-rs/canvas from this checkout.
  const bundle = join(ROOT, 'node_modules', '.cache', `stamp-samples-${process.pid}.mjs`);
  await build({
    stdin: {
      contents: [
        "export { DEFAULT_OPTIONS, layoutStamp } from './src/tools/stamp-maker/layout.ts';",
        "export { COLORS, paintStamp, pixelSize } from './src/tools/stamp-maker/render.ts';",
        "export { SAMPLE_CORP, SAMPLE_PERSONAL, STYLES, STYLE_IDS } from './src/tools/stamp-maker/styles.ts';",
        "export { inkMeasure, sliceFont } from './tests/helpers/stamp-fonts.ts';",
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: ['@napi-rs/canvas'],
    outfile: bundle,
    logLevel: 'error',
  });
  const m = await import(pathToFileURL(bundle).href);
  rmSync(bundle, { force: true });
  const { createCanvas } = await import('@napi-rs/canvas');

  const hash = samplesHash();
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const red = [0xd0, 0x20, 0x2e];
  const files = {};
  let bytes = 0;
  for (const id of m.STYLE_IDS) {
    const text = m.STYLES[id].kind === 'corp' ? m.SAMPLE_CORP : m.SAMPLE_PERSONAL;
    const r = m.layoutStamp(id, text, { ...m.DEFAULT_OPTIONS, date: SAMPLE_DATE }, m.inkMeasure);
    if (!r.ok) throw new Error(`${id}: ${r.reason}`);
    const c = createCanvas(PX, PX);
    const ctx = c.getContext('2d');
    const long = Math.round(PX * FILL);
    const { w, h } = m.pixelSize(r.layout, long);
    ctx.translate(Math.round((PX - w) / 2), Math.round((PX - h) / 2));
    m.paintStamp(ctx, r.layout, long, m.COLORS.red, m.sliceFont);
    const data = ctx.getImageData(0, 0, PX, PX).data;
    const alpha = new Uint8Array(PX * PX);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    const png = alphaPng(alpha, PX, PX, red);
    const name = `${id}.${hash.slice(0, 8)}.png`;
    writeFileSync(join(OUT_DIR, name), png);
    files[id] = `/stamp-samples/${name}`;
    bytes += png.length;
  }
  writeFileSync(MANIFEST, `${JSON.stringify({ hash, size: PX, bytes, files }, null, 2)}\n`);
  console.log(`gen-stamp-samples: ${readdirSync(OUT_DIR).length} files, ${(bytes / 1024).toFixed(1)} KB, hash ${hash}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
