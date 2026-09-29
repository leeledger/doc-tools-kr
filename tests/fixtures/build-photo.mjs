// Generates the committed photo fixtures (run: node tests/fixtures/build-photo.mjs; cmyk.jpg comes from
// build-cmyk.py) and, via makePhotoRuntimeFixtures(), the files created at test time and never committed.
// CORPUS_DIR (default spikes/photo/corpus) is needed only to regenerate portrait_pd.jpg and scene_cc0.jpg.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seededBytes } from './build.mjs';

const FIXTURES = dirname(fileURLToPath(import.meta.url));
export const PHOTO = join(FIXTURES, 'photo');
const root = join(FIXTURES, '..', '..');

async function load(p) {
  const { runnerImport } = await import('vite');
  return (await runnerImport(join(root, p), { root })).module;
}

async function tools() {
  await load('tests/helpers/image-data.ts');
  const w = await load('tests/helpers/image-writers.ts');
  const { nodeCodecs } = await load('tests/helpers/photo-deps.ts');
  return { w, c: await nodeCodecs() };
}

/** P3 patch values (3 × 2 grid of 200 × 200 on 600 × 400); expected sRGB via p3ToSrgb (SOURCES.md). */
export const P3_PATCHES = [
  [200, 60, 60],
  [90, 170, 100],
  [60, 90, 200],
  [220, 200, 110],
  [128, 128, 128],
  [230, 150, 90],
];

/**
 * Corpus photo → lanczos to `width` → MozJPEG (jSquash defaults, progressive) at q88, or the highest q
 * below it that keeps the file within `maxBytes` (the fixture size limit wins over q88).
 */
async function fromCorpus({ c }, corpus, file, width, maxBytes) {
  const img = await c.decodeJpeg(new Uint8Array(readFileSync(join(corpus, file))));
  const h = Math.round((img.height * width) / img.width);
  const small = await c.resize(img, width, h);
  for (let q = 88; q >= 70; q--) {
    const out = await c.mozjpeg(small, q, { progressive: true });
    if (out.length <= maxBytes) {
      console.log(`fixtures: ${file} → ${width}×${h} q${q}`);
      return out;
    }
  }
  throw new Error(`${file}: no quality ≥ 70 fits ${maxBytes} bytes`);
}

/** exif6_gps.jpg: 1200 × 900 stored, red block top-left and blue block top-right (stored), EXIF 6 + GPS, a trailer. */
async function exif6Gps({ w, c }) {
  const W = 1200;
  const H = 900;
  const img = new ImageData(W, H);
  const noise = seededBytes(W * H, 606);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4;
      const n = (noise[y * W + x] % 9) - 4;
      let rgb = [90 + (x * 100) / W + n, 110 + (y * 90) / H + n, 150 + n];
      if (x < 160 && y < 160) rgb = [230, 20, 20];
      if (x >= W - 160 && y < 160) rgb = [20, 40, 230];
      img.data.set([...rgb, 255], k);
    }
  }
  const jpeg = await c.mozjpeg(img, 80);
  const withExif = w.insertSegments(jpeg, [w.exifApp1({ order: 'MM', orientation: 6, gps: { lat: 37.5665, lon: 126.978 } })]);
  // An MPF-like secondary image after EOI, carrying a GPS marker string.
  const trailer = w.concat([Uint8Array.of(0xff, 0xd8), w.segment(0xe1, Uint8Array.from('GPS-TRAILER\0', (ch) => ch.charCodeAt(0))), Uint8Array.of(0xff, 0xd9)]);
  return w.concat([withExif, trailer]);
}

async function p3Patches({ w, c }) {
  const W = 600;
  const H = 400;
  const img = new ImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = P3_PATCHES[Math.floor(y / 200) * 3 + Math.floor(x / 200)];
      img.data.set([...p, 255], (y * W + x) * 4);
    }
  }
  return w.insertSegments(await c.mozjpeg(img, 92), [w.iccApp2(w.iccDisplayP3())]);
}

/** alpha.png: 800 × 600 RGBA, left half fully transparent, right half an opaque gradient. */
function alphaPng({ w }) {
  const W = 800;
  const H = 600;
  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = W / 2; x < W; x++) px.set([40 + (x * 180) / W, 60 + (y * 150) / H, 170, 255], (y * W + x) * 4);
  }
  return w.pngRgba(W, H, px);
}

/** opaque_rgba.png: 750 × 1334 flat UI (header bar, cards, text lines), colour type 6, every alpha 255. */
function opaqueRgbaPng({ w }) {
  const W = 750;
  const H = 1334;
  const px = new Uint8Array(W * H * 4);
  const fill = (x0, y0, x1, y1, rgb) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px.set([...rgb, 255], (y * W + x) * 4);
  };
  fill(0, 0, W, H, [245, 246, 248]);
  fill(0, 0, W, 120, [15, 118, 110]);
  for (let i = 0; i < 6; i++) {
    const top = 160 + i * 190;
    fill(32, top, W - 32, top + 160, [255, 255, 255]);
    fill(56, top + 30, 360, top + 54, [40, 44, 52]);
    fill(56, top + 76, W - 80, top + 92, [150, 156, 166]);
    fill(56, top + 108, W - 200, top + 124, [150, 156, 166]);
  }
  return w.pngRgba(W, H, px);
}

