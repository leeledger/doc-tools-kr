// Ops automation (docs/OPS-RUNBOOK.md, REVENUE-MODEL §3): parsers and decision logic of scripts/ops/, with
// mocked fetch and a fake GitHub. No network.
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../../scripts/ops/lib/common.mjs';
import { createGitHub } from '../../scripts/ops/lib/github.mjs';
import { buildIdOf, buildMatches, changedUrls, findQuote, hasExactQuote, internalLinks, offSiteScripts, pageProblems, pageText, pageTextExact, quoteFragments, sitemapEntries } from '../../scripts/ops/lib/html.mjs';
import { parseFrontmatter, parsePresets, readGuides, readPresets, unquote, watchList } from '../../scripts/ops/lib/guides.mjs';
import { accessToken, fetchGrowth, parseServiceAccount, signJwt } from '../../scripts/ops/lib/gsc.mjs';
import { sumDays } from '../../scripts/ops/lib/cloudflare.mjs';
import { R1, isoWeek, parseReportData, r1Status, renderReport, weekMonday } from '../../scripts/ops/lib/report.mjs';
import { coveredBy, findOpportunities, suggestTool } from '../../scripts/ops/opportunities.mjs';
import { checkSources, issueBody, run as sourceWatch } from '../../scripts/ops/source-watch.mjs';
import { checkHealth } from '../../scripts/ops/health.mjs';
import { run as waitDeploy } from '../../scripts/ops/wait-deploy.mjs';
import { run as indexnowDiff } from '../../scripts/ops/indexnow-diff.mjs';
import { run as monetize } from '../../scripts/ops/monetize.mjs';
import { run as growth } from '../../scripts/ops/growth.mjs';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const quiet = { log: () => undefined, error: () => undefined };
const html = (status: number, body: string, type = 'text/html; charset=utf-8') => new Response(body, { status, headers: { 'content-type': type } });
const noWait = async () => undefined;

function fakeGitHub(existing: number[] = []) {
  return {
    live: true,
    issues: vi.fn(async () => existing.map((number) => ({ number }))),
    ensureLabel: vi.fn(),
    upsert: vi.fn(async (_o: { label: string; title: string; body: string }) => ({ action: 'opened', number: 1 })),
    closeAll: vi.fn(async () => []),
    commentOpen: vi.fn(async () => []),
    create: vi.fn(async (_o: { label: string; title: string; body: string }) => ({ action: 'opened', number: 1 })),
  };
}

const SITEMAP = (rows: [string, string][]) => `<?xml version="1.0"?><urlset>${rows.map(([l, d]) => `<url><loc>${l}</loc><lastmod>${d}</lastmod></url>`).join('\n')}</urlset>`;

describe('args', () => {
  it('reads flags, value options, key=value and positionals', () => {
    const a = parseArgs(['open', '--label', 'ops:x', '--dry-run', '--title=hi there', '--sha', 'abc']);
    expect(a.positional).toEqual(['open']);
    expect(a.opts).toEqual({ label: 'ops:x', title: 'hi there', sha: 'abc' });
    expect(a.dryRun).toBe(true);
  });
});

describe('sitemap and build id', () => {
  const prev = SITEMAP([['https://docttak.com/', '2026-09-30'], ['https://docttak.com/a/', '2026-09-30']]);
  const cur = SITEMAP([['https://docttak.com/', '2026-10-01'], ['https://docttak.com/a/', '2026-09-30'], ['https://docttak.com/b/', '2026-10-01']]);
  it('parses loc and lastmod', () => {
    expect(sitemapEntries(cur)).toEqual([
      { loc: 'https://docttak.com/', lastmod: '2026-10-01' },
      { loc: 'https://docttak.com/a/', lastmod: '2026-09-30' },
      { loc: 'https://docttak.com/b/', lastmod: '2026-10-01' },
    ]);
  });
  it('changed = new or lastmod changed; no previous = everything', () => {
    expect(changedUrls(prev, cur)).toEqual(['https://docttak.com/', 'https://docttak.com/b/']);
    expect(changedUrls(null, cur)).toHaveLength(3);
    expect(changedUrls(cur, cur)).toEqual([]);
  });
  it('reads the build id and matches it to the commit SHA prefix', () => {
    expect(buildIdOf('<head><meta name="build-id" content="f181dc0387a0"></head>')).toBe('f181dc0387a0');
    expect(buildIdOf('<head></head>')).toBeNull();
    expect(buildMatches('f181dc0387a0', 'f181dc0387a07e02c47bbd38d7473ff2f535e54e')).toBe(true);
    expect(buildMatches('4af0dd8b981c', 'f181dc0387a07e02c47bbd38d7473ff2f535e54e')).toBe(false);
    expect(buildMatches('dev', 'f181dc0387a0')).toBe(false);
    expect(buildMatches(null, 'f181dc0387a0')).toBe(false);
  });
});

