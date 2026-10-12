// The engine-load panel (#engine-error, src/components/EngineError.astro), shared by every tool. An engine
// failure is never the file's fault, so it never uses a file-error message (UX-AUDIT-1 P0-1, §11.1).
import { clearStatus } from './announce';
import { ENGINE_KO, pickEngineCopy, type EngineCopy, type EngineMessages } from './engine-load';

const panel = (): HTMLElement | null => document.getElementById('engine-error');

/** The panel with the Korean copy (showEngineErrorIn with ENGINE_KO). */
export function showEngineError(reload: () => void = () => location.reload()): Promise<EngineCopy> {
  return showEngineErrorIn(ENGINE_KO, reload);
}

/**
 * Fills the panel with the state-dependent copy from `m` (offline, new deploy or generic), a [새로고침] button, shows
 * it and focuses the button. The polite status region is cleared so no stale progress text is read after it.
 */
export async function showEngineErrorIn(m: EngineMessages, reload: () => void = () => location.reload()): Promise<EngineCopy> {
  const copy = await pickEngineCopy(m);
  const box = panel();
  if (!box) return copy;
  const title = document.createElement('p');
  title.className = 'engine-title';
  title.textContent = copy.title;
  const body = document.createElement('p');
  body.textContent = copy.body;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn primary';
  btn.textContent = m.reload;
  btn.addEventListener('click', reload);
  clearStatus();
  box.replaceChildren(title, body, btn);
  box.hidden = false;
  btn.focus();
  return copy;
}

export function hideEngineError(): void {
  const box = panel();
  if (!box) return;
  box.hidden = true;
  box.replaceChildren();
}
