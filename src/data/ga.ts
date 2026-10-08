// Google Analytics 4 (owner 2026-10-08) behind PUBLIC_GA_ID (scripts/lib/ga.mjs). The page carries only the tag of the
// self-hosted /ga.js loader (postbuild gen-ga). An invalid value renders nothing here and fails the build in check-dist.

const raw = import.meta.env.PUBLIC_GA_ID;
const id = typeof raw === 'string' ? raw.trim() : '';

/** The measurement ID, '' while Google Analytics is off. */
export const GA_ID = /^G-[A-Z0-9]{6,12}$/.test(id) ? id : '';
export const GA_ON = GA_ID !== '';
export const GA_LOADER = '/ga.js';
