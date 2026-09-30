// @vitest-environment jsdom
// Title swap cleanup when afterprint never fires (Richard, Step 5 round 2, Should Fix 6).
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve(), status: 'loaded' } });
  document.title = '원래 제목';
});

describe('printDocument', () => {
  it('afterprint restores the title and calls onAfter once', async () => {
    const { printDocument } = await import('../../src/tools/hwp-to-pdf/print');
    const titles: string[] = [];
    window.print = () => titles.push(document.title);
    const after = vi.fn();
    await printDocument('law10', after, 10_000);
    expect(titles).toEqual(['law10']);
    window.dispatchEvent(new Event('afterprint'));
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('원래 제목');
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('without afterprint the fallback timer restores the title', async () => {
    const { printDocument } = await import('../../src/tools/hwp-to-pdf/print');
    window.print = () => undefined;
    const after = vi.fn();
    await printDocument('law10', after, 20);
    expect(document.title).toBe('law10');
    await new Promise((r) => setTimeout(r, 60));
    expect(document.title).toBe('원래 제목');
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('returning to the page (visibilitychange) restores the title', async () => {
    const { printDocument } = await import('../../src/tools/hwp-to-pdf/print');
    window.print = () => undefined;
    const after = vi.fn();
    await printDocument('law10', after, 10_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(document.title).toBe('원래 제목');
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('a second save while the first swap is pending keeps the original title', async () => {
    const { printDocument } = await import('../../src/tools/hwp-to-pdf/print');
    window.print = () => undefined;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await printDocument('law10', () => undefined, 10_000);
    await printDocument('law10', () => undefined, 10_000);
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('원래 제목');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
});
