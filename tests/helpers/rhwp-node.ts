// The vendored rhwp engine in Node, for tests (HWPX2HWP): real exports, reloads and test-time fixtures such as a
// password HWPX made by rhwp itself. Initialised once per process.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import init, { HwpDocument } from '@rhwp/core';
import { hwpFixture } from './hwp';

let ready: Promise<typeof HwpDocument> | null = null;

/** rhwp's HwpDocument after the wasm is initialised (with the worker's deterministic text-width fallback). */
export function loadRhwp(): Promise<typeof HwpDocument> {
  ready ??= (async () => {
    (globalThis as unknown as { measureTextWidth: (font: string, text: string) => number }).measureTextWidth = (font, text) => {
      const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
      let w = 0;
      for (const ch of text) {
        const cp = ch.codePointAt(0) ?? 0;
        w += (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3000 && cp <= 0x9fff) || (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xff00 && cp <= 0xffef) ? px : px * 0.55;
      }
      return w;
    };
    await init({ module_or_path: readFileSync(join(process.cwd(), 'node_modules', '@rhwp', 'core', 'rhwp_bg.wasm')) });
    return HwpDocument;
  })();
  return ready;
}

/** A password HWPX (ODF AES-256 manifest) written by rhwp's exportHwpxWithPassword from an HWPX fixture. */
export async function passwordHwpx(fixture = 'adm14.hwpx', password = 'test1234'): Promise<Uint8Array> {
  const Doc = await loadRhwp();
  const doc = new Doc(hwpFixture(fixture));
  try {
    return doc.exportHwpxWithPassword(password);
  } finally {
    doc.free();
  }
}
