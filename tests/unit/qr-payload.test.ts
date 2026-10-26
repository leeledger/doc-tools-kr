// CARD1026 C7: payload builders. URL → canonical http(s) href only; tel/SMSTO digits; Wi-Fi escaping per the ZXing
// wiki (\ ; , : " get a backslash), nopass/hidden/WEP forms, and a jsQR round trip of an escaped Wi-Fi code.
import { describe, expect, it } from 'vitest';
import { encodeQr } from '../../src/lib/qr/encode';
import {
  SMS_MAX,
  SSID_MAX,
  normalizePhone,
  normalizeUrl,
  smsPayload,
  telPayload,
  textPayload,
  urlPayload,
  wifiEscape,
  wifiPayload,
} from '../../src/lib/qr/payload';
import { qrRgba } from '../../src/lib/qr/render';
import { decodeQrText } from '../helpers/qr-decode';

describe('urlPayload / normalizeUrl', () => {
  it('no scheme gets https://; http and https are kept; result is URL.href', () => {
    expect(urlPayload('docttak.com')).toEqual({ ok: true, payload: 'https://docttak.com/' });
    expect(urlPayload('  docttak.com/qr-code/  ')).toEqual({ ok: true, payload: 'https://docttak.com/qr-code/' });
    expect(urlPayload('http://example.com')).toEqual({ ok: true, payload: 'http://example.com/' });
    expect(urlPayload('HTTPS://Example.COM/A')).toEqual({ ok: true, payload: 'https://example.com/A' });
    expect(urlPayload('example.com:8080/x')).toEqual({ ok: true, payload: 'https://example.com:8080/x' });
  });

  it('Hangul host → punycode, Hangul path → percent-encoded, inner spaces in the path → %20 (ASCII only)', () => {
    const r = urlPayload('문서딱.com/가 나');
    expect(r).toEqual({ ok: true, payload: 'https://xn--w01b87ijtf.com/%EA%B0%80%20%EB%82%98' });
    if (r.ok) expect(/^[\x21-\x7e]+$/.test(r.payload)).toBe(true);
  });

  it('javascript:, data:, mailto:, ftp:, junk and hosts without a dot are url errors; blank is empty', () => {
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,hi', 'mailto:a@b.com', 'ftp://example.com', 'exa mple.com', 'https://', 'localhost', '안녕하세요']) {
      expect(urlPayload(bad)).toEqual({ ok: false, error: 'url' });
    }
    expect(urlPayload('   ')).toEqual({ ok: false, error: 'empty' });
    expect(normalizeUrl('')).toBeNull();
  });
});

describe('textPayload', () => {
  it('as typed, line breaks and spaces kept; blank is empty', () => {
    expect(textPayload(' 첫 줄\n둘째 줄 ')).toEqual({ ok: true, payload: ' 첫 줄\n둘째 줄 ' });
    expect(textPayload('')).toEqual({ ok: false, error: 'empty' });
    expect(textPayload(' \n ')).toEqual({ ok: false, error: 'empty' });
  });
});

