// Anonymous usage statistics (brief handoff/ARCHITECT-BRIEF-USAGE.md, "Test map"): the whitelist module, the page
// tracker, the two Pages Functions (/api/usage, /admin/), the SQL builders and table shaping, the service worker bypass.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BLOB_KEYS,
  FAIL_LABELS,
  LEVEL_IDS,
  MAX_BODY,
  PRESETS,
  TOOLS,
  bucketKB,
  bucketMB,
  datasetName,
  fetchUsage,
  renderTables,
  sampleWeight,
  shapeUsage,
  toDataPoint,
  usageOn,
  usageSample,
  usagePrevSql,
  usageSql,
  validate,
} from '../../scripts/lib/usage.mjs';
import { onRequest as usageFn } from '../../functions/api/usage';
import { onRequest as adminFn, MIN_PASSWORD, REALM } from '../../functions/admin/[[path]]';
import { PRESET_IDS } from '../../src/data/preset-ids';
import { LEVELS } from '../../src/lib/pdf/compress/levels';
import { BG_REMOVE_TOOL, LIVE_TOOLS } from '../../src/data/tools';
import { USAGE_ON, arrival, browserFamily, buildPayload, createTracker, startUsage, track } from '../../src/lib/ui/usage';
import { route } from '../../src/sw/sw';
import { FULL } from '../fixtures/usage-rows.mjs';
import { RUM_EMPTY } from '../fixtures/rum-rows.mjs';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const BASE = { e: 'pick', t: 'pdf-merge', via: 'direct', d: 'desktop', b: 'dev', w: 1 };
const body = (o: Record<string, unknown>): string => JSON.stringify(o);

// ---------- scripts/lib/usage.mjs ----------

describe('whitelist (scripts/lib/usage.mjs)', () => {
  it('stays equal to the site: every tool (incl. 배경 지우기), the id-photo presets + custom, the pdf-compress levels', () => {
    expect([...TOOLS].sort()).toEqual([...LIVE_TOOLS.map((t) => t.slug), BG_REMOVE_TOOL.slug].sort());
    expect(PRESETS).toEqual([...PRESET_IDS, 'custom']);
    expect(LEVEL_IDS).toEqual(Object.keys(LEVELS));
  });

  it('flag and sample parsing', () => {
    expect(usageOn('1')).toBe(true);
    expect(usageOn(' 1 ')).toBe(true);
    for (const v of ['0', 'true', 'yes', '', undefined]) expect(usageOn(v), String(v)).toBe(false);
    expect(usageSample(undefined)).toBe(1);
    expect(usageSample(' ')).toBe(1);
    expect(usageSample('0.25')).toBe(0.25);
    expect(usageSample('.5')).toBe(0.5);
    expect(usageSample('1')).toBe(1);
    expect(usageSample('0.01')).toBe(0.01);
    for (const bad of ['0', '0.001', '1.5', '2', 'abc', '-0.5', '1e-1']) expect(() => usageSample(bad), bad).toThrow(/PUBLIC_USAGE_SAMPLE/);
    expect(sampleWeight(1)).toBe(1);
    expect(sampleWeight(0.5)).toBe(2);
    expect(sampleWeight(0.3)).toBe(3);
    expect(sampleWeight(0.01)).toBe(100);
  });

  it('bucket edges', () => {
    expect([100, 100.1, 200, 201, 300, 300.5, 500, 501, 1000, 1001].map(bucketKB)).toEqual(['le100', 'le200', 'le200', 'le300', 'le300', 'le500', 'le500', 'le1000', 'le1000', 'gt1000']);
    expect([0.5, 1, 1.1, 2, 2.1, 5, 5.1, 10, 10.1].map(bucketMB)).toEqual(['le1', 'le1', 'le2', 'le2', 'le5', 'le5', 'le10', 'le10', 'gt10']);
  });

  it('dataset name: default, valid, refused', () => {
    expect(datasetName(undefined)).toBe('docttak_usage');
    expect(datasetName('')).toBe('docttak_usage');
    expect(datasetName('my_set_2')).toBe('my_set_2');
    for (const bad of ['a-b', 'x; DROP', 'A', 'a'.repeat(65)]) expect(datasetName(bad), bad).toBeNull();
  });

  it('validate accepts every whitelisted value', () => {
    for (const e of ['pick', 'success', 'download']) expect(validate(body({ ...BASE, e })), e).not.toBeNull();
    for (const t of TOOLS) expect(validate(body({ ...BASE, t })), t).not.toBeNull();
    for (const via of ['guide', 'direct']) expect(validate(body({ ...BASE, via }))).not.toBeNull();
    for (const d of ['mobile', 'tablet', 'desktop']) expect(validate(body({ ...BASE, d }))).not.toBeNull();
    for (const b of ['dev', 'abcdef0', 'a'.repeat(40)]) expect(validate(body({ ...BASE, b })), b).not.toBeNull();
    for (const w of [1, 100]) expect(validate(body({ ...BASE, w }))).not.toBeNull();
    for (const p of ['load', 'parse', 'process', 'save']) expect(validate(body({ ...BASE, e: 'fail', c: 'not-pdf', p })), p).not.toBeNull();
    for (const br of ['chrome 131', 'safari 17', 'other', 'samsung 25']) expect(validate(body({ ...BASE, e: 'fail', c: 'oom', p: 'load', br })), br).not.toBeNull();
    const settings: [string, string[]][] = [
      ['target-kb', ['le100', 'le200', 'le300', 'le500', 'le1000', 'gt1000']],
      ['target-mb', ['le1', 'le2', 'le5', 'le10', 'gt10']],
      ['preset', [...PRESET_IDS, 'custom']],
      ['level', ['high', 'recommended', 'strong']],
      ['mode', ['cloud', 'device']],
      ['page', ['fit', 'a4']],
      ['ppi', ['p96', 'p150', 'p300']],
    ];
    for (const [o, vs] of settings) for (const v of vs) expect(validate(body({ ...BASE, e: 'start', o, v })), `${o}=${v}`).not.toBeNull();
    expect(validate(body({ ...BASE, e: 'start' }))).not.toBeNull();
    expect(validate(body({ ...BASE, e: 'arrive', g: 'photo-100kb', dl: '1' }))).not.toBeNull();
    expect(validate(body({ ...BASE, e: 'arrive', g: 'a', dl: '0' }))).not.toBeNull();
  });

  it('validate returns every blob key in schema order, missing ones empty', () => {
    const ev = validate(body({ ...BASE, e: 'fail', c: 'oom', p: 'process', br: 'chrome 131', via: 'guide' }))!;
    expect(toDataPoint(ev)).toEqual({ indexes: ['pdf-merge'], blobs: ['fail', 'pdf-merge', 'oom', 'process', '', '', '', '', 'guide', 'desktop', 'chrome 131', 'dev'], doubles: [1] });
    expect(BLOB_KEYS).toEqual(['e', 't', 'c', 'p', 'o', 'v', 'g', 'dl', 'via', 'd', 'br', 'b']);
  });

  it.each([
    ['not JSON', '{'],
    ['an array', '[]'],
    ['a string', '"x"'],
    ['null', 'null'],
    ['not a string at all', 42],
    ['an unknown key', body({ ...BASE, name: '주민등록등본.pdf' })],
    ['a size key', body({ ...BASE, size: 123 })],
    ['over 512 bytes', body({ ...BASE, e: 'arrive', g: 'a'.repeat(60), dl: '1', pad: 'x'.repeat(600) })],
    ['missing e', body({ ...BASE, e: undefined })],
    ['missing w', body({ ...BASE, w: undefined })],
    ['missing b', body({ ...BASE, b: undefined })],
    ['unknown event', body({ ...BASE, e: 'view' })],
    ['unknown tool', body({ ...BASE, t: 'pdf-ocr' })],
    ['unknown via', body({ ...BASE, via: 'ad' })],
    ['unknown device', body({ ...BASE, d: 'tv' })],
    ['bad build', body({ ...BASE, b: 'XYZ' })],
    ['w 0', body({ ...BASE, w: 0 })],
    ['w 101', body({ ...BASE, w: 101 })],
    ['w 1.5', body({ ...BASE, w: 1.5 })],
    ['w as a string', body({ ...BASE, w: '1' })],
    ['a number value', body({ ...BASE, d: 1 })],
    ['c on pick', body({ ...BASE, c: 'oom' })],
    ['p on success', body({ ...BASE, e: 'success', p: 'load' })],
    ['br on download', body({ ...BASE, e: 'download', br: 'chrome 1' })],
    ['o/v on fail', body({ ...BASE, e: 'fail', c: 'oom', p: 'load', o: 'level', v: 'high' })],
    ['g/dl on start', body({ ...BASE, e: 'start', g: 'x', dl: '1' })],
    ['fail without c', body({ ...BASE, e: 'fail', p: 'load' })],
    ['fail without p', body({ ...BASE, e: 'fail', c: 'oom' })],
    ['bad fail code', body({ ...BASE, e: 'fail', c: 'Out Of Memory', p: 'load' })],
    ['long fail code', body({ ...BASE, e: 'fail', c: 'a'.repeat(25), p: 'load' })],
    ['bad phase', body({ ...BASE, e: 'fail', c: 'oom', p: 'render' })],
    ['full user agent', body({ ...BASE, e: 'fail', c: 'oom', p: 'load', br: 'Mozilla/5.0 (Windows NT 10.0)' })],
    ['o without v', body({ ...BASE, e: 'start', o: 'level' })],
    ['v without o', body({ ...BASE, e: 'start', v: 'high' })],
    ['unknown setting', body({ ...BASE, e: 'start', o: 'quality', v: '80' })],
    ['exact KB', body({ ...BASE, e: 'start', o: 'target-kb', v: '200' })],
    ['a value of another key', body({ ...BASE, e: 'start', o: 'level', v: 'le100' })],
    ['arrive without g', body({ ...BASE, e: 'arrive', dl: '1' })],
    ['arrive without dl', body({ ...BASE, e: 'arrive', g: 'x' })],
    ['bad guide slug', body({ ...BASE, e: 'arrive', g: '../x', dl: '1' })],
    ['dl 2', body({ ...BASE, e: 'arrive', g: 'x', dl: '2' })],
    ['a prototype key', '{"__proto__":{"x":1},"e":"pick","t":"pdf-merge","via":"direct","d":"desktop","b":"dev","w":1}'],
  ])('validate refuses %s', (_name, text) => {
    expect(validate(text)).toBeNull();
  });

  it('the body limit counts bytes, not characters', () => {
    expect(MAX_BODY).toBe(512);
    expect(validate(body({ ...BASE }) + ' '.repeat(512 - body({ ...BASE }).length))).not.toBeNull();
    expect(validate(body({ ...BASE }) + ' '.repeat(513 - body({ ...BASE }).length))).toBeNull();
  });
});

