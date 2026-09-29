// Before/after compare viewer (brief Step 3 §3.2). 원본 below, 결과 on top clipped from the left by the
// slider; zoom 1×/2×/4× applies the same transform to both; pan by pointer drag or arrow keys.
// Both images fill the same box, so the result is shown at the original's CSS size and any downscale shows.

export interface CompareView {
  show(opts: { original: string; result: string; aspect: number; caption: string; label: string }): void;
  hide(): void;
}

const ZOOMS = [1, 2, 4] as const;
/** Arrow-key pan step as a fraction of the box. */
const KEY_STEP = 0.1;

function must<T extends HTMLElement>(root: ParentNode, sel: string): T {
  const e = root.querySelector<T>(sel);
  if (!e) throw new Error(`${sel} missing`);
  return e;
}

export function initCompare(root: HTMLElement): CompareView {
  const stage = must<HTMLDivElement>(root, '.pc-stage');
  const orig = must<HTMLImageElement>(root, '.pc-img-orig');
  const res = must<HTMLImageElement>(root, '.pc-img-res');
  const top = must<HTMLDivElement>(root, '.pc-top');
  const divider = must<HTMLDivElement>(root, '.pc-divider');
  const slider = must<HTMLInputElement>(root, '.pc-slider');
  const caption = must<HTMLElement>(root, '.pc-caption');
  const origLabel = must<HTMLElement>(root, '.pc-label-orig');
  const zoomRadios = Array.from(root.querySelectorAll<HTMLInputElement>('input.pc-zoom'));

  let zoom = 1;
  // Pan offset in fractions of the box (0 = left/top edge of the image at the box's left/top).
  let panX = 0;
  let panY = 0;

  const clampPan = (): void => {
    const min = 1 - zoom; // the image (zoom × box) must still cover the box
    panX = Math.min(0, Math.max(min, panX));
    panY = Math.min(0, Math.max(min, panY));
  };

  const apply = (): void => {
    clampPan();
    const t = `translate(${panX * 100}%, ${panY * 100}%) scale(${zoom})`;
    orig.style.transform = t;
    res.style.transform = t;
    const x = Number(slider.value);
    top.style.clipPath = `inset(0 0 0 ${x}%)`;
    divider.style.left = `${x}%`;
    stage.dataset.zoom = String(zoom);
  };

  const setZoom = (z: number): void => {
    // Keep the image point at the centre of the box where it is (transform-origin is the top left).
    const centreX = (0.5 - panX) / zoom;
    const centreY = (0.5 - panY) / zoom;
    zoom = z;
    panX = 0.5 - centreX * zoom;
    panY = 0.5 - centreY * zoom;
    apply();
  };

  slider.addEventListener('input', apply);
  for (const r of zoomRadios) {
    r.addEventListener('change', () => {
      if (r.checked) setZoom(Number(r.value));
    });
  }

  stage.addEventListener('keydown', (ev) => {
    const d: Record<string, [number, number]> = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const v = d[ev.key];
    // At 1× there is nothing to pan: leave the arrow keys to the page.
    if (!v || zoom === 1) return;
    ev.preventDefault();
    panX += v[0] * KEY_STEP;
    panY += v[1] * KEY_STEP;
    apply();
  });

  let drag: { id: number; x: number; y: number; px: number; py: number } | null = null;
  stage.addEventListener('pointerdown', (ev) => {
    if (zoom === 1) return;
    drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, px: panX, py: panY };
    stage.setPointerCapture(ev.pointerId);
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!drag || drag.id !== ev.pointerId) return;
    const box = stage.getBoundingClientRect();
    panX = drag.px + (ev.clientX - drag.x) / box.width;
    panY = drag.py + (ev.clientY - drag.y) / box.height;
    apply();
  });
  const end = (ev: PointerEvent): void => {
    if (drag?.id === ev.pointerId) drag = null;
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  return {
    show({ original, result, aspect, caption: text, label }) {
      orig.src = original;
      res.src = result;
      stage.style.aspectRatio = String(aspect);
      stage.style.setProperty('--pc-ar', String(aspect));
      caption.textContent = text;
      origLabel.textContent = label;
      slider.value = '50';
      zoom = 1;
      panX = 0;
      panY = 0;
      for (const r of zoomRadios) r.checked = Number(r.value) === ZOOMS[0];
      apply();
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
      orig.removeAttribute('src');
      res.removeAttribute('src');
    },
  };
}
