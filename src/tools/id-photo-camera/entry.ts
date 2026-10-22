// /id-photo-camera/ page script (IDCAM1022 Step B). The camera controller loads on the first press in the tool (and
// starts the camera only on 「카메라 켜기」, never on load: no prompt before the tap). The preset select works before it
// loads; ?preset=<id> picks the 제출처 and the address follows the select. The native camera input (shown when the
// camera cannot start) hands its photo to /id-photo/ without the controller. A controller that cannot load says so and
// shows that input.
import { getPreset } from '../../data/id-photo-presets';
import { announce } from '../../lib/ui/announce';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { sweepIfDue } from '../../lib/ui/handoff-marker';
import { readUrl, writeUrl } from '../../lib/ui/quicklinks';
import { startUsage, track } from '../../lib/ui/usage';
import { renderSource } from '../id-photo/source';
import { COPY } from './copy';
import { SLUG, sendToIdPhoto } from './send';

startUsage(SLUG);

const root = document.getElementById('cam-tool');
const select = document.getElementById('cam-preset') as HTMLSelectElement | null;
const source = document.getElementById('cam-source');
const passport = document.getElementById('cam-passport');
const onBtn = document.getElementById('cam-on') as HTMLButtonElement | null;
const fallback = document.getElementById('cam-fallback');
const fileInput = document.getElementById('cam-file') as HTMLInputElement | null;
if (root && select && source && passport && onBtn && fallback && fileInput) {
  // This page sends files (이어서 하기): a file stored earlier and never taken is deleted once older than 10 minutes.
  sweepIfDue();

  const showPreset = (): void => {
    const p = getPreset(select.value);
    if (p) renderSource(source, p);
    passport.hidden = select.value !== 'passport_online';
  };
  const deep = readUrl('id-photo');
  if (deep?.preset && getPreset(deep.preset) && select.value !== deep.preset) {
    select.value = deep.preset;
    showPreset();
  }
  select.addEventListener('change', () => {
    writeUrl('id-photo', { preset: select.value });
    showPreset();
  });

  const fail = (msg: string): void => {
    fallback.hidden = false;
    announce('alert', msg, root);
  };

  type Ctl = { start(): void } | null;
  let loading: Promise<Ctl> | null = null;
  const load = (): Promise<Ctl> =>
    (loading ??= withEngineRetry(() => import('./controller')).then(
      (m) => m.initCamera(),
      () => {
        loading = null;
        track({ e: 'fail', t: SLUG, c: 'engine', p: 'load' });
        fail(COPY.engine);
        return null;
      },
    ));
  const preload = (): void => void load();
  for (const ev of ['pointerdown', 'focusin', 'touchstart'] as const) root.addEventListener(ev, preload, { passive: true, once: true });
  onBtn.addEventListener('click', () => void load().then((c) => c?.start()));

  // D7: the phone's own camera app (or the photo picker); the photo is not pre-cropped, /id-photo/ frames it.
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    track({ e: 'pick', t: SLUG });
    void sendToIdPhoto(f, f.name || 'photo.jpg', f.type || 'image/jpeg', select.value).then((ok) => {
      if (!ok) fail(COPY.fallbackFailed);
    });
  });
}
