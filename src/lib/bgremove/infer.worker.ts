// 배경 지우기 inference worker (Sprint C, C2). One session per worker, many photos (infer-core.ts); the page
// terminates the worker to free the engine. The engine script is imported at run time from our own /vendor/ path,
// never bundled.
import { createHandler, type OrtLike, type WorkerRequest, type WorkerResponse } from './infer-core';

interface WorkerScope {
  postMessage(m: WorkerResponse, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  crossOriginIsolated?: boolean;
  navigator: Navigator & { gpu?: { requestAdapter(o?: { powerPreference?: string }): Promise<unknown | null> } };
}

const scope = self as unknown as WorkerScope;

const handle = createHandler(
  {
    importOrt: (url) => import(/* @vite-ignore */ url) as Promise<OrtLike>,
    adapter: async () => (scope.navigator.gpu ? scope.navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }) : null),
    crossOriginIsolated: scope.crossOriginIsolated === true,
    hardwareConcurrency: scope.navigator.hardwareConcurrency ?? 1,
    now: () => performance.now(),
  },
  (m, transfer) => scope.postMessage(m, transfer ?? []),
);

// Messages are handled one at a time, in order (a run never overlaps the init or another run).
let queue: Promise<void> = Promise.resolve();
scope.onmessage = (e) => {
  queue = queue.then(() => handle(e.data));
};
