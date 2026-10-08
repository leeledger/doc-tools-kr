// WebP encoder worker (TOOLS5 U1): @jsquash/webp for browsers whose canvas cannot save WebP (Safari's toBlob gives PNG).
// A worker rather than a main-thread import, so the jSquash wasm keeps the one file name every worker build gives it (no
// second copy in dist) and a large photo does not block the page while it encodes. One request per worker.
import { loadWebpEncoder } from './wasm-browser';

export interface WebpRequest {
  img: ImageData;
  /** 0–100. */
  quality: number;
}

export type WebpResponse = { ok: true; bytes: Uint8Array } | { ok: false };

interface WorkerScope {
  postMessage(message: WebpResponse, transfer: Transferable[]): void;
  onmessage: ((ev: MessageEvent<WebpRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (ev) => {
  void (async () => {
    try {
      const encode = await loadWebpEncoder();
      const bytes = new Uint8Array(await encode(ev.data.img, { quality: ev.data.quality }));
      scope.postMessage({ ok: true, bytes }, [bytes.buffer]);
    } catch {
      scope.postMessage({ ok: false }, []);
    }
  })();
};
