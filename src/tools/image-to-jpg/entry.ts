// /image-to-jpg/ page script (TOOLS5 U1): starts the usage statistics and loads the controller on the first interaction
// with the tool (the /jpg-to-pdf/ pattern), never with the page. Photos dropped while it loads are handed to it;
// photos picked while it loads are still in the file input, which the controller reads when it starts. A controller
// that cannot load shows the shared engine panel.
import { showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { startUsage, track } from '../../lib/ui/usage';

type Api = { add(files: File[]): void } | null;

startUsage('image-to-jpg');

const root = document.getElementById('ij-tool');
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
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    if (loading) void loading.then((api) => api?.add(files));
    else void load(files);
  };
  const load = (pending?: File[]): Promise<Api> =>
    (loading ??= withEngineRetry(() => import('./controller')).then(
      (m) => {
        // From now on the controller's own listeners handle everything.
        for (const ev of EVENTS) root.removeEventListener(ev, start);
        root.removeEventListener('dragover', onDragOver);
        root.removeEventListener('drop', onDrop);
        return m.initImageToJpg(pending);
      },
      () => {
        loading = null;
        track({ e: 'fail', t: 'image-to-jpg', c: 'engine', p: 'load' });
        void showEngineError();
        return null;
      },
    ));
  for (const ev of EVENTS) root.addEventListener(ev, start, { passive: true });
  root.addEventListener('dragover', onDragOver);
  root.addEventListener('drop', onDrop);
}
