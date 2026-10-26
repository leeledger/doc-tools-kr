// /business-card/ controller (CARD1026 C11): the contact fields (src/lib/qr/contact.ts checks) → the vCard (vcard.ts) →
// three outputs, refreshed 250 ms after typing stops: the 연락처 QR (unfolded vCard → encodeQr → inline SVG preview,
// 연락처-QR.png / 연락처-QR.svg), the 명함 그림 on a canvas (layout.ts + draw.ts, 명함.png) and 연락처.vcf (folded,
// text/vcard, UTF-8 without BOM). The card picture is turned into a file right after each redraw, before any press, so
// 보내기 calls navigator.share inside the press itself; 보내기 shows only once that file passes navigator.canShare.
// Errors as on /qr-code/: a wrong format shows while typing, a missing name only on a 받기 press, which also focuses the
// first field in error. Usage: start once per page view at the first card shown, download per file; never a value.
import { checkContact, contactEmpty, CONTACT_ERROR_TEXT, CONTACT_KEYS } from '../../lib/qr/contact';
import { encodeQr, type QrModules } from '../../lib/qr/encode';
import { qrPng, qrSvg } from '../../lib/qr/render';
import { vcard, type ContactFields } from '../../lib/qr/vcard';
import { track } from '../../lib/ui/usage';
import { drawCard, type CardColor } from './draw';
import type { CardLayout } from './layout';

const T = {
  needName: '이름이나 회사를 쓰면 명함이 나와요.',
  needNameQr: '이름이나 회사를 쓰면 QR이 나와요.',
  tooLong: '글자가 너무 많아 QR에 다 들어가지 않아요. 조금 줄여 주세요.',
  savedCard: '명함 그림을 받았어요.',
  savedQr: 'QR 그림을 받았어요.',
  savedVcf: '연락처 파일을 받았어요.',
  shared: '명함 그림 보내기를 했어요.',
  shareFailed: '이 기기에서는 바로 보내기가 안 돼요. 그림을 받아서 보내 주세요.',
  saveFailed: '그림을 만들지 못했어요. 한 번 더 눌러 주세요.',
};

const DEBOUNCE_MS = 250;
const CARD_NAME = '명함.png';

function must<E extends HTMLElement>(id: string): E {
  const el = document.getElementById(id);
  if (!el) throw new Error(`business-card: #${id} is missing`);
  return el as E;
}

let lastUrl: string | null = null;
function saveBlob(blob: Blob, name: string): void {
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = lastUrl;
  a.download = name;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
}

