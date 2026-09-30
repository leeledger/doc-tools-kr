// Error codes of HWP PDF 변환 (brief Step 5 §3.2). Framework-free; shared by the worker and the page.

export type HwpErrorCode =
  | 'not-hwp'
  | 'unsupported'
  | 'password'
  | 'distribution'
  | 'corrupt'
  | 'too-large'
  | 'oom'
  | 'timeout'
  | 'engine';

export const HWP_ERROR_CODES: readonly HwpErrorCode[] = ['not-hwp', 'unsupported', 'password', 'distribution', 'corrupt', 'too-large', 'oom', 'timeout', 'engine'];

/** A file problem (or a device limit) with its user-facing code. */
export class HwpError extends Error {
  readonly code: HwpErrorCode;
  constructor(code: HwpErrorCode, message: string = code, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'HwpError';
    this.code = code;
  }
}

/** Structural damage found by the read-only CFB / ZIP readers. The only error they ever throw. */
export class CorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorruptError';
  }
}

/** A container feature we deliberately do not read (ZIP64). */
export class UnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedError';
  }
}