describe('SQL builders and table shaping', () => {
  it('the four queries (snapshot)', () => {
    expect(usageSql('docttak_usage', 7)).toEqual({
      events: "SELECT blob2 AS tool, blob1 AS event, blob9 AS via, SUM(_sample_interval * double1) AS n FROM docttak_usage WHERE timestamp > NOW() - INTERVAL '7' DAY GROUP BY blob2, blob1, blob9 FORMAT JSON",
      fails: "SELECT blob2 AS tool, blob3 AS code, blob4 AS phase, SUM(_sample_interval * double1) AS n FROM docttak_usage WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob1 = 'fail' GROUP BY blob2, blob3, blob4 ORDER BY n DESC LIMIT 20 FORMAT JSON",
      settings: "SELECT blob2 AS tool, blob5 AS setting, blob6 AS value, SUM(_sample_interval * double1) AS n FROM docttak_usage WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob1 = 'start' AND blob5 != '' GROUP BY blob2, blob5, blob6 ORDER BY n DESC LIMIT 500 FORMAT JSON",
      guides: "SELECT blob7 AS guide, blob2 AS tool, blob8 AS dl, SUM(_sample_interval * double1) AS n FROM docttak_usage WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob1 = 'arrive' GROUP BY blob7, blob2, blob8 ORDER BY n DESC LIMIT 500 FORMAT JSON",
    });
    expect(() => usageSql('docttak_usage', 365)).toThrow();
    expect(() => usageSql('x; DROP TABLE y', 7)).toThrow();
  });

  it('shapes rows: totals, rates (zero denominators "-"), top 5 settings per tool, Korean labels, guide conversion', () => {
    const shaped = shapeUsage({
      events: [
        { tool: 'photo-compress', event: 'pick', via: 'direct', n: 10 },
        { tool: 'photo-compress', event: 'start', via: 'direct', n: 8 },
        { tool: 'photo-compress', event: 'success', via: 'direct', n: 6 },
        { tool: 'photo-compress', event: 'success', via: 'guide', n: 3 },
        { tool: 'photo-compress', event: 'fail', via: 'guide', n: 1 },
        { tool: 'photo-compress', event: 'download', via: 'direct', n: 5 },
        { tool: 'hwp-viewer', event: 'pick', via: 'direct', n: 2 },
        { tool: 'not-a-tool', event: 'pick', via: 'direct', n: 99 },
      ],
      fails: [{ tool: 'pdf-compress', code: 'not-pdf', phase: 'parse', n: 4 }],
      settings: [
        ...['le100', 'le200', 'le300', 'le500', 'le1000', 'gt1000'].map((value, i) => ({ tool: 'photo-compress', setting: 'target-kb', value, n: 10 - i })),
        { tool: 'pdf-compress', setting: 'level', value: 'recommended', n: 2 },
        { tool: 'id-photo', setting: 'preset', value: 'custom', n: 1 },
      ],
      guides: [
        { guide: 'photo-200kb', tool: 'photo-compress', dl: '1', n: 3 },
        { guide: 'photo-200kb', tool: 'photo-compress', dl: '0', n: 1 },
      ],
    });
    expect(shaped.totals).toEqual({ success: 9, fail: 1, rate: '90%' });
    const [tools, fails, settings, guides, via] = shaped.tables;
    expect(tools!.head).toEqual(['도구', '파일 고름', '처리 시작', '성공', '실패', '성공률', '내려받음']);
    expect(tools!.rows).toEqual([
      ['사진 용량 줄이기', '10', '8', '9', '1', '90%', '5'],
      ['HWP 파일 보기', '2', '0', '0', '0', '-', '0'],
    ]);
    expect(fails!.rows).toEqual([['PDF 용량 줄이기', 'not-pdf', '파일 읽기', '4']]);
    expect(settings!.rows).toEqual([
      ['PDF 용량 줄이기', '압축 단계', '권장', '2'],
      ['사진 용량 줄이기', '목표 용량', '100KB 이하', '10'],
      ['사진 용량 줄이기', '목표 용량', '200KB 이하', '9'],
      ['사진 용량 줄이기', '목표 용량', '300KB 이하', '8'],
      ['사진 용량 줄이기', '목표 용량', '500KB 이하', '7'],
      ['사진 용량 줄이기', '목표 용량', '1000KB 이하', '6'],
      ['증명사진 규격 맞추기', '증명사진 규격', '직접 입력', '1'],
    ]);
    expect(guides!.rows).toEqual([['photo-200kb', '사진 용량 줄이기', '4', '75%']]);
    expect(via!.rows).toEqual([
      ['사진 용량 줄이기', '75%', '100%'],
      ['HWP 파일 보기', '-', '-'],
    ]);
    expect(shapeUsage({}).totals).toEqual({ success: 0, fail: 0, rate: '-' });
  });

  it('renders markdown and HTML from the same rows; HTML escapes every value', () => {
    const shaped = shapeUsage({ fails: [{ tool: 'pdf-merge', code: '<script>alert(1)</script>', phase: '<b>', n: 1 }] });
    const html = renderTables(shaped, 'html');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<h2>도구별</h2>\n<p>기록이 아직 없어요.</p>');
    const md = renderTables(shapeUsage({ fails: [{ tool: 'pdf-merge', code: 'a|b', phase: 'load', n: 2 }] }), 'md', 3);
    expect(md).toContain('### 실패 이유\n\n| 도구 | 오류 코드 | 단계 | 횟수 |\n| --- | --- | --- | --- |\n| PDF 합치기 | a\\|b | 준비 | 2 |');
  });

  it('the weekly report markdown and totals for the FULL fixture stay byte-identical (brief ADMIN-UI step 0)', () => {
    const shaped = shapeUsage(FULL);
    expect(shaped.totals).toMatchInlineSnapshot(`
      {
        "fail": 33,
        "rate": "89%",
        "success": 280,
      }
    `);
    expect(renderTables(shaped, 'md', 3)).toMatchInlineSnapshot(`
      "### 도구별

      | 도구 | 파일 고름 | 처리 시작 | 성공 | 실패 | 성공률 | 내려받음 |
      | --- | --- | --- | --- | --- | --- | --- |
      | PDF 합치기 | 70 | 60 | 40 | 15 | 73% | 38 |
      | PDF 용량 줄이기 | 95 | 80 | 70 | 10 | 88% | 66 |
      | 사진 용량 줄이기 | 150 | 120 | 114 | 4 | 97% | 110 |
      | 증명사진 규격 맞추기 | 14 | 10 | 8 | 2 | 80% | 7 |
      | HWP PDF 변환 | 55 | 50 | 48 | 2 | 96% | 47 |
      | 사진 PDF 변환 | 5 | 0 | 0 | 0 | - | 0 |

      ### 실패 이유

      | 도구 | 오류 코드 | 단계 | 횟수 |
      | --- | --- | --- | --- |
      | PDF 합치기 | corrupt | 파일 읽기 | 9 |
      | PDF 용량 줄이기 | wrong-password | 파일 읽기 | 6 |
      | PDF 합치기 | oom | 처리 | 4 |
      | PDF 용량 줄이기 | engine | 준비 | 4 |
      | 사진 용량 줄이기 | heic | 파일 읽기 | 3 |
      | PDF 합치기 | mystery-code | 저장 | 2 |
      | 증명사진 규격 맞추기 | unreachable | 저장 | 2 |
      | HWP PDF 변환 | timeout | 파일 읽기 | 2 |
      | 사진 용량 줄이기 | not-image | 파일 읽기 | 1 |

      ### 많이 쓴 설정

      | 도구 | 설정 | 값 | 횟수 |
      | --- | --- | --- | --- |
      | PDF 용량 줄이기 | 압축 단계 | 권장 | 50 |
      | PDF 용량 줄이기 | 압축 단계 | 강력 | 20 |
      | PDF 용량 줄이기 | 목표 용량 | 5MB 이하 | 10 |
      | 사진 용량 줄이기 | 목표 용량 | 200KB 이하 | 60 |
      | 사진 용량 줄이기 | 목표 용량 | 100KB 이하 | 35 |
      | 사진 용량 줄이기 | 목표 용량 | 500KB 이하 | 25 |
      | 증명사진 규격 맞추기 | 증명사진 규격 | 여권 (온라인 신청·정부24) | 6 |
      | 증명사진 규격 맞추기 | 증명사진 규격 | 직접 입력 | 4 |

      ### 안내 글에서 도구로

      | 안내 글 | 도구 | 넘어옴 | 딥링크 비율 |
      | --- | --- | --- | --- |
      | photo-200kb | 사진 용량 줄이기 | 20 | 75% |
      | pdf-under-5mb | PDF 용량 줄이기 | 10 | 100% |
      | 이력서 사진 규격, 사람인·잡코리아 크기와 용량 | 사진 용량 줄이기 | 5 | 0% |

      ### 도구별 성공률 (안내에서 온 경우와 바로 온 경우)

      | 도구 | 안내에서 옴 | 바로 옴 |
      | --- | --- | --- |
      | PDF 합치기 | - | 73% |
      | PDF 용량 줄이기 | 100% | 86% |
      | 사진 용량 줄이기 | 98% | 96% |
      | 증명사진 규격 맞추기 | - | 80% |
      | HWP PDF 변환 | - | 96% |
      | 사진 PDF 변환 | - | - |"
    `);
  });

  it('fetchUsage posts each query with the token and maps errors to the status only', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ data: [{ tool: 'pdf-merge', event: 'pick', via: 'direct', n: 1 }] }));
    });
    const r = await fetchUsage({ accountId: 'acc/1', token: 't0k', dataset: 'docttak_usage', days: 30, fetch: ok as never });
    expect(r.events).toHaveLength(1);
    expect(calls).toHaveLength(4);
    for (const c of calls) {
      expect(c.url).toBe('https://api.cloudflare.com/client/v4/accounts/acc%2F1/analytics_engine/sql');
      expect(c.init.method).toBe('POST');
      expect((c.init.headers as Record<string, string>).Authorization).toBe('Bearer t0k');
      expect(String(c.init.body)).toContain("INTERVAL '30' DAY");
    }
    await expect(fetchUsage({ accountId: 'a', token: 't0k', dataset: 'docttak_usage', days: 7, fetch: (async () => new Response('x', { status: 401 })) as never })).rejects.toMatchObject({ status: 401 });
    await expect(fetchUsage({ accountId: 'a', token: 't0k', dataset: 'docttak_usage', days: 7, fetch: (async () => Promise.reject(new Error('net'))) as never })).rejects.toMatchObject({ status: 0 });
  });
});

