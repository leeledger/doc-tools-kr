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
  | 'engine'
  | 'already-hwp'
  | 'unverified'
  | 'export';

export const HWP_ERROR_CODES: readonly HwpErrorCode[] = ['not-hwp', 'unsupported', 'password', 'distribution', 'corrupt', 'too-large', 'oom', 'timeout', 'engine', 'already-hwp', 'unverified', 'export'];

/** Why the HWPX → HWP reload gate failed (REQ1014-B D10): page count, reopen, or not a CFB at all. */
export type HwpErrorDetail = 'pages' | 'reopen' | 'bytes';

/** A file problem (or a device limit) with its user-facing code. */
export class HwpError extends Error {
  readonly code: HwpErrorCode;
  /** Only for `unverified`: which check failed (usage statistics; the user sees one line). */
  readonly detail?: HwpErrorDetail;
  constructor(code: HwpErrorCode, message: string = code, options?: { cause?: unknown; detail?: HwpErrorDetail }) {
    super(message, options);
    this.name = 'HwpError';
    this.code = code;
    if (options?.detail) this.detail = options.detail;
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
