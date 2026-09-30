// Growth G.4 (T3): the IndexNow ping, with a mocked fetch: preflight, host check, status handling, --sitemap.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ENDPOINT, readKey, run } from '../../scripts/indexnow.mjs';

const KEY = '0123456789abcdef0123456789abcdef';
const root = mkdtempSync(join(tmpdir(), 'indexnow-'));
mkdirSync(join(root, 'src', 'data'), { recursive: true });
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'src', 'data', 'indexnow.json'), JSON.stringify({ key: KEY }));
writeFileSync(
  join(root, 'dist', 'sitemap.xml'),
  '<urlset><url><loc>https://docttak.com/</loc></url><url><loc>https://docttak.com/guide/</loc></url><url><loc>https://docttak.com/</loc></url></urlset>',
);

const env = { PUBLIC_SITE_URL: 'https://docttak.com' };
const res = (status: number, body = '') => new Response(body, { status });

function mockFetch(keyBody: string, keyStatus: number, postStatus: number, postBody = '') {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    if (String(url).endsWith(`${KEY}.txt`)) return res(keyStatus, keyBody);
    if (String(url) === ENDPOINT && init?.method === 'POST') return res(postStatus, postBody);
    throw new Error(`unexpected ${String(url)}`);
  });
}
const quiet = { log: () => undefined, error: () => undefined };

describe('IndexNow (T3)', () => {
  it('the committed key is 32 hex characters and public/<key>.txt holds it', () => {
    const key = readKey();
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(readFileSync(join(__dirname, '..', '..', 'public', `${key}.txt`), 'utf8').trim()).toBe(key);
  });

  it('a preflight mismatch sends no POST and exits 1', async () => {
    for (const [body, status] of [['wrong', 200], ['', 404]] as const) {
      const f = mockFetch(body, status, 200);
      const errors: string[] = [];
      expect(await run(['https://docttak.com/'], { fetch: f as never, env, root, log: () => undefined, error: (s) => errors.push(s) })).toBe(1);
      expect(f.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === 'POST')).toBe(false);
      expect(errors.join()).toContain('IndexNow 키 파일이 사이트에 없습니다');
    }
  });

  it('an off-host or non-https URL is rejected before any request', async () => {
    const f = mockFetch(KEY, 200, 200);
    expect(await run(['https://evil.example/x'], { fetch: f as never, env, root, ...quiet })).toBe(1);
    expect(await run(['http://docttak.com/'], { fetch: f as never, env, root, ...quiet })).toBe(1);
    expect(f).not.toHaveBeenCalled();
  });

  it('200 and 202 succeed; 400, 403, 422 and 429 exit 1 with the status', async () => {
    for (const s of [200, 202]) expect(await run(['https://docttak.com/'], { fetch: mockFetch(KEY, 200, s) as never, env, root, ...quiet })).toBe(0);
    for (const s of [400, 403, 422, 429]) {
      const errors: string[] = [];
      expect(await run(['https://docttak.com/'], { fetch: mockFetch(KEY, 200, s, 'x'.repeat(500)) as never, env, root, log: () => undefined, error: (e) => errors.push(e) })).toBe(1);
      expect(errors[0]).toContain(String(s));
      expect(errors[0]!.length).toBeLessThan(260);
    }
  });

  it('--sitemap reads dist/sitemap.xml; URLs are de-duplicated; the body shape and keyLocation', async () => {
    const f = mockFetch(`${KEY}\n`, 200, 202);
    expect(await run(['--sitemap', 'https://docttak.com/'], { fetch: f as never, env, root, ...quiet })).toBe(0);
    const post = f.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'POST')!;
    const init = post[1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json; charset=utf-8');
    const body = JSON.parse(String(init.body));
    expect(Object.keys(body).sort()).toEqual(['host', 'key', 'keyLocation', 'urlList']);
    expect(body).toMatchObject({ host: 'docttak.com', key: KEY, keyLocation: `https://docttak.com/${KEY}.txt` });
    expect(body.urlList).toEqual(['https://docttak.com/', 'https://docttak.com/guide/']);
  });

  it('--dry-run sends nothing; a network error exits 1', async () => {
    const f = mockFetch(KEY, 200, 200);
    expect(await run(['--dry-run', 'https://docttak.com/'], { fetch: f as never, env, root, ...quiet })).toBe(0);
    expect(f).not.toHaveBeenCalled();
    const down = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await run(['https://docttak.com/'], { fetch: down as never, env, root, ...quiet })).toBe(1);
  });
});