const GOOD = (url: string, extra = '') => `<!doctype html><html><head>
<link rel="canonical" href="${url}">
<meta property="og:title" content="t"><meta property="og:description" content="d">
<meta property="og:image" content="https://docttak.com/og/x.png"><meta property="og:url" content="${url}">
<script type="application/ld+json">{"@context":"https://schema.org"}</script>
<script type="module" src="/_astro/page.js"></script>${extra}
</head><body><a href="/pdf-merge/">a</a><a href="/guide/x/#faq">b</a><a href="https://example.com/">c</a><a href="mailto:x@y.z">m</a></body></html>`;

describe('page checks (A-4)', () => {
  const url = 'https://docttak.com/pdf-merge/';
  it('a healthy page has no problems', () => {
    expect(pageProblems(GOOD(url), url)).toEqual([]);
  });
  it('flags missing canonical/OG/JSON-LD and a canonical to another page', () => {
    const p = pageProblems('<html><head><link rel="canonical" href="https://docttak.com/"></head></html>', url);
    expect(p).toContain('canonical이 다른 주소: https://docttak.com/');
    expect(p).toEqual(expect.arrayContaining(['og:title 없음', 'og:image 없음', 'JSON-LD 없음']));
  });
  it('the legal pages need no JSON-LD', () => {
    const legal = 'https://docttak.com/privacy/';
    expect(pageProblems(GOOD(legal).replace(/<script type="application\/ld\+json">.*<\/script>/, ''), legal)).toEqual([]);
  });
  it('catches off-site and Cloudflare-injected scripts', () => {
    const page = GOOD(url, '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{}\'></script><script src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script>');
    expect(offSiteScripts(page, url)).toEqual(['https://static.cloudflareinsights.com/beacon.min.js', 'https://docttak.com/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js']);
    expect(offSiteScripts(GOOD(url), url)).toEqual([]);
    // Our own marked beacon (PUBLIC_CF_ANALYTICS_TOKEN) passes; an injected one next to it still shows.
    const own = '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="{&quot;token&quot;:&quot;0123456789abcdef0123456789abcdef&quot;}" data-site-analytics></script>';
    expect(offSiteScripts(GOOD(url, own), url)).toEqual([]);
    expect(offSiteScripts(GOOD(url, `${own}<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{}'></script>`), url)).toEqual(['https://static.cloudflareinsights.com/beacon.min.js']);
  });
  it('lists internal links without fragments, mailto or other hosts', () => {
    expect(internalLinks(GOOD(url), url)).toEqual(['https://docttak.com/pdf-merge/', 'https://docttak.com/guide/x/']);
  });
  it('checkHealth: 200s, head checks, a broken internal link, and a 500 page', async () => {
    const pages: Record<string, Response | (() => Response)> = {};
    const fetchImpl = vi.fn(async (u: string | URL) => {
      const s = String(u);
      if (s.endsWith('/sitemap.xml')) return html(200, SITEMAP([['https://docttak.com/pdf-merge/', 'x'], ['https://docttak.com/bad/', 'x']]), 'application/xml');
      if (s === 'https://docttak.com/pdf-merge/') return html(200, GOOD(s));
      if (s === 'https://docttak.com/bad/') return html(500, 'oops');
      if (s === 'https://docttak.com/guide/x/') return html(404, 'nf');
      return pages[s] as Response;
    });
    const r = await checkHealth('https://docttak.com', { fetchImpl: fetchImpl as unknown as typeof fetch, wait: noWait });
    expect(r.problems).toEqual([
      { url: 'https://docttak.com/bad/', problem: 'HTTP 500' },
      { url: 'https://docttak.com/guide/x/', problem: '내부 링크 깨짐: HTTP 404 (링크한 페이지: /pdf-merge/)' },
    ]);
    // 500 is retried (2 retries) before it counts.
    expect(fetchImpl.mock.calls.filter((c) => String(c[0]) === 'https://docttak.com/bad/')).toHaveLength(3);
  });
});

