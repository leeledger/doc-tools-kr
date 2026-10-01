// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// The page script of the HWP tool (G2 A0/V0: Lighthouse LCP ≤ 2,000 ms). It imports nothing at load: the
// controller and the shared UI chunk are requested after the first paint (then on idle), or at once on the
// first interaction with the tool, so they stay off the critical path of the lead text. The picker is a native
// <label for> + <input type=file>, so nothing is lost meanwhile: a file picked or dropped before the controller
// runs is handed to it, and a press on the picker before then still starts the engine download at once.
// A controller that cannot load (offline, a new deploy) shows the shared engine panel. The two imports below sit
// in the ui-shared chunk, which the entry loads anyway (it holds Vite's dynamic-import helper); a dynamic import
// of them would make rolldown build a namespace object with its runtime helper, which lives in the export chunk.
import { showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';

/** What happened before the controller ran. */
export interface BootStart {
  file?: File;
  /** The picker was pressed (or a file dragged in): start the engine download now. */
  prefetch?: boolean;
}

export type BootInit = (start: BootStart) => void;

const EVENTS = ['pointerdown', 'keydown', 'focusin', 'touchstart', 'change', 'dragenter', 'dragover', 'drop'] as const;
const IDLE_TIMEOUT_MS = 2000;
const PAINT_FALLBACK_MS = 1500;

/** Runs `fn` after the first contentful paint (or after `PAINT_FALLBACK_MS` where paint timing is missing). */
function afterFirstPaint(fn: () => void): void {
  let done = false;
  const once = (): void => {
    if (done) return;
    done = true;
    fn();
  };
  try {
    if (PerformanceObserver.supportedEntryTypes?.includes('paint')) {
      if (performance.getEntriesByName('first-contentful-paint').length) {
        once();
        return;
      }
      const po = new PerformanceObserver((list) => {
        if (list.getEntriesByName('first-contentful-paint').length) {
          po.disconnect();
          once();
        }
      });
      po.observe({ type: 'paint', buffered: true });
    }
  } catch {
    // No paint timing: the timer below starts the controller.
  }
  setTimeout(once, PAINT_FALLBACK_MS);
}

function whenIdle(fn: () => void): void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS });
  else setTimeout(fn, 200);
}

export function bootHwpTool(rootId: string, load: () => Promise<BootInit>): void {
  const root = document.getElementById(rootId);
  if (!root) return;
  const start: BootStart = {};
  let loading: Promise<void> | null = null;

  const isPicker = (t: EventTarget | null): boolean => t instanceof Element && !!t.closest('label[for], input[type="file"]');
  const onEvent = (ev: Event): void => {
    if (ev.type === 'pointerdown' && isPicker(ev.target)) start.prefetch = true;
    else if (ev.type === 'keydown' && isPicker(ev.target) && ((ev as KeyboardEvent).key === 'Enter' || (ev as KeyboardEvent).key === ' ')) start.prefetch = true;
    else if (ev.type === 'dragenter') start.prefetch = true;
    else if (ev.type === 'change' && ev.target instanceof HTMLInputElement && ev.target.type === 'file') {
      const f = ev.target.files?.[0];
      if (f) start.file = f;
    } else if (ev.type === 'dragover' || ev.type === 'drop') {
      // Keep the browser from opening the file itself.
      ev.preventDefault();
      const f = ev.type === 'drop' ? (ev as DragEvent).dataTransfer?.files?.[0] : undefined;
      if (f) start.file = f;
    }
    run();
  };
  const detach = (): void => {
    for (const t of EVENTS) root.removeEventListener(t, onEvent);
  };
  function run(): void {
    loading ??= withEngineRetry(load).then(
      (init) => {
        // From now on the controller's own listeners handle everything.
        detach();
        init(start);
      },
      () => {
        detach();
        void showEngineError();
      },
    );
  }

  for (const t of EVENTS) root.addEventListener(t, onEvent);
  afterFirstPaint(() => whenIdle(run));
}
