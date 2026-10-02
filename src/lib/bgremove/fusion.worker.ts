// 배경 지우기 foreground-colour worker (Sprint C, C2): blur-fusion ×2 off the main thread. On any failure (most
// likely out of memory on a large photo) it answers ok: false and the page shows the plain cut-out instead
// (brief failure row "fusion": accepted degrade).
import { blurFusion } from './fusion';

export interface FusionRequest {
  rgba: ArrayBuffer;
  alpha: ArrayBuffer;
  width: number;
  height: number;
  r1: number;
  r2: number;
}

export type FusionResponse = { ok: true; rgba: ArrayBuffer; ms: number } | { ok: false; message: string };

interface WorkerScope {
  postMessage(m: FusionResponse, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<FusionRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const m = e.data;
  try {
    const t0 = performance.now();
    const out = blurFusion(new Uint8ClampedArray(m.rgba), new Uint8ClampedArray(m.alpha), m.width, m.height, m.r1, m.r2);
    scope.postMessage({ ok: true, rgba: out.buffer as ArrayBuffer, ms: performance.now() - t0 }, [out.buffer as ArrayBuffer]);
  } catch (err) {
    scope.postMessage({ ok: false, message: String((err as Error)?.message ?? err) });
  }
};
