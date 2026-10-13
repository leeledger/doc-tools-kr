// Anonymous usage statistics, page side (brief handoff/ARCHITECT-BRIEF-USAGE.md). OFF unless PUBLIC_USAGE_STATS=1:
// __USAGE_STATS__ is a build-time constant, so an off build contains no tracker and no sendBeacon at all
// (check-dist asserts it). On: whitelisted events go to the same-origin /api/usage (connect-src 'self') with
// navigator.sendBeacon. The payload is built field by field from the whitelist in scripts/lib/usage.mjs; nothing
// about the file (name, size, content) is ever part of it. Sampling is decided once per page load; at most 40 events
// leave one page load.
import { BUILD_RE, CODE_RE, MAX_EVENTS, USAGE_PATH, sampleWeight } from '../../../scripts/lib/usage.mjs';
import { parse as parseDeep } from './deeplink';
import { detectDevice, type Device } from './device';

export const USAGE_ON: boolean = __USAGE_STATS__;

export type UsageTool = 'pdf-merge' | 'pdf-compress' | 'photo-compress' | 'id-photo' | 'hwp-to-pdf' | 'hwp-viewer' | 'stamp-signature' | 'remove-background' | 'jpg-to-pdf' | 'pdf-to-jpg' | 'pdf-password' | 'image-to-jpg' | 'pdf-split' | 'pdf-sign' | 'hwpx-to-hwp';
/** OUT_DESTS in scripts/lib/usage.mjs (tests/unit/affiliate.test.ts keeps the links' dests equal to it). */
export type OutDest = 'photo-studio' | 'cp-printer' | 'cp-paper' | 'cp-backdrop' | 'cp-stamp' | 'cp-hancom' | 'cp-mfp' | 'cp-scanner' | 'cp-tripod';
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
  | { o: 'place'; v: 'one' | 'range' | 'all' };

/** What a tool reports. Tool pages never build the payload themselves. */
export type UsageEvent =
  | { e: 'pick' | 'success' | 'download'; t: UsageTool }
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

export interface PayloadContext {
  via: Via;
  ua: string;
  device: Device;
  build: string;
  w: number;
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
export function buildPayload(ev: UsageEvent | Arrive, ctx: PayloadContext): Record<string, string | number> {
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
  } else if (ev.e === 'arrive') {
    p.g = ev.g;
    p.dl = ev.dl;
  }
  // A guide's link block (REV3): the click happens on the guide itself, so it is via=guide.
  p.via = ev.e === 'out' && ev.g !== undefined ? 'guide' : ctx.via;
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
}

export interface Tracker {
  /** Once at tool entry: decides via and sends the arrive. */
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
  const send = (ev: UsageEvent | Arrive): void => {
    if (!sampled || sent >= MAX_EVENTS) return;
    sent++;
    try {
      const ctx: PayloadContext = {
        via,
        ua: deps.ua ?? navigator.userAgent,
        device: deps.device ?? detectDevice(),
        build: deps.build ?? document.querySelector('meta[name="build-id"]')?.getAttribute('content') ?? 'dev',
        w,
      };
      const body = JSON.stringify(buildPayload(ev, ctx));
      (deps.send ?? ((p: string, d: string) => navigator.sendBeacon(p, d)))(USAGE_PATH, body);
    } catch {
      // Reporting must never break the tool.
    }
  };
  return {
    start(tool) {
      if (!sampled) return;
      try {
        const a = arrival(deps.referrer ?? document.referrer, deps.origin ?? location.origin, deps.pathname ?? location.pathname, parseDeep(tool, deps.search ?? location.search) !== null);
        via = a.via;
        if (a.arrive) send({ e: 'arrive', t: tool, g: a.arrive.g, dl: a.arrive.dl });
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
