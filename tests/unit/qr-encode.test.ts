// CARD1026 C4: the uqr wrapper never throws on user text, cuts at 2,331 UTF-8 bytes (version 40-M binary,
// qrcode.com) and flags versions above 15 (412 bytes at M) as dense.
import { describe, expect, it } from 'vitest';
import { DENSE_VERSION, QR_MAX_BYTES, encodeQr, fixSurrogates, utf8Length } from '../../src/lib/qr/encode';
import { qrRgba } from '../../src/lib/qr/render';
import { decodeQrText } from '../helpers/qr-decode';

const decode = (text: string): string | null => {
  const r = encodeQr(text);
  if (!r.ok) throw new Error(r.code);
  const { data, width, height } = qrRgba(r.modules, 4);
  return decodeQrText(data, width, height);
};

describe('encodeQr', () => {
  it('empty text is `empty`, not a QR', () => {
    expect(encodeQr('')).toEqual({ ok: false, code: 'empty' });
  });

  it('ASCII, Hangul and emoji give a square matrix that decodes to the same UTF-8 text', () => {
    for (const text of ['hello world', '홍길동 010-1234-5678', '문서딱 😀 QR', 'ABC123']) {
      const r = encodeQr(text);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.modules.length).toBe(r.size);
      expect(r.modules.every((row) => row.length === r.size)).toBe(true);
      expect(r.size).toBe(17 + 4 * r.version);
      expect(decode(text)).toBe(text);
    }
  });

  it('a lone surrogate becomes U+FFFD instead of throwing (encodeURI would throw URIError)', () => {
    expect(() => encodeURI('a\ud800b')).toThrow(URIError);
    for (const text of ['a\ud800b', 'x\udc00', '\ud83d', '끝\udfff\ud800']) {
      expect(encodeQr(text).ok).toBe(true);
    }
    expect(decode('a\ud800b')).toBe('a�b');
    expect(fixSurrogates('😀𐀀')).toBe('😀𐀀');
    expect(fixSurrogates('\udc00\ud800')).toBe('��');
    expect(utf8Length(fixSurrogates('a\ud800'))).toBe(new TextEncoder().encode('a\ud800').length);
  });

  it('2,331 bytes encode at version 40; 2,332 bytes are tooLong without a throw', () => {
    expect(QR_MAX_BYTES).toBe(2331);
    const max = encodeQr('a'.repeat(2331));
    expect(max.ok && max.version).toBe(40);
    expect(encodeQr('a'.repeat(2332))).toEqual({ ok: false, code: 'tooLong' });
    // Hangul is 3 bytes: 777 syllables = 2,331 bytes fit, 778 do not.
    expect(encodeQr('가'.repeat(777)).ok).toBe(true);
    expect(encodeQr('가'.repeat(778))).toEqual({ ok: false, code: 'tooLong' });
    expect(decode('가'.repeat(777))).toBe('가'.repeat(777));
  });

  it('dense from version 16: 412 bytes are version 15, 413 bytes version 16 (qrcode.com binary at M)', () => {
    expect(DENSE_VERSION).toBe(15);
    const v15 = encodeQr('a'.repeat(412));
    const v16 = encodeQr('a'.repeat(413));
    expect(v15.ok && [v15.version, v15.dense]).toEqual([15, false]);
    expect(v16.ok && [v16.version, v16.dense]).toEqual([16, true]);
  });

  it('uses level M: 14 bytes fit version 1 (M binary 14), 15 bytes need version 2', () => {
    const a = encodeQr('a'.repeat(14));
    const b = encodeQr('a'.repeat(15));
    expect(a.ok && a.version).toBe(1);
    expect(b.ok && b.version).toBe(2);
  });
});