// ---------- src/lib/ui/usage.ts ----------

describe('page tracker (src/lib/ui/usage.ts)', () => {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
  const deps = (over: Record<string, unknown> = {}) => {
    const send = vi.fn((_p: string, _b: string) => true);
    return { send, deps: { rate: 1, random: () => 0, send, ua: UA, device: 'desktop' as const, build: 'abc1234', referrer: '', origin: 'https://docttak.com', pathname: '/photo-compress/', search: '', ...over } };
  };
  const bodies = (send: ReturnType<typeof vi.fn>) => send.mock.calls.map((c) => JSON.parse(c[1] as string) as Record<string, unknown>);

  it('is off in this build: no tracker, and track/startUsage never touch navigator or document', () => {
    expect(USAGE_ON).toBe(false);
    const trap = new Proxy({}, { get: () => { throw new Error('touched'); } });
    vi.stubGlobal('navigator', trap);
    vi.stubGlobal('document', trap);
    vi.stubGlobal('location', trap);
    expect(() => {
      startUsage('photo-compress');
      track({ e: 'pick', t: 'photo-compress' });
      track({ e: 'fail', t: 'photo-compress', c: 'oom', p: 'process' });
    }).not.toThrow();
  });

  it('sends only whitelisted keys to /api/usage; every body passes the server validation', () => {
    const { send, deps: d } = deps();
    const t = createTracker(d);
    t.start('photo-compress');
    t.track({ e: 'pick', t: 'photo-compress' });
    t.track({ e: 'start', t: 'photo-compress', o: 'target-kb', v: 'le200' });
    t.track({ e: 'fail', t: 'photo-compress', c: 'oom', p: 'process' });
    t.track({ e: 'success', t: 'photo-compress' });
    t.track({ e: 'download', t: 'photo-compress' });
    expect(send.mock.calls.every((c) => c[0] === '/api/usage')).toBe(true);
    for (const c of send.mock.calls) expect(validate(c[1] as string), c[1] as string).not.toBeNull();
    expect(bodies(send)).toEqual([
      { e: 'pick', t: 'photo-compress', via: 'direct', d: 'desktop', b: 'abc1234', w: 1 },
      { e: 'start', t: 'photo-compress', o: 'target-kb', v: 'le200', via: 'direct', d: 'desktop', b: 'abc1234', w: 1 },
      { e: 'fail', t: 'photo-compress', c: 'oom', p: 'process', br: 'chrome 131', via: 'direct', d: 'desktop', b: 'abc1234', w: 1 },
      { e: 'success', t: 'photo-compress', via: 'direct', d: 'desktop', b: 'abc1234', w: 1 },
      { e: 'download', t: 'photo-compress', via: 'direct', d: 'desktop', b: 'abc1234', w: 1 },
    ]);
  });

  it('builds the payload field by field: extra input keys never pass; a bad code becomes "unknown"; a bad build "dev"', () => {
    const ctx = { via: 'direct' as const, ua: UA, device: 'mobile' as const, build: 'not a hash', w: 1 };
    const p = buildPayload({ e: 'fail', t: 'pdf-compress', c: 'Out Of Memory', p: 'process', fileName: '주민등록등본.pdf', size: 123 } as never, ctx);
    expect(p).toEqual({ e: 'fail', t: 'pdf-compress', c: 'unknown', p: 'process', br: 'chrome 131', via: 'direct', d: 'mobile', b: 'dev', w: 1 });
    expect(buildPayload({ e: 'pick', t: 'pdf-merge', c: 'x', o: 'level', v: 'high' } as never, ctx)).toEqual({ e: 'pick', t: 'pdf-merge', via: 'direct', d: 'mobile', b: 'dev', w: 1 });
  });

  it('caps one page load at 40 events and never throws', () => {
    const { send, deps: d } = deps();
    const t = createTracker(d);
    for (let i = 0; i < 50; i++) t.track({ e: 'success', t: 'pdf-merge' });
    expect(send).toHaveBeenCalledTimes(40);
    const boom = createTracker({ ...d, send: () => { throw new Error('blocked'); } });
    expect(() => boom.track({ e: 'pick', t: 'pdf-merge' })).not.toThrow();
  });

  it('decides sampling once per page load: rate 0.5 sends all (w=2) or nothing', () => {
    const yes = deps({ rate: 0.5, random: vi.fn(() => 0.4) });
    const t = createTracker(yes.deps);
    for (let i = 0; i < 3; i++) t.track({ e: 'pick', t: 'pdf-merge' });
    expect(yes.send).toHaveBeenCalledTimes(3);
    expect(bodies(yes.send).map((b) => b.w)).toEqual([2, 2, 2]);
    expect(yes.deps.random).toHaveBeenCalledTimes(1);
    const no = deps({ rate: 0.5, random: () => 0.6, referrer: 'https://docttak.com/guide/photo-200kb/' });
    const u = createTracker(no.deps);
    u.start('photo-compress');
    for (let i = 0; i < 3; i++) u.track({ e: 'pick', t: 'pdf-merge' });
    expect(no.send).not.toHaveBeenCalled();
  });

  it('guide -> tool: a same-origin guide referrer sends one arrive (g, dl) and tags later events via=guide', () => {
    const { send, deps: d } = deps({ referrer: 'https://docttak.com/guide/photo-200kb/', search: '?target=200' });
    const t = createTracker(d);
    t.start('photo-compress');
    t.track({ e: 'pick', t: 'photo-compress' });
    expect(bodies(send)).toEqual([
      { e: 'arrive', t: 'photo-compress', g: 'photo-200kb', dl: '1', via: 'guide', d: 'desktop', b: 'abc1234', w: 1 },
      { e: 'pick', t: 'photo-compress', via: 'guide', d: 'desktop', b: 'abc1234', w: 1 },
    ]);
    for (const c of send.mock.calls) expect(validate(c[1] as string)).not.toBeNull();
    const bad = deps({ referrer: 'https://docttak.com/guide/photo-200kb/', search: '?target=abc' });
    createTracker(bad.deps).start('photo-compress');
    expect(bodies(bad.send)[0]).toMatchObject({ e: 'arrive', dl: '0' });
  });

  it.each([
    ['same-origin guide', 'https://docttak.com/guide/photo-200kb/', '/photo-compress/', { via: 'guide', arrive: { g: 'photo-200kb', dl: '0' } }],
    ['guide with a query', 'https://docttak.com/guide/photo-200kb/?x=1', '/photo-compress/', { via: 'guide', arrive: { g: 'photo-200kb', dl: '0' } }],
    ['another site with a /guide/ path', 'https://evil.example/guide/photo-200kb/', '/photo-compress/', { via: 'direct', arrive: null }],
    ['the guide index', 'https://docttak.com/guide/', '/photo-compress/', { via: 'direct', arrive: null }],
    ['a deeper guide path', 'https://docttak.com/guide/a/b/', '/photo-compress/', { via: 'direct', arrive: null }],
    ['tool to tool', 'https://docttak.com/pdf-merge/', '/photo-compress/', { via: 'direct', arrive: null }],
    ['no referrer', '', '/photo-compress/', { via: 'direct', arrive: null }],
    ['garbage referrer', 'not a url', '/photo-compress/', { via: 'direct', arrive: null }],
    ['on a guide page itself', 'https://docttak.com/guide/a/', '/guide/b/', { via: 'direct', arrive: null }],
  ])('arrival: %s', (_name, referrer, pathname, want) => {
    expect(arrival(referrer, 'https://docttak.com', pathname, false)).toEqual(want);
  });

  it('browser family and major version only', () => {
    expect(browserFamily('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1')).toBe('safari 17');
    expect(browserFamily('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0')).toBe('edge 131');
    expect(browserFamily('Mozilla/5.0 (Windows NT 10.0; rv:133.0) Gecko/20100101 Firefox/133.0')).toBe('firefox 133');
    expect(browserFamily('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Whale/3.28.266.14 Mobile Safari/537.36')).toBe('whale 3');
    expect(browserFamily('curl/8')).toBe('other');
  });
});

