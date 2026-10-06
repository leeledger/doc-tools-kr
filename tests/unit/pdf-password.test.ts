// PDF 암호 해제·설정 (TOOLS4 T4): qpdf argument builders and error mapping, the real vendored qpdf-wasm round trip
// (AES-256, a Korean password, checked with pdf.js), the lock password rule, the flow decisions and the page copy.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { getTool } from '../../src/data/tools';
import { TOOL_FACTS } from '../../src/data/tool-facts';
import { OWNER_HEX_LENGTH, lockArgs, passwordFailure, qpdfDone, randomOwnerPassword, unlockArgs } from '../../src/lib/pdf/password';
import { runQpdf, type QpdfFactory } from '../../src/lib/pdf/qpdf/qpdf-run';
import { MB } from '../../src/lib/ui/device';
import { STOP_MESSAGES, decide, outputName } from '../../src/tools/pdf-password/flow';
import { LIMITS, PASSWORD_MAX, PASSWORD_MESSAGES, PASSWORD_MIN, fileLimitMessage, lockPasswordError } from '../../src/tools/pdf-password/limits';
import { NOT_PRECACHED } from '../../scripts/gen-sw.mjs';
import { fixture, withPdf } from '../helpers/pdf';

const require = createRequire(import.meta.url);
const factory = require('@neslinesli93/qpdf-wasm/dist/qpdf.js') as QpdfFactory;
const qpdf = (args: string[], input: Uint8Array) => runQpdf(factory, undefined, args, input);

const KOREAN = '문서딱암호12';

/** pdf.js open result: the page count, or the exception name and code. */
async function open(bytes: Uint8Array, password?: string): Promise<number | string> {
  try {
    return await withPdf(bytes, async (doc) => doc.numPages, password);
  } catch (err) {
    const e = err as { name?: string; code?: number };
    return `${e.name}:${e.code}`;
  }
}

describe('qpdf arguments (password.ts)', () => {
  it('lock: AES-256 with named options; owner password = 32 random hex characters, never the user password', () => {
    const owner = randomOwnerPassword();
    expect(owner).toMatch(new RegExp(`^[0-9a-f]{${OWNER_HEX_LENGTH}}$`));
    expect(randomOwnerPassword()).not.toBe(owner);
    const args = lockArgs(KOREAN, owner);
    expect(args).toEqual(['--encrypt', `--user-password=${KOREAN}`, `--owner-password=${owner}`, '--bits=256', '--', 'in.pdf', 'out.pdf']);
    expect(owner).not.toBe(KOREAN);
    // A password that starts with "-" stays a value of the named option.
    expect(lockArgs('-x--', owner)[1]).toBe('--user-password=-x--');
    expect(randomOwnerPassword((a) => a.fill(0xab))).toBe('ab'.repeat(16));
  });

  it('unlock: --decrypt with the typed password; no other option (no restriction removal flags)', () => {
    expect(unlockArgs('1234')).toEqual(['--decrypt', '--password=1234', 'in.pdf', 'out.pdf']);
  });

  it('passwordFailure: invalid password -> wrong-password (given) or password (none); else corrupt; never returns log text', () => {
    const r = (logs: string[]) => ({ code: 2, out: null, logs });
    expect(passwordFailure(r([`qpdf: in.pdf: invalid password ${KOREAN}`]), true)).toBe('wrong-password');
    expect(passwordFailure(r(['in.pdf: invalid password']), false)).toBe('password');
    expect(passwordFailure(r(['in.pdf: not a PDF file']), true)).toBe('corrupt');
    expect(qpdfDone({ code: 3, out: new Uint8Array(4), logs: [] })).toBe(true);
    expect(qpdfDone({ code: 0, out: null, logs: [] })).toBe(false);
    expect(qpdfDone({ code: 2, out: new Uint8Array(4), logs: [] })).toBe(false);
  });
});

