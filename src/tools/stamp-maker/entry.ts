// /stamp-maker/ page script (STAMP1015 Flow; site rule Polish P.7, src/lib/ui/preload.ts): the controller (painting, the
// fine-tune panel, the font loading) is imported at once on a focus, key or press in the tool, and otherwise after the
// first user signal anywhere on the page (pointer, touch, key, scroll) plus idle — never with the page, so Lighthouse,
// which never interacts, measures the static page (the brief's load + idle pulled the font CSS into the simulated first
// paint: LCP 2.15 s vs 1.67 s). What was typed meanwhile is still in the input; a tile pressed meanwhile is picked when the
// controller starts. A controller that cannot load shows the shared engine panel.
import { showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { isRestingMove, preloadSkipped, SIGNALS } from '../../lib/ui/preload';
import { startUsage, track, trackOut } from '../../lib/ui/usage';
import type { StyleId } from './styles';

startUsage('stamp-maker');
trackOut(document.getElementById('sm-aff'), 'stamp-maker');

/**
 * The tiles' sample pictures (round 2): requested only after the first contentful paint (the hero text, which is this
 * page's LCP), so they never compete with it (LHCI: with plain src the 12 requests started before the observed paint and
 * the simulated LCP rose from 1,667 to 2,043 ms). Without paint timing: after load (and a second after load in any case).
 */
function showSamples(): void {
  const set = (): void => {
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('.sm-art img[data-src]'))) {
      img.src = img.dataset.src!;
      img.removeAttribute('data-src');
    }
  };
  const after = (): void => void requestAnimationFrame(() => set());
  // A browser that accepts the observer but never reports the paint still gets them a second after load.
  const late = (): void => void window.setTimeout(set, 1000);
  if (document.readyState === 'complete') late();
  else window.addEventListener('load', late, { once: true });
  try {
    if (performance.getEntriesByName('first-contentful-paint').length) return after();
    const po = new PerformanceObserver((list) => {
      if (!list.getEntriesByName('first-contentful-paint').length) return;
      po.disconnect();
      after();
    });
    po.observe({ type: 'paint', buffered: true });
  } catch {
    if (document.readyState === 'complete') after();
    else window.addEventListener('load', after, { once: true });
  }
}
showSamples();

const root = document.getElementById('sm-tool');
if (root) {
  let loading: Promise<void> | null = null;
  let pending: StyleId | undefined;
  const NOW = ['pointerdown', 'keydown', 'focusin', 'touchstart'] as const;
  const load = (): Promise<void> =>
    (loading ??= withEngineRetry(() => import('./controller')).then(
      (m) => {
        for (const ev of NOW) root.removeEventListener(ev, load);
        root.removeEventListener('click', onTile);
        m.initStampMaker(pending);
      },
      () => {
        loading = null;
        track({ e: 'fail', t: 'stamp-maker', c: 'engine', p: 'load' });
        void showEngineError();
      },
    ));
  const onTile = (ev: Event): void => {
    const style = (ev.target as Element | null)?.closest<HTMLElement>('.sm-tile')?.dataset.style;
    if (style) pending = style as StyleId;
  };
  for (const ev of NOW) root.addEventListener(ev, load, { passive: true });
  root.addEventListener('click', onTile);
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
