// @vitest-environment jsdom
// 이어서 하기 (CHAIN X2): every sender page runs sweepIfDue, so the privacy-page promise (a file nobody took is deleted
// when a tool that uses 이어서 하기 opens after 10 minutes) holds on every such page. Without the site flag nothing loads.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sweepLingering = vi.fn(async () => undefined);
vi.mock('../../src/lib/ui/handoff', () => ({ sweepLingering }));

import { SWEEP_FLAG, sweepIfDue } from '../../src/lib/ui/handoff-marker';

describe('sweepIfDue', () => {
  beforeEach(() => {
    localStorage.clear();
    sweepLingering.mockClear();
  });

  it('no site flag: handoff.ts is not loaded, nothing is swept', async () => {
    sweepIfDue();
    await new Promise((r) => setTimeout(r, 0));
    expect(sweepLingering).not.toHaveBeenCalled();
  });

  it('site flag set: sweeps once', async () => {
    localStorage.setItem(SWEEP_FLAG, '1');
    sweepIfDue();
    await vi.waitFor(() => expect(sweepLingering).toHaveBeenCalledTimes(1));
  });
});
