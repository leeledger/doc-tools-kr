// /qr-code/ controller (CARD1026 C10): the active panel's fields → payload (src/lib/qr/payload.ts, vcard.ts unfolded) →
// encodeQr → inline SVG preview, debounced 150 ms. Field errors are inline (aria-invalid + the field's own error line):
// a wrong format shows while typing, a missing required field only on a download click, which also focuses the first
// field in error. Downloads: QR코드.png (about 1,200 px) and QR코드.svg, fixed names. Usage: start once per page view
// at the first QR shown, download per file; never a value or the payload. Nothing is stored.
// QR1031: the 「색 바꾸기·로고 넣기」 panel. Its code (colors, contrast check, picture, styled renderers: logo.ts) is a lazy
// chunk loaded when the panel is first opened or used, so the plain path stays as it was and black on white without a
// picture gives the same files as before. A pair phones may not read shows a red line (the preview still shows it) and
// a 받기 press opens the panel and focuses QR 색, no file; until the chunk is here a styled QR is never downloaded. A
// picture switches the QR to level H from version 5 with a plate in the middle; it lives in this page view only.
import { checkContact, contactEmpty, CONTACT_ERROR_TEXT, CONTACT_KEYS } from '../../lib/qr/contact';
import { encodeQr, type QrModules } from '../../lib/qr/encode';
import { smsPayload, telPayload, textPayload, urlPayload, wifiPayload, type Payload, type PayloadError, type WifiSecurity } from '../../lib/qr/payload';
import type { QrLogo } from '../../lib/qr/logo-render';
import { qrPng, qrSvg } from '../../lib/qr/render';
import { vcard, type ContactFields } from '../../lib/qr/vcard';
import { track } from '../../lib/ui/usage';

type Kind = 'url' | 'text' | 'contact' | 'wifi' | 'tel' | 'sms';
type FieldError = [HTMLInputElement | HTMLTextAreaElement, string];
type Built = { ok: true; payload: string } | { ok: false; errors: FieldError[] };

const T = {
  urlEmpty: '인터넷 주소를 써 주세요.',
  textEmpty: 'QR에 담을 글자를 써 주세요.',
  telEmpty: '전화번호를 써 주세요.',
  smsLong: '문자 내용이 너무 길어요.',
  ssidEmpty: '와이파이 이름을 써 주세요.',
  pwEmpty: '비밀번호를 써 주세요. 비밀번호가 없으면 「비밀번호 없음」을 고르세요.',
  tooLong: '글자가 너무 많아 QR에 다 들어가지 않아요. 조금 줄여 주세요.',
  dense: '담은 글자가 많아 QR의 칸이 작아요. 인쇄할 때는 크게 해 주세요.',
  saved: 'QR 그림을 받았어요.',
  needName: '이름이나 회사를 쓰면 QR이 나와요.',
  needSsid: '와이파이 이름을 쓰면 QR이 나와요.',
  needPw: '비밀번호를 쓰면 QR이 나와요.',
  needTo: '받는 전화번호를 쓰면 QR이 나와요.',
  saveFailed: '그림을 만들지 못했어요. 한 번 더 눌러 주세요.',
  /** The panel code could not load (offline): pdf-sign's retry text. */
  styleLoad: '처리 중 문제가 생겼습니다. 새로고침 후 다시 시도해 주세요.',
};

type Styler = typeof import('./logo');

const DEBOUNCE_MS = 150;

