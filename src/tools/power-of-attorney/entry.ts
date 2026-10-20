// /power-of-attorney/ page script (FORM1020; the /stamp-maker/ pattern, site rule Polish P.7): fills today's date, starts
// the usage statistics and loads the controller (worker, preview, downloads) at once on a focus, key or press in the tool,
// otherwise after the first user signal anywhere on the page plus idle — never with the page, so the static page is what
// Lighthouse measures. A submit or 「빈 양식으로 받기」 before the controller runs is never lost: the form never submits
// (no action, prevented here), and the pressed action runs once the controller starts. A controller that cannot load
// shows the shared engine panel. Usage: nothing here but the page view (the controller reports start/download/next).
import { showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { isRestingMove, preloadSkipped, SIGNALS } from '../../lib/ui/preload';
import { startUsage, track } from '../../lib/ui/usage';
import type { BuildKind } from './controller';

startUsage('power-of-attorney');

const pad = (n: number): string => String(n).padStart(2, '0');
/** Today on this device, YYYY-MM-DD (the date input's value format). */
export const todayIso = (d: Date = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const root = document.getElementById('pa-tool');
const form = document.getElementById('pa-form') as HTMLFormElement | null;
const date = document.getElementById('pa-date') as HTMLInputElement | null;
if (date && !date.value) date.value = todayIso();

if (root && form) {
  let loading: Promise<void> | null = null;
  let started = false;
  let pending: BuildKind | undefined;
  const NOW = ['pointerdown', 'keydown', 'focusin', 'touchstart'] as const;
  const load = (): Promise<void> =>
    (loading ??= withEngineRetry(() => import('./controller')).then(
      (m) => {
        for (const ev of NOW) root.removeEventListener(ev, onNow);
        started = true;
        m.initPowerOfAttorney({ action: pending, today: todayIso });
      },
      () => {
        loading = null;
        track({ e: 'fail', t: 'power-of-attorney', c: 'engine', p: 'load' });
        void showEngineError();
      },
    ));
  const onNow = (): void => void load();
  for (const ev of NOW) root.addEventListener(ev, onNow, { passive: true });
  // Before the controller: never submit; remember the action. After: the controller's own handlers act.
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (started) return;
    pending = 'filled';
    void load();
  });
  document.getElementById('pa-blank')?.addEventListener('click', () => {
    if (started) return;
    pending = 'blank';
    void load();
  });
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const onSignal = (ev?: Event): void => {
    if (isRestingMove(ev)) return;
    for (const s of SIGNALS) window.removeEventListener(s, onSignal, true);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => void load(), { timeout: 3000 });
    else window.setTimeout(() => void load(), 1000);
  };
  // Save-Data / 2G: only a focus or press in the tool loads it.
  if (!preloadSkipped(connection)) for (const s of SIGNALS) window.addEventListener(s, onSignal, { capture: true, passive: true });
}
