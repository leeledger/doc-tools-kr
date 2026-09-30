// Vite plugin (brief Step 5 §1): the rhwp glue's default wasm location, `new URL('rhwp_bg.wasm', import.meta.url)`,
// makes Rollup emit a second 10 MB copy of rhwp_bg.wasm into _astro/. The worker always passes the compiled
// module to init() (src/lib/hwp/hwp.worker.ts), so that branch never runs; this plugin replaces the pattern
// before Vite's asset-URL plugin sees it. check-dist asserts exactly one rhwp_bg*.wasm in dist/.
const PATTERN = /new URL\((['"])rhwp_bg\.wasm\1,\s*import\.meta\.url\)/g;

export function rhwpNoDefaultWasm() {
  return {
    name: 'anolim:rhwp-no-default-wasm',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]@rhwp[\\/]core[\\/]rhwp\.js$/.test(id.split('?')[0])) return null;
      const out = code.replace(PATTERN, "(() => { throw new Error('rhwp: init() must receive the compiled module'); })()");
      if (out === code) this.error('rhwp.js no longer contains the default wasm URL pattern; update scripts/lib/vite-rhwp.mjs');
      return { code: out, map: null };
    },
  };
}
