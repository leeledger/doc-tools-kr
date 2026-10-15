// /stamp-maker/ page script (STAMP1015 Flow): the controller (tiles, fine-tune panel, font loading) is imported after the
// page has loaded and the browser is idle, or at once on the first focus, key or pointer in the tool, never with the page.
// What was typed meanwhile is still in the input, which the controller reads when it starts. A controller that cannot
// load shows the shared engine panel.
import { showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { startUsage, track } from '../../lib/ui/usage';

startUsage('stamp-maker');

const root = document.getElementById('sm-tool');
if (root) {
  let loading: Promise<void> | null = null;
  const EVENTS = ['pointerdown', 'keydown', 'focusin', 'touchstart'] as const;
  const load = (): Promise<void> =>
    (loading ??= withEngineRetry(() => import('./controller')).then(
      (m) => {
        for (const ev of EVENTS) root.removeEventListener(ev, load);
        m.initStampMaker();
      },
      () => {
        loading = null;
        track({ e: 'fail', t: 'stamp-maker', c: 'engine', p: 'load' });
        void showEngineError();
      },
    ));
  for (const ev of EVENTS) root.addEventListener(ev, load, { passive: true });
  const idle = (): void => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => void load(), { timeout: 3000 });
    else window.setTimeout(() => void load(), 1000);
  };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}
