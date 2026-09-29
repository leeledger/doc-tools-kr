// Engine-load failures (UX-AUDIT-1 P0-1, brief Polish P.1): a chunk, worker script or wasm that did not
// arrive (offline, a tab left open across a deploy, a network blip). It is never the file's fault, so
// it gets its own code `engine` and never a file-error message. Framework-free; the copy lookup is the
// only network use (a same-origin GET of /deploy-manifest.json, no file data).
import { PdfError } from '../pdf/errors';

export class EngineLoadError extends Error {
  readonly code = 'engine' as const;
  constructor(message = 'engine load failed', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EngineLoadError';
  }
}

// The brief's families, plus how WebKit ("Load failed") and Firefox ("NetworkError when attempting to fetch
// resource") word the same failed fetch.
const IMPORT_FAILED = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch|Load failed|NetworkError when attempting to fetch resource/i;
const WASM_FAILED = /both async and sync fetching of the wasm failed|failed to asynchronously prepare wasm|CompileError/;
const PDFJS_WORKER_FAILED = /Setting up fake worker failed/;

/** True for a failure to load code, never for a file problem (every PdfError, corrupt included, is false). */
export function isEngineLoadFailure(err: unknown): boolean {
  if (err instanceof EngineLoadError) return true;
  if (err instanceof PdfError) return false;
  if ((err as { code?: unknown } | null)?.code === 'engine') return true;
  const name = (err as { name?: unknown } | null)?.name;
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if ((err instanceof TypeError || name === 'TypeError') && IMPORT_FAILED.test(msg)) return true;
  if (name === 'CompileError') return true;
  return WASM_FAILED.test(msg) || PDFJS_WORKER_FAILED.test(msg);
}

export const RETRY_DELAY_MS = 800;

/**
 * Runs `load`; on a failure waits 800 ms and runs it once more, then throws EngineLoadError. Browsers
 * differ on whether a failed module import is cached, so the second import() may or may not refetch;
 * the retry is cheap either way.
 */
export async function withEngineRetry<T>(load: () => Promise<T>, delay: number = RETRY_DELAY_MS): Promise<T> {
  try {
    return await load();
  } catch {
    await new Promise((r) => setTimeout(r, delay));
    try {
      return await load();
    } catch (err) {
      throw err instanceof EngineLoadError ? err : new EngineLoadError('engine load failed twice', { cause: err });
    }
  }
}

export interface EngineCopy {
  title: string;
  body: string;
}

export const ENGINE_COPY = {
  offline: '인터넷 연결이 끊겨 처리 도구를 불러오지 못했습니다.',
  deployed: '사이트가 방금 새 버전으로 바뀌었습니다.',
  generic: '처리 도구를 불러오지 못했습니다.',
  reload: '새로고침',
} as const;

const body = (when: string): string => `파일에는 문제가 없습니다. ${when} 새로고침해 주세요. 새로고침하면 파일을 다시 골라야 합니다.`;

export const MANIFEST_TIMEOUT_MS = 3000;

/** The running page's build id (`<meta name="build-id">`), or null outside a page. */
function pageBuild(): string | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector('meta[name="build-id"]')?.getAttribute('content') ?? null;
}

/**
 * The panel copy: offline, a new deploy (the live /deploy-manifest.json names another build than this
 * page), or generic when the builds match or the manifest cannot be read within 3 s.
 */
export async function engineErrorCopy(
  deps: { online?: boolean; fetch?: typeof fetch; build?: string | null; timeoutMs?: number } = {},
): Promise<EngineCopy> {
  const online = deps.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  if (!online) return { title: ENGINE_COPY.offline, body: body('연결을 확인한 뒤') };
  const build = deps.build === undefined ? pageBuild() : deps.build;
  const get = deps.fetch ?? (typeof fetch === 'function' ? (url: string, init: RequestInit) => fetch(url, init) : null);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs ?? MANIFEST_TIMEOUT_MS);
  try {
    if (get && build) {
      const res = await Promise.race([
        get('/deploy-manifest.json', { cache: 'no-store', signal: ctrl.signal }),
        new Promise<never>((_, reject) => ctrl.signal.addEventListener('abort', () => reject(new Error('timeout')))),
      ]);
      if (res.ok) {
        const live = ((await res.json()) as { build?: unknown }).build;
        if (typeof live === 'string' && live !== build) return { title: ENGINE_COPY.deployed, body: body('바로') };
      }
    }
  } catch {
    // Unreachable or slow manifest: the generic copy.
  } finally {
    clearTimeout(timer);
  }
  return { title: ENGINE_COPY.generic, body: body('잠시 뒤') };
}
