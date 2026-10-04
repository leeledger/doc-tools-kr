// C2-cloud e2e fixtures (tests/e2e/remove-background.cloud.spec.ts): what the Worker answers, as RGBA WebP.
//   node tests/fixtures/build-bgcloud.mjs
// disc.webp:  600×400, alpha 255 inside the disc of tests/e2e's SUBJECT photo (centre 300,200, r 120), soft 4 px edge,
//             0 outside; the RGB is a flat red that the page must not use (it keeps only the alpha).
// empty.webp: 600×400, alpha 0 everywhere (the nosubject case).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';

const dir = join(import.meta.dirname, 'bgcloud');
function draw(alphaAt) {
  const c = createCanvas(600, 400);
  const g = c.getContext('2d');
  const img = g.createImageData(600, 400);
  for (let y = 0; y < 400; y++) {
    for (let x = 0; x < 600; x++) {
      const i = (y * 600 + x) * 4;
      img.data.set([255, 0, 0, alphaAt(x, y)], i);
    }
  }
  g.putImageData(img, 0, 0);
  return c.encode('webp', 100);
}
const disc = (x, y) => {
  const d = Math.hypot(x - 300, y - 200) - 120;
  return Math.round(255 * Math.min(1, Math.max(0, 0.5 - d / 4)));
};
writeFileSync(join(dir, 'disc.webp'), await draw(disc));
writeFileSync(join(dir, 'empty.webp'), await draw(() => 0));
console.log('build-bgcloud: disc.webp, empty.webp');
