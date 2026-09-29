// The engine-load panel (#engine-error, src/components/EngineError.astro), shared by every tool. An engine
// failure is never the file's fault, so it never uses a file-error message (UX-AUDIT-1 P0-1, §11.1).
import { clearStatus } from './announce';
import { ENGINE_COPY, engineErrorCopy, type EngineCopy } from './engine-load';

const panel = (): HTMLElement | null => document.getElementById('engine-error');

/**
 * Fills the panel with the state-dependent copy (offline, new deploy or generic), a [새로고침] button, shows
 * it and focuses the button. The polite status region is cleared so no stale progress text is read after it.
 */
export async function showEngineError(reload: () => void = () => location.reload()): Promise<EngineCopy> {
  const copy = await engineErrorCopy();
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
  btn.textContent = ENGINE_COPY.reload;
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
