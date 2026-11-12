// 직인 그림 넣기 (QUOTE1112 Q9): the optional seal picture of /quotation/, part of its lazy controller. A PNG or JPG
// file (sniffed by its first bytes, at most SEAL_MAX_BYTES) is decoded on this device, scaled to SEAL_MAX_PX on its long
// side and re-encoded as a PNG (no metadata survives a canvas); 「빼기」 drops it. A picture made by /stamp-maker/
// arrives through the sign hand-off (this tab's sessionStorage, read once and removed: lib/ui/sign-handoff). Never sent
// anywhere, never stored by us; a change marks a built document stale (an `input` event on the form).
import { sealFit, SEAL_MAX_BYTES, type FormSealMsg } from '../../lib/form/seal';
import { SIGN_SOURCES, takeSignPng } from '../../lib/ui/sign-handoff';
import { SEAL_COPY } from './copy';

type Seal = { bytes: Uint8Array; w: number; h: number };

/** The seal part of the page's form hooks. */
export interface SealPart {
  /** The seal for the next build: a copy of its bytes (the controller transfers it; the page keeps its own). */
  current(): FormSealMsg | undefined;
  reset(): void;
}

const isPng = (b: Uint8Array): boolean => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpeg = (b: Uint8Array): boolean => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** A PNG or JPG blob → the re-encoded PNG at most SEAL_MAX_PX on a side; null when it cannot be decoded. */
async function reencode(blob: Blob): Promise<Seal | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  try {
    if (!bitmap.width || !bitmap.height) return null;
    const { w, h } = sealFit(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return png ? { bytes: new Uint8Array(await png.arrayBuffer()), w, h } : null;
  } finally {
    bitmap.close();
  }
}

/** Wires the seal input of `prefix`; returns the controller's seal source. */
export function initSeal(prefix: string, form: HTMLFormElement, say: (msg: string) => void): SealPart {
  const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(`${prefix}-${id}`) as T | null;
  const input = $<HTMLInputElement>('seal-file');
  const img = $<HTMLImageElement>('seal-img');
  const remove = $<HTMLButtonElement>('seal-remove');
  const error = $<HTMLParagraphElement>('seal-error');
  const note = $<HTMLParagraphElement>('seal-note');
  let seal: Seal | null = null;
  let url: string | null = null;
  let token = 0;

  const changed = (): void => void form.dispatchEvent(new Event('input', { bubbles: true }));
  const show = (s: Seal | null): void => {
    seal = s;
    if (url) URL.revokeObjectURL(url);
    url = null;
    if (img) {
      if (s) img.src = url = URL.createObjectURL(new Blob([s.bytes.slice()], { type: 'image/png' }));
      else img.removeAttribute('src');
      img.hidden = !s;
    }
    if (remove) remove.hidden = !s;
  };
  const fail = (msg: string): void => {
    if (error) error.textContent = msg;
    input?.setAttribute('aria-invalid', 'true');
  };
  const clearLines = (): void => {
    if (error) error.textContent = '';
    if (note) note.textContent = '';
    input?.removeAttribute('aria-invalid');
  };

  async function use(blob: Blob, arrived?: string): Promise<void> {
    const id = ++token;
    clearLines();
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    if (id !== token) return;
    if (!isPng(head) && !isJpeg(head)) return fail(SEAL_COPY.notImage);
    if (blob.size > SEAL_MAX_BYTES) return fail(SEAL_COPY.tooLarge);
    const s = await reencode(blob);
    if (id !== token) return;
    if (!s) return fail(SEAL_COPY.unreadable);
    show(s);
    const line = arrived ? SEAL_COPY.arrived(arrived) : SEAL_COPY.added;
    if (note) note.textContent = line;
    say(line);
    changed();
  }

  input?.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void use(file);
  });
  remove?.addEventListener('click', () => {
    token++;
    show(null);
    clearLines();
    if (input) input.value = '';
    if (note) note.textContent = SEAL_COPY.removed;
    say(SEAL_COPY.removed);
    changed();
    input?.focus();
  });
  // A file picked before this module ran; then a picture handed over by /stamp-maker/ (read once, removed).
  const picked = input?.files?.[0];
  if (picked) void use(picked);
  else {
    const handed = takeSignPng();
    if (handed === 'invalid') fail(SEAL_COPY.unreadable);
    else if (handed) void use(handed.blob, SIGN_SOURCES[handed.from]);
  }

  return {
    current: () => (seal ? { bytes: seal.bytes.slice().buffer, w: seal.w, h: seal.h } : undefined),
    reset: () => {
      token++;
      show(null);
      clearLines();
      if (input) input.value = '';
    },
  };
}
