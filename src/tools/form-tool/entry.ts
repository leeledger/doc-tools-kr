// Form tool page script (FORM1020; generic since LOAN1022 L-D4; the /stamp-maker/ pattern, site rule Polish P.7): fills
// today's date, starts the usage statistics and loads the tool's controller (worker, preview, downloads) at once on a
// focus, key or press in the tool, otherwise after the first user signal anywhere on the page plus idle — never with the
// page, so the static page is what Lighthouse measures. A submit or 「빈 양식으로 받기」 before the controller runs is
// never lost: the form never submits (no action, prevented here), and the pressed action runs once the controller
// starts. A controller that cannot load shows the shared engine panel. Usage: nothing here but the page view (the
// controller reports start/download/next). Each tool's own entry.ts calls startFormTool with its id, prefix and its
// controller module (a dynamic import, so the controller stays a lazy chunk). RESIGN1027 R5: a preset button
// (src/components/FormTool.astro) fills its field here, before or after the controller loads: the value, then a bubbling
// `input` event (the controller marks a built document stale as for typing), focus and the caret at the end.
// QUOTE1112 Q3, Q8: 「품목 줄 더하기」 shows the next hidden item row and moves focus to its first input (the button goes
// once every row shows); a change of the 「만들 서류」 radio renames the 만들기 button and the result title; `now` starts
// the controller at once (a picture handed over by /stamp-maker/ is waiting). All of it before or after the controller.
import { showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { isRestingMove, preloadSkipped, SIGNALS } from '../../lib/ui/preload';
import { startUsage, track, type FormToolId } from '../../lib/ui/usage';
import type { BuildKind, FormStart } from './controller';

const pad = (n: number): string => String(n).padStart(2, '0');
/** Today on this device, YYYY-MM-DD (the date input's value format). */
export const todayIso = (d: Date = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export interface FormEntry {
  tool: FormToolId;
  /** The element id prefix (src/components/FormTool.astro). */
  prefix: string;
  /** Date fields that start at today. */
  today: readonly string[];
  /** The tool's controller module. */
  load: () => Promise<{ init: (start: FormStart) => void }>;
  /** Start the controller at once. */
  now?: boolean;
}

export function startFormTool(cfg: FormEntry): void {
  startUsage(cfg.tool);
  for (const id of cfg.today) {
    const date = document.getElementById(`${cfg.prefix}-${id}`) as HTMLInputElement | null;
    if (date && !date.value) date.value = todayIso();
  }
  const root = document.getElementById(`${cfg.prefix}-tool`);
  const form = document.getElementById(`${cfg.prefix}-form`) as HTMLFormElement | null;
  if (!root || !form) return;
  let loading: Promise<void> | null = null;
  let started = false;
  let pending: BuildKind | undefined;
  const NOW = ['pointerdown', 'keydown', 'focusin', 'touchstart'] as const;
  const load = (): Promise<void> =>
    (loading ??= withEngineRetry(cfg.load).then(
      (m) => {
        for (const ev of NOW) root.removeEventListener(ev, onNow);
        started = true;
        m.init({ action: pending, today: todayIso });
      },
      () => {
        loading = null;
        track({ e: 'fail', t: cfg.tool, c: 'engine', p: 'load' });
        void showEngineError();
      },
    ));
  root.addEventListener('click', (ev) => {
    const add = (ev.target as Element | null)?.closest<HTMLButtonElement>('button[data-add-row]');
    if (add) {
      const rows = Array.from(root.querySelectorAll<HTMLFieldSetElement>('fieldset[data-item]'));
      const next = rows.find((r) => r.hidden);
      if (next) {
        next.hidden = false;
        next.querySelector<HTMLInputElement>('input')?.focus();
      }
      add.hidden = !rows.some((r) => r.hidden);
      return;
    }
    const btn = (ev.target as Element | null)?.closest<HTMLButtonElement>('button[data-fill-for]');
    const input = btn ? (document.getElementById(btn.dataset.fillFor ?? '') as HTMLInputElement | HTMLTextAreaElement | null) : null;
    if (!btn || !input) return;
    input.value = btn.dataset.fill ?? '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
  root.addEventListener('change', (ev) => {
    const radio = ev.target as HTMLInputElement | null;
    const title = radio?.dataset.spec ? radio.dataset.title : undefined;
    if (!title) return;
    const make = document.getElementById(`${cfg.prefix}-make`);
    const head = document.getElementById(`${cfg.prefix}-result-title`);
    if (make) make.textContent = `${title} 만들기`;
    if (head) head.textContent = `만든 ${title}`;
  });
  const onNow = (): void => void load();
  for (const ev of NOW) root.addEventListener(ev, onNow, { passive: true });
  // Before the controller: never submit; remember the action. After: the controller's own handlers act.
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (started) return;
    pending = 'filled';
    void load();
  });
  document.getElementById(`${cfg.prefix}-blank`)?.addEventListener('click', () => {
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
  if (cfg.now) {
    void load();
    return;
  }
  // Save-Data / 2G: only a focus or press in the tool loads it.
  if (!preloadSkipped(connection)) for (const s of SIGNALS) window.addEventListener(s, onSignal, { capture: true, passive: true });
}
