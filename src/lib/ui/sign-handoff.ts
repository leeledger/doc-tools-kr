// 전자서명·도장 이미지 만들기 / 도장 만들기 → PDF 서명·도장 넣기 (TOOLS5 U3 decision 10, STAMP1015 D7): the made PNG
// travels in this tab's sessionStorage as a data URL with the name of the tool that made it, is read once by /pdf-sign/
// and removed. Nothing leaves the device; a full or blocked storage (QuotaExceeded, private mode) is reported so the page
// can ask for the download path instead.
import { track as trackUsage, type UsageEvent } from './usage';

export const SIGN_PNG_KEY = 'docttak:sign-png';
/** The tool that made the waiting PNG (STAMP1015 D7); missing or unknown reads as stamp-signature. */
export const SIGN_FROM_KEY = 'docttak:sign-from';
export const PDF_SIGN_PATH = '/pdf-sign/';
/** Shown on /stamp-signature/ when the PNG could not be stored. */
export const HANDOFF_FAILED = 'PNG를 내려받은 뒤 PDF 서명·도장 넣기에서 골라 주세요.';

/** Tools that hand a picture to /pdf-sign/ -> their names (equal to tools.ts names; unit test). */
export const SIGN_SOURCES = { 'stamp-signature': '전자서명·도장 이미지 만들기', 'stamp-maker': '도장 만들기' } as const;
export type SignSource = keyof typeof SIGN_SOURCES;
export const DEFAULT_SIGN_SOURCE: SignSource = 'stamp-signature';

/** /pdf-sign/'s arrival note for a picture made by `from`. */
export function arrivedNote(from: SignSource): string {
  return `${SIGN_SOURCES[from]}에서 만든 그림을 가져왔습니다. 이제 PDF 파일을 고르세요.`;
}

/** /pdf-sign/'s picture info line for a picture made by `from`. */
export function arrivedInfo(from: SignSource): string {
  return `${SIGN_SOURCES[from]}에서 가져온 그림`;
}

function isSource(v: string | null | undefined): v is SignSource {
  return typeof v === 'string' && Object.hasOwn(SIGN_SOURCES, v);
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** This tab's sessionStorage, or null where reading it throws (blocked storage). */
function session(): Store | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** `data:image/png;base64,…` of a PNG blob. */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(bin)}`;
}

/** Stores the PNG data URL and its source; false (nothing left behind) when storage is full or blocked. */
export function storeSignPng(dataUrl: string, store: Store | null = session(), from: SignSource = DEFAULT_SIGN_SOURCE): boolean {
  if (!store) return false;
  try {
    store.setItem(SIGN_PNG_KEY, dataUrl);
    store.setItem(SIGN_FROM_KEY, from);
    return true;
  } catch {
    try {
      store.removeItem(SIGN_PNG_KEY);
      store.removeItem(SIGN_FROM_KEY);
    } catch {
      /* blocked: nothing was stored */
    }
    return false;
  }
}

/** Whether a PNG is waiting (checked by /pdf-sign/'s page script to start its controller at once). */
export function hasSignPng(store: Store | null = session()): boolean {
  try {
    return Boolean(store?.getItem(SIGN_PNG_KEY));
  } catch {
    return false;
  }
}

const DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Reads the waiting PNG and its source once and removes both keys. `null` when there is none; `'invalid'` when the stored
 * value is not a PNG data URL (removed all the same). A missing or unknown source (a tab stored before STAMP1015) is
 * stamp-signature.
 */
export function takeSignPng(store: Store | null = session()): { blob: Blob; from: SignSource } | 'invalid' | null {
  let value: string | null;
  let source: string | null;
  try {
    value = store?.getItem(SIGN_PNG_KEY) ?? null;
    source = store?.getItem(SIGN_FROM_KEY) ?? null;
    store?.removeItem(SIGN_PNG_KEY);
    store?.removeItem(SIGN_FROM_KEY);
  } catch {
    return null;
  }
  if (!value) return null;
  const m = DATA_URL.exec(value);
  if (!m) return 'invalid';
  try {
    const bin = atob(m[1]!);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { blob: new Blob([bytes], { type: 'image/png' }), from: isSource(source) ? source : DEFAULT_SIGN_SOURCE };
  } catch {
    return 'invalid';
  }
}

/**
 * Stores `png` (made by `from`) and opens /pdf-sign/; false (nothing opened) when it could not be stored. A stored hand-off
 * counts as 이어서 하기 (REQ1014-A D16: next from -> pdf-sign), sent before the navigation (the beacon survives it).
 */
export async function sendToPdfSign(
  png: Blob,
  from: SignSource = DEFAULT_SIGN_SOURCE,
  go: (path: string) => void = (p) => window.location.assign(p),
  track: (ev: UsageEvent) => void = trackUsage,
): Promise<boolean> {
  let url: string;
  try {
    url = await blobToDataUrl(png);
  } catch {
    return false;
  }
  if (!storeSignPng(url, session(), from)) return false;
  track({ e: 'next', t: from, o: 'next', v: 'pdf-sign' });
  go(PDF_SIGN_PATH);
  return true;
}
