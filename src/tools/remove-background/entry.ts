// /remove-background/ page script (Sprint C, C2). The controller (bg.ts, and through it the asset loader and the
// workers) is imported on the first interaction with the tool, never on page load (LCP; the /stamp-signature/
// pattern). A photo picked or dropped while it loads is handed to it. A module that cannot load shows the shared
// engine panel. The only thing done at load: the crash check of the previous attempt in this tab (guard.ts).
import { takeCrash } from '../../lib/bgremove/guard';
import { sessionStore } from '../../lib/face/guard';
import { showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { COPY } from './copy';

type Api = { open(file: File): void } | null;

const root = document.getElementById('bg-tool');
const drop = document.getElementById('bg-drop');
const crash = document.getElementById('bg-crash');
if (crash && takeCrash(sessionStore())) {
  crash.textContent = COPY.crashBefore;
  crash.hidden = false;
}
if (root && drop) {
  let loading: Promise<Api> | null = null;
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
  const load = (pending?: File): Promise<Api> =>
    (loading ??= withEngineRetry(() => import('./bg')).then(
      (m) => {
        for (const ev of EVENTS) root.removeEventListener(ev, start);
        drop.removeEventListener('dragover', onDragOver);
        drop.removeEventListener('drop', onDrop);
        return m.initBgTool(pending);
      },
      () => {
        loading = null;
        void showEngineError();
        return null;
      },
    ));
  for (const ev of EVENTS) root.addEventListener(ev, start, { passive: true });
  drop.addEventListener('dragover', onDragOver);
  drop.addEventListener('drop', onDrop);
}
