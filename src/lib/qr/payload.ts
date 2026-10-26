// QR payload builders (CARD1026 C7). Pure. Formats: tel URI, SMSTO and WIFI as in the ZXing wiki Barcode Contents
// (handoff/sources/card1026/zxing-barcode-contents.txt); iOS reads tel, SMSTO and Wi-Fi codes (Apple Tech Talk 206,
// handoff/sources/card1026/apple-wwdc17-206.txt). Both fetched 2026-10-26.

export type PayloadError = 'empty' | 'url' | 'phone' | 'message' | 'ssid' | 'password';
export type Payload = { ok: true; payload: string } | { ok: false; error: PayloadError };

const ok = (payload: string): Payload => ({ ok: true, payload });
const fail = (error: PayloadError): Payload => ({ ok: false, error });

/** Longest 문자 message (characters as counted by a textarea maxLength). */
export const SMS_MAX = 300;
/** Longest Wi-Fi network name accepted. */
export const SSID_MAX = 32;

// A scheme is letters then ':' not followed by a digit, so 「example.com:8080」 keeps its port and gets https://.
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/**
 * Canonical http(s) address for what was typed, or null. No scheme → https://. Only http and https pass
 * (javascript:, data:, mailto: … do not), the host needs a dot, and the result is `URL.href` (punycode host,
 * percent-encoded path, ASCII only).
 */
export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(SCHEME_RE.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname.includes('.')) return null;
  return url.href;
}

/** Digits of a phone number (spaces, -, (, ) and . removed; one leading + kept), or null if not 3–15 digits. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '');
  return /^\+?\d{3,15}$/.test(digits) ? digits : null;
}

export function urlPayload(input: string): Payload {
  if (!input.trim()) return fail('empty');
  const href = normalizeUrl(input);
  return href ? ok(href) : fail('url');
}

/** 글자: exactly as typed (line breaks kept). */
export const textPayload = (input: string): Payload => (input.trim() ? ok(input) : fail('empty'));

export function telPayload(input: string): Payload {
  if (!input.trim()) return fail('empty');
  const digits = normalizePhone(input);
  return digits ? ok(`tel:${digits}`) : fail('phone');
}

/** 문자: `SMSTO:<digits>:<message>` (the message may be empty). */
export function smsPayload(number: string, message: string): Payload {
  if (!number.trim()) return fail('empty');
  const digits = normalizePhone(number);
  if (!digits) return fail('phone');
  if (message.length > SMS_MAX) return fail('message');
  return ok(`SMSTO:${digits}:${message}`);
}

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';
export interface WifiInput {
  ssid: string;
  password: string;
  security: WifiSecurity;
  hidden: boolean;
}

/** Backslash before each of \ ; , : " (one pass, so a backslash is never escaped twice). No hex quoting. */
export const wifiEscape = (value: string): string => value.replace(/[\\;,:"]/g, '\\$&');

export function wifiPayload({ ssid, password, security, hidden }: WifiInput): Payload {
  if (!ssid || ssid.length > SSID_MAX) return fail('ssid');
  if (security !== 'nopass' && !password) return fail('password');
  return ok(
    `WIFI:T:${security};S:${wifiEscape(ssid)};` +
      (security === 'nopass' ? '' : `P:${wifiEscape(password)};`) +
      (hidden ? 'H:true;' : '') +
      ';',
  );
}
