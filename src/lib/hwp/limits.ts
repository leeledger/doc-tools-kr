// Device limits and routing thresholds of HWP PDF 변환 (brief Step 5 §3.4). Pure.
// MB = 1,000,000 bytes; WASM memory is in MiB. "Over" means strictly greater than the limit; the guard
// thresholds are inclusive (pages ≥ 100, textboxes ≥ 3, equations > 0), exactly as written in the brief.
import type { Device } from '../ui/device';

export const MB_DEC = 1_000_000;
export const MIB = 1024 * 1024;

export interface DeviceLimits {
  /** Hard limit, checked before any parse: over → error too-large. */
  hardBytes: number;
  /** Caps, checked after the parse: over any → viewer-only. */
  capBytes: number;
  capPages: number;
  capWasmBytes: number;
  capImageBytes: number;
  /** Total inflated section bytes the scan may produce (zip-bomb guard; Arch, Step 5 round 3). */
  inflateCap: number;
}

export const LIMITS: Record<Device, DeviceLimits> = {
  desktop: { hardBytes: 150 * MB_DEC, capBytes: 80 * MB_DEC, capPages: 300, capWasmBytes: 1024 * MIB, capImageBytes: 60 * MB_DEC, inflateCap: 512 * MB_DEC },
  mobile: { hardBytes: 25 * MB_DEC, capBytes: 10 * MB_DEC, capPages: 60, capWasmBytes: 256 * MIB, capImageBytes: 8 * MB_DEC, inflateCap: 128 * MB_DEC },
};

/** Guard (viewer-first), the same on every device. */
export const GUARD_PAGES = 100;
export const GUARD_TEXTBOXES = 3;
export const GUARD_EQUATIONS = 1;

/** True when the file is over the hard limit and must not be parsed at all. */
export function overHardLimit(device: Device, fileBytes: number): boolean {
  return fileBytes > LIMITS[device].hardBytes;
}
