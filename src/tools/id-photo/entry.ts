// /id-photo/ page script (Step 4). The tool controller (framing, overlay, checklist, save) is imported on the
// first interaction with the tool, not on page load: its ~20 KB gzip otherwise competes with the fonts on the
// critical path (measured: Lighthouse LCP 1.96–2.04 s with it, 1.80 s without). The preset select, the
// custom fields and the file input are native controls, so nothing is lost meanwhile: the controller reads
// their state when it starts, and a photo picked or dropped before it arrives is handed to it. A controller
// that cannot load (offline, a new deploy) shows the shared engine panel.
import { showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { pendingHandoff, sweepIfDue } from '../../lib/ui/handoff-marker';
import { serialize } from '../../lib/ui/deeplink';
import { bindQuickLinks, readUrl, writeUrl } from '../../lib/ui/quicklinks';
import { startUsage, track } from '../../lib/ui/usage';
import { getPreset } from '../../data/id-photo-presets';
import { renderSource } from './source';

type Api = { open(file: File, opts?: { from?: string | null }): void } | null;

const root = document.getElementById('idp-tool');
const drop = document.getElementById('idp-drop');
if (root && drop) {
  startUsage('id-photo');
  let loading: Promise<Api> | null = null;
  const load = (pending?: File): Promise<Api> =>
    (loading ??= withEngineRetry(() => import('./controller').then((c) => ({ initIdPhotoTool: c.initIdPhotoTool }))).then(
      (m) => {
        // From now on the controller's own listeners handle everything.
        for (const ev of EVENTS) root.removeEventListener(ev, start);
        drop.removeEventListener('dragover', onDragOver);
        drop.removeEventListener('drop', onDrop);
        return m.initIdPhotoTool(pending);
      },
      () => {
        loading = null;
        track({ e: 'fail', t: 'id-photo', c: 'engine', p: 'load' });
        void showEngineError();
        return null;
      },
    ));
  const EVENTS = ['pointerdown', 'keydown', 'focusin', 'touchstart', 'change'] as const;
  const start = (): void => void load();
  const onDragOver = (e: DragEvent): void => {
    e.preventDefault();
    start();
  };
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    if (loading) void loading.then((api) => api?.open(f));
    else void load(f);
  };
  for (const ev of EVENTS) root.addEventListener(ev, start, { passive: true });
  drop.addEventListener('dragover', onDragOver);
  drop.addEventListener('drop', onDrop);
  // A photo handed over by another tool (이어서 하기; IDCAM1022 D2: 증명사진 촬영) is taken below, after the preset; this
  // page sends files too, so otherwise a file stored earlier and never taken is deleted once older than 10 minutes.
  const notice = document.getElementById('idp-notice');
  const receiving = !!notice && pendingHandoff('id-photo');
  if (!receiving) sweepIfDue();

  // Deep links (Growth G.5, G.6): ?preset=<id> picks that 제출처 before the controller loads (the controller reads
  // the select when it starts), and the address follows the select from then on.
  const select = document.getElementById('idp-preset') as HTMLSelectElement | null;
  const source = document.getElementById('idp-source');
  if (select && source) {
    const deep = readUrl('id-photo');
    const preset = deep?.preset ? getPreset(deep.preset) : undefined;
    if (preset && select.value !== preset.id) {
      select.value = preset.id;
      renderSource(source, preset);
    }
    // IDCAM1022 D1: 「카메라로 찍기」 opens the camera page with the same preset.
    const camera = document.getElementById('idp-camera') as HTMLAnchorElement | null;
    const cameraHref = (): void => {
      if (camera) camera.href = `/id-photo-camera/${serialize('id-photo', select.value === 'custom' ? null : { preset: select.value })}`;
    };
    cameraHref();
    select.addEventListener('change', () => {
      writeUrl('id-photo', select.value === 'custom' ? null : { preset: select.value });
      cameraHref();
    });
    bindQuickLinks(
      'id-photo',
      (s) => {
        if (!s.preset || select.disabled) return false;
        select.value = s.preset;
        // The controller (loaded now if it was not yet) and the address both follow the change event.
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      },
      root,
    );
  }

  if (receiving && notice) {
    // Start at once and open the photo as if picked, telling the controller where it came from (D8c).
    const ready = load();
    void import('../../lib/ui/handoff')
      .then(({ receiveHandoff }) =>
        receiveHandoff('id-photo', root, async (f, from) => {
          const api = await ready;
          if (!api) return false;
          api.open(f, { from });
          return true;
        }, { notice }),
      )
      .catch(() => void showEngineError());
  }
}
