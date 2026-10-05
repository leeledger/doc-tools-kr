import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BEACON_CONNECT, BEACON_SRC, analyticsToken, withAnalyticsCsp } from '../../scripts/lib/analytics.mjs';

const ROOT = join(import.meta.dirname, '..', '..');

describe('visitor counts (owner 2026-10-05): Cloudflare Web Analytics behind PUBLIC_CF_ANALYTICS_TOKEN', () => {
  it('analyticsToken: unset is off, a 32-hex token passes trimmed, anything else throws', () => {
    expect(analyticsToken(undefined)).toBe('');
    expect(analyticsToken('  ')).toBe('');
    expect(analyticsToken(' 0123456789abcdef0123456789abcdef ')).toBe('0123456789abcdef0123456789abcdef');
    expect(() => analyticsToken('G-ABC123')).toThrow('is not a Cloudflare Web Analytics token');
    expect(() => analyticsToken('0123456789ABCDEF0123456789ABCDEF')).toThrow();
  });
  it('withAnalyticsCsp: only script-src and connect-src of the site-wide policy gain the beacon hosts', () => {
    const headers = readFileSync(join(ROOT, 'public', '_headers'), 'utf8');
    const out = withAnalyticsCsp(headers);
    const csp = out.match(/Content-Security-Policy: (.*)/)![1]!;
    expect(csp).toContain(`script-src 'self' ${new URL(BEACON_SRC).origin} 'wasm-unsafe-eval';`);
    expect(csp).toContain(`connect-src 'self' ${BEACON_CONNECT};`);
    expect(csp).toContain("default-src 'self';");
    expect(out.replace(/^.*Content-Security-Policy.*$/m, '')).toBe(headers.replace(/^.*Content-Security-Policy.*$/m, ''));
    expect(() => withAnalyticsCsp('/*\n  X-Content-Type-Options: nosniff\n')).toThrow('no site-wide Content-Security-Policy');
  });
});
