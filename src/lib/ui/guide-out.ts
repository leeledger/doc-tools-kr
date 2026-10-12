// 안내 글 링크 누름 (brief handoff/ARCHITECT-BRIEF-REV3.md Decision 6), loaded only by src/components/GuideOutTracker.astro.
// A guide may load at most 4 KB of initial JS (check-dist), and importing src/lib/ui/usage.ts would pull the whole
// ui-shared chunk (about 7 KB gzip) into every guide with a link block. So this module imports nothing at runtime
// (type imports only) and sends the one event a guide has itself: out with g, via=guide. tests/unit/guide-out.test.ts
// keeps it equal to usage.ts (buildPayload, sampling, weight, device, event cap) and to the server whitelist (validate).
import type { Device } from './device';
import type { OutDest, UsageTool } from './usage';

/** USAGE_PATH and MAX_EVENTS of scripts/lib/usage.mjs (unit test). */
export const GUIDE_OUT_PATH = '/api/usage';
export const GUIDE_OUT_MAX = 40;
const BUILD = /^([0-9a-f]{7,40}|dev)$/;

/** detectDevice in src/lib/ui/device.ts. */
export function guideDevice(): Device {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const narrow = typeof screen !== 'undefined' && screen.width < 1024;
  return coarse && narrow ? 'mobile' : 'desktop';
}

/** The payload, in buildPayload's key order: e, t, o, v, g, via, d, b, w. */
export function guideOutPayload(t: UsageTool, v: OutDest, g: string, ctx: { device: Device; build: string; rate: number }): Record<string, string | number> {
  return { e: 'out', t, o: 'out', v, g, via: 'guide', d: ctx.device, b: BUILD.test(ctx.build) ? ctx.build : 'dev', w: Math.min(100, Math.max(1, Math.round(1 / ctx.rate))) };
}

export interface GuideOutDeps {
  rate?: number;
  random?: () => number;
  send?: (path: string, body: string) => boolean;
}

/**
 * Binds the delegated click listener to the guide's block (.out-links[data-guide][data-tool]). Sampled once per page
 * load like createTracker, at most GUIDE_OUT_MAX events, never throws; no preventDefault, no URL rewriting.
 */
export function bindGuideOut(doc: Document = document, deps: GuideOutDeps = {}): void {
  const block = doc.querySelector<HTMLElement>('.out-links[data-guide]');
  const g = block?.dataset.guide;
  const t = block?.dataset.tool as UsageTool | undefined;
  const rate = deps.rate ?? __USAGE_SAMPLE__;
  if (!block || !g || !t || !((deps.random ?? Math.random)() < rate)) return;
  let sent = 0;
  block.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[data-out]');
    if (!a || sent >= GUIDE_OUT_MAX) return;
    sent++;
    try {
      const build = doc.querySelector('meta[name="build-id"]')?.getAttribute('content') ?? 'dev';
      const body = JSON.stringify(guideOutPayload(t, a.dataset.out as OutDest, g, { device: guideDevice(), build, rate }));
      (deps.send ?? ((p: string, d: string) => navigator.sendBeacon(p, d)))(GUIDE_OUT_PATH, body);
    } catch {
      // Reporting must never break the link.
    }
  });
}
