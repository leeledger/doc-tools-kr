// MediaPipe Face Landmarker on the main thread (brief Step 4 §2): its glue loads with a <script> element,
// which a module worker cannot do. Imported only through a dynamic import() from the /id-photo/ controller,
// and only when auto-framing is on (__ID_PHOTO_AUTOFRAME__), so the bundle chunk, the loader, the wasm and the
// model are never requested before a photo is chosen.
//
// Telemetry: tasks-vision 1.0.1 creates a usage logger in every task that POSTs metrics to
// odml.pa.googleapis.com every 60 s and on close() (BUILD-LOG Step 4, 0.2). detachTelemetry() stops it right
// after creation; tests/unit/idphoto-landmarker.test.ts pins the bundle code it relies on, and the CSP
// (connect-src 'self') would block the request anyway.
import type { FaceLandmarker, FaceLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { FaceAssets } from './assets';
import type { FaceBlend, FaceResult, Pt } from './types';
import { EngineLoadError } from '../ui/engine-load';

/** Inference runs on a copy with this long edge at most (spike: 89 ms median on desktop). */
export const ANALYSIS_EDGE = 1024;

interface TelemetryQueue {
  g?: ReturnType<typeof setInterval>;
  h: unknown[];
  error?: Error;
  flush: unknown;
}

/**
 * Stops the task's usage logger (minified names of @mediapipe/tasks-vision 1.0.1: task.m is the logger, m.l
 * its queue with the 60 s timer g, the pending events h and the error flag that makes flush() a no-op).
 * Returns false when the shape is not the pinned one.
 */
export function detachTelemetry(task: object): boolean {
  const t = task as { m?: { l?: TelemetryQueue } };
  const q = t.m?.l;
  if (!q || typeof q.flush !== 'function' || !Array.isArray(q.h)) return false;
  if (q.g !== undefined) clearInterval(q.g);
  q.g = undefined;
  q.h = [];
  q.error = new Error('telemetry disabled by 안올림');
  t.m = undefined;
  return true;
}

export async function createLandmarker(assets: FaceAssets): Promise<FaceLandmarker> {
  let mod: typeof import('@mediapipe/tasks-vision');
  try {
    mod = await import('@mediapipe/tasks-vision');
  } catch (err) {
    throw new EngineLoadError('face module did not load', { cause: err });
  }
  // The wasm glue logs graph and delegate details (one line through console.error: "INFO: Created TensorFlow
  // Lite XNNPACK delegate"). MediaPipe hands a pre-set global Module to its factory and clears it afterwards;
  // its print/printErr go nowhere. Real failures still reject createFromOptions / detect.
  (globalThis as { Module?: object }).Module = { print: () => undefined, printErr: () => undefined };
  const lm = await mod.FaceLandmarker.createFromOptions(
    { wasmLoaderPath: assets.wasmLoaderPath, wasmBinaryPath: assets.wasmBinaryPath },
    {
      baseOptions: { modelAssetBuffer: assets.model, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numFaces: 3,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    },
  );
  if (!detachTelemetry(lm)) throw new EngineLoadError('face module is not the pinned build (telemetry could not be detached)');
  return lm;
}

type Surface = OffscreenCanvas | HTMLCanvasElement;

/** A canvas (OffscreenCanvas where the page has it) of `w` × `h`. */
export function surface(w: number, h: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function analysisCopy(bitmap: ImageBitmap): Surface {
  const s = Math.min(1, ANALYSIS_EDGE / Math.max(bitmap.width, bitmap.height));
  const c = surface(Math.max(1, Math.round(bitmap.width * s)), Math.max(1, Math.round(bitmap.height * s)));
  const g = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!g) throw new Error('2d context unavailable');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}

const BLEND_KEYS = new Set(['mouthSmileLeft', 'mouthSmileRight', 'jawOpen', 'eyeBlinkLeft', 'eyeBlinkRight']);
const deg = (r: number): number => (r * 180) / Math.PI;

/** Converts one result to source px of a W × H bitmap: the spike's measureFace (landmarker branch). */
export function toMeasure(r: FaceLandmarkerResult, W: number, H: number): FaceResult {
  const faces = r.faceLandmarks ?? [];
  if (!faces.length) return { faces: 0 };
  let idx = 0;
  for (let i = 1; i < faces.length; i++) if (faces[i]![152]!.y - faces[i]![10]!.y > faces[idx]![152]!.y - faces[idx]![10]!.y) idx = i;
  const f: NormalizedLandmark[] = faces[idx]!;
  const P = (i: number): Pt => ({ x: f[i]!.x * W, y: f[i]!.y * H });
  const blend: FaceBlend = {};
  for (const c of r.faceBlendshapes?.[idx]?.categories ?? []) if (BLEND_KEYS.has(c.categoryName)) (blend as Record<string, number>)[c.categoryName] = c.score;
  const M = r.facialTransformationMatrixes?.[idx]?.data;
  // Column-major 4 × 4 rotation part.
  const pose = M ? { yaw: deg(Math.atan2(-M[2]!, Math.hypot(M[6]!, M[10]!))), pitch: deg(Math.atan2(M[6]!, M[10]!)), roll: deg(Math.atan2(M[1]!, M[0]!)) } : null;
  const eyeR = P(468);
  const eyeL = P(473);
  const cheekR = P(234);
  const cheekL = P(454);
  // z is on roughly the x scale (normalised by the image width).
  const ipd3d = Math.hypot((f[473]!.x - f[468]!.x) * W, (f[473]!.y - f[468]!.y) * H, (f[473]!.z - f[468]!.z) * W);
  return {
    faces: faces.length,
    eye: { x: (eyeR.x + eyeL.x) / 2, y: (eyeR.y + eyeL.y) / 2 },
    eyeR,
    eyeL,
    chin: P(152),
    cheekR,
    cheekL,
    centerX: (cheekR.x + cheekL.x) / 2,
    roll: deg(Math.atan2(eyeL.y - eyeR.y, eyeL.x - eyeR.x)),
    ipd3d,
    pose,
    blend,
  };
}

/** One inference on a ≤ 1024 px copy of `bitmap`; the result is in `bitmap` px. */
export function measure(lm: FaceLandmarker, bitmap: ImageBitmap): FaceResult {
  const copy = analysisCopy(bitmap);
  try {
    return toMeasure(lm.detect(copy), bitmap.width, bitmap.height);
  } finally {
    copy.width = 0;
    copy.height = 0;
  }
}
