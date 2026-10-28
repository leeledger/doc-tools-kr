// Anonymous usage statistics, page side (brief handoff/ARCHITECT-BRIEF-USAGE.md). OFF unless PUBLIC_USAGE_STATS=1:
// __USAGE_STATS__ is a build-time constant, so an off build contains no tracker and no sendBeacon at all
// (check-dist asserts it). On: whitelisted events go to the same-origin /api/usage (connect-src 'self') with
// navigator.sendBeacon. The payload is built field by field from the whitelist in scripts/lib/usage.mjs; nothing
// about the file (name, size, content) is ever part of it. Sampling is decided once per page load; at most 40 events
// leave one page load.
import { BUILD_RE, CAMPAIGN_RE, CODE_RE, MAX_EVENTS, SHEET_PRESETS, USAGE_PATH, UTM_SOURCES, sampleWeight, utmOf } from '../../../scripts/lib/usage.mjs';
import { parse as parseDeep } from './deeplink';
import { detectDevice, type Device } from './device';

export const USAGE_ON: boolean = __USAGE_STATS__;

export type UsageTool = 'pdf-merge' | 'pdf-compress' | 'photo-compress' | 'id-photo' | 'hwp-to-pdf' | 'hwp-viewer' | 'stamp-signature' | 'remove-background' | 'jpg-to-pdf' | 'pdf-to-jpg' | 'pdf-password' | 'image-to-jpg' | 'pdf-split' | 'pdf-sign' | 'hwpx-to-hwp' | 'char-count' | 'id-copy' | 'pdf-edit' | 'stamp-maker' | 'english-name' | 'english-address' | 'power-of-attorney' | 'loan-note' | 'id-photo-camera' | 'qr-code' | 'business-card' | 'resignation-letter';
/** OUT_DESTS in scripts/lib/usage.mjs (tests/unit/affiliate.test.ts keeps the links' dests equal to it). */
export type OutDest = 'photo-studio' | 'cp-printer' | 'cp-paper' | 'cp-backdrop' | 'cp-stamp' | 'cp-hancom' | 'cp-mfp' | 'cp-scanner' | 'cp-tripod' | 'lp-signgate' | 'lp-dosirak' | 'lp-usimsa' | 'lp-soomgo';
/** STAMP_STYLES in scripts/lib/usage.mjs (= the 도장 만들기 style ids). */
export type StampStyle = 'round' | 'round-double' | 'oval' | 'square-seal' | 'square-round' | 'square-inverse' | 'rect-v' | 'rect-h' | 'plain' | 'corp-round' | 'corp-square' | 'date-round';
/** NAME_FORMS in scripts/lib/usage.mjs (= the /english-name/ row shapes). */
export type NameForm = 'joined' | 'hyphen' | 'space';
const NAME_FORMS: readonly string[] = ['joined', 'hyphen', 'space'];
/** ADDR_FIELDS in scripts/lib/usage.mjs: the 영문주소 변환기 field a copy button copied. */
export type AddrField = 'line1' | 'line2' | 'city' | 'state' | 'zip' | 'country' | 'full' | 'road';
const ADDR_FIELDS: readonly string[] = ['line1', 'line2', 'city', 'state', 'zip', 'country', 'full', 'road'];
/** The form tools (src/tools/form-tool): their download event names the file format. */
export type FormToolId = 'power-of-attorney' | 'loan-note' | 'resignation-letter';
/** FORM_FORMATS in scripts/lib/usage.mjs: the form tool file downloaded. */
export type FormFormat = 'hwp' | 'pdf';
const FORM_FORMATS: readonly string[] = ['hwp', 'pdf'];
export type UsagePhase = 'load' | 'parse' | 'process' | 'save';
export type UsageSetting =
  | { o: 'target-kb'; v: 'le100' | 'le200' | 'le300' | 'le500' | 'le1000' | 'gt1000' }
  | { o: 'target-mb'; v: 'le1' | 'le2' | 'le5' | 'le10' | 'gt10' }
  | { o: 'preset'; v: string }
  | { o: 'level'; v: 'high' | 'recommended' | 'strong' }
  | { o: 'mode'; v: 'cloud' | 'device' }
  | { o: 'page'; v: 'fit' | 'a4' }
  | { o: 'ppi'; v: 'p96' | 'p150' | 'p300' }
  | { o: 'action'; v: 'lock' | 'unlock' }
  | { o: 'to'; v: 'jpg' | 'png' | 'webp' }
  | { o: 'save'; v: 'edit' | 'extract' | 'ranges' | 'every' | 'each' }
  | { o: 'place'; v: 'one' | 'range' | 'all' }
  | { o: 'basis'; v: 'space' | 'nospace' | 'byte2' | 'byte3' }
  | { o: 'mark'; v: 'on' | 'off' }
  | { o: 'items'; v: 'text' | 'date' | 'white' | 'mix' }
  | { o: 'style'; v: StampStyle }
  | { o: 'build'; v: 'blank' | 'filled' };