describe('telPayload / smsPayload', () => {
  it('spaces, -, (, ), . are removed; + kept; 3–15 digits', () => {
    expect(telPayload('010-1234-5678')).toEqual({ ok: true, payload: 'tel:01012345678' });
    expect(telPayload('(02) 123.4567')).toEqual({ ok: true, payload: 'tel:021234567' });
    expect(telPayload('+82 10 1234 5678')).toEqual({ ok: true, payload: 'tel:+821012345678' });
    expect(telPayload('112')).toEqual({ ok: true, payload: 'tel:112' });
    expect(normalizePhone('1'.repeat(15))).toBe('1'.repeat(15));
  });

  it('letters, too short, too long, a + inside are phone errors; blank is empty', () => {
    for (const bad of ['010-abcd-5678', '12', '1'.repeat(16), '010+1234', '++8210', '#123']) {
      expect(telPayload(bad)).toEqual({ ok: false, error: 'phone' });
    }
    expect(telPayload(' ')).toEqual({ ok: false, error: 'empty' });
  });

  it('SMSTO:<digits>:<message>; empty message allowed; over 300 characters is a message error', () => {
    expect(smsPayload('010-1234-5678', '안녕하세요: 도착했어요')).toEqual({ ok: true, payload: 'SMSTO:01012345678:안녕하세요: 도착했어요' });
    expect(smsPayload('01012345678', '')).toEqual({ ok: true, payload: 'SMSTO:01012345678:' });
    expect(SMS_MAX).toBe(300);
    expect(smsPayload('01012345678', '가'.repeat(300)).ok).toBe(true);
    expect(smsPayload('01012345678', '가'.repeat(301))).toEqual({ ok: false, error: 'message' });
    expect(smsPayload('abc', 'x')).toEqual({ ok: false, error: 'phone' });
    expect(smsPayload('', 'x')).toEqual({ ok: false, error: 'empty' });
  });
});

describe('wifiPayload', () => {
  it('escapes backslash, semicolon, comma, colon and double quote, each once (ZXing wiki example)', () => {
    expect(wifiEscape('"foo;bar\\baz"')).toBe('\\"foo\\;bar\\\\baz\\"');
    expect(wifiEscape('a,b:c')).toBe('a\\,b\\:c');
    expect(wifiEscape('\\;')).toBe('\\\\\\;');
    expect(wifiEscape('ABCD')).toBe('ABCD'); // no hex quoting
  });

  it('WPA, WEP, nopass and hidden forms', () => {
    expect(wifiPayload({ ssid: '우리집', password: 'pa;ss:word', security: 'WPA', hidden: false })).toEqual({
      ok: true,
      payload: 'WIFI:T:WPA;S:우리집;P:pa\\;ss\\:word;;',
    });
    expect(wifiPayload({ ssid: 'old', password: '12345', security: 'WEP', hidden: true })).toEqual({
      ok: true,
      payload: 'WIFI:T:WEP;S:old;P:12345;H:true;;',
    });
    expect(wifiPayload({ ssid: 'cafe guest', password: 'ignored', security: 'nopass', hidden: false })).toEqual({
      ok: true,
      payload: 'WIFI:T:nopass;S:cafe guest;;',
    });
    expect(wifiPayload({ ssid: 'h', password: '', security: 'nopass', hidden: true })).toEqual({ ok: true, payload: 'WIFI:T:nopass;S:h;H:true;;' });
  });

  it('SSID required and at most 32 characters; password required unless nopass', () => {
    expect(SSID_MAX).toBe(32);
    expect(wifiPayload({ ssid: '', password: 'x', security: 'WPA', hidden: false })).toEqual({ ok: false, error: 'ssid' });
    expect(wifiPayload({ ssid: 'a'.repeat(33), password: 'x', security: 'WPA', hidden: false })).toEqual({ ok: false, error: 'ssid' });
    expect(wifiPayload({ ssid: 'a'.repeat(32), password: 'x', security: 'WPA', hidden: false }).ok).toBe(true);
    expect(wifiPayload({ ssid: 'a', password: '', security: 'WPA', hidden: false })).toEqual({ ok: false, error: 'password' });
    expect(wifiPayload({ ssid: 'a', password: '', security: 'WEP', hidden: false })).toEqual({ ok: false, error: 'password' });
  });

  it('an escaped Wi-Fi payload survives a QR round trip byte for byte', () => {
    const r = wifiPayload({ ssid: '문서딱;5G', password: 'a;b,c:d"e\\f', security: 'WPA', hidden: false });
    if (!r.ok) throw new Error(r.error);
    const q = encodeQr(r.payload);
    if (!q.ok) throw new Error(q.code);
    const { data, width, height } = qrRgba(q.modules, 4);
    expect(decodeQrText(data, width, height)).toBe(r.payload);
  });
});