describe('quotes (A-3)', () => {
  it('splits elisions and preset joins into fragments', () => {
    expect(quoteFragments('가나다라마 … 바사아자차')).toEqual(['가나다라마', '바사아자차']);
    expect(quoteFragments('파일 크기 500KB 이하 / 머리 길이는 3.2~3.6cm')).toEqual(['파일 크기 500KB 이하', '머리 길이는 3.2~3.6cm']);
    expect(quoteFragments('파일형식 : *.JPG 또는 *.JPEG · 파일용량 : 200KB 이하')).toHaveLength(1);
  });
  it('finds a quote across tags, entities, whitespace and punctuation variants', () => {
    const text = pageText('<p>파일형식&nbsp;: *.JPG 또는 *.JPEG <br>ㆍ 파일용량 :  <b>200KB</b> 이하</p><script>var x="파일용량"</script>');
    expect(findQuote('파일형식 : *.JPG 또는 *.JPEG · 파일용량 : 200KB 이하', text).found).toBe(true);
    expect(findQuote('3.5cm x 4.5cm', pageText('3.5cm × 4.5cm')).found).toBe(true);
  });
  it('a changed quote is not found and the context shows the closest current text', () => {
    const text = pageText('<p>안내: 파일용량 : 300KB 이하로 올려 주세요.</p>');
    const r = findQuote('파일용량 : 200KB 이하', text);
    expect(r.found).toBe(false);
    expect(r.context).toContain('파일용량 : 300KB 이하');
    expect(findQuote('전혀 다른 문장입니다', text)).toEqual({ found: false, context: null });
  });
  it('checkSources: found, changed, unreachable, and a preset quote spread over two pages', async () => {
    const list = [
      { urls: ['https://a.go.kr/1'], quote: '사진은 6개월 이내 촬영', origin: 'guide g', pages: ['/guide/g/'] },
      { urls: ['https://a.go.kr/1'], quote: '배경은 흰색', origin: 'guide g', pages: ['/guide/g/'] },
      { urls: ['https://a.go.kr/1', 'https://a.go.kr/2'], quote: '사진은 6개월 이내 촬영 / 머리 길이 3.2~3.6cm', origin: 'preset p', pages: ['/id-photo/'] },
      { urls: ['https://down.go.kr/'], quote: '아무 문구', origin: 'guide h', pages: ['/guide/h/'] },
    ];
    const bodies: Record<string, { ok: boolean; status: number; text?: string; error?: string }> = {
      'https://a.go.kr/1': { ok: true, status: 200, text: '<p>사진은 6개월 이내 촬영한 것. 배경은 회색</p>' },
      'https://a.go.kr/2': { ok: true, status: 200, text: '<p>머리 길이 3.2∼3.6cm</p>' },
      'https://down.go.kr/': { ok: false, status: 503 },
    };
    const get = vi.fn(async (u: string) => bodies[u]!);
    const r = await checkSources(list, get);
    expect(get).toHaveBeenCalledTimes(3); // each URL once
    expect(r.checked).toBe(4);
    expect(r.changed).toHaveLength(1);
    expect(r.changed[0]).toMatchObject({ quote: '배경은 흰색', url: 'https://a.go.kr/1', pages: ['/guide/g/'] });
    expect(r.unreachable).toEqual([{ pages: ['/guide/h/'], url: 'https://down.go.kr/', why: 'HTTP 503', quote: '아무 문구' }]);
  });
  it('G2 A1 publish gate: the exact check joins inline tags, breaks at block tags, folds whitespace runs and rejects an added space', () => {
    // The live kosaf markup (2026-10-02): the menu path is split across <FONT>/<STRONG> with no space between.
    const html = '<P>1) 홈페이지 업로드(빠른접수) : <FONT color=#ff0000>로그인&gt;장학금&gt;장학금신청&gt;서류제출현황</FONT></STRONG><FONT><STRONG> 우측 하단 [서류제출]클릭&nbsp;후 파일 업로드</STRONG></FONT></P><p>다음\n\n  줄</p>';
    const text = pageTextExact(html);
    expect(hasExactQuote('1) 홈페이지 업로드(빠른접수) : 로그인>장학금>장학금신청>서류제출현황 우측 하단 [서류제출]클릭 후 파일 업로드', text)).toBe(true);
    // The A1 defect: three added spaces. The lenient watch matcher accepts it; the gate must not.
    const bad = '1) 홈페이지 업로드(빠른접수) : 로그인>장학금>장학금신청> 서류제출 현황 우측 하단 [ 서류제출 ]클릭 후 파일 업로드';
    expect(findQuote(bad, pageText(html)).found).toBe(true);
    expect(hasExactQuote(bad, text)).toBe(false);
    expect(hasExactQuote('업로드(빠른접수)', text)).toBe(true);
    expect(hasExactQuote('업로드 (빠른접수)', text)).toBe(false);
    // A whitespace run in the page or the quote counts as one space; a block tag is a break, not a join.
    expect(hasExactQuote('다음 줄', text)).toBe(true);
    expect(pageTextExact('<p>가</p><p>나</p>')).toBe('가 나');
    expect(pageTextExact('가<b>나</b>다')).toBe('가나다');
  });
  it('G2 A1 publish gate: checkSources({ exact: true }) reports a quote with an added space as changed', async () => {
    const page = { ok: true, status: 200, text: '<p>입은 다물어야 하며(치아 노출 불가)</p>' };
    const entry = { urls: ['https://a.go.kr/p'], quote: '입은 다물어야 하며 (치아 노출 불가)', origin: 'guide p', pages: ['/guide/p/'] };
    expect((await checkSources([entry], async () => page)).changed).toEqual([]);
    expect((await checkSources([entry], async () => page, { exact: true })).changed).toHaveLength(1);
    expect((await checkSources([{ ...entry, quote: '입은 다물어야 하며(치아 노출 불가)' }], async () => page, { exact: true })).changed).toEqual([]);
  });
  it('G2 A1: a browser-read quote is never fetched, changed or unreachable; it is listed for a manual check and opens no issue', async () => {
    const entry = { urls: ['https://shell.kr/faq'], quote: '사진은 3개월 이내', origin: 'guide b', pages: ['/guide/b/'], via: 'browser' };
    const get = vi.fn(async () => ({ ok: false, status: 0, error: 'should not be called' }));
    const r = await checkSources([entry], get);
    expect(get).not.toHaveBeenCalled();
    expect(r).toMatchObject({ checked: 0, changed: [], unreachable: [], manual: [{ pages: ['/guide/b/'], url: 'https://shell.kr/faq', quote: '사진은 3개월 이내' }] });
    expect(issueBody(r, '2026-10-01', '')).toContain('## 수동 확인 (브라우저 출처) (1)');
    const fm = parseFrontmatter(`---\ntitle: T\nquery: q\nsources:\n  - url: https://shell.kr/faq\n    title: S\n    quote: '사진은 3개월 이내'\n    retrieved: '2026-10-01'\n    via: browser\n---\n`)!;
    const guide = { slug: 'b', path: '/guide/b/', ...fm };
    expect(watchList([guide], [])[0]).toMatchObject({ via: 'browser', pages: ['/guide/b/'] });
    const upsert = vi.fn();
    const commentOpen = vi.fn();
    const logs: string[] = [];
    const fetchImpl = vi.fn();
    const code = await sourceWatch([], { guides: [guide], presets: [], log: (s: string) => logs.push(s), env: {}, fetchImpl, wait: async () => {}, github: { upsert, commentOpen } });
    expect(code).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('수동 확인 (브라우저 출처)');
  });
});

