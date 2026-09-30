// Node-side fonts for the HWP PDF writer tests: a FaceTable over local files (the fontsource .woff slices and the
// committed fallback faces), loaded the way font-source.ts loads them in the browser (WOFF → SFNT → fontkit).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@cantoo/fontkit';
import { PDFArray, PDFRawStream, type PDFDocument, type PDFPage, type PDFRef } from '@cantoo/pdf-lib';
import { unzlibSync } from 'fflate';
import { FaceTable, type FaceDef, type FontMetrics, type LoadedFace } from '../../src/lib/hwp/pdf/faces';
import { woffToSfnt } from '../../src/lib/hwp/pdf/woff';
import { FAMILY } from '../../src/lib/hwp/svg-string';

const ROOT = process.cwd();
export const FB_SANS_WOFF = join(ROOT, 'scripts', 'fonts', 'fb-sans.woff');

/** The @font-face slices of one @fontsource package/weight as FaceDefs whose url is the local .woff path. */
export function fontsourceFaces(pkg: string, family: string, weight: number): FaceDef[] {
  const dir = join(ROOT, 'node_modules', '@fontsource', pkg);
  const css = readFileSync(join(dir, `${weight}.css`), 'utf8');
  const out: FaceDef[] = [];
  for (const block of css.split('@font-face').slice(1)) {
    const file = block.match(/url\(\.\/files\/([^)]+)\.woff2\)/)?.[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim() ?? null;
    if (file) out.push({ family, weight, url: join(dir, 'files', `${file}.woff`), range });
  }
  return out;
}

export const loadLocal = async (def: FaceDef): Promise<LoadedFace> => {
  const woff = new Uint8Array(readFileSync(def.url));
  const sfnt = woffToSfnt(woff);
  return { def, woff, sfnt, font: fontkit.create(sfnt as never) as unknown as FontMetrics };
};

/** Noto Sans KR 400 as "Anolim HWP Sans" and "Anolim HWP Serif" (enough for Latin and Hangul), plus fb-sans. */
export function testFaces(): FaceTable {
  const sans = fontsourceFaces('noto-sans-kr', FAMILY.sans, 400);
  return new FaceTable([...sans, ...sans.map((d) => ({ ...d, family: FAMILY.serif })), { family: FAMILY.fallback, weight: 400, url: FB_SANS_WOFF, range: 'U+2000-206F, U+2B0-36F' }], loadLocal);
}

/** The decoded content streams of a page (before save). */
export function pageContent(doc: PDFDocument, page: PDFPage): string {
  const c = page.node.Contents();
  const refs: PDFRef[] = c instanceof PDFArray ? (c.asArray() as PDFRef[]) : [];
  let out = '';
  for (const r of refs) {
    const s = doc.context.lookup(r);
    if (s instanceof PDFRawStream) out += new TextDecoder('latin1').decode(unzlibSync(s.getContents()));
  }
  return out;
}
