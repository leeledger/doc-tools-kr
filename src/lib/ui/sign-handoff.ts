// 전자서명·도장 이미지 만들기 → PDF 서명·도장 넣기 (TOOLS5 U3, brief decision 10): the made PNG travels in this tab's
// sessionStorage as a data URL, is read once by /pdf-sign/ and removed. Nothing leaves the device; a full or blocked
// storage (QuotaExceeded, private mode) is reported so the page can ask for the download path instead.

export const SIGN_PNG_KEY = 'docttak:sign-png';
export const PDF_SIGN_PATH = '/pdf-sign/';
/** Shown on /stamp-signature/ when the PNG could not be stored. */
export const HANDOFF_FAILED = 'PNG를 내려받은 뒤 PDF 서명·도장 넣기에서 골라 주세요.';

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

/** Stores the PNG data URL; false when storage is full or blocked. */
export function storeSignPng(dataUrl: string, store: Store | null = session()): boolean {
  if (!store) return false;
  try {
    store.setItem(SIGN_PNG_KEY, dataUrl);
    return true;
  } catch {
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
 * Reads the waiting PNG once and removes it. `null` when there is none; `'invalid'` when the stored value is not a PNG
 * data URL (it is removed all the same).
 */
export function takeSignPng(store: Store | null = session()): Blob | 'invalid' | null {
  let value: string | null;
  try {
    value = store?.getItem(SIGN_PNG_KEY) ?? null;
    store?.removeItem(SIGN_PNG_KEY);
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
    return new Blob([bytes], { type: 'image/png' });
  } catch {
    return 'invalid';
  }
}

/** Stores `png` and opens /pdf-sign/; false (nothing opened) when it could not be stored. */
export async function sendToPdfSign(png: Blob, go: (path: string) => void = (p) => window.location.assign(p)): Promise<boolean> {
  let url: string;
  try {
    url = await blobToDataUrl(png);
  } catch {
    return false;
  }
  if (!storeSignPng(url)) return false;
  go(PDF_SIGN_PATH);
  return true;
}
