// The id-photo preset ids, apart from their data (Growth G.5): the deep-link check on /photo-compress/ and
// /pdf-compress/ must not pull the preset table (sources, quotes) into those pages' first-load JS. A unit test
// keeps this list equal to PRESETS in id-photo-presets.ts.
export const PRESET_IDS = ['passport_online', 'gosi', 'qnet', 'history', 'korcham', 'teps', 'kuksiwon', 'saramin', 'jobkorea', 'half_card'] as const;
export const DEFAULT_PRESET_ID = 'passport_online';
