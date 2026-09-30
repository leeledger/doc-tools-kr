// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import { autoframeOn } from './scripts/lib/autoframe.mjs';
import { beaconPath } from './scripts/lib/beacon-path.mjs';
import { rhwpNoDefaultWasm } from './scripts/lib/vite-rhwp.mjs';

// PUBLIC_* values from the environment or .env files, read the way Astro reads them.
const env = loadEnv(process.env.NODE_ENV === 'development' ? 'development' : 'production', process.cwd(), 'PUBLIC_');
// Error beacon (Polish P.18): on only for a same-origin path ("/x", never "//x"); otherwise '' and the call is
// dropped at build.
const errorBeaconPath = beaconPath(env.PUBLIC_ERROR_BEACON_PATH);
// Step 4 kill switch: false makes the MediaPipe import dead code (no chunk, no vendor files).
const idPhotoAutoframe = autoframeOn(env.PUBLIC_ID_PHOTO_AUTOFRAME);

export default defineConfig({
  output: 'static',
  site: env.PUBLIC_SITE_URL || 'https://doc-tools-kr.pages.dev',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'never' },
  devToolbar: { enabled: false },
  vite: {
    build: {
      sourcemap: false,
      assetsInlineLimit: 0,
      // One shared chunk for the small UI modules every tool page uses (Step 4). Without it, the lazily
      // imported /id-photo/ controller (which shares some of them but not all) split them into three extra
      // requests on every tool page, and Lighthouse LCP went from 1.95 s to 2.04 s on the local HTTP/1.1
      // server (measured; BUILD-LOG Step 4).
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Growth G: the deep-link modules (and josa, which they share with every tool) join the chunk, so a
            // tool page loads no extra request for them (Lighthouse LCP on /photo-compress/ and /pdf-compress/).
            if (/[\/]src[\/]lib[\/]ui[\/](announce|beacon|device|engine-error|engine-load|font|format|preload|josa|deeplink|quicklinks)\.ts$/.test(id)) return 'ui-shared';
            if (/[\/]src[\/]data[\/]preset-ids\.ts$/.test(id)) return 'ui-shared';
            if (/[\/]src[\/]lib[\/]pdf[\/]errors\.ts$/.test(id) || id.includes('vite/preload-helper')) return 'ui-shared';
            return undefined;
          },
        },
      },
    },
    // HWP direct: @cantoo/fontkit's Brotli decoder is never used (the PDF path reads WOFF 1.0 only).
    resolve: { alias: [{ find: /^brotli\/decompress(\.js)?$/, replacement: fileURLToPath(new URL('./src/lib/hwp/pdf/brotli-stub.ts', import.meta.url)) }] },
    // rhwpNoDefaultWasm: one rhwp_bg.wasm in dist/ (Step 5; see scripts/lib/vite-rhwp.mjs).
    worker: { format: 'es', plugins: () => [rhwpNoDefaultWasm()] },
    define: { __ERROR_BEACON_PATH__: JSON.stringify(errorBeaconPath), __ID_PHOTO_AUTOFRAME__: JSON.stringify(idPhotoAutoframe) },
  },
});
