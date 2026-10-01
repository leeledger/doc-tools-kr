/// <reference lib="webworker" />
// Module worker of 전자서명·도장 이미지 (Sprint C, C1). No wasm, no model, no network: the ink key is plain
// typed-array math (key.ts). In: load {pixels (transferred), width, height} | run {run, opts}.
// Out: loaded | result {…, out.pixels transferred} | error {code}. Protocol in worker-core.ts.
import { createInkHandler, type InkRequest } from './worker-core';

declare const self: DedicatedWorkerGlobalScope;

const handle = createInkHandler();

self.onmessage = (ev: MessageEvent<InkRequest>) => {
  const { msg, transfer } = handle(ev.data);
  self.postMessage(msg, transfer);
};