describe('guide and preset data', () => {
  it('unquotes YAML scalars', () => {
    expect(unquote("'it''s'")).toBe("it's");
    expect(unquote('"a\\"b"')).toBe('a"b');
    expect(unquote(' plain ')).toBe('plain');
  });
  it('parses the frontmatter sources', () => {
    const fm = parseFrontmatter(`---\ntitle: 제목\nquery: 검색어\nsources:\n  - preset: passport_online\n  - url: https://x.go.kr/a\n    title: T\n    quote: '입은 다물어야 하며 (치아 노출 불가)'\n    retrieved: '2026-09-30'\nfaq:\n  - q: 질문\n---\nbody`);
    expect(fm).toEqual({ title: '제목', query: '검색어', draft: false, sources: [{ preset: 'passport_online' }, { url: 'https://x.go.kr/a', title: 'T', quote: '입은 다물어야 하며 (치아 노출 불가)', retrieved: '2026-09-30' }] });
  });
  it('reads every real guide; published ones cite sources with quotes or presets', () => {
    const guides = readGuides();
    expect(guides.length).toBeGreaterThanOrEqual(10);
    for (const g of guides.filter((x) => !x.draft)) {
      expect(g.title, g.slug).not.toBe('');
      expect(g.sources.length, g.slug).toBeGreaterThan(0);
      for (const s of g.sources) expect(Boolean((s.url && s.quote) || s.preset), `${g.slug} ${JSON.stringify(s)}`).toBe(true);
    }
  });
  it('reads the official presets with resolved URLs and quotes', () => {
    const presets = readPresets();
    expect(presets.map((p) => p.id)).toEqual(['passport_online', 'gosi', 'qnet', 'history', 'korcham', 'teps', 'kuksiwon', 'saramin', 'jobkorea']);
    for (const p of presets) {
      expect(p.urls.length, p.id).toBeGreaterThan(0);
      for (const u of p.urls) expect(u, p.id).toMatch(/^https:\/\//);
      expect(p.quote.length, p.id).toBeGreaterThan(10);
    }
    expect(presets[0]!.urls).toContain('https://www.passport.go.kr/home/kor/contents.do?menuPos=32');
    expect(parsePresets("const A_URL = 'https://a';\nexport const PRESETS = [\n  {\n    id: 'x',\n    label: 'X',\n    status: 'official',\n    sourceUrls: [A_URL, 'https://b'],\n    quote: 'it\\'s',\n  },\n];")).toEqual([{ id: 'x', label: 'X', urls: ['https://a', 'https://b'], quote: "it's" }]);
  });
  it('the watch list dedupes a preset cited by guides and the tool', () => {
    const list = watchList(readGuides(), readPresets());
    const passport = list.find((e) => e.origin === 'preset passport_online')!;
    expect(passport.pages[0]).toBe('/id-photo/');
    expect(passport.pages).toContain('/guide/passport-photo/');
    expect(list.filter((e) => e.origin === 'preset passport_online')).toHaveLength(1);
  });
});

describe('Search Console auth and queries (A-5)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const sa = parseServiceAccount(JSON.stringify({ type: 'service_account', client_email: 'ops@p.iam.gserviceaccount.com', private_key: privateKey, token_uri: 'https://oauth2.googleapis.com/token' }));
  it('rejects a key without the fields', () => {
    expect(() => parseServiceAccount('{}')).toThrow(/client_email/);
    expect(() => parseServiceAccount('nope')).toThrow(/not JSON/);
  });
  it('signs an RS256 JWT with the read-only scope', () => {
    const jwt = signJwt(sa, 1_700_000_000);
    const [h, c, s] = jwt.split('.');
    const dec = (x: string) => JSON.parse(Buffer.from(x, 'base64url').toString('utf8'));
    expect(dec(h!)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(dec(c!)).toEqual({ iss: 'ops@p.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat: 1_700_000_000, exp: 1_700_003_600 });
    const v = createVerify('RSA-SHA256');
    v.update(`${h}.${c}`);
    expect(v.verify(publicKey, Buffer.from(s!, 'base64url'))).toBe(true);
  });
  it('exchanges the JWT for a token and surfaces a Google error', async () => {
    const ok = vi.fn(async (_u: string, init: RequestInit) => {
      expect(String(init.body)).toMatch(/^grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=/);
      return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
    });
    expect(await accessToken(sa, { fetchImpl: ok as unknown as typeof fetch })).toBe('tok');
    const bad = async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'bad key' }), { status: 400 });
    await expect(accessToken(sa, { fetchImpl: bad as unknown as typeof fetch })).rejects.toThrow('Google token: 400 invalid_grant bad key');
  });
  it('fetchGrowth asks for 7- and 28-day ranges ending at the given day', async () => {
    const calls: Record<string, unknown>[] = [];
    const query = async (b: Record<string, unknown>) => {
      calls.push(b);
      if (!b.dimensions) return [{ clicks: 5, impressions: 100, ctr: 0.05, position: 7.2 }];
      return [{ keys: ['여권사진 규격'], clicks: 3, impressions: 60, ctr: 0.05, position: 4 }];
    };
    const g = await fetchGrowth(query, new Date('2026-09-28T00:00:00Z'));
    expect(g.range7).toEqual({ startDate: '2026-09-22', endDate: '2026-09-28' });
    expect(g.range28).toEqual({ startDate: '2026-09-01', endDate: '2026-09-28' });
    expect(g.last7.clicks).toBe(5);
    expect(g.queries28[0]).toEqual({ key: '여권사진 규격', clicks: 3, impressions: 60, ctr: 0.05, position: 4 });
    expect(calls.find((c) => (c.dimensions as string[] | undefined)?.[0] === 'query' && c.rowLimit === 500)).toBeTruthy();
  });
});

