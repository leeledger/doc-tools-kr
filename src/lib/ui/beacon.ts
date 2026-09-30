// Error beacon stub (brief Polish P.18). OFF unless PUBLIC_ERROR_BEACON_PATH is set and starts with "/"
// (same origin, inside connect-src 'self'). The path is a build-time constant, so an off build contains no
// beacon call at all (check-dist asserts there is no sendBeacon in dist/). The payload is built field by
// field from a fixed whitelist; nothing about the file (name, size, content) is ever part of it.
import { detectDevice, type Device } from './device';

/** '' when off. astro.config.mjs only passes a same-origin path (scripts/lib/beacon-path.mjs: "/x", never "//x"). */
export const BEACON_PATH: string = __ERROR_BEACON_PATH__;
export const BEACON_ENABLED = __ERROR_BEACON_PATH__ !== '';
export const SAMPLE_RATE = 0.1;

export type BeaconTool = 'pdf-merge' | 'pdf-compress' | 'photo-compress' | 'id-photo';
export type BeaconPhase = 'load' | 'parse' | 'process' | 'save';

export interface BeaconInput {
  tool: BeaconTool;
  phase: BeaconPhase;
  /** A PdfErrorCode, `engine` or a photo error code. */
  code: string;
}

export interface BeaconPayload {
  tool: string;
  phase: string;
  code: string;
  browser: string;
  device: Device;
  build: string;
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

const CODE_RE = /^[a-z-]{1,24}$/;

/** The whitelisted payload, field by field (never spread from the input). */
export function buildPayload(input: BeaconInput, env: { ua: string; device: Device; build: string }): BeaconPayload {
  return {
    tool: input.tool,
    phase: input.phase,
    code: CODE_RE.test(input.code) ? input.code : 'unknown',
    browser: browserFamily(env.ua),
    device: env.device,
    build: env.build,
  };
}

export interface ReporterDeps {
  random?: () => number;
  send?: (path: string, body: string) => boolean;
  device?: Device;
  ua?: string;
  build?: string;
}

/** A reporter for `path`: sampled 1 in 10, never throws. */
export function createReporter(path: string, deps: ReporterDeps = {}): (input: BeaconInput) => void {
  return (input) => {
    if ((deps.random ?? Math.random)() >= SAMPLE_RATE) return;
    const env = {
      ua: deps.ua ?? navigator.userAgent,
      device: deps.device ?? detectDevice(),
      build: deps.build ?? document.querySelector('meta[name="build-id"]')?.getAttribute('content') ?? 'dev',
    };
    const body = JSON.stringify(buildPayload(input, env));
    try {
      (deps.send ?? ((p: string, d: string) => navigator.sendBeacon(p, d)))(path, body);
    } catch {
      // Reporting must never break the tool.
    }
  };
}

const noop = (): void => undefined;

/**
 * Reports one non-user-caused failure (engine, oom, unknown, verify). While the beacon is off this is a
 * no-op and the reporter (with its sendBeacon) is dropped from the bundle.
 */
export const reportError: (input: BeaconInput) => void = BEACON_ENABLED ? createReporter(BEACON_PATH) : noop;
