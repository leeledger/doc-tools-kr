// HWPX HWP 변환: the export with the reload gate (HWPX2HWP brief decision 4, test map "export-hwp"), with the real
// rhwp engine in Node on the four HWPX fixtures and with a fake rhwp for every failure path.
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { openCfb } from '../../src/lib/hwp/cfb';
import { HwpError } from '../../src/lib/hwp/errors';
import { CFB_MAGIC, countLosses, exportHwp, hasCfbMagic, type ExportableDocument, type ReloadCtor, type RhwpExport } from '../../src/lib/hwp/export-hwp';
import { glyphText } from '../../src/lib/hwp/svg-string';
import { hwpFixture } from '../helpers/hwp';
import { loadRhwp } from '../helpers/rhwp-node';

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const CFB = Uint8Array.from([...CFB_MAGIC, 0, 0, 0, 0]);

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
    return 'no error';
  } catch (err) {
    return err instanceof HwpError ? err.code : `not an HwpError: ${String(err)}`;
  }
};

describe('export-hwp with the real rhwp (adm02, adm14, adm19, adm28)', () => {
  let Doc: Awaited<ReturnType<typeof loadRhwp>>;
  beforeAll(async () => {
    Doc = await loadRhwp();
  }, 60_000);

  const pageTexts = (doc: InstanceType<typeof Doc>): string[] => {
    const out: string[] = [];
    for (let i = 0; i < doc.pageCount(); i++) out.push(glyphText(doc.renderPageSvg(i)));
    return out;
  };

  it.each(['adm02', 'adm14', 'adm19', 'adm28'])(
    '%s: 0 losses, an HWP 5 CFB with the RhwpHwpxOrigin stream, same pages and page text on reload, same bytes twice',
    (key) => {
      const src = hwpFixture(`${key}.hwpx`);
      const sourceText = (() => {
        const d = new Doc(src);
        try {
          return pageTexts(d);
        } finally {
          d.free();
        }
      })();
      const freed: string[] = [];
      const run = (): ReturnType<typeof exportHwp> => {
        const d = new Doc(src);
        const free = d.free.bind(d);
        d.free = () => {
          freed.push(key);
          free();
        };
        return exportHwp(d, Doc);
      };
      const r = run();
      expect(freed).toEqual([key]);
      expect(r.losses).toBe(0);
      expect(r.pagesIn).toBe(sourceText.length);
      expect(hasCfbMagic(r.bytes)).toBe(true);
      const cfb = openCfb(r.bytes);
      const header = cfb.readStream('FileHeader')!;
      expect(String.fromCharCode(...header.subarray(0, 17))).toBe('HWP Document File');
      // Pin: rhwp 0.8.6 writes a 1-byte RhwpHwpxOrigin stream that 한글 accepted (owner O4). An engine upgrade
      // that drops or changes it shows up here (HWPX2HWP decision 7).
      const origin = cfb.listStreams().find((s) => s.path === 'RhwpHwpxOrigin');
      expect(origin, cfb.listStreams().map((s) => s.path).join(' ')).toBeDefined();
      expect(origin!.size).toBe(1);
      const back = new Doc(r.bytes);
      try {
        expect(back.pageCount()).toBe(r.pagesIn);
        expect(pageTexts(back)).toEqual(sourceText);
      } finally {
        back.free();
      }
      expect(sha(run().bytes)).toBe(sha(r.bytes));
    },
    120_000,
  );
});

interface FakeOpts {
  pages?: number;
  bytes?: Uint8Array;
  report?: string | (() => string);
  exportThrows?: unknown;
  takeThrows?: unknown;
}

function fakeDoc(o: FakeOpts = {}): ExportableDocument & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    pageCount: () => o.pages ?? 3,
    exportHwpWithReport(): RhwpExport {
      if (o.exportThrows) throw o.exportThrows;
      return {
        contentLoss: () => (typeof o.report === 'function' ? o.report() : (o.report ?? '{"schemaVersion":1,"outputFormat":"hwp","count":0,"losses":[]}')),
        takeBytes: () => {
          if (o.takeThrows) throw o.takeThrows;
          log.push('take');
          return o.bytes ?? CFB;
        },
        free: () => log.push('export.free'),
      };
    },
    free: () => log.push('doc.free'),
  };
}