/** True when this device can share `file` (Web Share with files); a throwing canShare counts as no. */
function canShareFile(file: File): boolean {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** The canvas as a PNG file, synchronously (toDataURL), for a 보내기 press that came before the latest file was ready. */
function fileNow(canvas: HTMLCanvasElement): File {
  const url = canvas.toDataURL('image/png');
  const bin = atob(url.slice(url.indexOf(',') + 1));
  return new File([Uint8Array.from(bin, (c) => c.charCodeAt(0))], CARD_NAME, { type: 'image/png' });
}

export function initBusinessCard(): void {
  const root = must<HTMLDivElement>('bc-tool');
  if (root.dataset.ready) return;
  root.dataset.ready = '1';
  const fields = new Map(CONTACT_KEYS.map((k) => [k, must<HTMLInputElement | HTMLTextAreaElement>(`bc-c-${k}`)]));
  const over = must<HTMLParagraphElement>('bc-over');
  const status = must<HTMLParagraphElement>('bc-status');
  const cardBox = must<HTMLDivElement>('bc-card-box');
  const cardEmpty = must<HTMLParagraphElement>('bc-card-empty');
  const canvas = must<HTMLCanvasElement>('bc-card');
  const qrBox = must<HTMLDivElement>('bc-qr');
  const qrEmpty = must<HTMLParagraphElement>('bc-qr-empty');
  const shareBtn = must<HTMLButtonElement>('bc-share');
  const shareError = must<HTMLParagraphElement>('bc-share-error');
  const defaults = { card: cardEmpty.textContent ?? '', qr: qrEmpty.textContent ?? '' };

  const values = (): ContactFields => Object.fromEntries(CONTACT_KEYS.map((k) => [k, fields.get(k)!.value])) as unknown as ContactFields;
  const layout = (): CardLayout => (root.querySelector<HTMLInputElement>('input[name="bc-layout"]:checked')?.value ?? 'wide') as CardLayout;
  const color = (): CardColor => (root.querySelector<HTMLInputElement>('input[name="bc-color"]:checked')?.value ?? 'navy') as CardColor;

  function showErrors(problems: [keyof ContactFields, keyof typeof CONTACT_ERROR_TEXT][]): void {
    for (const el of fields.values()) {
      el.removeAttribute('aria-invalid');
      must<HTMLParagraphElement>(`${el.id}-error`).textContent = '';
    }
    for (const [key, code] of problems) {
      const el = fields.get(key)!;
      el.setAttribute('aria-invalid', 'true');
      must<HTMLParagraphElement>(`${el.id}-error`).textContent = CONTACT_ERROR_TEXT[code];
    }
  }

  // The state of the shown outputs: null while the fields are invalid.
  let current: { f: ContactFields; modules: QrModules; svg: string } | null = null;
  // The card picture as a file, made after each redraw; `gen` tells whether it is the latest picture.
  let gen = 0;
  let file: { gen: number; file: File } | null = null;
  let started = false;

  function clear(hint: boolean): void {
    current = null;
    gen++;
    file = null;
    cardEmpty.textContent = hint ? T.needName : defaults.card;
    qrEmpty.textContent = hint ? T.needNameQr : defaults.qr;
    canvas.hidden = true;
    cardEmpty.hidden = false;
    cardBox.classList.add('is-empty');
    qrBox.replaceChildren(qrEmpty);
    qrBox.classList.add('is-empty');
    shareBtn.hidden = true;
  }

  /** Redraws the card for the current layout and colour, then makes its file (async) for 보내기. */
  function redrawCard(): void {
    if (!current) return;
    cardBox.dataset.layout = layout();
    drawCard(canvas, current.f, current.modules, layout(), color());
    canvas.hidden = false;
    cardEmpty.hidden = true;
    cardBox.classList.remove('is-empty');
    const mine = ++gen;
    canvas.toBlob((blob) => {
      if (!blob || mine !== gen) return;
      file = { gen: mine, file: new File([blob], CARD_NAME, { type: 'image/png' }) };
      // Shown by the controller only (never replayed after a late load): the file is ready before any press.
      if (current) shareBtn.hidden = !canShareFile(file.file);
    }, 'image/png');
  }

  /** Recomputes every output; `strict` also reports a missing name or company. True when the outputs are shown. */
  function update(strict: boolean): boolean {
    const f = values();
    over.textContent = '';
    const problems = Object.entries(checkContact(f)) as [keyof ContactFields, keyof typeof CONTACT_ERROR_TEXT][];
    showErrors(problems.filter(([, code]) => strict || code !== 'need'));
    if (problems.length) {
      // The neutral hint while something is written but 성, 이름 and 회사 are all blank (as /qr-code/ 연락처).
      clear(!contactEmpty(f) && problems.every(([, code]) => code === 'need'));
      return false;
    }
    const enc = encodeQr(vcard(f, { fold: false }));
    if (!enc.ok) {
      clear(false);
      over.textContent = T.tooLong;
      return false;
    }
    current = { f, modules: enc.modules, svg: qrSvg(enc.modules) };
    // The SVG is built from the module matrix only (no typed text inside it).
    qrBox.innerHTML = current.svg;
    qrBox.classList.remove('is-empty');
    redrawCard();
    if (!started) {
      started = true;
      track({ e: 'start', t: 'business-card' });
    }
    return true;
  }

  let timer: number | undefined;
  let dirty = false;
  root.addEventListener('input', (ev) => {
    if ((ev.target as HTMLInputElement | null)?.type === 'radio') return;
    dirty = true;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      dirty = false;
      update(false);
    }, DEBOUNCE_MS);
  });
  root.addEventListener('change', (ev) => {
    if ((ev.target as HTMLInputElement | null)?.type !== 'radio') return;
    shareError.textContent = '';
    redrawCard();
  });

  /** Before a 받기 or 보내기 press: the latest text, every problem shown; false (and the first field in error focused) if nothing to give. */
  function ready(): boolean {
    status.textContent = '';
    shareError.textContent = '';
    if (dirty || !current) {
      window.clearTimeout(timer);
      dirty = false;
      if (!update(true)) {
        const bad = CONTACT_KEYS.map((k) => fields.get(k)!).find((el) => el.getAttribute('aria-invalid') === 'true');
        bad?.focus();
        return false;
      }
    }
    return true;
  }

  const done = (message: string): void => {
    status.textContent = message;
    track({ e: 'download', t: 'business-card' });
  };

  must<HTMLButtonElement>('bc-card-png').addEventListener('click', () => {
    if (!ready()) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        shareError.textContent = T.saveFailed;
        return;
      }
      saveBlob(blob, CARD_NAME);
      done(T.savedCard);
    }, 'image/png');
  });
  shareBtn.addEventListener('click', () => {
    if (!ready()) return;
    // navigator.share runs in this press: the file was made after the last redraw, or now, synchronously.
    const f = file && file.gen === gen ? file.file : fileNow(canvas);
    navigator.share({ files: [f] }).then(
      () => done(T.shared),
      (err: unknown) => {
        if ((err as { name?: string } | null)?.name === 'AbortError') return;
        shareError.textContent = T.shareFailed;
      },
    );
  });
  must<HTMLButtonElement>('bc-qr-png').addEventListener('click', () => {
    if (!ready() || !current) return;
    qrPng(current.modules).then(
      (blob) => {
        saveBlob(blob, '연락처-QR.png');
        done(T.savedQr);
      },
      () => {
        over.textContent = T.saveFailed;
      },
    );
  });
  must<HTMLButtonElement>('bc-qr-svg').addEventListener('click', () => {
    if (!ready() || !current) return;
    saveBlob(new Blob([current.svg], { type: 'image/svg+xml' }), '연락처-QR.svg');
    done(T.savedQr);
  });
  must<HTMLButtonElement>('bc-vcf').addEventListener('click', () => {
    if (!ready() || !current) return;
    // A JS string Blob is UTF-8 without a BOM; the vCard text already ends every line with CRLF.
    saveBlob(new Blob([vcard(current.f, { fold: true })], { type: 'text/vcard' }), '연락처.vcf');
    done(T.savedVcf);
  });

  update(false);
}
