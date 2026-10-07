// @ts-check
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import { autoframeOn } from './scripts/lib/autoframe.mjs';
import { bgCloudOn, privacyGate } from './scripts/lib/bgcloud.mjs';
import { BG_PATH, bgRemoveOn } from './scripts/lib/bgremove.mjs';
import { rhwpNoDefaultWasm } from './scripts/lib/vite-rhwp.mjs';
import { usageOn, usageSample } from './scripts/lib/usage.mjs';

// PUBLIC_* values from the environment or .env files, read the way Astro reads them.
const env = loadEnv(process.env.NODE_ENV === 'development' ? 'development' : 'production', process.cwd(), 'PUBLIC_');
// Anonymous usage statistics (brief USAGE): PUBLIC_USAGE_STATS=1 ships the tracker (src/lib/ui/usage.ts); otherwise
// it is dropped at build. An invalid PUBLIC_USAGE_SAMPLE is a check-dist error; here it falls back to 1.
const usageStats = usageOn(env.PUBLIC_USAGE_STATS);
let usageRate = 1;
try {
  usageRate = usageSample(env.PUBLIC_USAGE_SAMPLE);
} catch {
  // check-dist fails the build with the reason.
}
// Step 4 kill switch: false makes the MediaPipe import dead code (no chunk, no vendor files).
const idPhotoAutoframe = autoframeOn(env.PUBLIC_ID_PHOTO_AUTOFRAME);
// Sprint C, C2 release flag (scripts/lib/bgremove.mjs): the /remove-background/ page exists only when on. Its source
// lives outside src/pages/ and is injected here, so a flag-off build has no such route at all.
const bgRemove = bgRemoveOn(env.PUBLIC_BG_REMOVE);
// C2-cloud (scripts/lib/bgcloud.mjs): the page's default path sends a <= 1024 px copy to /api/remove-bg. Needs both
// flags, and the privacy policy's officer and contact lines: the build stops here without them (brief §7.1).
const bgCloud = bgCloudOn(env);
const gate = privacyGate(env);
if (gate.length) throw new Error(gate.join('; '));
/** @type {import('astro').AstroIntegration} */
const bgRemoveRoute = {
  name: 'docttak-bg-remove',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      if (bgRemove) injectRoute({ pattern: BG_PATH, entrypoint: './src/tools/remove-background/page.astro' });
    },
  },
};

export default defineConfig({
  output: 'static',
  site: env.PUBLIC_SITE_URL || 'https://doc-tools-kr.pages.dev',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'never' },
  devToolbar: { enabled: false },
  integrations: [bgRemoveRoute],
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
            if (/[\/]src[\/]lib[\/]ui[\/](announce|usage|device|engine-error|engine-load|font|format|preload|josa|deeplink|quicklinks)\.ts$/.test(id)) return 'ui-shared';
            // Not here: lib/image/raster.ts and lib/ui/reorder.ts (LCP round 2: in ui-shared they made /photo-compress/
            // slower, 1,980 -> 2,119 ms local, and moved no other page).
            if (/[\/]src[\/]data[\/]preset-ids\.ts$/.test(id)) return 'ui-shared';
            if (/[\/]scripts[\/]lib[\/]usage\.mjs$/.test(id)) return 'ui-shared';
            // G2 A0: the HWP page script (shared by /hwp-to-pdf/ and /hwp-viewer/) joins the chunk those pages load
            // anyway; as its own chunk it was one more request before the first paint.
            if (/[\/]src[\/]tools[\/]hwp-shared[\/]boot\.ts$/.test(id)) return 'ui-shared';
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
    define: { __USAGE_STATS__: JSON.stringify(usageStats), __USAGE_SAMPLE__: JSON.stringify(usageRate), __ID_PHOTO_AUTOFRAME__: JSON.stringify(idPhotoAutoframe), __BG_REMOVE__: JSON.stringify(bgRemove), __BG_CLOUD__: JSON.stringify(bgCloud) },
  },
});