function must<E extends HTMLElement>(id: string): E {
  const el = document.getElementById(id);
  if (!el) throw new Error(`qr-code: #${id} is missing`);
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

export function initQrCode(): void {
  const root = must<HTMLDivElement>('qr-tool');
  if (root.dataset.ready) return;
  root.dataset.ready = '1';
  const field = (id: string) => must<HTMLInputElement | HTMLTextAreaElement>(id);
  const url = field('qr-url');
  const text = field('qr-text');
  const ssid = field('qr-ssid');
  const pw = field('qr-pw');
  const pwBox = must<HTMLDivElement>('qr-pw-box');
  const tel = field('qr-tel');
  const smsTo = field('qr-sms-to');
  const smsText = field('qr-sms-text');
  const contact = new Map(CONTACT_KEYS.map((k) => [k, field(`qr-c-${k}`)]));
  const preview = must<HTMLDivElement>('qr-preview');
  const empty = must<HTMLParagraphElement>('qr-empty');
  const emptyDefault = empty.textContent ?? '';
  const over = must<HTMLParagraphElement>('qr-over');
  const dense = must<HTMLParagraphElement>('qr-dense');
  const status = must<HTMLParagraphElement>('qr-status');
  const styleBox = must<HTMLDetailsElement>('qr-style');
  const fgInput = must<HTMLInputElement>('qr-fg');
  const bgInput = must<HTMLInputElement>('qr-bg');
  const colorError = must<HTMLParagraphElement>('qr-color-error');
  const logoInput = must<HTMLInputElement>('qr-logo-input');
  const logoRemove = must<HTMLButtonElement>('qr-logo-remove');
  const logoError = must<HTMLParagraphElement>('qr-logo-error');

  let styler: Styler | null = null;
  let stylerLoad: Promise<Styler> | null = null;
  /** The panel code, loaded once (a failed load is tried again on the next use). */
  const loadStyler = (): Promise<Styler> =>
    (stylerLoad ??= import('./logo').then(
      (m) => (styler = m),
      (err: unknown) => {
        stylerLoad = null;
        throw err;
      },
    ));
  let pic: QrLogo | null = null;
  /** Anything but black on white without a picture (the inputs' defaults are #000000 and #ffffff). */
  const styled = (): boolean => fgInput.value.toLowerCase() !== fgInput.defaultValue || bgInput.value.toLowerCase() !== bgInput.defaultValue || !!pic;
  const colors = () => ({ fg: fgInput.value, bg: bgInput.value });

  const kind = (): Kind => (root.querySelector<HTMLInputElement>('input[name="qr-kind"]:checked')?.value ?? 'url') as Kind;
  const security = (): WifiSecurity => (root.querySelector<HTMLInputElement>('input[name="qr-sec"]:checked')?.value ?? 'WPA') as WifiSecurity;

  /** A payload result → Built; `map` names the field and message of each error (a blank field only when strict). */
  const fromPayload = (r: Payload, strict: boolean, map: Partial<Record<PayloadError, FieldError>>): Built => {
    if (r.ok) return { ok: true, payload: r.payload };
    const e = map[r.error];
    return { ok: false, errors: e && (strict || r.error !== 'empty') ? [e] : [] };
  };

  function build(k: Kind, strict: boolean): Built {
    switch (k) {
      case 'url':
        return fromPayload(urlPayload(url.value), strict, { empty: [url, T.urlEmpty], url: [url, CONTACT_ERROR_TEXT.url] });
      case 'text':
        return fromPayload(textPayload(text.value), strict, { empty: [text, T.textEmpty] });
      case 'tel':
        return fromPayload(telPayload(tel.value), strict, { empty: [tel, T.telEmpty], phone: [tel, CONTACT_ERROR_TEXT.phone] });
      case 'sms':
        return fromPayload(smsPayload(smsTo.value, smsText.value), strict, { empty: [smsTo, T.telEmpty], phone: [smsTo, CONTACT_ERROR_TEXT.phone], message: [smsText, T.smsLong] });
      case 'wifi': {
        const sec = security();
        if (!ssid.value && !pw.value) return { ok: false, errors: strict ? [[ssid, T.ssidEmpty]] : [] };
        // Wi-Fi has no format errors: a missing name or password shows on a download click only.
        const r = wifiPayload({ ssid: ssid.value, password: pw.value, security: sec, hidden: false });
        if (r.ok) return { ok: true, payload: r.payload };
        if (!strict) return { ok: false, errors: [] };
        return { ok: false, errors: r.error === 'ssid' ? [[ssid, T.ssidEmpty]] : [[pw, T.pwEmpty]] };
      }
      case 'contact': {
        const f = Object.fromEntries(CONTACT_KEYS.map((key) => [key, contact.get(key)!.value])) as unknown as ContactFields;
        if (contactEmpty(f)) return { ok: false, errors: strict ? [[contact.get('last')!, CONTACT_ERROR_TEXT.need]] : [] };
        const problems = Object.entries(checkContact(f)) as [keyof ContactFields, keyof typeof CONTACT_ERROR_TEXT][];
        if (!problems.length) return { ok: true, payload: vcard(f, { fold: false }) };
        const shown = problems.filter(([, code]) => strict || code !== 'need');
        return { ok: false, errors: shown.map(([key, code]) => [contact.get(key)!, CONTACT_ERROR_TEXT[code]]) };
      }
    }
  }

  /**
   * The preview hint while the panel has text but a required field is still blank (review B, Should Fix 1): neutral, not
   * an error (the red line and aria-invalid wait for a 받기 press). Null: the default text.
   */
  function missingHint(k: Kind): string | null {
    if (k === 'sms') return smsText.value.trim() && !smsTo.value.trim() ? T.needTo : null;
    if (k === 'wifi') {
      if (pw.value && !ssid.value) return T.needSsid;
      return ssid.value && !pw.value && security() !== 'nopass' ? T.needPw : null;
    }
    if (k === 'contact') {
      const f = Object.fromEntries(CONTACT_KEYS.map((key) => [key, contact.get(key)!.value])) as unknown as ContactFields;
      return !contactEmpty(f) && checkContact(f).last === 'need' ? T.needName : null;
    }
    return null;
  }

  const panelFields = (k: Kind): (HTMLInputElement | HTMLTextAreaElement)[] =>
    Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(`[data-panel="${k}"] input:not([type="radio"]), [data-panel="${k}"] textarea`));

  function showErrors(k: Kind, errors: FieldError[]): void {
    for (const el of panelFields(k)) {
      el.removeAttribute('aria-invalid');
      const slot = document.getElementById(`${el.id}-error`);
      if (slot) slot.textContent = '';
    }
    for (const [el, msg] of errors) {
      el.setAttribute('aria-invalid', 'true');
      const slot = document.getElementById(`${el.id}-error`);
      if (slot) slot.textContent = msg;
    }
  }

  let modules: QrModules | null = null;
  let svg = '';
  let started = false;
  /** False while the colors are blocked or a styled QR waits for the panel code. */
  let colorsOk = true;

  /** The red line under the colors; the panel code is loaded first when a style is set. Its module, or null. */
  function checkStyle(): Styler | null {
    const st = styled() ? styler : null;
    const problem = st ? st.colorProblem(colors()) : '';
    colorsOk = !problem && (!!st || !styled());
    if (styled() && !st) {
      loadStyler().then(
        () => update(false),
        () => {
          colorError.textContent = T.styleLoad;
        },
      );
    } else colorError.textContent = problem;
    if (problem) fgInput.setAttribute('aria-invalid', 'true');
    else fgInput.removeAttribute('aria-invalid');
    return st;
  }

  function clearPreview(hint: string | null = null): void {
    empty.textContent = hint ?? emptyDefault;
    modules = null;
    svg = '';
    preview.replaceChildren(empty);
    preview.classList.add('is-empty');
    dense.hidden = true;
  }

  /** Recomputes the QR of the active panel; `strict` also reports missing required fields. True when a QR is shown. */
  function update(strict: boolean): boolean {
    const k = kind();
    pwBox.hidden = security() === 'nopass';
    const b = build(k, strict);
    showErrors(k, b.ok ? [] : b.errors);
    over.textContent = '';
    if (!b.ok) {
      clearPreview(missingHint(k));
      return false;
    }
    const st = checkStyle();
    const enc = encodeQr(b.payload, st && pic ? st.LOGO_ENCODE : undefined);
    if (!enc.ok) {
      clearPreview();
      if (enc.code === 'tooLong') over.textContent = st && pic ? st.LOGO_OVER : T.tooLong;
      return false;
    }
    modules = enc.modules;
    svg = st ? st.styledSvg(enc.modules, colors(), pic) : qrSvg(enc.modules);
    // The SVG is built from the module matrix, #rrggbb colors and a PNG data URL only (no typed text inside it).
    preview.innerHTML = svg;
    preview.classList.remove('is-empty');
    dense.textContent = T.dense;
    dense.hidden = !enc.dense;
    if (!started) {
      started = true;
      track({ e: 'start', t: 'qr-code' });
    }
    return true;
  }

  let timer: number | undefined;
  const schedule = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => update(false), DEBOUNCE_MS);
  };
  root.addEventListener('input', (ev) => {
    if ((ev.target as HTMLInputElement | null)?.type !== 'radio') schedule();
  });
  root.addEventListener('change', (ev) => {
    if ((ev.target as HTMLInputElement | null)?.type !== 'radio' && ev.target !== fgInput && ev.target !== bgInput) return;
    window.clearTimeout(timer);
    update(false);
  });

  /** Before a download: the latest text, every problem shown; false (and the first field in error focused) if no QR. */
  function ready(): boolean {
    window.clearTimeout(timer);
    status.textContent = '';
    if (update(true)) {
      if (colorsOk) return true;
      styleBox.open = true;
      fgInput.focus();
      return false;
    }
    const k = kind();
    const bad = panelFields(k).find((el) => el.getAttribute('aria-invalid') === 'true') ?? (over.textContent ? panelFields(k)[0] : undefined);
    bad?.focus();
    return false;
  }

  must<HTMLButtonElement>('qr-png').addEventListener('click', () => {
    if (!ready() || !modules) return;
    (styler && styled() ? styler.styledPng(modules, colors(), pic) : qrPng(modules)).then(
      (blob) => {
        saveBlob(blob, 'QR코드.png');
        status.textContent = T.saved;
        track({ e: 'download', t: 'qr-code' });
      },
      () => {
        over.textContent = T.saveFailed;
      },
    );
  });
  must<HTMLButtonElement>('qr-svg').addEventListener('click', () => {
    if (!ready()) return;
    saveBlob(new Blob([svg], { type: 'image/svg+xml' }), 'QR코드.svg');
    status.textContent = T.saved;
    track({ e: 'download', t: 'qr-code' });
  });

  // Opening the panel fetches its code before anything in it is used; a failure shows when it is used.
  styleBox.addEventListener('toggle', () => {
    if (styleBox.open) loadStyler().catch(() => undefined);
  });
  must<HTMLButtonElement>('qr-color-reset').addEventListener('click', () => {
    fgInput.value = fgInput.defaultValue;
    bgInput.value = bgInput.defaultValue;
    window.clearTimeout(timer);
    update(false);
  });

  /** Sets (or clears) the picture and redraws. */
  const setPic = (next: QrLogo | null): void => {
    pic = next;
    logoRemove.hidden = !next;
    window.clearTimeout(timer);
    update(false);
  };
  let picks = 0;
  async function onPick(): Promise<void> {
    const file = logoInput.files?.[0];
    if (!file) return;
    const mine = ++picks;
    logoError.textContent = '';
    try {
      const st = await loadStyler();
      const next = await st.readLogo(file);
      if (mine === picks) setPic(next);
    } catch (err) {
      if (mine !== picks) return;
      logoInput.value = '';
      // A picture problem has its own line; the code not loading (offline) or anything else, the retry line.
      logoError.textContent = styler && err instanceof styler.LogoError ? err.message : T.styleLoad;
      setPic(null);
    }
  }
  logoInput.addEventListener('change', () => void onPick());
  logoRemove.addEventListener('click', () => {
    picks++;
    logoInput.value = '';
    logoError.textContent = '';
    setPic(null);
    logoInput.focus();
  });

  update(false);
  // A picture picked before this code loaded.
  if (logoInput.files?.length) void onPick();
}
