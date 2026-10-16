// /english-address/ page script (ADDREN1016): starts the usage statistics and loads the controller lazily — at once on
// a focus, key or press in the tool, otherwise after the first user signal anywhere plus idle (Polish P.7,
// src/lib/ui/preload.ts; never with the page, so Lighthouse measures the static page). A 찾기 pressed before the
// controller is ready is kept and run when it starts. A controller that cannot load shows the generic message.
import { withEngineRetry } from '../../lib/ui/engine-load';
import { isRestingMove, preloadSkipped, SIGNALS } from '../../lib/ui/preload';
import { startUsage, track } from '../../lib/ui/usage';
import { MESSAGES } from './messages';

startUsage('english-address');

const root = document.getElementById('ea-tool');
const form = document.getElementById('ea-form');
if (root && form) {
  let loading: Promise<void> | null = null;
  let pendingSubmit = false;
  const NOW = ['pointerdown', 'keydown', 'focusin', 'touchstart'] as const;
  const onSubmit = (ev: Event): void => {
    ev.preventDefault();
    pendingSubmit = true;
    void load();
  };
  const load = (): Promise<void> =>
    (loading ??= withEngineRetry(() => import('./controller')).then(
      (m) => {
        for (const ev of NOW) root.removeEventListener(ev, load);
        form.removeEventListener('submit', onSubmit);
        m.initEnglishAddress({ submitNow: pendingSubmit });
      },
      () => {
        loading = null;
        track({ e: 'fail', t: 'english-address', c: 'engine', p: 'load' });
        const msg = document.getElementById('ea-msg');
        if (msg) {
          msg.textContent = MESSAGES.other;
          msg.dataset.kind = 'error';
        }
      },
    ));
  form.addEventListener('submit', onSubmit);
  for (const ev of NOW) root.addEventListener(ev, load, { passive: true });
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const onSignal = (ev?: Event): void => {
    if (isRestingMove(ev)) return;
    for (const s of SIGNALS) window.removeEventListener(s, onSignal, true);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => void load(), { timeout: 3000 });
    else window.setTimeout(() => void load(), 1000);
  };
  if (!preloadSkipped(connection)) for (const s of SIGNALS) window.addEventListener(s, onSignal, { capture: true, passive: true });
}