describe('Cloudflare sums', () => {
  it('sums only the days in range', () => {
    const g = (date: string, requests: number) => ({ dimensions: { date }, sum: { requests, cachedRequests: 1, bytes: 1000, cachedBytes: 0, pageViews: 2 }, uniq: { uniques: 3 } });
    const s = sumDays([g('2026-09-01', 10), g('2026-09-25', 20), g('2026-09-30', 30)], '2026-09-24', '2026-09-30');
    expect(s).toEqual({ requests: 50, cachedRequests: 2, bytes: 2000, cachedBytes: 0, pageViews: 4, uniques: 6, days: 2 });
  });
});

describe('weeks and the R1 trigger (M-3)', () => {
  it('ISO weeks, including year boundaries', () => {
    expect(isoWeek(new Date('2026-10-01T00:00:00Z')).label).toBe('2026-40');
    expect(isoWeek(new Date('2021-01-03T00:00:00Z')).label).toBe('2020-53');
    expect(isoWeek(new Date('2024-12-30T00:00:00Z')).label).toBe('2025-01');
    expect(new Date(weekMonday('2026-40')).toISOString().slice(0, 10)).toBe('2026-09-28');
    expect(new Date(weekMonday('2025-01')).toISOString().slice(0, 10)).toBe('2024-12-30');
  });
  const rep = (week: string, clicks: number | null) => ({ week, gsc: clicks === null ? null : { last7: { clicks } } });
  it('met: ≥ 15 pages and 4 consecutive weeks of ≥ 100 clicks (across a year boundary)', () => {
    const s = r1Status(21, [rep('2025-51', 50), rep('2025-52', 120), rep('2026-01', 100), rep('2026-02', 300), rep('2026-03', 150)]);
    expect(s).toMatchObject({ pagesOk: true, streak: 4, clicksOk: true, met: true });
    expect(s.recent.map((r) => r.week)).toEqual(['2025-52', '2026-01', '2026-02', '2026-03']);
  });
  it('not met: a gap week, a week under 100, too few pages, or no GSC data', () => {
    expect(r1Status(21, [rep('2026-01', 200), rep('2026-02', 200), rep('2026-04', 200), rep('2026-05', 200)]).met).toBe(false);
    expect(r1Status(21, [rep('2026-01', 200), rep('2026-02', 99), rep('2026-03', 200), rep('2026-04', 200)]).streak).toBe(2);
    expect(r1Status(14, [rep('2026-01', 200), rep('2026-02', 200), rep('2026-03', 200), rep('2026-04', 200)])).toMatchObject({ clicksOk: true, pagesOk: false, met: false });
    expect(r1Status(21, [rep('2026-01', null)]).streak).toBe(0);
    expect(R1).toEqual({ minPages: 15, minWeeklyClicks: 100, weeks: 4 });
  });
  it('the report carries its data line, which parses back', () => {
    const gsc = { range7: { startDate: 'a', endDate: 'b' }, range28: { startDate: 'c', endDate: 'd' }, last7: { clicks: 120, impressions: 3000, ctr: 0.04, position: 8.5 }, last28: { clicks: 400, impressions: 9000, ctr: 0.044, position: 9 }, queries7: [], queries28: [{ key: 'a|b', clicks: 1, impressions: 2, ctr: 0.5, position: 1 }], pages28: [] };
    const md = renderReport({ week: '2026-40', generated: '2026-10-01', sitemapCount: 21, gsc, cf: null, notes: ['CF_API_TOKEN 없음'], r1: r1Status(21, []) });
    expect(md).toContain('| a\\|b |');
    expect(md).toContain('> CF_API_TOKEN 없음');
    expect(parseReportData(md)).toEqual({ week: '2026-40', generated: '2026-10-01', sitemapCount: 21, gsc: { range7: gsc.range7, range28: gsc.range28, last7: gsc.last7, last28: gsc.last28 }, cf: null });
    expect(parseReportData('# no data')).toBeNull();
  });
  it('monetize opens one issue when met, never twice', async () => {
    const reports = ['2026-01', '2026-02', '2026-03', '2026-04'].map((w) => rep(w, 150));
    const gh = fakeGitHub();
    await monetize([], { ...quiet, sitemapCount: 21, reports, github: gh });
    expect(gh.create).toHaveBeenCalledTimes(1);
    expect(gh.create.mock.calls[0]![0]).toMatchObject({ label: 'ops:monetize' });
    const again = fakeGitHub([7]);
    await monetize([], { ...quiet, sitemapCount: 21, reports, github: again });
    expect(again.issues).toHaveBeenCalledWith('ops:monetize', 'all');
    expect(again.create).not.toHaveBeenCalled();
    const notYet = fakeGitHub();
    await monetize([], { ...quiet, sitemapCount: 21, reports: reports.slice(1), github: notYet });
    expect(notYet.create).not.toHaveBeenCalled();
  });
});

