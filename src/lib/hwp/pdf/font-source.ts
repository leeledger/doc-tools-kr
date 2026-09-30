// The PDF fonts' network side (SPIKE-HWP-DIRECT §6.2 "font-source.ts"; network-guard allowlist: "HWP PDF
// fonts, own origin"). Same-origin GETs of our own versioned static files only: the face list
// (/fonts/hwp/hwp-pdf-faces.*.json) and the .woff slices under /fonts/hwp/. Never file data. Each slice is
// fetched once per document, unwrapped to SFNT and parsed with fontkit.
import fontkit from '@cantoo/fontkit';
import pdfFaces from '../../../generated/hwp-pdf-faces.json';
import { FaceTable, unpackFaces, type FaceDef, type FontMetrics, type LoadedFace, type PackedFaces } from './faces';
import { woffToSfnt } from './woff';

export interface FontSource {
  table: FaceTable;
  /** Bytes of .woff fetched so far (reported by regress:hwp). */
  fetchedBytes(): number;
}

const sameOrigin = (url: string): boolean => {
  try {
    return new URL(url, location.href).origin === location.origin && new URL(url, location.href).pathname.startsWith('/fonts/hwp/');
  } catch {
    return false;
  }
};

async function get(url: string): Promise<Response> {
  if (!sameOrigin(url)) throw new Error(`not a font of this site: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font ${res.status}: ${url}`);
  return res;
}

export async function createFontSource(): Promise<FontSource> {
  const defs = unpackFaces((await (await get(pdfFaces.json)).json()) as PackedFaces);
  let fetched = 0;
  const load = async (def: FaceDef): Promise<LoadedFace | null> => {
    const woff = new Uint8Array(await (await get(def.url)).arrayBuffer());
    fetched += woff.length;
    const sfnt = woffToSfnt(woff);
    const font = fontkit.create(sfnt) as unknown as FontMetrics;
    return { def, font, sfnt, woff };
  };
  return { table: new FaceTable(defs, load), fetchedBytes: () => fetched };
}