describe('vendored qpdf-wasm round trip (brief Unverified a, b, c)', () => {
  it('lock with a Korean password: AES-256 (V5 R6 AESV3); pdf.js refuses it without the password and opens it with it at the same page count; two locks differ', async () => {
    const src = fixture('gen_links_outline.pdf');
    const pages = await open(src);
    expect(typeof pages).toBe('number');
    const a = await qpdf(lockArgs(KOREAN, randomOwnerPassword()), src);
    const b = await qpdf(lockArgs(KOREAN, randomOwnerPassword()), src);
    expect(qpdfDone(a) && qpdfDone(b)).toBe(true);
    const text = Buffer.from(a.out!).toString('latin1');
    expect(text).toMatch(/\/V 5/);
    expect(text).toMatch(/\/R 6/);
    expect(text).toMatch(/AESV3/);
    expect(await open(a.out!)).toBe('PasswordException:1');
    expect(await open(a.out!, 'wrong')).toBe('PasswordException:2');
    expect(await open(a.out!, KOREAN)).toBe(pages);
    expect(Buffer.compare(Buffer.from(a.out!), Buffer.from(b.out!))).not.toBe(0);
  });

  it('unlock: the right password gives a file pdf.js opens without one; a wrong one maps to wrong-password and the logs are not surfaced', async () => {
    const src = fixture('gen_links_outline.pdf');
    const locked = (await qpdf(lockArgs(KOREAN, randomOwnerPassword()), src)).out!;
    const ok = await qpdf(unlockArgs(KOREAN), locked);
    expect(qpdfDone(ok)).toBe(true);
    expect(await open(ok.out!)).toBe(await open(src));
    await withPdf(ok.out!, async (doc) => expect(await doc.getPermissions()).toBeNull());
    const bad = await qpdf(unlockArgs('0000'), locked);
    expect(qpdfDone(bad)).toBe(false);
    expect(passwordFailure(bad, true)).toBe('wrong-password');
  });
});

describe('lock password rule and limits (limits.ts)', () => {
  it(`${PASSWORD_MIN}–${PASSWORD_MAX} characters (code points), typed twice the same; Korean allowed`, () => {
    expect(lockPasswordError('', '')).toBe('empty');
    expect(lockPasswordError('abc', 'abc')).toBe('length');
    expect(lockPasswordError('abcd', 'abcd')).toBeNull();
    expect(lockPasswordError('암호', '암호')).toBe('length');
    expect(lockPasswordError('암호암호', '암호암호')).toBeNull();
    expect(lockPasswordError(KOREAN, KOREAN)).toBeNull();
    expect(lockPasswordError('a'.repeat(64), 'a'.repeat(64))).toBeNull();
    expect(lockPasswordError('a'.repeat(65), 'a'.repeat(65))).toBe('length');
    // An emoji is one character, not two UTF-16 units.
    expect(lockPasswordError('😀😀😀😀', '😀😀😀😀')).toBeNull();
    expect(lockPasswordError('abcd', 'abce')).toBe('mismatch');
    expect(PASSWORD_MESSAGES.length).toContain(`${PASSWORD_MIN}자 이상 ${PASSWORD_MAX}자 이하`);
  });

  it('file caps: PC 200 MB, phone 50 MB, with the number in the message', () => {
    expect(LIMITS.desktop.maxFileBytes).toBe(200 * MB);
    expect(LIMITS.mobile.maxFileBytes).toBe(50 * MB);
    expect(fileLimitMessage(50 * MB, 'mobile')).toBeNull();
    expect(fileLimitMessage(50 * MB + 1, 'mobile')).toContain('50 MB');
    expect(fileLimitMessage(201 * MB, 'desktop')).toContain('200 MB');
  });
});