describe('opportunities (A-6)', () => {
  const guides = [
    { slug: 'passport-photo', path: '/guide/passport-photo/', title: '여권사진 규격과 사이즈', query: '여권사진 규격', draft: false, sources: [] },
    { slug: 'pdf-merge', path: '/guide/pdf-merge/', title: 'PDF 합치기 방법', query: 'pdf 합치기', draft: false, sources: [] },
    { slug: 'kakao-photo', path: '/guide/kakao-photo/', title: '카톡 사진 화질', query: '카톡 사진 화질', draft: true, sources: [] },
  ];
  it('matches queries to guides by words; drafts do not count', () => {
    expect(coveredBy('여권 사진 규격', guides)?.slug).toBe('passport-photo');
    expect(coveredBy('pdf 합치기 무료', guides)?.slug).toBe('pdf-merge');
    expect(coveredBy('카톡 사진 화질', guides)).toBeNull();
    expect(coveredBy('운전면허 사진', guides)).toBeNull();
  });
  it('suggests the tool deep link', () => {
    expect(suggestTool('pdf 합치기')).toBe('/pdf-merge/');
    expect(suggestTool('pdf 용량 줄이기 10mb')).toBe('/pdf-compress/?target=10');
    expect(suggestTool('hwp pdf 변환')).toBe('/hwp-to-pdf/');
    expect(suggestTool('공무원 증명사진 사이즈')).toBe('/id-photo/?preset=gosi');
    expect(suggestTool('사진 200kb 줄이기')).toBe('/photo-compress/?target=200');
    expect(suggestTool('날씨')).toBeNull();
  });
  it('lists low-CTR queries and uncovered queries, without the brand', () => {
    const row = (key: string, impressions: number, clicks: number) => ({ key, impressions, clicks, ctr: clicks / impressions, position: 9 });
    const r = findOpportunities([row('여권사진 규격', 400, 2), row('운전면허 사진 규격', 80, 4), row('문서딱', 500, 1), row('pdf 합치기', 30, 0), row('카톡 사진 화질', 9, 0)], guides);
    expect(r.lowCtr.map((x) => [x.key, x.guide])).toEqual([['여권사진 규격', '/guide/passport-photo/']]);
    expect(r.uncovered.map((x) => [x.key, x.tool])).toEqual([['운전면허 사진 규격', '/id-photo/']]);
  });
});

