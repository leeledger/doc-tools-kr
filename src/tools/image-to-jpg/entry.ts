// /image-to-jpg/ page script (TOOLS5 U1): starts the usage statistics and loads the controller on the first interaction
// with the tool (the /jpg-to-pdf/ pattern), never with the page. Photos dropped while it loads are handed to it;
// photos picked while it loads are still in the file input, which the controller reads when it starts. A controller
// that cannot load shows the shared engine panel. EN0: the page passes the engine copy and the loader of its language's
// controller chunk (src/tools/image-to-jpg/ko/controller.ts on the Korean page).
import { showEngineErrorIn } from '../../lib/ui/engine-error';
import { withEngineRetry, type EngineMessages } from '../../lib/ui/engine-load';
import { sweepIfDue } from '../../lib/ui/handoff-marker';
import { startUsage, track } from '../../lib/ui/usage';

type Api = { add(files: File[]): void } | null;
/** A language's controller chunk: initImageToJpg bound to its catalog. */
export type ControllerChunk = { init(pending?: File[]): Api };

export function startImageToJpg(engine: EngineMessages, loadController: () => Promise<ControllerChunk>): void {
  startUsage('image-to-jpg');
  const found = document.getElementById('ij-tool');
  if (!found) return;
  const root: HTMLElement = found;
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
    (loading ??= withEngineRetry(loadController).then(
      (m) => {
        // From now on the controller's own listeners handle everything.
        for (const ev of EVENTS) root.removeEventListener(ev, start);
        root.removeEventListener('dragover', onDragOver);
        root.removeEventListener('drop', onDrop);
        return m.init(pending);
      },
      () => {
        loading = null;
        track({ e: 'fail', t: 'image-to-jpg', c: 'engine', p: 'load' });
        void showEngineErrorIn(engine);
        return null;
      },
    ));
  for (const ev of EVENTS) root.addEventListener(ev, start, { passive: true });
  root.addEventListener('dragover', onDragOver);
  root.addEventListener('drop', onDrop);
  // This page sends files (이어서 하기): a file stored earlier and never taken is deleted once older than 10 minutes.
  sweepIfDue();
}
