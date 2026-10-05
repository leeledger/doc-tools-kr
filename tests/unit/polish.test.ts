// Polish P unit tests (brief "Test map"): engine-load, formatSize, announce, preload, 목표 용량 search,
// live-only copy, operator contact, error beacon, service worker routing.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfCorruptError, PdfError, PdfNotPdfError, PdfWrongPasswordError } from '../../src/lib/pdf/errors';
import { TARGET_FLOORS, TARGET_LADDER, TARGET_SEARCH, LEVELS, type RungName } from '../../src/lib/pdf/compress/levels';
import type { CompressReport } from '../../src/lib/pdf/compress/report';
import { searchTarget, type RungOutcome } from '../../src/lib/pdf/compress/target';
import { announce, clearAlert } from '../../src/lib/ui/announce';
import { BEACON_ENABLED, browserFamily, buildPayload, createReporter, reportError } from '../../src/lib/ui/beacon';
import { EngineLoadError, ENGINE_COPY, engineErrorCopy, isEngineLoadFailure, withEngineRetry } from '../../src/lib/ui/engine-load';
import { formatSize } from '../../src/lib/ui/format';
import { nonPdfMessage } from '../../src/lib/ui/pdf-pick';
import { SIGNALS, schedulePreload, warmWorker } from '../../src/lib/ui/preload';
import { beaconPath } from '../../scripts/lib/beacon-path.mjs';
import { contactLine, defaultDescription, EMAIL_RE, footerContact, liveNames, sharePreview, SITE, TITLE_SUFFIX } from '../../src/data/site';
import og from '../../src/data/og.json';
import { LIVE_TOOLS, TOOLS, type Tool } from '../../src/data/tools';
import { handleFetch, route, staleCaches, type SwEnv } from '../../src/sw/sw';
import { parseTargetMb, TARGET_COPY, targetBytes, targetLabel } from '../../src/tools/pdf-compress/target';

// ---------- P.1 engine-load ----------

describe('isEngineLoadFailure', () => {
  const table: [string, unknown, boolean][] = [
    ['Chrome dynamic import', new TypeError('Failed to fetch dynamically imported module: https://x/_astro/inspect.js'), true],
    ['Safari dynamic import', new TypeError('Importing a module script failed.'), true],
    ['Firefox dynamic import', new TypeError('error loading dynamically imported module: https://x/a.js'), true],
    ['fetch failure', new TypeError('Failed to fetch'), true],
    ['WebKit fetch failure', new TypeError('Load failed'), true],
    ['EngineLoadError', new EngineLoadError(), true],
    ['emscripten fetch abort', new Error('Aborted(both async and sync fetching of the wasm failed). Build with -sASSERTIONS'), true],
    ['emscripten prepare', new Error('failed to asynchronously prepare wasm: CompileError: x'), true],
    ['CompileError by name', Object.assign(new Error('wasm validation error'), { name: 'CompileError' }), true],
    ['pdf.js fake worker', new Error('Setting up fake worker failed: "Failed to fetch dynamically imported module"'), true],
    ['corrupt PdfError', new PdfCorruptError('Failed to fetch dynamically imported module'), false],
    ['not-pdf', new PdfNotPdfError(), false],
    ['wrong password', new PdfWrongPasswordError(), false],
    ['unknown PdfError', new PdfError('unknown', 'CompileError'), false],
    ['a TypeError from code', new TypeError("Cannot read properties of undefined (reading 'x')"), false],
    ['a plain Error', new Error('Invalid PDF structure.'), false],
    ['a string', 'boom', false],
    ['null', null, false],
  ];
  it.each(table)('%s', (_, err, want) => expect(isEngineLoadFailure(err)).toBe(want));
});

