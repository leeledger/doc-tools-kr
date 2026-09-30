# HWP PDF 변환: engine notes

- Engine: `@rhwp/core` 0.8.6 (MIT), exact pin. `scripts/vendor-rhwp.mjs` copies `rhwp_bg.wasm` to
  `public/vendor/rhwp/<version>/` at prebuild and fails the build unless its SHA-256 matches the pinned hash.
- **Every rhwp upgrade re-runs `npm run regress:hwp` on the full corpus before merge**
  (`CORPUS_DIR=spikes/hwp/corpus`, 120 files); then update `RHWP_VERSION` and `RHWP_SHA256` together.
  The pass rules are in `scripts/regress/hwp.mjs` (non-routed broken rate ≤ 5 %, routing parity, fixtures,
  0 measure calls, 0 sanitizer removals, size and time rules). Never lower them; report misses to Arch.
- Workarounds for rhwp 0.8.6 bugs live in `src/lib/hwp/svg-string.ts` and `src/lib/hwp/svg-dom.ts`
  (id scoping, cell clips, picture fills, word spaces). Re-check each one after an upgrade; drop a
  workaround only when the harness shows the bug is gone.
- Fonts: `scripts/gen-hwp-fonts.mjs` (four @fontsource families, 400 and 700, renamed in CSS only) and the
  committed fallback subset `scripts/fonts/anolim-hwp-fallback.woff2` (`scripts/gen-hwp-fallback.mjs`).
