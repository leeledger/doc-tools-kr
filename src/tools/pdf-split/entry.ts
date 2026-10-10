// /pdf-split/ page script (TOOLS5 U2, as /pdf-to-jpg/): starts the usage statistics and loads the controller on the first
// interaction with the tool, never with the page. A file dropped while it loads is handed to it; a file picked while it
// loads is still in the file input, which the controller reads when it starts. A controller that cannot load shows the
// shared engine panel.
import { showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { pendingHandoff, sweepDue } from '../../lib/ui/handoff-marker';
import { startUsage, track } from '../../lib/ui/usage';

type Api = { open(files: File[]): Promise<void> } | null;

startUsage('pdf-split');

const root = document.getElementById('ps-tool');
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
    if (loading) void loading.then((api) => api?.open(files));
    else void load(files);
  };
  const load = (pending?: File[]): Promise<Api> =>
    (loading ??= withEngineRetry(() => import('./controller')).then(
      (m) => {
        // From now on the controller's own listeners handle everything.
        for (const ev of EVENTS) root.removeEventListener(ev, start);
        root.removeEventListener('dragover', onDragOver);
        root.removeEventListener('drop', onDrop);
        return m.initPdfSplit(pending);
      },
      () => {
        loading = null;
        track({ e: 'fail', t: 'pdf-split', c: 'engine', p: 'load' });
        void showEngineError();
        return null;
      },
    ));
  for (const ev of EVENTS) root.addEventListener(ev, start, { passive: true });
  root.addEventListener('dragover', onDragOver);
  root.addEventListener('drop', onDrop);
  const notice = document.getElementById('ps-notice');
  if (notice && pendingHandoff('pdf-split')) {
    // A result handed over by another tool (이어서 하기): start at once and open it as if picked.
    const ready = load();
    void import('../../lib/ui/handoff')
      .then(({ receiveHandoff }) =>
        receiveHandoff('pdf-split', root, async (f) => {
          const api = await ready;
          if (!api) return false;
          await api.open([f]);
          return true;
        }, { notice }),
      )
      .catch(() => void showEngineError());
  } else if (sweepDue()) {
    // A file stored earlier may never have been taken: delete it once it is older than 10 minutes.
    void import('../../lib/ui/handoff').then(({ sweepLingering }) => sweepLingering()).catch(() => undefined);
  }
}