/** What a tool reports. Tool pages never build the payload themselves. */
export type UsageEvent =
  | { e: 'pick' | 'success' | 'download'; t: UsageTool }
  /** 영문 이름 변환기 복사 (ROMANIZE1016 D6): which row was copied; never the name. */
  | { e: 'download'; t: 'english-name'; o: 'form'; v: NameForm }
  /** 영문주소 변환기 복사 (ADDREN1016 decision 17): which field was copied; never the address. */
  | { e: 'download'; t: 'english-address'; o: 'field'; v: AddrField }
  /** 위임장 만들기 내려받기 (FORM1020 D9): HWP or PDF; never a value. */
  | { e: 'download'; t: FormToolId; o: 'format'; v: FormFormat }
  /** 여권·증명사진 인화용 모아찍기 내려받기 (PRINT1023 P12): the preset id (SHEET_PRESETS); the plain download has no o / v. */
  | { e: 'download'; t: 'id-photo'; o: 'sheet'; v: string }
  | ({ e: 'start'; t: UsageTool } & (UsageSetting | { o?: undefined; v?: undefined }))
  /** 이어서 하기 (CHAIN): the result of `t` was handed to the tool `v`. */
  | { e: 'next'; t: UsageTool; o: 'next'; v: UsageTool }
  /**
   * 인화·사진관·상품 링크 (REV2, REV3): a link of a result screen's block (or, with g, of a guide's block, t = the guide's
   * tools[0]) was pressed; only its kind, never the href. The server checks the pair (scripts/lib/usage.mjs TOOL_OUT, GUIDE_OUT).
   */
  | { e: 'out'; t: UsageTool; o: 'out'; v: OutDest; g?: string }
  | { e: 'fail'; t: UsageTool; c: string; p: UsagePhase };

type Via = 'guide' | 'direct' | 'embed';
type Arrive = { e: 'arrive'; t: UsageTool; g: string; dl: '0' | '1' };
/** A link marker (REQ1014-A D2): utm_source and utm_campaign, already whitelisted. */
export type Utm = { us: string; uc: string };
/** A marked-link landing (REQ1014-A D3); home and guides send it from src/lib/ui/utm-land.ts. */
type Land = { e: 'land'; t: UsageTool | 'home' | 'guide'; g?: string } & Utm;

export interface PayloadContext {
  via: Via;
  ua: string;
  device: Device;
  build: string;
  w: number;
  /** The tab's link marker (stash), carried by start and success only. */
  utm?: Utm | null;
}

/** Browser family and major version only ("chrome 131"), never the full user agent. */
export function browserFamily(ua: string): string {
  const rules: [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\/(\d+)/, 'edge'],
    [/SamsungBrowser\/(\d+)/, 'samsung'],
    [/Whale\/(\d+)/, 'whale'],
    [/Firefox\/(\d+)|FxiOS\/(\d+)/, 'firefox'],
    [/CriOS\/(\d+)|Chrome\/(\d+)/, 'chrome'],
    [/Version\/(\d+)[.\d]* (?:Mobile\/\S+ )?Safari\//, 'safari'],
  ];
  for (const [re, name] of rules) {
    const m = ua.match(re);
    if (m) return `${name} ${m.slice(1).find(Boolean) ?? ''}`.trim();
  }
  return 'other';
}

