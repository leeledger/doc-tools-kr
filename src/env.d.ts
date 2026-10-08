/** Build-time constant (astro.config.mjs `define`): anonymous usage statistics ship (PUBLIC_USAGE_STATS=1). */
declare const __USAGE_STATS__: boolean;
/** Build-time constant (astro.config.mjs `define`): share of page loads that report (PUBLIC_USAGE_SAMPLE, 0.01-1). */
declare const __USAGE_SAMPLE__: number;
/** Build-time constant (astro.config.mjs `define`): face auto-framing on /id-photo/ (PUBLIC_ID_PHOTO_AUTOFRAME). */
declare const __ID_PHOTO_AUTOFRAME__: boolean;
/** Build-time constant (astro.config.mjs `define`): the /remove-background/ tool ships (PUBLIC_BG_REMOVE). */
declare const __BG_REMOVE__: boolean;
/** Build-time constant (astro.config.mjs `define`): 배경 지우기 sends a copy to /api/remove-bg (PUBLIC_BG_CLOUD and PUBLIC_BG_REMOVE). */
declare const __BG_CLOUD__: boolean;
interface ImportMetaEnv {
  /** Google Analytics 4 measurement ID (owner 2026-10-08; scripts/lib/ga.mjs). Unset: no GA. */
  readonly PUBLIC_GA_ID?: string;
}