function animGif({ w }) {
  const f1 = new Uint8Array(16 * 16).fill(1);
  const f2 = new Uint8Array(16 * 16).fill(2);
  return w.gif(16, 16, [f1, f2]);
}

/** A flat gradient JPEG (limits tests). */
async function gradientJpeg({ c }, W, H) {
  const img = new ImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) img.data.set([(x * 255) / W, (y * 255) / H, 128, 255], (y * W + x) * 4);
  }
  return c.mozjpeg(img, 75);
}

/** Test-time files under `dir` (never committed), rebuilt on every call. Returns their paths by name. */
export async function makePhotoRuntimeFixtures(dir) {
  mkdirSync(dir, { recursive: true });
  const t = await tools();
  const portrait = new Uint8Array(readFileSync(join(PHOTO, 'portrait_pd.jpg')));
  const exif6 = new Uint8Array(readFileSync(join(PHOTO, 'exif6_gps.jpg')));
  const files = {
    'truncated.jpg': () => portrait.subarray(0, Math.floor(portrait.length * 0.6)),
    'not_image.txt': () => new TextEncoder().encode('이 파일은 사진이 아닙니다.\n'),
    'fake.heic': () => {
      const out = new Uint8Array(2048);
      out.set([0, 0, 0, 0x18, ...'ftypheic'.split('').map((ch) => ch.charCodeAt(0)), 0, 0, 0, 0, ...'mif1heic'.split('').map((ch) => ch.charCodeAt(0))]);
      return out;
    },
    'exif3.jpg': () => t.w.patchOrientation(exif6, 3),
    'zero.jpg': () => new Uint8Array(0),
    'pano_20000x1000.jpg': () => gradientJpeg(t, 20000, 1000),
    'big_5000x3750.jpg': () => gradientJpeg(t, 5000, 3750),
    'small_60k.jpg': async () => {
      // A quality-mode output of the portrait (≤ 62 KB), with EXIF (upright, GPS) and a comment to strip.
      const img = await t.c.decodeJpeg(portrait);
      for (let q = 60; q >= 10; q -= 2) {
        const out = await t.c.mozjpeg(img, q);
        if (out.length <= 62_000) {
          const com = t.w.segment(0xfe, new TextEncoder().encode('camera comment'));
          return t.w.insertSegments(out, [t.w.exifApp1({ orientation: 1, gps: { lat: 35.1, lon: 129.04 } }), com]);
        }
      }
      throw new Error('small_60k: no quality fits');
    },
  };
  const paths = {};
  for (const [name, make] of Object.entries(files)) {
    const p = join(dir, name);
    writeFileSync(p, await make());
    paths[name] = p;
  }
  // Batch: a Korean name, and two files with the same base name (scene.jpg and scene.png).
  for (const [name, from] of [
    ['사진.jpg', 'portrait_pd.jpg'],
    ['scene.jpg', 'scene_cc0.jpg'],
    ['scene.png', 'opaque_rgba.png'],
  ]) {
    const p = join(dir, name);
    copyFileSync(join(PHOTO, from), p);
    paths[name] = p;
  }
  return paths;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t = await tools();
  const corpus = resolve(root, process.env.CORPUS_DIR ?? 'spikes/photo/corpus');
  mkdirSync(PHOTO, { recursive: true });
  const out = {
    'exif6_gps.jpg': await exif6Gps(t),
    'p3_patches.jpg': await p3Patches(t),
    'alpha.png': alphaPng(t),
    'opaque_rgba.png': opaqueRgbaPng(t),
    'anim.gif': animGif(t),
  };
  if (existsSync(join(corpus, 'p03.jpg'))) {
    out['portrait_pd.jpg'] = await fromCorpus(t, corpus, 'p03.jpg', 1400, 350_000);
    out['scene_cc0.jpg'] = await fromCorpus(t, corpus, 'g04.jpg', 1600, 300_000);
  } else {
    console.log(`fixtures: corpus not found at ${corpus}; portrait_pd.jpg and scene_cc0.jpg left as they are.`);
  }
  for (const [name, bytes] of Object.entries(out)) {
    writeFileSync(join(PHOTO, name), bytes);
    console.log(`fixtures: photo/${name} ${(bytes.length / 1024).toFixed(1)} KB`);
  }
  for (const p of P3_PATCHES) console.log(`p3 ${p.join(',')} → sRGB ${t.w.p3ToSrgb(p).join(',')}`);
  process.exit(0);
}