/** The whitelisted payload, field by field (never spread from the input). */
export function buildPayload(ev: UsageEvent | Arrive | Land, ctx: PayloadContext): Record<string, string | number> {
  const p: Record<string, string | number> = { e: ev.e, t: ev.t };
  if (ev.e === 'fail') {
    p.c = CODE_RE.test(ev.c) ? ev.c : 'unknown';
    p.p = ev.p;
    p.br = browserFamily(ctx.ua);
  } else if (ev.e === 'start' || ev.e === 'next' || ev.e === 'out') {
    if (ev.o !== undefined && ev.v !== undefined) {
      p.o = ev.o;
      p.v = ev.v;
    }
    if (ev.e === 'out' && ev.g !== undefined) p.g = ev.g;
  } else if (ev.e === 'download' && ev.t === 'english-name' && 'o' in ev && ev.o === 'form' && NAME_FORMS.includes(ev.v)) {
    p.o = ev.o;
    p.v = ev.v;
  } else if (ev.e === 'download' && ev.t === 'english-address' && 'o' in ev && ev.o === 'field' && ADDR_FIELDS.includes(ev.v)) {
    p.o = ev.o;
    p.v = ev.v;
  } else if (ev.e === 'download' && (ev.t === 'power-of-attorney' || ev.t === 'loan-note' || ev.t === 'resignation-letter') && 'o' in ev && ev.o === 'format' && FORM_FORMATS.includes(ev.v)) {
    p.o = ev.o;
    p.v = ev.v;
  } else if (ev.e === 'download' && ev.t === 'id-photo' && 'o' in ev && ev.o === 'sheet' && SHEET_PRESETS.includes(ev.v)) {
    p.o = ev.o;
    p.v = ev.v;
  } else if (ev.e === 'arrive') {
    p.g = ev.g;
    p.dl = ev.dl;
  } else if (ev.e === 'land') {
    if (ev.t === 'guide' && ev.g !== undefined) p.g = ev.g;
    p.us = ev.us;
    p.uc = ev.uc;
  }
  if ((ev.e === 'start' || ev.e === 'success') && ctx.utm) {
    p.us = ctx.utm.us;
    p.uc = ctx.utm.uc;
  }
  // A guide's link block (REV3): the click happens on the guide itself, so it is via=guide. A landing is always direct.
  p.via = ev.e === 'out' && ev.g !== undefined ? 'guide' : ev.e === 'land' ? 'direct' : ctx.via;
  p.d = ctx.device;
  p.b = BUILD_RE.test(ctx.build) ? ctx.build : 'dev';
  p.w = ctx.w;
  return p;
}

const GUIDE_PATH = /^\/guide\/([a-z0-9-]{1,60})\/$/;

/**
 * Guide -> tool (brief decision 7): a tool page opened from a same-origin /guide/<slug>/ page reports one arrive and
 * tags every event of this page load via=guide; anything else (another site, the guide index, another tool, no
 * referrer) is via=direct without an arrive. Only the referrer's path is read, never sent. The embed widget
 * (/embed/..., REV5 Decision 5) is via=embed on every event, read from its own path; the host site is never read.
 */
export function arrival(referrer: string, origin: string, pathname: string, deepValid: boolean): { via: Via; arrive: { g: string; dl: '0' | '1' } | null } {
  if (pathname.startsWith('/embed/')) return { via: 'embed', arrive: null };
  const direct = { via: 'direct' as const, arrive: null };
  if (!referrer || pathname.startsWith('/guide/')) return direct;
  let ref: URL;
  try {
    ref = new URL(referrer);
  } catch {
    return direct;
  }
  const m = ref.origin === origin ? GUIDE_PATH.exec(ref.pathname) : null;
  return m ? { via: 'guide', arrive: { g: m[1]!, dl: deepValid ? '1' : '0' } } : direct;
}

/** The tab's link marker in sessionStorage (REQ1014-A D7): {s, c, at}; `at` (ms) is never sent. */
export const UTM_STASH_KEY = 'docttak:utm';
/** A marker older than this no longer attributes a start or success. */
export const UTM_TTL_MS = 3 * 60 * 60 * 1000;
type StashStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Writes the marker (last link wins); a storage error (private mode, quota) means no attribution, nothing else. */
export function writeUtmStash(storage: StashStorage | null, utm: Utm, now: number): void {
  try {
    storage?.setItem(UTM_STASH_KEY, JSON.stringify({ s: utm.us, c: utm.uc, at: now }));
  } catch {
    // No attribution.
  }
}

/** The marker of this tab, or null; a malformed, unknown or expired entry is removed. Never throws. */
export function readUtmStash(storage: StashStorage | null, now: number): Utm | null {
  try {
    const raw = storage?.getItem(UTM_STASH_KEY);
    if (raw == null) return null;
    let o: { s?: unknown; c?: unknown; at?: unknown } | null = null;
    try {
      o = JSON.parse(raw);
    } catch {
      // Malformed: removed below.
    }
    const age = typeof o?.at === 'number' ? now - o.at : NaN;
    const ok = typeof o?.s === 'string' && (UTM_SOURCES.includes(o.s) || o.s === 'other') && typeof o.c === 'string' && CAMPAIGN_RE.test(o.c) && age >= 0 && age <= UTM_TTL_MS;
    if (ok) return { us: o!.s as string, uc: o!.c as string };
    storage!.removeItem(UTM_STASH_KEY);
  } catch {
    // No attribution.
  }
  return null;
}

