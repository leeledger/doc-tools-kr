// Pointer drag reorder for tool lists (brief Polish P.16; moved here from pdf-merge in TOOLS4 T0). Mouse and
// touch through Pointer Events: the handle captures the pointer (touch-action: none on the handle only), the
// row follows the pointer, and a placeholder gap marks the drop position. The list's order is never touched
// here: the drop reports the target index and the controller commits it through the same reorder function as
// the ↑↓ buttons.
// Escape cancels and nothing moves. Within 48 px of the viewport edges the page scrolls.
// The drag always ends: on pointerup (commit), and on pointercancel, a lost pointer capture (for example the
// row left the DOM) or the page being hidden (cancel), so the auto-scroll loop and listeners never outlive it.

export const EDGE_PX = 48;

/** Index the dragged row would take: the placeholder's position among the rows other than the dragged one. */
export function dropIndex(children: readonly Element[], dragged: Element, placeholder: Element): number {
  return children.filter((c) => c !== dragged).indexOf(placeholder);
}

export function startRowDrag(ev: PointerEvent, row: HTMLElement, list: HTMLElement, onEnd: (to: number | null) => void): void {
  const handle = ev.currentTarget as HTMLElement;
  try {
    handle.setPointerCapture(ev.pointerId);
  } catch {
    // The pointer is already gone: no drag.
    onEnd(null);
    return;
  }
  const from = Array.from(list.children).indexOf(row);
  const rect = row.getBoundingClientRect();
  const grab = ev.clientY - rect.top;
  const placeholder = document.createElement('li');
  placeholder.className = 'drag-placeholder';
  placeholder.setAttribute('aria-hidden', 'true');
  placeholder.style.height = `${rect.height}px`;
  row.before(placeholder);
  row.classList.add('dragging');
  Object.assign(row.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, zIndex: '20' });

  let y = ev.clientY;
  let frame = 0;
  let ended = false;

  const place = (): void => {
    row.style.top = `${y - grab}px`;
    const others = Array.from(list.children).filter((c) => c !== row && c !== placeholder) as HTMLElement[];
    const before = others.find((s) => {
      const r = s.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    if (before) {
      if (placeholder.nextElementSibling !== before) before.before(placeholder);
    } else if (list.lastElementChild !== placeholder) {
      list.append(placeholder);
    }
  };

  const autoScroll = (): void => {
    const h = window.innerHeight;
    const dy = y < EDGE_PX ? -Math.ceil((EDGE_PX - y) / 4) : y > h - EDGE_PX ? Math.ceil((y - (h - EDGE_PX)) / 4) : 0;
    if (dy) {
      window.scrollBy({ top: dy, behavior: 'instant' });
      place();
    }
    frame = requestAnimationFrame(autoScroll);
  };
  frame = requestAnimationFrame(autoScroll);

  const onMove = (e: PointerEvent): void => {
    y = e.clientY;
    place();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      end(false);
    }
  };
  const onUp = (): void => end(true);
  const onCancel = (): void => end(false);
  const onHidden = (): void => {
    if (document.visibilityState === 'hidden') end(false);
  };

  function end(commit: boolean): void {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(frame);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onCancel);
    handle.removeEventListener('lostpointercapture', onCancel);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onHidden);
    const to = dropIndex(Array.from(list.children), row, placeholder);
    placeholder.remove();
    row.classList.remove('dragging');
    row.removeAttribute('style');
    onEnd(commit && to >= 0 && to !== from ? to : null);
  }

  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onCancel);
  // pointerup fires before lostpointercapture, so a normal drop has already committed when this runs.
  handle.addEventListener('lostpointercapture', onCancel);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('visibilitychange', onHidden);
}
