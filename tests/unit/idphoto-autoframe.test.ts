// runAutoFrame and the crash flag (Richard, Step 4 round 2): a skip or timeout during model init must not
// leave `idphoto-mp-attempt` behind once init has finished.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let resolveInit: (lm: object) => void = () => undefined;
vi.mock('../../src/lib/face/assets', () => ({
  loadFaceAssets: vi.fn(async () => ({ model: new Uint8Array(1), wasmLoaderPath: '/l.js', wasmBinaryPath: '/w.wasm' })),
}));
vi.mock('../../src/lib/face/landmarker', () => ({
  createLandmarker: vi.fn(() => new Promise((r) => (resolveInit = r))),
  measure: vi.fn(() => ({ faces: 0 })),
}));

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('runAutoFrame crash flag', () => {
  it.each(['skip', 'timeout'] as const)('%s during init, then init resolves: the key is gone', async (how) => {
    const { runAutoFrame } = await import('../../src/tools/id-photo/autoframe');
    const bitmap = Promise.resolve({} as ImageBitmap);
    const run = runAutoFrame(bitmap, () => undefined, how === 'timeout' ? 20 : 60_000);
    await tick();
    expect(store.get('idphoto-mp-attempt')).toBe('1');
    if (how === 'skip') run.skip();
    const outcome = await run.result;
    expect(outcome).toEqual({ kind: 'manual', reason: how === 'skip' ? 'skipped' : 'timeout' });
    expect(store.get('idphoto-mp-attempt')).toBe('1');
    resolveInit({});
    await tick();
    await tick();
    expect(store.has('idphoto-mp-attempt')).toBe(false);
  });

  it('a successful detect clears the key', async () => {
    const { runAutoFrame } = await import('../../src/tools/id-photo/autoframe');
    const run = runAutoFrame(Promise.resolve({} as ImageBitmap), () => undefined);
    await tick();
    resolveInit({});
    expect(await run.result).toEqual({ kind: 'face', face: { faces: 0 } });
    expect(store.has('idphoto-mp-attempt')).toBe(false);
  });
});