describe('GitHub issues', () => {
  function mockApi(open: { number: number }[]) {
    const calls: [string, string, unknown][] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const path = url.replace('https://api.github.com/repos/o/r', '');
      calls.push([init.method!, path, init.body ? JSON.parse(String(init.body)) : undefined]);
      if (init.method === 'GET') return new Response(JSON.stringify([...open, { number: 99, pull_request: {} }]), { status: 200 });
      if (path === '/labels') return new Response('{}', { status: 422 });
      return new Response(JSON.stringify({ number: 5 }), { status: 201 });
    });
    return { calls, gh: createGitHub({ token: 't', repo: 'o/r', fetchImpl: fetchImpl as unknown as typeof fetch, log: () => undefined }) };
  }
  it('upsert opens a new issue when none is open', async () => {
    const { calls, gh } = mockApi([]);
    expect(await gh.upsert({ label: 'ops:health', title: 'T', body: 'B' })).toEqual({ action: 'opened', number: 5 });
    expect(calls.map((c) => `${c[0]} ${c[1]}`)).toEqual(['POST /labels', 'GET /issues?labels=ops%3Ahealth&state=open&per_page=20&sort=created&direction=desc', 'POST /issues']);
    expect(calls[2]![2]).toEqual({ title: 'T', body: 'B', labels: ['ops:health'] });
  });
  it('upsert updates the open issue (never a PR) and comments', async () => {
    const { calls, gh } = mockApi([{ number: 3 }]);
    expect(await gh.upsert({ label: 'ops:health', title: 'T', body: 'B', comment: 'C' })).toEqual({ action: 'updated', number: 3 });
    expect(calls.slice(2).map((c) => `${c[0]} ${c[1]}`)).toEqual(['PATCH /issues/3', 'POST /issues/3/comments']);
  });
  it('closeAll comments and closes each open issue', async () => {
    const { calls, gh } = mockApi([{ number: 3 }, { number: 4 }]);
    expect(await gh.closeAll('ops:health', 'ok')).toEqual([3, 4]);
    expect(calls.filter((c) => c[0] === 'PATCH').map((c) => c[2])).toEqual([{ state: 'closed', state_reason: 'completed' }, { state: 'closed', state_reason: 'completed' }]);
  });
  it('dry run sends nothing; a real run without a token refuses', async () => {
    const fetchImpl = vi.fn();
    const gh = createGitHub({ dryRun: true, fetchImpl: fetchImpl as unknown as typeof fetch, log: () => undefined });
    await gh.upsert({ label: 'ops:x', title: 'T', body: 'B' });
    await gh.closeAll('ops:x', 'c');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(() => createGitHub({ token: '', repo: 'o/r' })).toThrow(/GITHUB_TOKEN/);
  });
});

describe('wait-deploy (A-1) and indexnow-diff (A-2)', () => {
  const SHA = 'f181dc0387a07e02c47bbd38d7473ff2f535e54e';
  it('returns 0 once the live build id matches', async () => {
    let n = 0;
    const fetchImpl = async () => html(200, `<meta name="build-id" content="${n++ < 2 ? '4af0dd8b981c' : 'f181dc0387a0'}">`);
    const waits: number[] = [];
    expect(await waitDeploy(['--sha', SHA, '--interval', '5'], { ...quiet, fetchImpl: fetchImpl as unknown as typeof fetch, wait: async (ms: number) => void waits.push(ms) })).toBe(0);
    expect(waits).toEqual([5000, 5000]);
  });
  it('returns 1 after the timeout', async () => {
    let t = 0;
    const fetchImpl = async () => html(200, '<meta name="build-id" content="4af0dd8b981c">');
    const errors: string[] = [];
    const code = await waitDeploy(['--sha', SHA, '--timeout', '60', '--interval', '20'], { log: () => undefined, error: (s: string) => void errors.push(s), fetchImpl: fetchImpl as unknown as typeof fetch, now: () => t, wait: async (ms: number) => void (t += ms) });
    expect(code).toBe(1);
    expect(errors[0]).toContain('4af0dd8b981c');
    expect(await waitDeploy([], { ...quiet, env: {} })).toBe(2);
  });
  it('pings only the changed URLs and saves the state after success', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ops-'));
    const state = join(dir, 'sitemap.xml');
    writeFileSync(state, SITEMAP([['https://docttak.com/', '2026-09-30'], ['https://docttak.com/a/', '2026-09-30']]));
    const live = SITEMAP([['https://docttak.com/', '2026-10-01'], ['https://docttak.com/a/', '2026-09-30']]);
    const fetchImpl = async () => html(200, live, 'application/xml');
    const ping = vi.fn(async () => 1);
    expect(await indexnowDiff(['--state', state], { ...quiet, fetchImpl: fetchImpl as unknown as typeof fetch, indexnow: ping })).toBe(1);
    expect(ping).toHaveBeenCalledWith(['https://docttak.com/'], expect.anything());
    expect(readFileSync(state, 'utf8')).not.toBe(live); // failed ping: state kept for a retry
    const okPing = vi.fn(async () => 0);
    expect(await indexnowDiff(['--state', state], { ...quiet, fetchImpl: fetchImpl as unknown as typeof fetch, indexnow: okPing })).toBe(0);
    expect(readFileSync(state, 'utf8')).toBe(live);
    const noChange = vi.fn(async () => 0);
    expect(await indexnowDiff(['--state', state], { ...quiet, fetchImpl: fetchImpl as unknown as typeof fetch, indexnow: noChange })).toBe(0);
    expect(noChange).not.toHaveBeenCalled();
  });
});

