// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import { beaconPath } from './scripts/lib/beacon-path.mjs';
import { rhwpNoDefaultWasm } from './scripts/lib/vite-rhwp.mjs';

// PUBLIC_* values from the environment or .env files, read the way Astro reads them.
const env = loadEnv(process.env.NODE_ENV === 'development' ? 'development' : 'production', process.cwd(), 'PUBLIC_');
// Error beacon (Polish P.18): on only for a same-origin path ("/x", never "//x"); otherwise '' and the call is
// dropped at build.
const errorBeaconPath = beaconPath(env.PUBLIC_ERROR_BEACON_PATH);

export default defineConfig({
  output: 'static',
  site: env.PUBLIC_SITE_URL || 'https://doc-tools-kr.pages.dev',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'never' },
  devToolbar: { enabled: false },
  vite: {
    build: { sourcemap: false, assetsInlineLimit: 0 },
    // rhwpNoDefaultWasm: one rhwp_bg.wasm in dist/ (Step 5; see scripts/lib/vite-rhwp.mjs).
    worker: { format: 'es', plugins: () => [rhwpNoDefaultWasm()] },
    define: { __ERROR_BEACON_PATH__: JSON.stringify(errorBeaconPath) },
  },
});
