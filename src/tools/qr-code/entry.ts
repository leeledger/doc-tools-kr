// /qr-code/ page script (CARD1026 C10, C14): switches the kind panels (and selects one from ?tab= once on load; the
// URL is never written), starts the usage statistics and loads the controller (uqr, payloads, renderers) at once on a
// focus, key, press or input in the tool, otherwise after the first user signal on the page plus idle — never with
// the page (repo entry → controller pattern; check-dist keeps the controller out of the initial JS). What was typed
// before it loads is still in the fields; the controller reads them when it starts, and a 받기 press that came first
// is replayed. A controller that cannot load shows the shared engine panel.
import { showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { isRestingMove, preloadSkipped, SIGNALS } from '../../lib/ui/preload';
import { startUsage, track } from '../../lib/ui/usage';

startUsage('qr-code');

const KINDS = ['url', 'text', 'contact', 'wifi', 'tel', 'sms'];

const root = document.getElementById('qr-tool');
if (root) {
  const radios = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="qr-kind"]'));
  const show = (): void => {
    const kind = radios.find((r) => r.checked)?.value ?? 'url';
    for (const p of Array.from(root.querySelectorAll<HTMLElement>('[data-panel]'))) p.hidden = p.dataset.panel !== kind;
  };
  const tab = new URLSearchParams(location.search).get('tab');
  if (tab && KINDS.includes(tab)) {
    const r = radios.find((x) => x.value === tab);
    if (r) r.checked = true;
  }
  show();
  root.addEventListener('change', (ev) => {
    if ((ev.target as HTMLInputElement | null)?.name === 'qr-kind') show();
  });

  let loading: Promise<void> | null = null;
  // A 받기 press that started the load: its click reached the page before the controller listened, so it is replayed.
  let pending: HTMLButtonElement | null = null;
  const onEarlyClick = (ev: Event): void => {
    pending = (ev.target as Element | null)?.closest<HTMLButtonElement>('#qr-png, #qr-svg') ?? pending;
  };
  root.addEventListener('click', onEarlyClick);
  const NOW = ['pointerdown', 'keydown', 'focusin', 'touchstart', 'input'] as const;
  const load = (): Promise<void> =>
    (loading ??= withEngineRetry(() => import('./controller')).then(
      (m) => {
        for (const ev of NOW) root.removeEventListener(ev, load);
        root.removeEventListener('click', onEarlyClick);
        m.initQrCode();
        pending?.click();
        pending = null;
      },
      () => {
        loading = null;
        track({ e: 'fail', t: 'qr-code', c: 'engine', p: 'load' });
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