describe('growth report run (A-5)', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const sitemap = SITEMAP(Array.from({ length: 16 }, (_, i) => [`https://docttak.com/p${i}/`, '2026-09-30'] as [string, string]));
  function apis() {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (u: string | URL, init?: RequestInit) => {
      const url = String(u);
      seen.push(url);
      if (url.endsWith('/sitemap.xml')) return html(200, sitemap, 'application/xml');
      if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'g' }));
      if (url.includes('searchAnalytics/query')) {
        expect(url).toContain('sc-domain%3Adocttak.com');
        const body = JSON.parse(String(init!.body));
        return new Response(JSON.stringify({ rows: body.dimensions ? [{ keys: ['운전면허 사진 규격'], clicks: 1, impressions: 80, ctr: 0.0125, position: 6 }] : [{ clicks: 130, impressions: 4000, ctr: 0.0325, position: 9.1 }] }));
      }
      if (url.endsWith('/client/v4/graphql')) {
        const days = Array.from({ length: 28 }, (_, i) => ({ dimensions: { date: new Date(Date.UTC(2026, 8, 3 + i)).toISOString().slice(0, 10) }, sum: { requests: 100, cachedRequests: 50, bytes: 1e6, cachedBytes: 5e5, pageViews: 20 }, uniq: { uniques: 10 } }));
        return new Response(JSON.stringify({ data: { viewer: { zones: [{ httpRequests1dGroups: days }] } } }));
      }
      throw new Error(`unexpected ${url}`);
    });
    return { fetchImpl, seen };
  }
  it('writes the report with both sources, the data for A-6, and a summary issue', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'growth-'));
    const out = join(dir, 'growth.json');
    const { fetchImpl } = apis();
    const gh = fakeGitHub();
    const env = { OPS_TODAY: '2026-10-01', GSC_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'a@b', private_key: privateKey }), CF_API_TOKEN: 'cf', CF_ZONE_ID: 'z' };
    expect(await growth(['--reports', dir, '--out-json', out], { ...quiet, env, fetchImpl: fetchImpl as unknown as typeof fetch, wait: noWait, github: gh })).toBe(0);
    const md = readFileSync(join(dir, '2026-40.md'), 'utf8');
    expect(md).toContain('| 최근 7일 (2026-09-22~2026-09-28) | 130 | 4,000 | 3.3% | 9.1 |');
    expect(md).toContain('| 최근 7일 (~2026-09-30, 7일) | 700 | 350 | 7 MB | 140 | 70 |');
    expect(parseReportData(md)).toMatchObject({ week: '2026-40', sitemapCount: 16, gsc: { last7: { clicks: 130 } }, cf: { last28: { requests: 2800 } } });
    expect(JSON.parse(readFileSync(out, 'utf8')).gsc.queries28[0].key).toBe('운전면허 사진 규격');
    expect(gh.create.mock.calls[0]![0]).toMatchObject({ label: 'ops:growth', title: '성장 리포트 2026-40' });
  });
  it('skips a missing secret with a note and marks an API error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'growth-'));
    const { fetchImpl } = apis();
    const gh = fakeGitHub();
    const env = { OPS_TODAY: '2026-10-01', GSC_SERVICE_ACCOUNT_JSON: '{}' };
    await growth(['--reports', dir], { ...quiet, env, fetchImpl: fetchImpl as unknown as typeof fetch, wait: noWait, github: gh });
    const md = readFileSync(join(dir, '2026-40.md'), 'utf8');
    expect(md).toContain('CF_API_TOKEN 비밀값이 없어 Cloudflare 부분을 건너뛰었습니다');
    expect(md).toContain('서치콘솔 오류: GSC_SERVICE_ACCOUNT_JSON has no client_email');
    expect(gh.create.mock.calls[0]![0].title).toBe('성장 리포트 2026-40 (오류 있음)');
  });
});