function fakeReload(pages: number | (() => never)): ReloadCtor & { freed: number } {
  const ctor = class {
    static freed = 0;
    constructor(_bytes: Uint8Array) {
      if (typeof pages === 'function') pages();
    }
    pageCount(): number {
      return pages as number;
    }
    free(): void {
      ctor.freed++;
    }
  };
  return ctor;
}

describe('export-hwp with a fake rhwp', () => {
  it('passes: bytes, losses, pagesIn; export and source freed before the reload, reload freed', () => {
    const doc = fakeDoc();
    const Reload = fakeReload(3);
    const r = exportHwp(doc, Reload);
    expect(r).toEqual({ bytes: CFB, losses: 0, pagesIn: 3 });
    expect(doc.log).toEqual(['take', 'export.free', 'doc.free']);
    expect(Reload.freed).toBe(1);
  });

  it('reload with another page count → unverified', () => {
    expect(codeOf(() => exportHwp(fakeDoc({ pages: 3 }), fakeReload(4)))).toBe('unverified');
  });

  it('reload throws → unverified; reload out of memory → oom', () => {
    expect(codeOf(() => exportHwp(fakeDoc(), fakeReload(() => { throw new Error('유효하지 않은 파일'); })))).toBe('unverified');
    expect(codeOf(() => exportHwp(fakeDoc(), fakeReload(() => { throw new RangeError('Out of memory'); })))).toBe('oom');
  });

  it('zero bytes, bytes without the CFB magic, or a 0-page source → unverified (and the source is still freed)', () => {
    const doc = fakeDoc({ bytes: new Uint8Array(0) });
    expect(codeOf(() => exportHwp(doc, fakeReload(3)))).toBe('unverified');
    expect(doc.log).toContain('doc.free');
    expect(codeOf(() => exportHwp(fakeDoc({ bytes: Uint8Array.from([0x50, 0x4b, 3, 4, 0, 0, 0, 0]) }), fakeReload(3)))).toBe('unverified');
    expect(codeOf(() => exportHwp(fakeDoc({ pages: 0 }), fakeReload(0)))).toBe('unverified');
  });

  it('export throws → export; RangeError → oom; takeBytes throws → export (export and source freed)', () => {
    const doc = fakeDoc({ exportThrows: new Error('adapter failed') });
    expect(codeOf(() => exportHwp(doc, fakeReload(3)))).toBe('export');
    expect(doc.log).toEqual(['doc.free']);
    expect(codeOf(() => exportHwp(fakeDoc({ exportThrows: new RangeError('Maximum call stack') }), fakeReload(3)))).toBe('oom');
    const take = fakeDoc({ takeThrows: new Error('bytes already taken') });
    expect(codeOf(() => exportHwp(take, fakeReload(3)))).toBe('export');
    expect(take.log).toEqual(['export.free', 'doc.free']);
  });

  it('losses > 0 pass through with the bytes (download stays allowed)', () => {
    const report = JSON.stringify({ schemaVersion: 1, outputFormat: 'hwp', count: 2, losses: [{ code: 'controlOmitted' }, { code: 'metadataReduced' }] });
    expect(exportHwp(fakeDoc({ report }), fakeReload(3)).losses).toBe(2);
  });

  it('a malformed or unreadable loss report counts as one unknown loss, never as none', () => {
    expect(exportHwp(fakeDoc({ report: '{not json' }), fakeReload(3)).losses).toBe(1);
    expect(exportHwp(fakeDoc({ report: () => { throw new Error('report gone'); } }), fakeReload(3)).losses).toBe(1);
  });
});

describe('countLosses', () => {
  it('reads the losses array (and a larger count); anything else is one unknown loss', () => {
    expect(countLosses('{"schemaVersion":1,"outputFormat":"hwp","count":0,"losses":[]}')).toBe(0);
    expect(countLosses('{"count":1,"losses":[{"code":"x"}]}')).toBe(1);
    expect(countLosses('{"count":5,"losses":[{"code":"x"}]}')).toBe(5);
    expect(countLosses('{"count":"3","losses":[]}')).toBe(0);
    for (const bad of ['', 'null', '[]', '{"count":0}', '{"losses":{}}', '42', '{']) expect(countLosses(bad), bad).toBe(1);
  });
});
