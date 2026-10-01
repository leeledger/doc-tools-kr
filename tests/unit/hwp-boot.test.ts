// @vitest-environment jsdom
// The HWP page script (G2 A0/V0): nothing loads before the first paint or an interaction; what happened before
// the controller ran is handed to it; a controller that cannot load shows the engine panel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootHwpTool, type BootInit, type BootStart } from '../../src/tools/hwp-to-pdf/boot';

function page(): { root: HTMLElement; input: HTMLInputElement; label: HTMLLabelElement } {
  document.body.innerHTML = `<div id="engine-error" hidden></div><div id="tool"><input id="in" type="file"><label for="in" id="pick">고르기</label></div>`;
  return { root: document.getElementById('tool')!, input: document.getElementById('in') as HTMLInputElement, label: document.getElementById('pick') as HTMLLabelElement };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('bootHwpTool', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('loads nothing at once; after the paint fallback and idle it loads and inits with an empty start', async () => {
    page();
    const init = vi.fn<BootInit>();
    const load = vi.fn(() => Promise.resolve(init));
    bootHwpTool('tool', load);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith({});
  });

  it('a pointerdown on the picker loads at once and asks for the engine prefetch', async () => {
    const { label } = page();
    const init = vi.fn<BootInit>();
    bootHwpTool('tool', () => Promise.resolve(init));
    label.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await flush();
    expect(init).toHaveBeenCalledWith({ prefetch: true });
  });

  it('a file picked before the controller runs is handed to it; later events are the controller’s', async () => {
    const { input } = page();
    const seen: BootStart[] = [];
    let resolve!: (i: BootInit) => void;
    bootHwpTool('tool', () => new Promise<BootInit>((r) => (resolve = r)));
    const file = new File(['x'], 'a.hwp');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    resolve((s) => seen.push({ ...s }));
    await flush();
    expect(seen).toEqual([{ file }]);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(seen).toHaveLength(1);
  });

  it('a drop before the controller runs is kept from the browser and handed over', async () => {
    const { root } = page();
    const init = vi.fn<BootInit>();
    bootHwpTool('tool', () => Promise.resolve(init));
    const file = new File(['x'], 'b.hwpx');
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown };
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file] } });
    root.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    await flush();
    expect(init).toHaveBeenCalledWith({ file });
  });

  it('a controller that fails twice shows the engine panel', async () => {
    const { root } = page();
    const load = vi.fn(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')));
    bootHwpTool('tool', load);
    root.dispatchEvent(new Event('focusin', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(2);
    expect(document.getElementById('engine-error')!.hidden).toBe(false);
  });
});
