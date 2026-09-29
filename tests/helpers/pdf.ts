// Node-side PDF inspection for tests and the regression harness (pdfjs-dist legacy build).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'));
// pdf.js in Node takes filesystem paths with a trailing separator.
const CMAPS = join(pdfjsRoot, 'cmaps') + '/';
const FONTS = join(pdfjsRoot, 'standard_fonts') + '/';
const WASM = join(pdfjsRoot, 'wasm') + '/';

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
export const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(FIXTURES, name)));

export type PdfjsDoc = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;

export async function withPdf<T>(bytes: Uint8Array, fn: (doc: PdfjsDoc) => Promise<T>, password?: string): Promise<T> {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    password,
    cMapUrl: CMAPS,
    cMapPacked: true,
    standardFontDataUrl: FONTS,
    wasmUrl: WASM,
    verbosity: 0,
  });
  try {
    return await fn(await task.promise);
  } finally {
    await task.destroy();
  }
}

export async function pageTexts(bytes: Uint8Array, password?: string, pages?: number[]): Promise<string[]> {
  return withPdf(
    bytes,
    async (doc) => {
      const idx = pages ?? [...Array(doc.numPages).keys()];
      const out: string[] = [];
      for (const i of idx) {
        const page = await doc.getPage(i + 1);
        const tc = await page.getTextContent();
        out.push(tc.items.map((it) => ('str' in it ? it.str : '')).join(''));
        page.cleanup();
      }
      return out;
    },
    password,
  );
}

interface OutlineNode {
  items: OutlineNode[];
}
const countOutline = (o: OutlineNode[] | null): number => (o ?? []).reduce((a, it) => a + 1 + countOutline(it.items), 0);

export async function outlineCount(bytes: Uint8Array, password?: string): Promise<number> {
  return withPdf(bytes, async (doc) => countOutline((await doc.getOutline()) as OutlineNode[] | null), password);
}

export async function pageCount(bytes: Uint8Array, password?: string): Promise<number> {
  return withPdf(bytes, async (doc) => doc.numPages, password);
}

export { pdfjs };
