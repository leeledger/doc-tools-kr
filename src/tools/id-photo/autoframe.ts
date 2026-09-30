// Face auto-framing run of /id-photo/ (brief Step 4 Flow, right column). Imported with import() only when the
// build flag is on and the guard allows it, after a photo is chosen: the model, the wasm, the loader and the
// MediaPipe chunk are never requested before that.
// Any failure, the 60 s timeout or the skip button → manual mode (the page announces it). The landmarker is
// kept for the next photo and preset changes reuse the measurement.
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { loadFaceAssets, type AssetProgress } from '../../lib/face/assets';
import { clearAttempt, markAttempt, sessionStore } from '../../lib/face/guard';
import { createLandmarker, measure } from '../../lib/face/landmarker';
import type { FaceResult } from '../../lib/face/types';

export const TIMEOUT_MS = 60_000;

export type AutoOutcome = { kind: 'face'; face: FaceResult } | { kind: 'manual'; reason: 'skipped' | 'failed' | 'timeout' };

export interface AutoRun {
  result: Promise<AutoOutcome>;
  /** "건너뛰고 직접 맞추기": stops waiting (and any download) at once. */
  skip(): void;
}

let landmarker: Promise<FaceLandmarker> | null = null;

export function runAutoFrame(bitmap: Promise<ImageBitmap>, onProgress: (p: AssetProgress) => void, timeoutMs: number = TIMEOUT_MS): AutoRun {
  const ctrl = new AbortController();
  let settle!: (o: AutoOutcome) => void;
  const result = new Promise<AutoOutcome>((resolve) => (settle = resolve));
  let done = false;
  const finish = (o: AutoOutcome): void => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (o.kind === 'manual') ctrl.abort();
    settle(o);
  };
  const timer = setTimeout(() => finish({ kind: 'manual', reason: 'timeout' }), timeoutMs);
  const storage = sessionStore();

  void (async () => {
    try {
      if (!landmarker) {
        const assets = await loadFaceAssets(onProgress, ctrl.signal);
        if (done) return;
        markAttempt(storage);
        // The attempt flag is cleared after the first successful detect, when init fails normally, or when init
        // ends after a skip/timeout; it stays only if the tab dies in between (the next load then goes manual).
        landmarker = createLandmarker(assets).then(
          (lm) => lm,
          (err: unknown) => {
            landmarker = null;
            clearAttempt(storage);
            throw err;
          },
        );
      } else {
        onProgress({ loaded: 1, total: 1 });
      }
      const lm = await landmarker;
      const bm = await bitmap;
      if (done) {
        // Skipped or timed out while init ran: init finished, so the tab survived it. Without this the flag
        // would send every later photo of the session to manual (Richard, round 2).
        clearAttempt(storage);
        return;
      }
      const face = measure(lm, bm);
      clearAttempt(storage);
      finish({ kind: 'face', face });
    } catch {
      clearAttempt(storage);
      finish({ kind: 'manual', reason: 'failed' });
    }
  })();

  return { result, skip: () => finish({ kind: 'manual', reason: 'skipped' }) };
}