describe('withEngineRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('retries once after 800 ms and returns the second result', async () => {
    const load = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce('ok');
    const p = withEngineRetry(load);
    await vi.advanceTimersByTimeAsync(799);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBe('ok');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('throws EngineLoadError after the second failure', async () => {
    const load = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const p = withEngineRetry(load);
    const check = expect(p).rejects.toBeInstanceOf(EngineLoadError);
    await vi.advanceTimersByTimeAsync(800);
    await check;
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not retry a success', async () => {
    const load = vi.fn().mockResolvedValue(1);
    await expect(withEngineRetry(load)).resolves.toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('engineErrorCopy', () => {
  const manifest = (build: string) => vi.fn(async () => new Response(JSON.stringify({ build })));

  it('offline: the connection copy, no fetch', async () => {
    const f = manifest('x');
    const c = await engineErrorCopy({ online: false, fetch: f, build: 'a' });
    expect(c.title).toBe('인터넷 연결이 끊겨 처리 도구를 불러오지 못했습니다.');
    expect(c.body).toBe('파일에는 문제가 없습니다. 연결을 확인한 뒤 새로고침해 주세요. 새로고침하면 파일을 다시 골라야 합니다.');
    expect(f).not.toHaveBeenCalled();
  });

  it('another build is live: the new-version copy; the manifest is fetched with no-store', async () => {
    const f = manifest('b');
    const c = await engineErrorCopy({ online: true, fetch: f, build: 'a' });
    expect(c.title).toBe(ENGINE_COPY.deployed);
    expect(c.body).toBe('파일에는 문제가 없습니다. 바로 새로고침해 주세요. 새로고침하면 파일을 다시 골라야 합니다.');
    expect(f).toHaveBeenCalledWith('/deploy-manifest.json', expect.objectContaining({ cache: 'no-store' }));
  });

  it('the same build: the generic copy', async () => {
    const c = await engineErrorCopy({ online: true, fetch: manifest('a'), build: 'a' });
    expect(c.title).toBe('처리 도구를 불러오지 못했습니다.');
    expect(c.body).toBe('파일에는 문제가 없습니다. 잠시 뒤 새로고침해 주세요. 새로고침하면 파일을 다시 골라야 합니다.');
  });

  it('a failed manifest fetch or a 404: the generic copy', async () => {
    for (const f of [vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))), vi.fn(async () => new Response('', { status: 404 }))]) {
      expect((await engineErrorCopy({ online: true, fetch: f as unknown as typeof fetch, build: 'a' })).title).toBe(ENGINE_COPY.generic);
    }
  });

  it('a manifest that hangs: the generic copy after the 3 s timeout', async () => {
    vi.useFakeTimers();
    const hang = vi.fn(() => new Promise<Response>(() => undefined));
    const p = engineErrorCopy({ online: true, fetch: hang as unknown as typeof fetch, build: 'a' });
    await vi.advanceTimersByTimeAsync(3000);
    expect((await p).title).toBe(ENGINE_COPY.generic);
    vi.useRealTimers();
  });
});

// ---------- P.14 formatSize ----------

describe('formatSize', () => {
  const MiB = 1024 * 1024;
  it.each([
    [0, '0 KB'],
    [5, '0.1 KB'],
    [1023, '1.0 KB'],
    [1024, '1.0 KB'],
    [1300, '1.3 KB'],
    [10239, '10 KB'],
    [10240, '10 KB'],
    [96_000, '94 KB'],
    [1_048_575, '1,024 KB'],
    [MiB, '1.0 MB'],
    [12.4 * MiB, '12.4 MB'],
  ])('%d → %s', (bytes, want) => expect(formatSize(bytes)).toBe(want));
});

// ---------- P.17 announce ----------

describe('announce', () => {
  function regions() {
    const status = { textContent: 'old status' } as unknown as HTMLElement;
    const alert = { textContent: '', hidden: true } as unknown as HTMLElement;
    const root = { querySelector: (sel: string) => (sel.includes('status') ? status : alert) } as unknown as ParentNode;
    return { status, alert, root };
  }
  let frames: (() => void)[];
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => (frames[id - 1] = () => undefined));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('status: clears first, then sets the text on the next frame', () => {
    const { status, root } = regions();
    announce('status', '확인하는 중입니다.', root);
    expect(status.textContent).toBe('');
    frames.forEach((f) => f());
    expect(status.textContent).toBe('확인하는 중입니다.');
  });

  it('an alert clears the status region, including a status still waiting for its frame', () => {
    const { status, alert, root } = regions();
    announce('status', '파일을 확인하는 중입니다.', root);
    announce('alert', '파일이 손상되었거나…', root);
    frames.forEach((f) => f());
    expect(status.textContent).toBe('');
    expect(alert.textContent).toBe('파일이 손상되었거나…');
    expect(alert.hidden).toBe(false);
  });

  it('clearAlert empties and hides the alert (a new file or run)', () => {
    const { alert, root } = regions();
    announce('alert', 'x', root);
    clearAlert(root);
    expect(alert.textContent).toBe('');
    expect(alert.hidden).toBe(true);
  });
});

// ---------- P.7 preload ----------

