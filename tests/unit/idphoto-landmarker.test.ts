// The MediaPipe glue we depend on (brief Step 4; BUILD-LOG Step 4, 0.2): the telemetry detach pins the
// minified shape of @mediapipe/tasks-vision 1.0.1, and toMeasure converts a result to source px.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { describe, expect, it, vi } from 'vitest';
import { detachTelemetry, toMeasure } from '../../src/lib/face/landmarker';
import { hasFace } from '../../src/lib/face/types';

const pkgDir = join(__dirname, '..', '..', 'node_modules', '@mediapipe', 'tasks-vision');
const bundle = readFileSync(join(pkgDir, 'vision_bundle.mjs'), 'utf8');

describe('tasks-vision 1.0.1 telemetry (pinned bundle shape)', () => {
  it('is the pinned version', () => {
    expect(JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version).toBe('1.0.1');
  });

  it('every task gets a logger on `m`, whose queue `l` flushes on a 60 s timer `g` unless `error` is set', () => {
    // Created in the task factory for every task.
    expect(bundle).toContain('var r=t.g.Sa();t.m=new Dh(t.C(),e,r)');
    // The logger owns the queue.
    expect(bundle).toContain('this.l=new Fh(r)');
    // The queue: pending events h, the timer g, and flush() that sends nothing once `error` is set.
    expect(bundle).toContain('this.h=[],this.m=new Eh,this.j=t??"",this.g=setInterval(()=>{this.flush()},6e4)');
    expect(bundle).toMatch(/flush\(t,e\)\{if\(this\.error\)e\?\.\("net-send-failed"\);/);
    expect(bundle).toContain('url:"https://odml.pa.googleapis.com/v1/log"');
    // Every other use of the task's logger is optional-chained or guarded, so `m = undefined` is safe.
    const uses = bundle.match(/this\.m(\?\.|&&| &&|\.)[a-z]{1,3}\(/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    expect(bundle).toContain('this.m&&void 0!==t&&this.m.za(t)');
    expect(bundle).toContain('close(){this.D=void 0,this.m?.xa(),this.m?.close(),this.g.closeGraph()}');
  });

  it('a pre-set global Module reaches the wasm factory (its print/printErr silence the glue logs)', () => {
    expect(bundle).toContain('self.Module&&i&&((e=self.Module).locateFile=i.locateFile');
    expect(bundle).toContain('i=await self.ModuleFactory(self.Module||i),self.ModuleFactory=self.Module=void 0');
    const glue = readFileSync(join(pkgDir, 'wasm', 'vision_wasm_internal.js'), 'utf8');
    expect(glue).toContain('err = Module["printErr"]');
  });

  it('detachTelemetry clears the timer and queue, blocks flush and drops the logger', () => {
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const timer = setInterval(() => undefined, 60_000);
    const q = { g: timer, h: [1, 2], error: undefined as Error | undefined, flush: () => undefined };
    const task = { m: { l: q } } as { m?: unknown };
    expect(detachTelemetry(task)).toBe(true);
    expect(clear).toHaveBeenCalledWith(timer);
    expect(q.g).toBeUndefined();
    expect(q.h).toEqual([]);
    expect(q.error).toBeInstanceOf(Error);
    expect(task.m).toBeUndefined();
    clear.mockRestore();
  });

  it('refuses an unknown shape', () => {
    expect(detachTelemetry({})).toBe(false);
    expect(detachTelemetry({ m: { l: { h: 'x' } } })).toBe(false);
  });
});

describe('toMeasure', () => {
  /** 478 landmarks at the image centre, with the ones we read set explicitly (normalised). */
  function landmarks(set: Record<number, [number, number, number?]>) {
    return Array.from({ length: 478 }, (_, i) => {
      const v = set[i] ?? [0.5, 0.5, 0];
      return { x: v[0], y: v[1], z: v[2] ?? 0, visibility: 0 };
    });
  }

  it('picks the largest face and converts to source px', () => {
    const small = landmarks({ 10: [0.1, 0.1], 152: [0.1, 0.15] });
    const big = landmarks({ 10: [0.5, 0.2], 152: [0.5, 0.6], 468: [0.4, 0.4, 0], 473: [0.6, 0.42, 0.01], 234: [0.3, 0.45], 454: [0.7, 0.45] });
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const r = {
      faceLandmarks: [small, big],
      faceWorldLandmarks: [],
      faceBlendshapes: [
        { categories: [], headIndex: 0, headName: '' },
        {
          categories: [
            { categoryName: 'mouthSmileLeft', score: 0.7, index: 0, displayName: '' },
            { categoryName: 'mouthSmileRight', score: 0.6, index: 1, displayName: '' },
            { categoryName: 'browInnerUp', score: 0.9, index: 2, displayName: '' },
          ],
          headIndex: 1,
          headName: '',
        },
      ],
      facialTransformationMatrixes: [
        { rows: 4, columns: 4, data: identity },
        { rows: 4, columns: 4, data: identity },
      ],
    } as unknown as FaceLandmarkerResult;
    const m = toMeasure(r, 1000, 2000);
    if (!hasFace(m)) throw new Error('no face');
    expect(m.faces).toBe(2);
    expect(m.chin).toEqual({ x: 500, y: 1200 });
    expect(m.eye.x).toBeCloseTo(500, 9);
    expect(m.eye.y).toBeCloseTo(820, 9);
    expect(m.centerX).toBeCloseTo(500, 9);
    expect(m.roll).toBeCloseTo((Math.atan2(40, 200) * 180) / Math.PI, 9);
    expect(m.ipd3d).toBeCloseTo(Math.hypot(200, 40, 10), 9);
    expect(m.pose).toEqual({ yaw: -0, pitch: 0, roll: 0 });
    expect(m.blend).toEqual({ mouthSmileLeft: 0.7, mouthSmileRight: 0.6 });
  });

  it('no face → {faces: 0}', () => {
    expect(toMeasure({ faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] } as unknown as FaceLandmarkerResult, 10, 10)).toEqual({ faces: 0 });
  });
});
