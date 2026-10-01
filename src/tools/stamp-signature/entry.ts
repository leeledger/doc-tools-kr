// /stamp-signature/ page script (Sprint C, C1): the two tabs, and lazy loading. The photo controller (photo.ts, and
// through it the ink worker) is imported on the first interaction with the photo tab, the pad on the first opening of the
// draw tab; neither on page load (the /id-photo/ pattern: nothing competes with the fonts for LCP). A photo picked
// or dropped while the controller loads is handed to it. A module that cannot load shows the shared engine panel.
// photo.ts is deliberately not named controller*: gen-sw precaches such chunks, and the 450 KB precache has no room
// for it (BUILD-LOG C1); after a first use it comes from the runtime cache like every other lazy chunk.
import { showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';

type Api = { open(file: File): void } | null;

const tabs = [...document.querySelectorAll<HTMLButtonElement>('#ss-tabs [role="tab"]')];

let padLoading: Promise<void> | null = null;
const loadPad = (): Promise<void> =>
  (padLoading ??= withEngineRetry(() => import('./pad')).then(
    (m) => m.initPad(),
    () => {
      padLoading = null;
      void showEngineError();
    },
  ));

function select(tab: HTMLButtonElement, focus: boolean): void {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(t.getAttribute('aria-controls') ?? '');
    if (panel) panel.hidden = !on;
  }
  if (focus) tab.focus();
  if (tab.id === 'ss-tab-draw') void loadPad();
}

tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => select(tab, false));
  tab.addEventListener('keydown', (e) => {
    const k = e.key;
    const next = k === 'ArrowRight' ? i + 1 : k === 'ArrowLeft' ? i - 1 : k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    select(tabs[(next + tabs.length) % tabs.length]!, true);
  });
});

const root = document.getElementById('ss-photo');
const drop = document.getElementById('ss-drop');
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
    (loading ??= withEngineRetry(() => import('./photo')).then(
      (m) => {
        // From now on the controller's own listeners handle everything.
        for (const ev of EVENTS) root.removeEventListener(ev, start);
        drop.removeEventListener('dragover', onDragOver);
        drop.removeEventListener('drop', onDrop);
        return m.initStampTool(pending);
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
