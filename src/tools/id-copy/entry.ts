// /id-copy/ page script (TOOLS1015 I1, the /image-to-jpg/ pattern): starts the usage statistics and loads the controller on
// the first interaction with the tool, never with the page. A photo dropped while it loads is handed to it; a photo
// picked while it loads is still in the file input, which the controller reads when it starts. A controller that cannot
// load shows the shared engine panel.
import { showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { sweepIfDue } from '../../lib/ui/handoff-marker';
import { startUsage, track, trackOut } from '../../lib/ui/usage';

type Api = { open(file: File): void } | null;

startUsage('id-copy');
// AFF1029 A10: presses of the result's affiliate group (link kind only).
trackOut(document.getElementById('ic-result'), 'id-copy');
const root = document.getElementById('ic-tool');
if (root) {
  let loading: Promise<Api> | null = null;
  const EVENTS = ['pointerdown', 'keydown', 'focusin', 'touchstart', 'change'] as const;
  const start = (): void => void load();
  const onDragOver = (e: DragEvent): void => {
    e.preventDefault();
    start();
  };
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    if (loading) void loading.then((api) => api?.open(file));
    else void load(file);
  };
  const load = (pending?: File): Promise<Api> =>
    (loading ??= withEngineRetry(() => import('./controller')).then(
      (m) => {
        // From now on the controller's own listeners handle everything.
        for (const ev of EVENTS) root.removeEventListener(ev, start);
        root.removeEventListener('dragover', onDragOver);
        root.removeEventListener('drop', onDrop);
        return m.initIdCopy(pending);
      },
      () => {
        loading = null;
        track({ e: 'fail', t: 'id-copy', c: 'engine', p: 'load' });
        void showEngineError();
        return null;
      },
    ));
  for (const ev of EVENTS) root.addEventListener(ev, start, { passive: true });
  root.addEventListener('dragover', onDragOver);
  root.addEventListener('drop', onDrop);
  // This page sends files (이어서 하기): a file stored earlier and never taken is deleted once older than 10 minutes.
  sweepIfDue();
}