// ---------- functions/api/usage.ts ----------

describe('Pages Function /api/usage', () => {
  const GOOD = body({ e: 'start', t: 'id-photo', o: 'preset', v: 'gosi', via: 'guide', d: 'mobile', b: 'abc1234', w: 2 });
  function req(init: { method?: string; site?: string | null; origin?: string | null; len?: string | null; type?: string; ua?: string; text?: string } = {}): Request {
    const text = init.text ?? GOOD;
    const headers = new Headers();
    if (init.site !== null) headers.set('sec-fetch-site', init.site ?? 'same-origin');
    if (init.origin) headers.set('origin', init.origin);
    if (init.len !== null) headers.set('content-length', init.len ?? String(new TextEncoder().encode(text).length));
    headers.set('content-type', init.type ?? 'text/plain;charset=UTF-8');
    headers.set('user-agent', init.ua ?? 'Mozilla/5.0 Chrome/131.0');
    headers.set('cf-connecting-ip', '203.0.113.7');
    const method = init.method ?? 'POST';
    return new Request('https://docttak.com/api/usage', { method, headers, body: method === 'POST' ? text : undefined });
  }
  const bound = (impl?: () => void) => {
    const writeDataPoint = vi.fn((_p: unknown): void => impl?.());
    return { env: { USAGE: { writeDataPoint } }, writeDataPoint };
  };

  it('writes one data point in the schema order, with nothing from headers or cf', async () => {
    const { env, writeDataPoint } = bound();
    const r = req();
    (r as unknown as { cf: unknown }).cf = { country: 'KR', city: 'Seoul' };
    const res = await usageFn({ request: r, env });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(res.headers.get('cache-control')).toBe('no-store, private');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(writeDataPoint.mock.calls[0]![0]).toEqual({ indexes: ['id-photo'], blobs: ['start', 'id-photo', '', '', 'preset', 'gosi', '', '', 'guide', 'mobile', '', 'abc1234'], doubles: [2] });
    expect(JSON.stringify(writeDataPoint.mock.calls[0])).not.toMatch(/203\.0\.113|KR|Seoul|Chrome/);
  });

  it('accepts a beacon without Content-Length (HTTP/2, HTTP/3) by measuring the body', async () => {
    const { env, writeDataPoint } = bound();
    const res = await usageFn({ request: req({ len: null }), env });
    expect(res.status).toBe(204);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['GET', () => req({ method: 'GET' }), 405],
    ['cross-site', () => req({ site: 'cross-site' }), 403],
    ['same-site', () => req({ site: 'same-site' }), 403],
    ['no Sec-Fetch-Site and no Origin', () => req({ site: null }), 403],
    ['no Sec-Fetch-Site and another Origin', () => req({ site: null, origin: 'https://evil.example' }), 403],
    ['Content-Length 0', () => req({ len: '0' }), 413],
    ['Content-Length 513', () => req({ len: '513' }), 413],
    ['no Content-Length and a body over 512 bytes', () => req({ len: null, text: GOOD.padEnd(513, ' ') }), 413],
    ['no Content-Length and an empty body', () => req({ len: null, text: '' }), 413],
    ['application/json', () => req({ type: 'application/json' }), 415],
    ['invalid body', () => req({ text: body({ ...BASE, name: 'x.pdf' }) }), 400],
    ['not JSON', () => req({ text: 'hello' }), 400],
  ])('refuses %s without writing', async (_name, make, status) => {
    const { env, writeDataPoint } = bound();
    const res = await usageFn({ request: make(), env });
    expect(res.status).toBe(status);
    expect(await res.text()).toBe('');
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('accepts the Origin fallback (a browser without Sec-Fetch-Site)', async () => {
    const { env, writeDataPoint } = bound();
    expect((await usageFn({ request: req({ site: null, origin: 'https://docttak.com' }), env })).status).toBe(204);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
  });

  it('drops bots with 204 and no write', async () => {
    for (const ua of ['Googlebot/2.1', 'Mozilla/5.0 HeadlessChrome/131', 'Chrome-Lighthouse', 'curl/8.4', 'python-requests/2', 'Wget/1.21', 'facebookexternalhit preview', 'Baiduspider', 'Yahoo! Slurp', 'AhrefsCrawler']) {
      const { env, writeDataPoint } = bound();
      expect((await usageFn({ request: req({ ua }), env })).status, ua).toBe(204);
      expect(writeDataPoint, ua).not.toHaveBeenCalled();
    }
  });

  it('no binding: 503; a throwing writeDataPoint: still 204', async () => {
    expect((await usageFn({ request: req(), env: {} })).status).toBe(503);
    const { env, writeDataPoint } = bound(() => {
      throw new Error('quota');
    });
    expect((await usageFn({ request: req(), env })).status).toBe(204);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
  });
});

// ---------- functions/admin/[[path]].ts ----------

describe('Pages Function /admin/', () => {
  const PW = 'correct-horse-battery';
  const ENV = { ADMIN_PASSWORD: PW, CF_ACCOUNT_ID: 'acc', AE_API_TOKEN: 'super-secret-token' };
  const auth = (user: string, pw: string) => `Basic ${Buffer.from(`${user}:${pw}`).toString('base64')}`;
  const get = (path: string, authorization?: string) => new Request(`https://docttak.com${path}`, { headers: authorization ? { authorization } : {} });
  const sqlApi = (rows: Record<string, Record<string, unknown>[]> = {}, status = 200, prevStatus = status) => {
    const bodies: string[] = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
      // The visits query (Web Analytics GraphQL) is answered empty; only SQL bodies are recorded.
      if (String(url).endsWith('/graphql')) return new Response(JSON.stringify(RUM_EMPTY));
      const sql = String(init.body);
      bodies.push(sql);
      // "AS kind" (the previous-period query) is checked before "AS event".
      if (sql.includes('AS kind')) return prevStatus !== 200 ? new Response('error', { status: prevStatus }) : new Response(JSON.stringify({ data: rows.prev ?? [] }));
      if (status !== 200) return new Response('error', { status });
      const key = sql.includes('AS event') ? 'events' : sql.includes('AS code') ? 'fails' : sql.includes('AS setting') ? 'settings' : 'guides';
      return new Response(JSON.stringify({ data: rows[key] ?? [] }));
    });
    vi.stubGlobal('fetch', f);
    return { f, bodies };
  };

  it('does not exist without a password of 16+ characters', async () => {
    expect(MIN_PASSWORD).toBe(16);
    for (const ADMIN_PASSWORD of [undefined, '', 'a'.repeat(15)]) {
      const res = await adminFn({ request: get('/admin/', auth('admin', ADMIN_PASSWORD ?? '')), env: { ...ENV, ADMIN_PASSWORD } });
      expect(res.status, String(ADMIN_PASSWORD)).toBe(404);
    }
  });

  it('asks for Basic auth: none, a wrong password or a wrong user -> 401 with the realm', async () => {
    sqlApi();
    for (const a of [undefined, auth('admin', 'wrong-password-123'), auth('root', PW), 'Bearer x', 'Basic !!!']) {
      const res = await adminFn({ request: get('/admin/', a), env: ENV });
      expect(res.status, String(a)).toBe(401);
      expect(res.headers.get('www-authenticate')).toBe(REALM);
      expect(REALM).toBe('Basic realm="docttak-admin", charset="UTF-8"');
    }
  });

  it('the right password -> 200, noindex, no-store, CSP, no client script; a UTF-8 password works too', async () => {
    sqlApi();
    const res = await adminFn({ request: get('/admin/', auth('admin', PW)), env: ENV });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store, private');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    const html = await res.text();
    expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(html).toContain('기록은 3개월 동안만 남아요.');
    expect(html).not.toContain('<script');
    const kr = '관리자비밀번호는열여섯글자입니다';
    const res2 = await adminFn({ request: get('/admin/', auth('admin', kr)), env: { ...ENV, ADMIN_PASSWORD: kr } });
    expect(res2.status).toBe(200);
  });

  it('/admin -> 301 /admin/; anything deeper -> 404', async () => {
    const r = await adminFn({ request: get('/admin'), env: ENV });
    expect(r.status).toBe(301);
    expect(r.headers.get('location')).toBe('/admin/');
    expect((await adminFn({ request: get('/admin/x', auth('admin', PW)), env: ENV })).status).toBe(404);
  });

  it('the period is whitelisted (1, 7, 30, 90; else 7) and the SQL holds only constants, the period and the dataset', async () => {
    for (const [q, days] of [['', 7], ['?days=abc', 7], ['?days=365', 7], ['?days=30', 30], ['?days=1', 1], ['?days=90', 90], ["?days=7'%20OR%201=1", 7]] as const) {
      const { bodies } = sqlApi();
      await adminFn({ request: get(`/admin/${q}`, auth('admin', PW)), env: ENV });
      const expected = [...Object.values(usageSql('docttak_usage', days)), ...(days === 90 ? [] : [usagePrevSql('docttak_usage', days)])];
      expect(bodies.sort(), q).toEqual(expected.sort());
    }
    const { bodies } = sqlApi();
    await adminFn({ request: get('/admin/', auth('admin', PW)), env: { ...ENV, USAGE_DATASET: 'other_set' } });
    expect(bodies.every((b) => b.includes('FROM other_set '))).toBe(true);
  });

  it('missing account or token, a bad dataset, or an SQL API error -> a Korean notice with status 200, never the token', async () => {
    const { f, bodies } = sqlApi();
    for (const env of [{ ...ENV, CF_ACCOUNT_ID: undefined }, { ...ENV, AE_API_TOKEN: undefined }]) {
      const res = await adminFn({ request: get('/admin/', auth('admin', PW)), env });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('도구 사용 통계를 불러오지 못했어요 (CF_ACCOUNT_ID 또는 AE_API_TOKEN 없음)');
      expect(html).toContain('방문 통계를 불러오지 못했어요 (CF_ACCOUNT_ID 또는 AE_API_TOKEN 없음)');
    }
    expect(f).not.toHaveBeenCalled();
    const badSet = await (await adminFn({ request: get('/admin/', auth('admin', PW)), env: { ...ENV, USAGE_DATASET: 'bad-name' } })).text();
    expect(badSet).toContain('도구 사용 통계를 불러오지 못했어요 (USAGE_DATASET 이름이 올바르지 않음)');
    expect(badSet).not.toContain('방문 통계를 불러오지 못했어요');
    expect(bodies).toEqual([]);
    sqlApi({}, 500);
    const res = await adminFn({ request: get('/admin/', auth('admin', PW)), env: ENV });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('통계를 불러오지 못했어요 (HTTP 500)');
    expect(html).not.toContain('super-secret-token');
  });

  it('the previous-period query failing (500) still renders the page with 200 and "비교 없음"', async () => {
    const { bodies } = sqlApi({ events: [{ tool: 'pdf-merge', event: 'start', via: 'direct', n: 4 }] }, 200, 500);
    const res = await adminFn({ request: get('/admin/?days=7', auth('admin', PW)), env: ENV });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(bodies.some((b) => b.includes('AS kind'))).toBe(true);
    expect(html).toContain('비교 없음');
    expect(html).not.toContain('통계를 불러오지 못했어요');
  });

  it('90 days: no previous-period query, the KPI says the period before is past retention', async () => {
    const { bodies } = sqlApi({ events: [{ tool: 'pdf-merge', event: 'start', via: 'direct', n: 4 }] });
    const html = await (await adminFn({ request: get('/admin/?days=90', auth('admin', PW)), env: ENV })).text();
    expect(bodies.some((b) => b.includes('AS kind'))).toBe(false);
    expect(html).toContain('비교 없음 (기록은 3개월만 남아요)');
  });

  it('a bad PUBLIC_USAGE_SAMPLE does not break the page; 0.25 adds the sample sentence', async () => {
    sqlApi();
    const bad = await (await adminFn({ request: get('/admin/', auth('admin', PW)), env: { ...ENV, PUBLIC_USAGE_SAMPLE: 'lots' } })).text();
    expect(bad).toContain('기록은 3개월 동안만 남아요.');
    expect(bad).not.toContain('만 기록해요');
    const quarter = await (await adminFn({ request: get('/admin/', auth('admin', PW)), env: { ...ENV, PUBLIC_USAGE_SAMPLE: '0.25' } })).text();
    expect(quarter).toContain('지금은 방문의 25%만 기록해요.');
  });

  it('escapes every value from the rows', async () => {
    sqlApi({ fails: [{ tool: 'pdf-merge', code: '<script>alert(1)</script>', phase: 'load', n: 3 }], guides: [{ guide: '"><img src=x onerror=alert(1)>', tool: 'pdf-merge', dl: '1', n: 1 }] });
    const html = await (await adminFn({ request: get('/admin/', auth('admin', PW)), env: ENV })).text();
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

// ---------- service worker ----------

describe('service worker: /admin and /api/ always go to the network untouched', () => {
  const origin = 'https://docttak.com';
  it.each([
    ['/admin/', 'navigate'],
    ['/admin', 'navigate'],
    ['/admin/?days=30', 'navigate'],
    ['/api/usage', 'no-cors'],
    ['/api/usage', 'navigate'],
  ])('%s (%s)', (path, mode) => {
    expect(route({ method: 'GET', url: origin + path, mode }, origin)).toBe('default');
    expect(route({ method: 'POST', url: origin + path, mode }, origin)).toBe('default');
  });
  it('an ordinary page still goes network-first', () => {
    expect(route({ method: 'GET', url: `${origin}/administration-guide/`, mode: 'navigate' }, origin)).toBe('navigate');
  });
});

describe('사진 PDF 변환 (TOOLS4 T2)', () => {
  it('tool and 용지 setting are whitelisted; an unknown 용지 value or a setting of another tool is refused', () => {
    expect(TOOLS).toContain('jpg-to-pdf');
    expect(validate(body({ ...BASE, t: 'jpg-to-pdf', e: 'start', o: 'page', v: 'a4' }))).not.toBeNull();
    expect(validate(body({ ...BASE, t: 'jpg-to-pdf', e: 'start', o: 'page', v: 'letter' }))).toBeNull();
    expect(validate(body({ ...BASE, t: 'jpg-to-pdf', e: 'start', o: 'page', v: 'le100' }))).toBeNull();
    for (const c of ['heic', 'not-image', 'too-many', 'too-big', 'canvas', 'engine']) {
      expect(validate(body({ ...BASE, t: 'jpg-to-pdf', e: 'fail', c, p: 'parse' })), c).not.toBeNull();
    }
  });

  it('admin labels are Korean: tool name as in tools.ts, 용지, 사진 크기에 맞춤 / A4', () => {
    const shaped = shapeUsage({
      events: [{ tool: 'jpg-to-pdf', event: 'success', via: 'direct', n: 2 }],
      settings: [
        { tool: 'jpg-to-pdf', setting: 'page', value: 'a4', n: 3 },
        { tool: 'jpg-to-pdf', setting: 'page', value: 'fit', n: 1 },
      ],
    });
    const [tools, , settings] = shaped.tables;
    expect(tools!.rows[0]![0]).toBe('사진 PDF 변환');
    expect(settings!.rows).toEqual([
      ['사진 PDF 변환', '용지', 'A4', '3'],
      ['사진 PDF 변환', '용지', '사진 크기에 맞춤', '1'],
    ]);
  });
});

describe('PDF JPG 변환 (TOOLS4 T3)', () => {
  it('tool and 선명도 setting are whitelisted; an unknown 선명도 value is refused', () => {
    expect(TOOLS).toContain('pdf-to-jpg');
    for (const v of ['p96', 'p150', 'p300']) expect(validate(body({ ...BASE, t: 'pdf-to-jpg', e: 'start', o: 'ppi', v })), v).not.toBeNull();
    for (const v of ['p200', '150', 'a4']) expect(validate(body({ ...BASE, t: 'pdf-to-jpg', e: 'start', o: 'ppi', v })), v).toBeNull();
    for (const c of ['not-pdf', 'too-big', 'too-many', 'wrong-password', 'corrupt', 'canvas', 'oom', 'engine']) {
      expect(validate(body({ ...BASE, t: 'pdf-to-jpg', e: 'fail', c, p: 'parse' })), c).not.toBeNull();
    }
  });

  it('admin labels are Korean: tool name as in tools.ts, 선명도, 작게 / 보통 / 선명 with the ppi', () => {
    const shaped = shapeUsage({
      events: [{ tool: 'pdf-to-jpg', event: 'success', via: 'direct', n: 2 }],
      settings: [
        { tool: 'pdf-to-jpg', setting: 'ppi', value: 'p150', n: 3 },
        { tool: 'pdf-to-jpg', setting: 'ppi', value: 'p300', n: 2 },
        { tool: 'pdf-to-jpg', setting: 'ppi', value: 'p96', n: 1 },
      ],
    });
    const [tools, , settings] = shaped.tables;
    expect(tools!.rows[0]![0]).toBe('PDF JPG 변환');
    expect(settings!.rows).toEqual([
      ['PDF JPG 변환', '선명도', '보통(약 150 ppi)', '3'],
      ['PDF JPG 변환', '선명도', '선명(약 300 ppi)', '2'],
      ['PDF JPG 변환', '선명도', '작게(약 96 ppi)', '1'],
    ]);
  });
});

describe('PDF 암호 해제·설정 (TOOLS4 T4)', () => {
  it('tool and 할 일 setting are whitelisted (lock / unlock only); unknown values and a password-like value are refused', () => {
    expect(TOOLS).toContain('pdf-password');
    for (const v of ['lock', 'unlock']) expect(validate(body({ ...BASE, t: 'pdf-password', e: 'start', o: 'action', v })), v).not.toBeNull();
    for (const v of ['remove', '문서딱암호12', '1234', 'LOCK']) expect(validate(body({ ...BASE, t: 'pdf-password', e: 'start', o: 'action', v })), v).toBeNull();
    for (const c of ['not-pdf', 'too-big', 'not-encrypted', 'already-encrypted', 'wrong-password', 'corrupt', 'oom', 'engine', 'unknown']) {
      expect(validate(body({ ...BASE, t: 'pdf-password', e: 'fail', c, p: 'process' })), c).not.toBeNull();
    }
    // A Korean or digit "code" (what a password would look like) is refused by CODE_RE.
    for (const c of ['문서딱암호12', 'pw1234']) expect(validate(body({ ...BASE, t: 'pdf-password', e: 'fail', c, p: 'process' })), c).toBeNull();
  });

  it('admin labels are Korean: tool name as in tools.ts, 할 일, 암호 걸기 / 암호 풀기', () => {
    const shaped = shapeUsage({
      events: [{ tool: 'pdf-password', event: 'success', via: 'direct', n: 2 }],
      settings: [
        { tool: 'pdf-password', setting: 'action', value: 'unlock', n: 3 },
        { tool: 'pdf-password', setting: 'action', value: 'lock', n: 1 },
      ],
    });
    const [tools, , settings] = shaped.tables;
    expect(tools!.rows[0]![0]).toBe('PDF 암호 해제·설정');
    expect(settings!.rows).toEqual([
      ['PDF 암호 해제·설정', '할 일', '암호 풀기', '3'],
      ['PDF 암호 해제·설정', '할 일', '암호 걸기', '1'],
    ]);
  });
});

describe('사진 JPG 변환 (TOOLS5 U1)', () => {
  it('tool and 저장 형식 setting are whitelisted (jpg / png / webp only); its fail codes pass; unknown values are refused', () => {
    expect(TOOLS).toContain('image-to-jpg');
    for (const v of ['jpg', 'png', 'webp']) expect(validate(body({ ...BASE, t: 'image-to-jpg', e: 'start', o: 'to', v })), v).not.toBeNull();
    for (const v of ['avif', 'JPG', 'heic', 'IMG_0001.jpg']) expect(validate(body({ ...BASE, t: 'image-to-jpg', e: 'start', o: 'to', v })), v).toBeNull();
    for (const c of ['heic', 'not-image', 'corrupt', 'empty', 'too-many', 'too-big', 'canvas', 'encoder', 'oom', 'engine', 'unknown']) {
      expect(validate(body({ ...BASE, t: 'image-to-jpg', e: 'fail', c, p: 'parse' })), c).not.toBeNull();
    }
  });

  it('admin labels are Korean: 사진 JPG 변환, 저장 형식, JPG / PNG / WebP, and the encoder failure', () => {
    const shaped = shapeUsage({
      events: [{ tool: 'image-to-jpg', event: 'success', via: 'direct', n: 4 }],
      settings: [
        { tool: 'image-to-jpg', setting: 'to', value: 'jpg', n: 3 },
        { tool: 'image-to-jpg', setting: 'to', value: 'webp', n: 1 },
      ],
    });
    const [tools, , settings] = shaped.tables;
    expect(tools!.rows[0]![0]).toBe('사진 JPG 변환');
    expect(settings!.rows).toEqual([
      ['사진 JPG 변환', '저장 형식', 'JPG', '3'],
      ['사진 JPG 변환', '저장 형식', 'WebP', '1'],
    ]);
    expect(FAIL_LABELS.encoder).toBe('고른 형식으로 저장 실패');
  });
});

describe('PDF 서명·도장 넣기 (TOOLS5 U3)', () => {
  it('tool and 넣을 쪽 setting are whitelisted; its fail codes pass; pages, ranges and positions are refused as values', () => {
    expect(TOOLS).toContain('pdf-sign');
    for (const v of ['one', 'range', 'all']) expect(validate(body({ ...BASE, t: 'pdf-sign', e: 'start', o: 'place', v })), v).not.toBeNull();
    for (const v of ['1-3', '2', 'ALL', 'x120y40', 'a.pdf']) expect(validate(body({ ...BASE, t: 'pdf-sign', e: 'start', o: 'place', v })), v).toBeNull();
    for (const c of ['not-pdf', 'corrupt', 'too-big', 'wrong-password', 'oom', 'engine', 'unknown', 'verify', 'heic', 'not-image', 'canvas', 'no-image']) {
      expect(validate(body({ ...BASE, t: 'pdf-sign', e: 'fail', c, p: 'parse' })), c).not.toBeNull();
    }
  });

  it('admin labels are Korean: PDF 서명·도장 넣기, 넣을 쪽 and its three values', () => {
    const shaped = shapeUsage({
      events: [{ tool: 'pdf-sign', event: 'success', via: 'direct', n: 3 }],
      settings: [
        { tool: 'pdf-sign', setting: 'place', value: 'all', n: 2 },
        { tool: 'pdf-sign', setting: 'place', value: 'one', n: 1 },
      ],
    });
    const [tools, , settings] = shaped.tables;
    expect(tools!.rows[0]![0]).toBe('PDF 서명·도장 넣기');
    expect(settings!.rows).toEqual([
      ['PDF 서명·도장 넣기', '넣을 쪽', '모든 쪽', '2'],
      ['PDF 서명·도장 넣기', '넣을 쪽', '고른 쪽', '1'],
    ]);
    expect(FAIL_LABELS['no-image']).toBe('서명 그림을 읽지 못함');
  });
});

describe('PDF 나누기·쪽 편집 (TOOLS5 U2)', () => {
  it('tool and 저장 방식 setting are whitelisted; its fail codes pass; ranges, counts and names are refused as values', () => {
    expect(TOOLS).toContain('pdf-split');
    for (const v of ['edit', 'extract', 'ranges', 'every', 'each']) expect(validate(body({ ...BASE, t: 'pdf-split', e: 'start', o: 'save', v })), v).not.toBeNull();
    for (const v of ['1-3', '2', 'split', 'EDIT', 'a.pdf']) expect(validate(body({ ...BASE, t: 'pdf-split', e: 'start', o: 'save', v })), v).toBeNull();
    for (const c of ['not-pdf', 'corrupt', 'too-many', 'too-big', 'wrong-password', 'oom', 'engine', 'unknown', 'verify', 'no-pages']) {
      expect(validate(body({ ...BASE, t: 'pdf-split', e: 'fail', c, p: 'process' })), c).not.toBeNull();
    }
  });

  it('admin labels are Korean: PDF 나누기·쪽 편집, 저장 방식 and its five values', () => {
    const shaped = shapeUsage({
      events: [{ tool: 'pdf-split', event: 'success', via: 'direct', n: 2 }],
      settings: [
        { tool: 'pdf-split', setting: 'save', value: 'ranges', n: 2 },
        { tool: 'pdf-split', setting: 'save', value: 'each', n: 1 },
      ],
    });
    const [tools, , settings] = shaped.tables;
    expect(tools!.rows[0]![0]).toBe('PDF 나누기·쪽 편집');
    expect(settings!.rows).toEqual([
      ['PDF 나누기·쪽 편집', '저장 방식', '범위대로 나누기', '2'],
      ['PDF 나누기·쪽 편집', '저장 방식', '한 쪽씩 나누기', '1'],
    ]);
    expect(FAIL_LABELS['no-pages']).toBe('남은 쪽 없음');
  });
});

describe('PDF 암호 해제·설정: the password never reaches a payload (TOOLS4 T4 decision 12)', () => {
  it('buildPayload drops any password, file name or page count passed alongside a start event', () => {
    const ctx = { via: 'direct' as const, ua: '', device: 'desktop' as const, build: 'dev', w: 1 };
    const p = buildPayload({ e: 'start', t: 'pdf-password', o: 'action', v: 'lock', password: '문서딱암호12', pw: '1234', name: '등본.pdf', pages: 7 } as never, ctx);
    expect(p).toEqual({ e: 'start', t: 'pdf-password', o: 'action', v: 'lock', via: 'direct', d: 'desktop', b: 'dev', w: 1 });
    expect(JSON.stringify(p)).not.toMatch(/문서딱암호12|1234|등본|7/);
  });
});
