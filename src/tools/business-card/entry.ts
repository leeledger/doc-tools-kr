// /business-card/ page script (CARD1026 C11, C14): starts the usage statistics and loads the controller (uqr, vCard,
// renderers, card layout) at once on a focus, key, press or input in the tool, otherwise after the first user signal on
// the page plus idle — never with the page (repo entry → controller pattern; check-dist keeps the controller out of the
// initial JS). What was typed before it loads is still in the fields; the controller reads them when it starts. A 받기
// press that came first is replayed (a download needs no user gesture). 보내기 is never replayed: it is hidden in the
// page and only the controller shows it, so it cannot be pressed before the controller listens (sharing needs the
// press itself). A controller that cannot load shows the shared engine panel.
import { showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { isRestingMove, preloadSkipped, SIGNALS } from '../../lib/ui/preload';
import { startUsage, track } from '../../lib/ui/usage';

startUsage('business-card');

const root = document.getElementById('bc-tool');
if (root) {
  let loading: Promise<void> | null = null;
  let pending: HTMLButtonElement | null = null;
  const onEarlyClick = (ev: Event): void => {
    pending = (ev.target as Element | null)?.closest<HTMLButtonElement>('#bc-card-png, #bc-qr-png, #bc-qr-svg, #bc-vcf') ?? pending;
  };
  root.addEventListener('click', onEarlyClick);
  const NOW = ['pointerdown', 'keydown', 'focusin', 'touchstart', 'input'] as const;
  const load = (): Promise<void> =>
    (loading ??= withEngineRetry(() => import('./controller')).then(
      (m) => {
        for (const ev of NOW) root.removeEventListener(ev, load);
        root.removeEventListener('click', onEarlyClick);
        m.initBusinessCard();
        pending?.click();
        pending = null;
      },
      () => {
        loading = null;
        track({ e: 'fail', t: 'business-card', c: 'engine', p: 'load' });
        void showEngineError();
      },
    ));
  for (const ev of NOW) root.addEventListener(ev, load, { passive: true });
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const onSignal = (ev?: Event): void => {
    if (isRestingMove(ev)) return;
    for (const s of SIGNALS) window.removeEventListener(s, onSignal, true);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => void load(), { timeout: 3000 });
    else window.setTimeout(() => void load(), 1000);
  };
  // Save-Data / 2G: only a focus, key or press in the tool loads it.
  if (!preloadSkipped(connection)) for (const s of SIGNALS) window.addEventListener(s, onSignal, { capture: true, passive: true });
}