function sessionStore(): StashStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export interface TrackerDeps {
  rate?: number;
  random?: () => number;
  send?: (path: string, body: string) => boolean;
  ua?: string;
  device?: Device;
  build?: string;
  referrer?: string;
  origin?: string;
  pathname?: string;
  search?: string;
  /** The page language (`<html lang>`). */
  lang?: string;
  /** Where the tab's link marker lives (sessionStorage); null: none. */
  storage?: StashStorage | null;
  now?: () => number;
}

export interface Tracker {
  /** Once at tool entry, before anything rewrites the address (quicklinks): stashes a link marker, decides via, sends arrive and land. */
  start(tool: UsageTool): void;
  track(ev: UsageEvent): void;
}

/** A tracker for one page load: sampled once (rate), capped at MAX_EVENTS, never throws. */
export function createTracker(deps: TrackerDeps = {}): Tracker {
  const rate = deps.rate ?? __USAGE_SAMPLE__;
  // EN1 (brief EN decision 10): only Korean pages report, so the Korean statistics stay clean; EN2 adds a language key.
  // No document while a page is prerendered (the module is imported there for USAGE_ON): nothing is sent there anyway.
  const lang = deps.lang ?? (typeof document === 'undefined' ? '' : document.documentElement.lang);
  const sampled = (deps.random ?? Math.random)() < rate && lang === 'ko';
  const w = sampleWeight(rate);
  let via: Via = 'direct';
  let sent = 0;
  const storage = (): StashStorage | null => (deps.storage !== undefined ? deps.storage : sessionStore());
  const now = (): number => (deps.now ?? Date.now)();
  // Link markers (REQ1014-A D7): Korean pages only, never the embed widget.
  const marks = (): boolean => lang === 'ko' && !(deps.pathname ?? location.pathname).startsWith('/embed/');
  const send = (ev: UsageEvent | Arrive | Land): void => {
    if (!sampled || sent >= MAX_EVENTS) return;
    sent++;
    try {
      const ctx: PayloadContext = {
        via,
        ua: deps.ua ?? navigator.userAgent,
        device: deps.device ?? detectDevice(),
        build: deps.build ?? document.querySelector('meta[name="build-id"]')?.getAttribute('content') ?? 'dev',
        w,
        // Read at send time: a later page load of this tab may carry the marker of an earlier landing.
        utm: (ev.e === 'start' || ev.e === 'success') && marks() ? readUtmStash(storage(), now()) : null,
      };
      const body = JSON.stringify(buildPayload(ev, ctx));
      (deps.send ?? ((p: string, d: string) => navigator.sendBeacon(p, d)))(USAGE_PATH, body);
    } catch {
      // Reporting must never break the tool.
    }
  };
  return {
    start(tool) {
      try {
        const search = deps.search ?? location.search;
        // Stashed whether or not this load is sampled: a later, sampled load of the tab still attributes.
        const utm = marks() ? utmOf(search) : null;
        if (utm) writeUtmStash(storage(), utm, now());
        if (!sampled) return;
        const a = arrival(deps.referrer ?? document.referrer, deps.origin ?? location.origin, deps.pathname ?? location.pathname, parseDeep(tool, search) !== null);
        via = a.via;
        if (a.arrive) send({ e: 'arrive', t: tool, g: a.arrive.g, dl: a.arrive.dl });
        if (utm) send({ e: 'land', t: tool, ...utm });
      } catch {
        // As above.
      }
    },
    track: send,
  };
}

const noop = (): void => undefined;
const live: Tracker | null = __USAGE_STATS__ ? createTracker() : null;

/** Once when a tool page starts. A no-op while usage statistics are off. */
export const startUsage: (tool: UsageTool) => void = __USAGE_STATS__ ? (tool) => live!.start(tool) : noop;

/** Reports one tool event. A no-op while usage statistics are off (and the tracker is dropped from the bundle). */
export const track: (ev: UsageEvent) => void = __USAGE_STATS__ ? (ev) => live!.track(ev) : noop;

/**
 * 링크 누름 (REV3 Decision 6): one delegated click listener on a result screen's `root` reports each press of an
 * a[data-out] inside it as out (the link kind only). No preventDefault, no URL rewriting: the browser opens the link as
 * usual. A no-op while usage statistics are off, like track. Guides: src/components/GuideOutTracker.astro.
 */
export function trackOut(root: Element | null, t: UsageTool): void {
  if (!__USAGE_STATS__ || !root) return;
  root.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[data-out]');
    if (a) track({ e: 'out', t, o: 'out', v: a.dataset.out as OutDest });
  });
}
