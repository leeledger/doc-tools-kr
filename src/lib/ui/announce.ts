// Screen-reader announcements shared by every tool (brief Polish P.17). Each tool page has one polite
// status region (`data-live="status"`) and one alert region (`data-live="alert"`, role="alert").
// - A status message clears the region first, so an identical message is repeated.
// - An alert clears the status region, so a stale "확인하는 중…" is never read after an error.
// - A new file or run clears the alert (clearAlert).

export type AnnounceKind = 'status' | 'alert';

const region = (kind: AnnounceKind, root: ParentNode): HTMLElement | null => root.querySelector<HTMLElement>(`[data-live="${kind}"]`);

/** A status message waiting for its frame; an alert or a clear cancels it so it cannot land afterwards. */
const queued = new WeakMap<HTMLElement, number>();

export function clearStatus(root: ParentNode = document): void {
  const status = region('status', root);
  if (!status) return;
  const frame = queued.get(status);
  if (frame !== undefined) cancelAnimationFrame(frame);
  queued.delete(status);
  status.textContent = '';
}

export function clearAlert(root: ParentNode = document): void {
  const alert = region('alert', root);
  if (!alert) return;
  alert.textContent = '';
  alert.hidden = true;
}

export function announce(kind: AnnounceKind, text: string, root: ParentNode = document): void {
  if (kind === 'alert') {
    clearStatus(root);
    const alert = region('alert', root);
    if (!alert) return;
    alert.textContent = text;
    alert.hidden = false;
    return;
  }
  clearStatus(root);
  const status = region('status', root);
  if (!status) return;
  queued.set(
    status,
    requestAnimationFrame(() => {
      queued.delete(status);
      status.textContent = text;
    }),
  );
}
