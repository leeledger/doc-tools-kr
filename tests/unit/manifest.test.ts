// TWA brief step 1: the web app manifest gains id, description, categories and Android shortcuts; the Bubblewrap
// project (twa/twa-manifest.json) carries the same shortcuts, so the app's long-press menu matches the site.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultDescription } from '../../src/data/site';
import { getTool } from '../../src/data/tools';
import { SHORTCUT_SLUGS, SHORT_LABEL_MAX, webManifest } from '../../src/data/web-manifest';

const m = webManifest();
const twa = JSON.parse(readFileSync('twa/twa-manifest.json', 'utf8')) as {
  packageId: string;
  host: string;
  startUrl: string;
  themeColor: string;
  backgroundColor: string;
  shortcuts: { name: string; shortName: string; url: string; chosenIconUrl: string }[];
  webManifestUrl: string;
  iconUrl: string;
  maskableIconUrl: string;
  enableNotifications: boolean;
  fallbackType: string;
  features: Record<string, unknown>;
  signingKey: { path: string; alias: string };
  appVersionCode: number;
  appVersion: string;
};

describe('web app manifest', () => {
  it('keeps the web install unchanged: start_url and scope "/", standalone, no orientation', () => {
    expect(m).toMatchObject({ start_url: '/', scope: '/', display: 'standalone', background_color: '#ffffff' });
    expect(m).not.toHaveProperty('orientation');
  });

  it('has id "/", the home meta description and the store categories', () => {
    expect(m.id).toBe('/');
    expect(m.description).toBe(defaultDescription());
    expect(m.categories).toEqual(['productivity', 'utilities']);
  });

  it('has at most 4 shortcuts, named from tools.ts, each with a 192px icon', () => {
    expect(m.shortcuts.length).toBeLessThanOrEqual(4);
    expect(m.shortcuts.map((s) => s.url)).toEqual(['/id-photo/', '/pdf-merge/', '/hwp-to-pdf/', '/photo-compress/']);
    for (const [i, s] of m.shortcuts.entries()) {
      expect(s.name).toBe(getTool(SHORTCUT_SLUGS[i]!).name);
      expect([...s.short_name].length).toBeLessThanOrEqual(SHORT_LABEL_MAX);
      expect(getTool(SHORTCUT_SLUGS[i]!).status).toBe('live');
      expect(s.icons).toEqual([{ src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' }]);
    }
  });
});

describe('twa/twa-manifest.json', () => {
  const origin = `https://${twa.host}`;

  it('mirrors the web manifest shortcuts (same names, absolute URLs on the app host)', () => {
    expect(twa.shortcuts).toEqual(
      m.shortcuts.map((s) => ({ name: s.name, shortName: s.short_name, url: `${origin}${s.url}`, chosenIconUrl: `${origin}${s.icons[0]!.src}` })),
    );
  });

  it('points at the production site with the app attribution start URL', () => {
    expect(twa.packageId).toBe('com.docttak.app');
    expect(twa.host).toBe('docttak.com');
    expect(twa.startUrl).toBe('/?utm_source=play&utm_medium=twa');
    expect(twa.webManifestUrl).toBe(`${origin}/manifest.webmanifest`);
    expect(twa.iconUrl).toBe(`${origin}/brand/icon-512.png`);
    expect(twa.maskableIconUrl).toBe(`${origin}/brand/icon-maskable-512.png`);
    expect(twa.themeColor.toLowerCase()).toBe(m.theme_color.toLowerCase());
    expect(twa.backgroundColor.toLowerCase()).toBe(m.background_color);
  });

  it('asks for nothing extra: no notifications, no billing, no location; Custom Tabs fallback', () => {
    expect(twa.enableNotifications).toBe(false);
    expect(twa.features).toEqual({});
    expect(twa.fallbackType).toBe('customtabs');
  });

  it('matches the generated project: manifest-checksum.txt is the SHA-1 of twa-manifest.json (else `bubblewrap build` prompts)', () => {
    const sum = createHash('sha1').update(readFileSync('twa/twa-manifest.json')).digest('hex');
    expect(readFileSync('twa/manifest-checksum.txt', 'utf8').trim()).toBe(sum);
  });

  it('signs with the upload key outside the repo; holds no password', () => {
    expect(twa.signingKey).toEqual({ path: 'C:\\Users\\force\\.docttak-keys\\docttak-upload.jks', alias: 'upload' });
    expect(JSON.stringify(twa)).not.toMatch(/password/i);
    expect(Number.isInteger(twa.appVersionCode) && twa.appVersionCode >= 1).toBe(true);
    expect(twa.appVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('twa/screenshots.mjs (Play listing images)', () => {
  it('feeds the tools a synthetic picture only: no photo fixture (real people, paintings) can reach a store screenshot', () => {
    const src = readFileSync('twa/screenshots.mjs', 'utf8');
    expect(src).not.toMatch(/portrait_pd|scene_cc0|cc0-person|exif6_gps|p3_patches|bgremove|bgcloud|['"]photo['"]/);
    expect(src).toContain('syntheticPhoto');
  });
});
