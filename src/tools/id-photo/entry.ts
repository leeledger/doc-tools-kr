// /id-photo/ page script (Step 4). The tool controller (framing, overlay, checklist, save) is imported on the
// first interaction with the tool, not on page load: its ~20 KB gzip otherwise competes with the fonts on the
// critical path (measured: Lighthouse LCP 1.96–2.04 s with it, 1.80 s without). The preset select, the
// custom fields and the file input are native controls, so nothing is lost meanwhile: the controller reads
// their state when it starts, and a photo picked or dropped before it arrives is handed to it. A controller
// that cannot load (offline, a new deploy) shows the shared engine panel.
import { showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';

type Api = { open(file: File): void } | null;

const root = document.getElementById('idp-tool');
const drop = document.getElementById('idp-drop');
if (root && drop) {
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
}
