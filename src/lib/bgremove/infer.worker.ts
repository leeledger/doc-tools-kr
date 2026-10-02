// 배경 지우기 inference worker (Sprint C, C2). One run per worker; the page terminates it after the reply
// (infer-core.ts). The engine script is imported at run time from our own /vendor/ path, never bundled.
import { runOnce, StageError, type OrtLike, type RunRequest, type RunResponse } from './infer-core';

interface WorkerScope {
  postMessage(m: RunResponse, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<RunRequest>) => void) | null;
  crossOriginIsolated?: boolean;
  navigator: Navigator & { gpu?: { requestAdapter(o?: { powerPreference?: string }): Promise<unknown | null> } };
}

const scope = self as unknown as WorkerScope;

scope.onmessage = async (e) => {
  if (e.data?.type !== 'run') return;
  try {
    const r = await runOnce(e.data, {
      importOrt: (url) => import(/* @vite-ignore */ url) as Promise<OrtLike>,
      adapter: async () => (scope.navigator.gpu ? scope.navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }) : null),
      crossOriginIsolated: scope.crossOriginIsolated === true,
      hardwareConcurrency: scope.navigator.hardwareConcurrency ?? 1,
      now: () => performance.now(),
      onCreated: (createMs) => scope.postMessage({ type: 'created', createMs }),
    });
    scope.postMessage(r, [r.mask]);
  } catch (err) {
    const stage = err instanceof StageError ? err.stage : 'run';
    scope.postMessage({ type: 'error', stage, message: String((err as Error)?.message ?? err) });
  }
};
