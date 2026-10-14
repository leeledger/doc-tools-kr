// A marked-link landing on the home page or a guide (REQ1014-A D5/D6): added by site.ts as a module script of its
// own (built via `?worker&url`, so it runs land() itself below), only when usage statistics are on and the address
// has a utm_source. Tool pages send theirs from the tracker (src/lib/ui/usage.ts
// start(), before quicklinks rewrites the address). Importing usage.ts or scripts/lib/usage.mjs from here would add
// an importer to the shared chunk and could split it (EN1 Decision 8), so this module imports nothing at runtime
// (type imports only) and keeps its own copies; tests/unit/utm-land.test.ts keeps every copy equal to usage.mjs /
// usage.ts and checks the payload against the server whitelist (validate).
import type { Device } from './device';

/** USAGE_PATH of scripts/lib/usage.mjs. */
export const LAND_PATH = '/api/usage';
/** UTM_SOURCES and CAMPAIGN_RE of scripts/lib/usage.mjs. */
export const LAND_SOURCES = ['naver_blog', 'tistory', 'play'];
export const LAND_CAMPAIGN = /^[a-z0-9-]{1,60}$/;
/** UTM_STASH_KEY of src/lib/ui/usage.ts. */
export const LAND_STASH_KEY = 'docttak:utm';
const BUILD = /^([0-9a-f]{7,40}|dev)$/;
const GUIDE = /^\/guide\/(?:([a-z0-9-]{1,60})\/)?$/;

type Utm = { us: string; uc: string };
type Target = { t: 'home' } | { t: 'guide'; g?: string };

/** utmOf in scripts/lib/usage.mjs. */
export function landUtm(search: string): Utm | null {
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(search);
  } catch {
    return null;
  }
  const src = (q.get('utm_source') ?? '').trim().toLowerCase();
  if (!src) return null;
  const camp = (q.get('utm_campaign') ?? '').trim().toLowerCase();
  return { us: LAND_SOURCES.includes(src) ? src : 'other', uc: !camp ? 'none' : LAND_CAMPAIGN.test(camp) ? camp : 'other' };
}

/** The page kinds this module sends for: home `/` and the guides (the /guide/ index without g); anything else null. */
export function landTarget(pathname: string): Target | null {
  if (pathname === '/') return { t: 'home' };
  const m = GUIDE.exec(pathname);
  if (!m) return null;
  return m[1] ? { t: 'guide', g: m[1] } : { t: 'guide' };
}

/** detectDevice in src/lib/ui/device.ts. */
export function landDevice(): Device {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const narrow = typeof screen !== 'undefined' && screen.width < 1024;
  return coarse && narrow ? 'mobile' : 'desktop';
}

/** buildPayload's land payload, in its key order: e, t, g, us, uc, via, d, b, w. */
export function landPayload(target: Target, utm: Utm, ctx: { device: Device; build: string; rate: number }): Record<string, string | number> {
  const p: Record<string, string | number> = { e: 'land', t: target.t };
  if (target.t === 'guide' && target.g !== undefined) p.g = target.g;
  p.us = utm.us;
  p.uc = utm.uc;
  p.via = 'direct';
  p.d = ctx.device;
  p.b = BUILD.test(ctx.build) ? ctx.build : 'dev';
  p.w = Math.min(100, Math.max(1, Math.round(1 / ctx.rate)));
  return p;
}

export interface LandDeps {
  rate?: number;
  random?: () => number;
  send?: (path: string, body: string) => boolean;
  lang?: string;
  pathname?: string;
  search?: string;
  storage?: Pick<Storage, 'setItem'> | null;
  now?: () => number;
}

/**
 * Stashes the marker for this tab (always, like the tracker) and, when this page load is sampled, sends one land.
 * Korean pages only; never throws.
 */
export function land(deps: LandDeps = {}): void {
  try {
    const lang = deps.lang ?? document.documentElement.lang;
    const target = landTarget(deps.pathname ?? location.pathname);
    const utm = landUtm(deps.search ?? location.search);
    if (lang !== 'ko' || !target || !utm) return;
    try {
      const storage = deps.storage !== undefined ? deps.storage : sessionStorage;
      storage?.setItem(LAND_STASH_KEY, JSON.stringify({ s: utm.us, c: utm.uc, at: (deps.now ?? Date.now)() }));
    } catch {
      // Private mode or quota: no attribution, the land still counts.
    }
    const rate = deps.rate ?? __USAGE_SAMPLE__;
    if (!((deps.random ?? Math.random)() < rate)) return;
    const build = document.querySelector('meta[name="build-id"]')?.getAttribute('content') ?? 'dev';
    const body = JSON.stringify(landPayload(target, utm, { device: landDevice(), build, rate }));
    (deps.send ?? ((p: string, d: string) => navigator.sendBeacon(p, d)))(LAND_PATH, body);
  } catch {
    // Reporting must never break the page.
  }
}

// Runs itself when site.ts adds this file (usage-stats build only; in any other build the file is empty).
if (__USAGE_STATS__) land();
