// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: process.env.PUBLIC_SITE_URL ?? 'https://doc-tools-kr.pages.dev',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'never' },
  devToolbar: { enabled: false },
  vite: {
    build: { sourcemap: false, assetsInlineLimit: 0 },
    worker: { format: 'es' },
  },
});
