// One qpdf CLI run in a fresh Emscripten module instance (its heap is released afterwards).
// Shared by the browser worker and the Node deps.
// The qpdf-wasm 0.3.0 build binds console.log / console.error for its output when the factory runs
// (its INCOMING_MODULE_JS_API has no print/printErr), so the run captures them around that call.
import { EngineLoadError } from '../../ui/engine-load';
import { isOutOfMemory } from '../errors';
import type { QpdfResult } from './deps';

export interface QpdfModule {
  FS: { writeFile(path: string, data: Uint8Array): void; readFile(path: string): Uint8Array };
  callMain(args: string[]): number;
}

export type QpdfFactory = (opts: { noInitialRun: boolean; locateFile?: (file: string) => string }) => Promise<QpdfModule>;

/** Log lines kept per run (a badly damaged file can make qpdf warn once per object). */
export const MAX_LOG_LINES = 200;

export async function runQpdf(factory: QpdfFactory, locateFile: ((file: string) => string) | undefined, args: string[], input: Uint8Array): Promise<QpdfResult> {
  const logs: string[] = [];
  const capture = (...a: unknown[]): void => {
    if (logs.length < MAX_LOG_LINES) logs.push(a.map(String).join(' '));
  };
  const { log, error } = console;
  console.log = capture;
  console.error = capture;
  let pending: Promise<QpdfModule>;
  try {
    // The glue binds console.* synchronously inside the factory call.
    pending = factory(locateFile ? { noInitialRun: true, locateFile } : { noInitialRun: true });
  } finally {
    console.log = log;
    console.error = error;
  }
  let m: QpdfModule;
  try {
    m = await pending;
  } catch (err) {
    // The module never started: its wasm did not arrive or did not compile (the glue aborts with the
    // fetch or XHR error). That is the engine, never the file (Polish P.1).
    if (isOutOfMemory(err)) throw err;
    throw new EngineLoadError('qpdf module did not start', { cause: err });
  }
  m.FS.writeFile('/in.pdf', input);
  let code: number;
  try {
    code = m.callMain(args);
  } catch (e) {
    // Emscripten reports exit() as a thrown ExitStatus; a failed heap growth aborts with "OOM".
    const status = (e as { status?: unknown } | null)?.status;
    if (typeof status === 'number') code = status;
    else if (/\bOOM\b|enlarge memory|out of memory/i.test(String((e as Error | null)?.message ?? e))) {
      throw new RangeError('Array buffer allocation failed (qpdf)');
    } else code = -1;
  }
  let out: Uint8Array | null = null;
  try {
    out = m.FS.readFile('/out.pdf');
  } catch {
    out = null;
  }
  return { code, out, logs };
}
