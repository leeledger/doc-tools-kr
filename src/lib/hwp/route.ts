// Routing after the parse (brief Step 5 §3.4). Pure. Caps first (viewer-only), then the guard (viewer-first),
// else convert. Reasons come in table order: bytes, pages, wasm, images, then textboxes, long.
// HWP direct (SPIKE-HWP-DIRECT §6.6, UX-AUDIT-2 item 1): equations no longer trigger the guard (none of corpus
// v2's 9 equation files is broken by its equations); the page shows a soft note for them instead.
import type { Device } from '../ui/device';
import { GUARD_PAGES, GUARD_TEXTBOXES, LIMITS } from './limits';

export type Mode = 'convert' | 'viewer-first' | 'viewer-only';

export type CapReason = { kind: 'bytes' | 'pages' | 'wasm' | 'images'; limit: number; value: number };
export type GuardReason = { kind: 'textboxes' | 'long'; value: number };
export type Reason = CapReason | GuardReason;

export interface RouteInput {
  device: Device;
  fileBytes: number;
  pages: number;
  wasmBytes: number;
  imageBytes: number;
  textboxes: number;
}

export interface RouteResult {
  mode: Mode;
  reasons: Reason[];
}

export function route(x: RouteInput): RouteResult {
  const l = LIMITS[x.device];
  const caps: CapReason[] = [];
  if (x.fileBytes > l.capBytes) caps.push({ kind: 'bytes', limit: l.capBytes, value: x.fileBytes });
  if (x.pages > l.capPages) caps.push({ kind: 'pages', limit: l.capPages, value: x.pages });
  if (x.wasmBytes > l.capWasmBytes) caps.push({ kind: 'wasm', limit: l.capWasmBytes, value: x.wasmBytes });
  if (x.imageBytes > l.capImageBytes) caps.push({ kind: 'images', limit: l.capImageBytes, value: x.imageBytes });
  const guard: GuardReason[] = [];
  if (x.textboxes >= GUARD_TEXTBOXES) guard.push({ kind: 'textboxes', value: x.textboxes });
  if (x.pages >= GUARD_PAGES) guard.push({ kind: 'long', value: x.pages });
  if (caps.length) return { mode: 'viewer-only', reasons: [...caps, ...guard] };
  if (guard.length) return { mode: 'viewer-first', reasons: guard };
  return { mode: 'convert', reasons: [] };
}
