// Postbuild, before check-dist (ADS1020 D3): writes dist/ads-cfg.js (ad requests paused, non-personalized only) when
// PUBLIC_ADSENSE_ON=1 (scripts/lib/adsense.mjs); otherwise makes sure no dist/ads-cfg.js ships. An invalid client writes
// nothing: astro.config.mjs and check-dist fail the build with the reason.
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { distDir, publicEnv } from './lib/dist.mjs';
import { ADS_CFG_PATH, ADS_CFG_SOURCE, adsenseConfig } from './lib/adsense.mjs';

const file = join(distDir(), ADS_CFG_PATH.slice(1));
let on = false;
try {
  on = adsenseConfig(publicEnv()).on;
} catch {
  // check-dist reports it.
}
if (on) {
  writeFileSync(file, ADS_CFG_SOURCE);
  console.log(`gen-ads-cfg: ${ADS_CFG_PATH} written`);
} else {
  if (existsSync(file)) rmSync(file);
  console.log(`gen-ads-cfg: AdSense off, no ${ADS_CFG_PATH}`);
}