describe('flow (flow.ts, brief decision 13)', () => {
  it('unlock only a file that asks for a password; anything else stops with the not-encrypted message (no restriction removal)', () => {
    expect(decide('unlock', 'user')).toEqual({ step: 'ask' });
    for (const kind of ['none', 'owner'] as const) {
      expect(decide('unlock', kind)).toEqual({ step: 'stop', code: 'not-encrypted', message: STOP_MESSAGES['not-encrypted'], offerUnlock: false });
    }
    expect(STOP_MESSAGES['not-encrypted']).toBe('이 파일은 열 때 비밀번호가 필요 없습니다. 암호를 풀지 않아도 됩니다.');
  });

  it('lock only a file without encryption; a password-protected one is sent to 암호 풀기; an owner-limited one stops', () => {
    expect(decide('lock', 'none')).toEqual({ step: 'ask' });
    expect(decide('lock', 'user')).toEqual({ step: 'stop', code: 'already-encrypted', message: '이미 암호가 걸린 파일입니다. 먼저 암호를 풀어 주세요.', offerUnlock: true });
    expect(decide('lock', 'owner')).toMatchObject({ step: 'stop', code: 'already-encrypted', offerUnlock: false });
  });

  it('output names: {base}_암호.pdf / {base}_암호해제.pdf, unsafe characters removed', () => {
    expect(outputName('등본.pdf', 'lock')).toBe('등본_암호.pdf');
    expect(outputName('등본.PDF', 'unlock')).toBe('등본_암호해제.pdf');
    expect(outputName('a:b?.pdf', 'unlock')).toBe('ab_암호해제.pdf');
  });
});

describe('precache (deploy-gate ruling: the 450 KB limit is never raised)', () => {
  it('/pdf-password/ is not precached from the start; /hwp-viewer/ left to make room (measured, gen-sw.mjs); home and the PDF tools stay', () => {
    expect(NOT_PRECACHED('/pdf-password/')).toBe(true);
    expect(NOT_PRECACHED('/hwp-viewer/')).toBe(true);
    for (const p of ['/', '/pdf-merge/', '/pdf-compress/', '/hwp-to-pdf/', '/stamp-signature/']) expect(NOT_PRECACHED(p), p).toBe(false);
  });
});

describe('page copy (tools.ts)', () => {
  const tool = getTool('pdf-password');

  it('live; name = h1; title and 80–120 character description from the brief; keywords', () => {
    expect(tool.status).toBe('live');
    expect(tool.name).toBe('PDF 암호 해제·설정');
    expect(tool.h1).toBe(tool.name);
    expect(tool.title).toBe('PDF 암호 해제·설정 — 비밀번호 풀기·걸기 무료 | 문서딱');
    const n = [...tool.description].length;
    expect(n).toBeGreaterThanOrEqual(80);
    expect(n).toBeLessThanOrEqual(120);
    expect(tool.description).toContain('PDF 암호 해제');
    expect(tool.keywords).toContain('pdf 비밀번호 해제');
  });

  it('FAQ: forgotten password (decision 13, verbatim), 정부24·홈택스, AES-256, signature (decision 14), limits from limits.ts', () => {
    const all = tool.faq.map((f) => `${f.q} ${f.a}`).join('\n');
    expect(all).toContain('문서딱으로는 풀 수 없습니다. 파일을 보낸 곳에서 안내한 비밀번호를 확인하거나 파일을 다시 받으세요.');
    expect(all).toContain('정부24·홈택스');
    expect(all).toContain('AES-256');
    expect(all).toContain('전자서명이 더 이상 유효하지 않습니다');
    expect(all).toContain(`PC에서 ${LIMITS.desktop.maxFileBytes / MB} MB, 휴대폰에서 ${LIMITS.mobile.maxFileBytes / MB} MB`);
    expect(all).toContain(`${PASSWORD_MIN}자에서 ${PASSWORD_MAX}자`);
    expect(tool.faq.length).toBeGreaterThanOrEqual(4);
    expect(tool.faq.length).toBeLessThanOrEqual(6);
    // No 기관 password is stated, and nothing promises guessing or restriction removal.
    expect(all).not.toMatch(/생년월일|주민등록번호 앞|제한 해제|제한을 풀|크랙/);
    expect(`${tool.description}${all}`).not.toMatch(/업로드|서버|브라우저|메모리|dpi/);
  });

  it('tool facts read the limits', () => {
    expect(TOOL_FACTS['pdf-password.maxFileMb.desktop'].value).toBe(200);
    expect(TOOL_FACTS['pdf-password.maxFileMb.mobile'].value).toBe(50);
    expect(TOOL_FACTS['pdf-password.passwordMin'].value).toBe(PASSWORD_MIN);
    expect(TOOL_FACTS['pdf-password.passwordMax'].value).toBe(PASSWORD_MAX);
  });
});