describe('schedulePreload', () => {
  class FakeTarget {
    listeners = new Map<string, Set<() => void>>();
    addEventListener(t: string, fn: () => void) {
      if (!this.listeners.has(t)) this.listeners.set(t, new Set());
      this.listeners.get(t)!.add(fn);
    }
    removeEventListener(t: string, fn: () => void) {
      this.listeners.get(t)?.delete(fn);
    }
    fire(t: string) {
      for (const fn of [...(this.listeners.get(t) ?? [])]) fn();
    }
  }
  const setup = (connection?: { saveData?: boolean; effectiveType?: string }) => {
    const win = new FakeTarget() as FakeTarget & { setTimeout: typeof setTimeout };
    win.setTimeout = ((fn: () => void, ms: number) => setTimeout(fn, ms)) as typeof setTimeout;
    const root = new FakeTarget();
    const picker = new FakeTarget();
    const drop = new FakeTarget();
    const fn = vi.fn(async () => undefined);
    const p = schedulePreload(fn, { root: root as unknown as EventTarget, immediate: [picker as unknown as EventTarget], dropZone: drop as unknown as EventTarget }, { win: win as never, connection });
    return { win, root, picker, drop, fn, p };
  };
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('never on idle alone', async () => {
    const { fn } = setup();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fn).not.toHaveBeenCalled();
  });

  it.each([...SIGNALS])('the first %s plus idle (1 s fallback) starts it once', async (signal) => {
    const { win, fn } = setup();
    win.fire(signal);
    win.fire('pointermove');
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('focus inside the tool counts as a signal', async () => {
    const { root, fn } = setup();
    root.fire('focusin');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('pointerdown on the picker and dragenter on the drop zone start it at once, with one shared promise', async () => {
    const { picker, drop, fn, p } = setup();
    picker.fire('pointerdown');
    drop.fire('dragenter');
    expect(fn).toHaveBeenCalledTimes(1);
    const a = p.pending();
    expect(a).not.toBeNull();
    expect(p.start()).toBe(a);
    await a;
    expect(p.pending()).toBeNull();
    p.start();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it.each([[{ saveData: true }], [{ effectiveType: '2g' }], [{ effectiveType: 'slow-2g' }]])('skipped on %o', async (conn) => {
    const { win, picker, fn, p } = setup(conn);
    win.fire('pointermove');
    picker.fire('pointerdown');
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).not.toHaveBeenCalled();
    expect(p.skipped).toBe(true);
  });

  it('a failure is silent and the next start tries again', async () => {
    const { p, fn } = setup();
    fn.mockRejectedValueOnce(new Error('offline'));
    await expect(p.start()).resolves.toBeUndefined();
    expect(p.pending()).toBeNull();
    await p.start();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('claim: a running preload is returned; one that has not started never starts', async () => {
    const a = setup();
    a.picker.fire('pointerdown');
    expect(a.p.claim()).not.toBeNull();
    const b = setup();
    expect(b.p.claim()).toBeNull();
    b.picker.fire('pointerdown');
    b.win.fire('pointermove');
    await vi.advanceTimersByTimeAsync(2000);
    expect(b.fn).not.toHaveBeenCalled();
  });
});

describe('warmWorker', () => {
  class FakeWorker {
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    onerror: ((ev: { preventDefault(): void }) => void) | null = null;
    terminated = false;
    constructor(private reply: 'warm-done' | 'error' | 'crash') {}
    postMessage(msg: { type: string }) {
      expect(msg).toEqual({ type: 'warm' });
      queueMicrotask(() => (this.reply === 'crash' ? this.onerror?.({ preventDefault() {} }) : this.onmessage?.({ data: { type: this.reply } })));
    }
    terminate() {
      this.terminated = true;
    }
  }
  it('resolves on warm-done and terminates the worker', async () => {
    const w = new FakeWorker('warm-done');
    await warmWorker(() => w as unknown as Worker);
    expect(w.terminated).toBe(true);
  });
  it.each(['error', 'crash'] as const)('rejects with EngineLoadError on %s and terminates', async (kind) => {
    const w = new FakeWorker(kind);
    await expect(warmWorker(() => w as unknown as Worker)).rejects.toBeInstanceOf(EngineLoadError);
    expect(w.terminated).toBe(true);
  });
});

// ---------- P.13 목표 용량 ----------

describe('목표 용량 search', () => {
  const report = (rung: RungName, keptOriginal = false): CompressReport => ({
    level: rung,
    inBytes: 1000,
    outBytes: 0,
    keptOriginal,
    pages: 1,
    imagesSeen: 1,
    imagesReplaced: 1,
    skipped: {},
    minImageSsim: null,
    signed: false,
    ownerRestrictionRemoved: false,
    ms: {},
  });
  /** A fake engine: `sizes[rung]` bytes, or kept when null. */
  const fake = (sizes: Partial<Record<RungName, number | null>>) => {
    const calls: RungName[] = [];
    const run = async (rung: RungName): Promise<RungOutcome> => {
      calls.push(rung);
      const n = sizes[rung];
      return n == null ? { bytes: new Uint8Array(1000), keptOriginal: true, report: report(rung, true) } : { bytes: new Uint8Array(n), keptOriginal: false, report: report(rung) };
    };
    return { run, calls };
  };

  it.each(TARGET_SEARCH.map((r, i) => [r, i] as const))('hit at rung %s: stops there, the highest-quality pass that fits', async (rung, i) => {
    const sizes = Object.fromEntries(TARGET_SEARCH.map((r, k) => [r, k < i ? 150 : 90])) as Record<RungName, number>;
    const { run, calls } = fake(sizes);
    const r = await searchTarget(run, TARGET_SEARCH, 100, 1000);
    expect(r.outcome).toBe('hit');
    if (r.outcome === 'hit') expect(r.rung).toBe(rung);
    expect(calls.at(-1)).toBe(rung);
  });

  it('skip-ahead: a plain level over 2 × target skips the next plain level, never a target rung', async () => {
    const { run, calls } = fake({ high: 500, recommended: 180, strong: 250, 'target-1': 220, 'target-2': 90 });
    const r = await searchTarget(run, TARGET_SEARCH, 100, 1000);
    // high 500 > 200 → recommended skipped; strong 250 > 200 → the next is target-1 (never skipped).
    expect(calls).toEqual(['high', 'strong', 'target-1', 'target-2']);
    expect(r.outcome).toBe('hit');
  });

  it('miss: the smallest valid result is offered', async () => {
    const { run } = fake({ high: 400, recommended: 190, strong: 150, 'target-1': 130, 'target-2': 140 });
    const r = await searchTarget(run, TARGET_SEARCH, 100, 1000);
    expect(r.outcome).toBe('miss');
    if (r.outcome === 'miss') {
      expect(r.rung).toBe('target-1');
      expect(r.bytes.length).toBe(130);
    }
  });

  it('none: every rung kept the original', async () => {
    const { run, calls } = fake({});
    const r = await searchTarget(run, TARGET_SEARCH, 100, 1000);
    expect(r.outcome).toBe('none');
    // Kept = input size (1000) > 2 × target: recommended is skipped.
    expect(calls).toEqual(['high', 'strong', 'target-1', 'target-2']);
  });

  it('input already under the target: nothing runs', async () => {
    const { run, calls } = fake({ high: 10 });
    const r = await searchTarget(run, TARGET_SEARCH, 1000, 1000);
    expect(r.outcome).toBe('already');
    expect(calls).toEqual([]);
  });

  it('keep-original holds on the chosen result: an output ≥ 99 % of the input is never offered', async () => {
    const { run } = fake({ high: 995, recommended: 992, strong: 991, 'target-1': 990, 'target-2': 999 });
    const r = await searchTarget(run, TARGET_SEARCH, 100, 1000);
    expect(r.outcome).toBe('none');
  });

  it('only the best result so far is referenced by the outcome', async () => {
    const { run } = fake({ high: 400, recommended: 190, strong: 150, 'target-1': 130, 'target-2': 140 });
    const r = await searchTarget(run, TARGET_SEARCH, 100, 1000);
    expect(Object.values(r).filter((v) => v instanceof Uint8Array)).toHaveLength(1);
  });

  it('TARGET_LADDER respects the floors (≥ 96 ppi, q ≥ 45, SSIM ≥ 0.80) and shares COMMON', () => {
    for (const lv of Object.values(TARGET_LADDER)) {
      expect(lv.targetPpi).toBeGreaterThanOrEqual(TARGET_FLOORS.ppi);
      expect(lv.q).toBeGreaterThanOrEqual(TARGET_FLOORS.q);
      expect(lv.minSsim).toBeGreaterThanOrEqual(TARGET_FLOORS.minSsim);
      expect({ minBytes: lv.minBytes, minPixels: lv.minPixels, minGain: lv.minGain }).toEqual({
        minBytes: LEVELS.high.minBytes,
        minPixels: LEVELS.high.minPixels,
        minGain: LEVELS.high.minGain,
      });
    }
    expect(TARGET_LADDER).toEqual({
      'target-1': expect.objectContaining({ triggerPpi: 110, targetPpi: 96, q: 50, minSsim: 0.82 }),
      'target-2': expect.objectContaining({ triggerPpi: 96, targetPpi: 96, q: 45, minSsim: 0.8 }),
    });
    expect(TARGET_SEARCH).toEqual(['high', 'recommended', 'strong', 'target-1', 'target-2']);
  });

  it('input: 0.5–100 MB in steps of 0.1, MB × 1,000,000 bytes, and the copy', () => {
    expect(parseTargetMb('0.5')).toBe(0.5);
    expect(parseTargetMb('12,5')).toBe(12.5);
    expect(parseTargetMb('100')).toBe(100);
    for (const bad of ['0.4', '100.1', '1.25', 'abc', '', '-1']) expect(parseTargetMb(bad)).toBeNull();
    expect(targetBytes(10)).toBe(10_000_000);
    expect(targetBytes(0.5)).toBe(500_000);
    expect(targetLabel(0.5)).toBe('0.5 MB');
    expect(TARGET_COPY.chip('10 MB')).toBe('✓ 10 MB 이하');
    expect(TARGET_COPY.miss('1 MB', '1.4 MB', false)).toBe('1 MB 이하로는 줄이지 못했습니다. 가장 작게 줄인 결과는 1.4 MB입니다. 이미지로 변환을 켜거나 파일을 나눠 제출해 보세요.');
    expect(TARGET_COPY.miss('1 MB', '1.4 MB', true)).toBe('1 MB 이하로는 줄이지 못했습니다. 가장 작게 줄인 결과는 1.4 MB입니다.');
    expect(TARGET_COPY.already('10 MB', '606 KB')).toBe('이미 10 MB 이하입니다(606 KB). 원본을 그대로 제출하면 됩니다.');
  });
});

// ---------- P.15 non-PDF ----------

it('nonPdfMessage: one name, several names, and more than three', () => {
  expect(nonPdfMessage(['a.txt'])).toBe('a.txt는 PDF 파일이 아니어서 넣지 않았습니다. PDF 파일만 넣을 수 있습니다.');
  expect(nonPdfMessage(['메모.hwp'])).toBe('메모.hwp는 PDF 파일이 아니어서 넣지 않았습니다. PDF 파일만 넣을 수 있습니다.');
  expect(nonPdfMessage(['사진.html'])).toBe('사진.html은 PDF 파일이 아니어서 넣지 않았습니다. PDF 파일만 넣을 수 있습니다.');
  expect(nonPdfMessage(['a.txt', 'b.jpg'])).toBe('파일 2개는 PDF가 아니어서 넣지 않았습니다: a.txt, b.jpg');
  expect(nonPdfMessage(['a', 'b', 'c', 'd', 'e'])).toBe('파일 5개는 PDF가 아니어서 넣지 않았습니다: a, b, c 외 2개');
});

// ---------- P.6 live-only copy, P.4 operator ----------

describe('live-only description (P.6)', () => {
  const soon = TOOLS.filter((t) => t.status !== 'live');

  it('names every live tool and no soon tool; 80–120 characters', () => {
    for (const text of [defaultDescription()]) {
      for (const t of LIVE_TOOLS) expect(text).toContain(t.name);
      for (const t of soon) expect(text).not.toContain(t.name);
    }
    const n = [...defaultDescription()].length;
    expect(n).toBeGreaterThanOrEqual(80);
    expect(n).toBeLessThanOrEqual(120);
  });

  it('follows tools.ts status: a flipped fixture changes the text with it', () => {
    const flipped: Tool[] = TOOLS.map((t) => ({ ...t, status: t.slug === 'id-photo' ? 'live' : t.slug === 'photo-compress' ? 'soon' : t.status }));
    const live = flipped.filter((t) => t.status === 'live');
    const text = defaultDescription(live);
    expect(text).toContain('여권·증명사진 규격 맞추기');
    expect(text).not.toContain('사진 용량 줄이기');
    expect(liveNames(live)).toBe(live.map((t) => t.name).join('·'));
  });

  it('no tool name is written as a literal outside tools.ts in the site data and the home page', () => {
    const files = ['src/data/site.ts', 'src/pages/index.astro', 'src/layouts/Base.astro', 'src/pages/404.astro'];
    for (const f of files) {
      const text = readFileSync(join(__dirname, '..', '..', f), 'utf8');
      for (const t of TOOLS) expect(text, `${f} writes "${t.name}"`).not.toContain(t.name);
    }
  });
});

describe('brand and titles (Polish Q)', () => {
  it('every tool title carries real search terms, ends with "| 문서딱" and stays ≤ 60 chars; the H1 is the menu name', () => {
    const KEYWORDS: Record<string, RegExp> = {
      'pdf-merge': /PDF 합치기.*병합/, 'pdf-compress': /PDF 용량 줄이기/, 'photo-compress': /사진 용량 줄이기/,
      'id-photo': /증명사진.*사이즈|사이즈.*규격/, 'hwp-to-pdf': /한글파일.*PDF/,
    };
    for (const t of TOOLS) {
      expect(t.title.endsWith(`| ${SITE.name}`)).toBe(true);
      expect([...t.title].length).toBeLessThanOrEqual(60);
      const kw = KEYWORDS[t.slug as string]; if (kw) expect(t.title).toMatch(kw);
      expect(t.h1).toBe(t.name);
    }
    expect(TITLE_SUFFIX.endsWith(`| ${SITE.name}`)).toBe(true);
    expect(SITE.name).toBe('문서딱');
  });
});

describe('share previews (Polish Q, src/data/og.json)', () => {
  it('each tool has its own image titled with its name; every page description is plain and ≤ 80 characters', () => {
    const images = og.images as Record<string, { title: string; line: string }>;
    const pages = og.pages as Record<string, { image: string; description: string }>;
    for (const t of TOOLS) {
      expect(pages[`/${t.slug}/`]?.image, t.slug).toBe(t.slug);
      expect(images[t.slug]?.title).toBe(t.name);
    }
    expect(pages['*']).toBeDefined();
    for (const [path, p] of Object.entries(pages)) {
      expect(images[p.image], path).toBeDefined();
      const d = sharePreview(path, 'https://docttak.com').description;
      expect([...d].length, path).toBeLessThanOrEqual(80);
      expect(d, path).not.toMatch(/업로드|서버|브라우저|네트워크|메모리|안올림|\{tools\}/);
    }
    for (const img of Object.values(images)) expect(img.line).toContain(' — ');
    expect(og.domain).toBe('docttak.com');
  });
  it('sharePreview: absolute image URL on the given site; unlisted paths take the default', () => {
    expect(sharePreview('/pdf-merge/', 'https://docttak.com')).toEqual({
      image: 'https://docttak.com/brand/og-pdf-merge.png',
      description: (og.pages as Record<string, { description: string }>)['/pdf-merge/']!.description,
      alt: '문서딱: PDF 합치기. 여러 PDF를 한 파일로 — 무료, 가입 없이',
    });
    expect(sharePreview('/404.html', 'https://docttak.com').image).toBe('https://docttak.com/brand/og-default.png');
    // The home preview no longer lists the tools (Sprint C: seven names alone pass 80 characters); it never names a
    // tool that is not live.
    const home = sharePreview('/', 'https://docttak.com').description;
    for (const t of TOOLS.filter((x) => x.status !== 'live')) expect(home).not.toContain(t.name);
  });
});

describe('operator contact (P.4)', () => {
  it('contactLine and footerContact: nothing while unset (owner decision, Polish Q); an escaped mailto link when set', () => {
    expect(contactLine(undefined)).toBeNull();
    expect(footerContact(undefined, undefined)).toBe('');
    expect(contactLine('help@example.kr')).toBe('문의: <a href="mailto:help@example.kr">help@example.kr</a>');
    expect(contactLine('a<b@c.kr')).toBe('문의: <a href="mailto:a&lt;b@c.kr">a&lt;b@c.kr</a>');
    expect(footerContact('help@example.kr', '123-45-67890')).toBe('문의: <a href="mailto:help@example.kr">help@example.kr</a> · 사업자등록번호 123-45-67890');
    expect(footerContact(undefined, '1<2')).toBe('사업자등록번호 1&lt;2');
  });
  it('EMAIL_RE', () => {
    expect(EMAIL_RE.test('help@example.kr')).toBe(true);
    for (const bad of ['help', 'help@', 'help@example', 'a b@c.kr']) expect(EMAIL_RE.test(bad)).toBe(false);
  });
});

// ---------- P.18 beacon ----------

describe('error beacon (P.18)', () => {
  it('is off in this build: reportError is a no-op', () => {
    expect(BEACON_ENABLED).toBe(false);
    const send = vi.fn();
    vi.stubGlobal('navigator', { sendBeacon: send, userAgent: 'x' });
    reportError({ tool: 'pdf-merge', phase: 'load', code: 'engine' });
    expect(send).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('the payload is exactly the whitelist, built field by field', () => {
    const input = { tool: 'pdf-compress', phase: 'process', code: 'oom', fileName: '주민등록등본.pdf', size: 123 } as never;
    const p = buildPayload(input, { ua: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36', device: 'desktop', build: 'abc123' });
    expect(Object.keys(p).sort()).toEqual(['browser', 'build', 'code', 'device', 'phase', 'tool']);
    expect(p).toEqual({ tool: 'pdf-compress', phase: 'process', code: 'oom', browser: 'chrome 131', device: 'desktop', build: 'abc123' });
    expect(buildPayload({ tool: 'pdf-merge', phase: 'load', code: 'x'.repeat(50) }, { ua: '', device: 'mobile', build: 'b' }).code).toBe('unknown');
  });

  it('the beacon path must be same-origin: one leading "/", never "//" (round 2)', () => {
    expect(beaconPath('/api/e')).toBe('/api/e');
    expect(beaconPath(' /api/e ')).toBe('/api/e');
    for (const bad of ['//evil.example/x', '///x', 'https://evil.example/x', 'api/e', '', undefined, '/\\evil.example']) expect(beaconPath(bad), String(bad)).toBe('');
  });

  it('browser family and major version only', () => {
    expect(browserFamily('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1')).toBe('safari 17');
    expect(browserFamily('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0')).toBe('edge 131');
    expect(browserFamily('Mozilla/5.0 (Windows NT 10.0; rv:133.0) Gecko/20100101 Firefox/133.0')).toBe('firefox 133');
    expect(browserFamily('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Whale/3.28.266.14 Mobile Safari/537.36')).toBe('whale 3');
    expect(browserFamily('curl/8')).toBe('other');
  });

  it('samples 1 in 10 and never throws', () => {
    const send = vi.fn(() => true);
    const env = { send, device: 'desktop' as const, ua: 'Chrome/131.0', build: 'b' };
    createReporter('/api/e', { ...env, random: () => 0.5 })({ tool: 'pdf-merge', phase: 'load', code: 'engine' });
    expect(send).not.toHaveBeenCalled();
    createReporter('/api/e', { ...env, random: () => 0.05 })({ tool: 'pdf-merge', phase: 'load', code: 'engine' });
    expect(send).toHaveBeenCalledWith('/api/e', JSON.stringify({ tool: 'pdf-merge', phase: 'load', code: 'engine', browser: 'chrome 131', device: 'desktop', build: 'b' }));
    const boom = () => {
      throw new Error('x');
    };
    expect(() => createReporter('/api/e', { ...env, random: () => 0, send: boom })({ tool: 'pdf-merge', phase: 'load', code: 'engine' })).not.toThrow();
  });
});

// ---------- P.11 service worker ----------

describe('service worker (P.11)', () => {
  const origin = 'https://anolim.example';
  const req = (url: string, method = 'GET', mode = 'no-cors') => ({ url: new URL(url, origin).href, method, mode }) as unknown as Request;

  it('routes only allowlisted same-origin GETs', () => {
    expect(route(req('/pdf-merge/', 'POST', 'navigate'), origin)).toBe('default');
    expect(route(req('https://other.example/_astro/a.js'), origin)).toBe('default');
    expect(route(req('/api/e'), origin)).toBe('default');
    expect(route(req('/sw.js'), origin)).toBe('default');
    expect(route(req('/deploy-manifest.json'), origin)).toBe('default');
    expect(route(req('/pdf-merge/', 'GET', 'navigate'), origin)).toBe('navigate');
    for (const p of ['/_astro/a.js', '/vendor/qpdf/x/qpdf.wasm', '/fonts/p.woff2', '/brand/og.png']) expect(route(req(p), origin)).toBe('runtime');
    expect(route(req('/sitemap.xml'), origin)).toBe('default');
  });

  class FakeCache {
    store = new Map<string, Response>();
    async match(r: Request | string) {
      const k = typeof r === 'string' ? new URL(r, origin).pathname : new URL(r.url).pathname;
      return this.store.get(k)?.clone();
    }
    async put(r: Request | string, res: Response) {
      this.store.set(typeof r === 'string' ? r : new URL(r.url).pathname, res);
    }
  }
  const envWith = (fetchImpl: SwEnv['fetch'], cache = new FakeCache()): SwEnv => ({
    origin,
    cacheName: 'anolim-b',
    precache: new Set(['/', '/pdf-merge/', '/offline/']),
    caches: { match: (r: RequestInfo | URL) => cache.match(r as Request), open: async () => cache as unknown as Cache } as SwEnv['caches'],
    fetch: fetchImpl,
    timeoutMs: 50,
  });
  const event = (r: Request) => {
    let responded: Promise<Response> | null = null;
    return {
      e: { request: r, respondWith: (p: Promise<Response>) => (responded = p) },
      get responded() {
        return responded;
      },
    };
  };

  it('does not answer POST, cross-origin, /api/ or /sw.js (browser default)', () => {
    const f = vi.fn();
    for (const r of [req('/pdf-merge/', 'POST', 'navigate'), req('https://x.example/_astro/a.js'), req('/api/e'), req('/sw.js')]) {
      const ev = event(r);
      handleFetch(ev.e, envWith(f));
      expect(ev.responded).toBeNull();
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('assets: cache first; a miss is fetched and stored only when ok and basic', async () => {
    const cache = new FakeCache();
    const ok = Object.defineProperty(new Response('js'), 'type', { value: 'basic' });
    const f = vi.fn(async () => ok);
    const ev = event(req('/_astro/a.js'));
    handleFetch(ev.e, envWith(f, cache));
    expect(await (await ev.responded!).text()).toBe('js');
    expect(cache.store.has('/_astro/a.js')).toBe(true);
    const again = event(req('/_astro/a.js'));
    handleFetch(again.e, envWith(f, cache));
    expect(await (await again.responded!).text()).toBe('js');
    expect(f).toHaveBeenCalledTimes(1);

    const notFound = vi.fn(async () => Object.defineProperty(new Response('no', { status: 404 }), 'type', { value: 'basic' }));
    const miss = event(req('/_astro/b.js'));
    handleFetch(miss.e, envWith(notFound, cache));
    expect((await miss.responded!).status).toBe(404);
    expect(cache.store.has('/_astro/b.js')).toBe(false);
  });

  it('C2 round 2: /terms/, /privacy/, /licenses/ are not precached but stored when visited; offline they come from the cache', async () => {
    const cache = new FakeCache();
    for (const path of ['/terms/', '/privacy/', '/licenses/']) {
      const ev = event(req(path, 'GET', 'navigate'));
      handleFetch(ev.e, envWith(async () => new Response(`page ${path}`), cache));
      await ev.responded;
      expect(cache.store.has(path), path).toBe(true);
      const offline = event(req(path, 'GET', 'navigate'));
      handleFetch(offline.e, envWith(async () => Promise.reject(new TypeError('offline')), cache));
      expect(await (await offline.responded!).text()).toBe(`page ${path}`);
    }
    const guide = event(req('/guide/x/', 'GET', 'navigate'));
    handleFetch(guide.e, envWith(async () => new Response('guide'), cache));
    await guide.responded;
    expect(cache.store.has('/guide/x/')).toBe(false);
  });

  it('navigation: network first (refreshing the precache), then the cache, then the offline page', async () => {
    const cache = new FakeCache();
    const online = event(req('/pdf-merge/', 'GET', 'navigate'));
    handleFetch(online.e, envWith(async () => new Response('fresh'), cache));
    expect(await (await online.responded!).text()).toBe('fresh');
    expect(await (await cache.match('/pdf-merge/'))!.text()).toBe('fresh');

    const offline = event(req('/pdf-merge/', 'GET', 'navigate'));
    handleFetch(offline.e, envWith(async () => Promise.reject(new TypeError('Failed to fetch')), cache));
    expect(await (await offline.responded!).text()).toBe('fresh');

    // Round 2: the fallback is the precached /offline/ page, never /404.html (Cloudflare redirects *.html).
    await cache.put('/404.html', new Response('not found page'));
    const noFallback = event(req('/nowhere/', 'GET', 'navigate'));
    handleFetch(noFallback.e, envWith(async () => Promise.reject(new TypeError('Failed to fetch')), cache));
    expect((await noFallback.responded!).type).toBe('error');
    await cache.put('/offline/', new Response('offline page'));
    const unknown = event(req('/nowhere/', 'GET', 'navigate'));
    handleFetch(unknown.e, envWith(async () => Promise.reject(new TypeError('Failed to fetch')), cache));
    expect(await (await unknown.responded!).text()).toBe('offline page');
  });

  it('a slow network (over 3 s) answers from the cache when it can', async () => {
    const cache = new FakeCache();
    await cache.put('/', new Response('cached home'));
    const slow = event(req('/', 'GET', 'navigate'));
    handleFetch(slow.e, envWith(() => new Promise<Response>((r) => setTimeout(() => r(new Response('late')), 500)), cache));
    expect(await (await slow.responded!).text()).toBe('cached home');
  });

  it('activate keeps the current cache and the single most recent previous one', () => {
    expect(staleCaches(['anolim-a', 'other', 'anolim-b', 'anolim-c', 'anolim-d'], 'anolim-d')).toEqual(['anolim-a', 'anolim-b']);
    expect(staleCaches(['anolim-c', 'anolim-d'], 'anolim-d')).toEqual([]);
    expect(staleCaches(['anolim-d'], 'anolim-d')).toEqual([]);
  });

  it('static guard: src/sw/sw.ts never reads a request body', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'sw', 'sw.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/\b(request|req|r)\.(body|formData|arrayBuffer|text|blob|json|clone)\b/);
    // No automatic skipWaiting(): only the SKIP_WAITING message calls it.
    const calls = src.split('\n').filter((l) => l.includes('.skipWaiting('));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('SKIP_WAITING');
  });
});
