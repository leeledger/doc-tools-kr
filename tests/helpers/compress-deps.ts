// Node implementation of CompressDeps (tests and regress:compress). Reads the same wasm the site
// ships, from node_modules. Needs the ImageData polyfill (tests/helpers/image-data.ts) loaded first.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import encode, { init as initEncode } from '@jsquash/jpeg/encode.js';
import decode, { init as initDecode } from '@jsquash/jpeg/decode.js';
import initResize, { resize as wasmResize } from '@jsquash/resize/lib/resize/pkg/squoosh_resize.js';
import { codecDeps, type CompressDeps } from '../../src/lib/pdf/compress/deps';
import { runQpdf, type QpdfFactory } from '../../src/lib/pdf/compress/qpdf-run';

const require = createRequire(import.meta.url);

let ready: Promise<CompressDeps> | null = null;

export function nodeCompressDeps(): Promise<CompressDeps> {
  ready ??= (async () => {
    const wasm = (p: string) => WebAssembly.compile(readFileSync(require.resolve(p)));
    await initEncode(await wasm('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm'));
    await initDecode(await wasm('@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'));
    await initResize(await wasm('@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm'));
    // In Node the glue reads qpdf.wasm next to itself.
    const factory = require('@neslinesli93/qpdf-wasm/dist/qpdf.js') as QpdfFactory;

    const deps: CompressDeps = {
      qpdf: (args, input) => runQpdf(factory, undefined, args, input),
      ...codecDeps(encode, decode, wasmResize),
    };
    return deps;
  })();
  return ready;
}
