// IDCAM1022 Step C review fix C2: sharpestFrame (src/tools/id-photo-camera/hints.ts) with stub canvases — keeps the
// sharpest frame and releases the others, drops the burst when the camera stops, and returns null when no frame comes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BURST, BURST_GAP_MS } from '../../src/lib/idphoto/live';
import { sharpestFrame } from '../../src/tools/id-photo-camera/hints';

/** A stub frame: `amp` is the contrast of its pixel pattern (higher = sharper). */
interface Frame {
  width: number;
  height: number;
  amp: number;
}

const frame = (amp: number): Frame => ({ width: 40, height: 50, amp });
const released = (f: Frame): boolean => f.width === 0 && f.height === 0;

beforeEach(() => {
  vi.useFakeTimers();
  // The ≤256 px copy frameSharpness draws into: getImageData returns a checker pattern of the drawn frame's contrast.
  vi.stubGlobal('document', {
    createElement: () => {
      let src: Frame | null = null;
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (f: Frame) => {
            src = f;
          },
          getImageData: (_x: number, _y: number, w: number, h: number) => {
            const data = new Uint8ClampedArray(w * h * 4);
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                const v = 128 + ((x + y) % 2 ? 1 : -1) * (src?.amp ?? 0);
                data.set([v, v, v, 255], (y * w + x) * 4);
              }
            }
            return { data, width: w, height: h };
          },
        }),
      };
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Runs sharpestFrame over `frames` (null = a failed grab), advancing the gaps; `stopAfter` grabs, alive() turns false. */
async function burst(frames: (Frame | null)[], stopAfter = Infinity) {
  let grabs = 0;
  const p = sharpestFrame(
    () => (frames[grabs++] ?? null) as unknown as HTMLCanvasElement | null,
    () => grabs < stopAfter,
  );
  for (let i = 1; i < BURST; i++) await vi.advanceTimersByTimeAsync(BURST_GAP_MS);
  return { result: (await p) as unknown as Frame | null, grabs: () => grabs };
}

describe('sharpestFrame (D5 burst)', () => {
  it('keeps the sharpest of three and releases the others', async () => {
    const f = [frame(10), frame(60), frame(30)];
    const { result, grabs } = await burst(f);
    expect(grabs()).toBe(BURST);
    expect(result).toBe(f[1]);
    expect(released(f[1]!)).toBe(false);
    expect(released(f[0]!)).toBe(true);
    expect(released(f[2]!)).toBe(true);
  });

  it('the camera stopped mid-burst: null, no more grabs, the frame held so far released', async () => {
    const f = [frame(50), frame(10), frame(20)];
    const { result, grabs } = await burst(f, 1);
    expect(result).toBeNull();
    expect(grabs()).toBe(1);
    expect(released(f[0]!)).toBe(true);
  });

  it('every grab fails: null', async () => {
    const { result, grabs } = await burst([null, null, null]);
    expect(result).toBeNull();
    expect(grabs()).toBe(BURST);
  });

  it('a failed grab in the middle is skipped', async () => {
    const f = [frame(10), null, frame(40)];
    const { result } = await burst(f);
    expect(result).toBe(f[2]);
    expect(released(f[0]!)).toBe(true);
  });
});
