// Service worker (brief Polish P.11), built by scripts/gen-sw.mjs into dist/sw.js.
//
// Rule: the SW never sees or stores file bytes. User files never go through fetch (they are File objects
// read locally; results leave through blob: URLs, which a SW does not intercept), and the SW answers only
// allowlisted same-origin GETs. It never reads a request body. A static unit test greps this file for
// request-body reads.
//
// request ─► not GET ──────────────────────────────► browser default (no respondWith)
//         ─► other origin ─────────────────────────► browser default
//         ─► /sw.js, /deploy-manifest.json, /api/* ─► browser default
//         ─► /admin, /admin/* ──────────────────────► browser default (Pages Function, never cached; brief USAGE)
//         ─► /vendor/birefnet-lite-512/, /vendor/onnxruntime-web/ ► browser default (C2: the tool's own Cache Storage
//            keeps them; a second copy here would double ~120 MB on the device)
//         ─► navigation ───────────────────────────► network first (3 s), then cache, then /offline/
//            (precached pages and RUNTIME_PAGES are stored on a successful network answer)
//         ─► /_astro/ /vendor/ /fonts/ /brand/ ────► cache first; stores only res.ok && basic
//         ─► anything else ────────────────────────► browser default

/** Injected by scripts/gen-sw.mjs. */
declare const __BUILD_ID__: string;
declare const __PRECACHE__: string[];

export const CACHE_PREFIX = 'anolim-';
export const RUNTIME_PREFIXES = ['/_astro/', '/vendor/', '/fonts/', '/brand/'];
export const BYPASS = ['/sw.js', '/deploy-manifest.json'];
/**
 * Pages left out of the precache (C2 round 2, Arch: budget headroom; TOOLS4 T2-T4: the tool pages that do not fit the
 * 450 KB precache), stored when visited instead, so a page once opened is still there offline. The tool pages' scripts
 * (/_astro/) and engines (/vendor/ qpdf, pdf.js, rhwp) are runtime-cached on first use, so a returning visitor can work
 * offline. /remove-background/ is not here: it needs the network for its model or cloud path anyway.
 */
export const RUNTIME_PAGES = ['/licenses/', '/terms/', '/privacy/', '/jpg-to-pdf/', '/pdf-to-jpg/', '/pdf-password/', '/hwp-viewer/', '/image-to-jpg/', '/pdf-split/', '/pdf-sign/'];
/** 배경 지우기 (Sprint C, C2): the model and the runtime go straight to the network (src/lib/bgremove/assets.ts caches them). */
export const NETWORK_PREFIXES = ['/vendor/birefnet-lite-512/', '/vendor/onnxruntime-web/'];
export const NAV_TIMEOUT_MS = 3000;
/** The precached page shown for a navigation that neither the network nor the cache can answer. */
export const OFFLINE_PAGE = '/offline/';

export type Route = 'default' | 'navigate' | 'runtime';

interface RequestLike {
  method: string;
  url: string;
  mode: string;
}

export function route(req: RequestLike, origin: string): Route {
  if (req.method !== 'GET') return 'default';
  const url = new URL(req.url);
  if (url.origin !== origin) return 'default';
  if (BYPASS.includes(url.pathname) || url.pathname.startsWith('/api/')) return 'default';
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return 'default';
  if (NETWORK_PREFIXES.some((p) => url.pathname.startsWith(p))) return 'default';
  if (req.mode === 'navigate') return 'navigate';
  if (RUNTIME_PREFIXES.some((p) => url.pathname.startsWith(p))) return 'runtime';
  return 'default';
}

export interface SwEnv {
  origin: string;
  cacheName: string;
  precache: ReadonlySet<string>;
  caches: Pick<CacheStorage, 'match' | 'open'>;
  fetch: (req: Request) => Promise<Response>;
  timeoutMs?: number;
}

export interface FetchEventLike {
  request: Request;
  respondWith(res: Promise<Response>): void;
}

/** Answers only what `route` allows; everything else falls through to the browser. */
export function handleFetch(event: FetchEventLike, env: SwEnv): void {
  const r = route(event.request, env.origin);
  if (r === 'navigate') event.respondWith(networkFirst(event.request, env));
  else if (r === 'runtime') event.respondWith(cacheFirst(event.request, env));
}

/**
 * Navigation: the network first, so a new deploy is always served online. After 3 s a cached copy of the
 * page (if any) answers instead; offline, the cached page or the cached offline page.
 */
async function networkFirst(request: Request, env: SwEnv): Promise<Response> {
  const path = new URL(request.url).pathname;
  const network = env.fetch(request).then(async (res) => {
    if (res.ok && (env.precache.has(path) || RUNTIME_PAGES.includes(path))) await (await env.caches.open(env.cacheName)).put(path, res.clone());
    return res;
  });
  const cached = (): Promise<Response | undefined> => env.caches.match(path, { ignoreSearch: true });
  const fallback = async (): Promise<Response> => (await cached()) ?? (await env.caches.match(OFFLINE_PAGE)) ?? Response.error();
  const slow = new Promise<'slow'>((resolve) => setTimeout(() => resolve('slow'), env.timeoutMs ?? NAV_TIMEOUT_MS));
  network.catch(() => undefined); // a late failure after the cache answered is not an unhandled rejection
  try {
    const first = await Promise.race([network, slow]);
    if (first !== 'slow') return first;
    // Slow network: a cached copy if there is one, otherwise keep waiting for the network.
    return (await cached()) ?? (await network);
  } catch {
    return fallback();
  }
}

/** Hashed and versioned assets: the cache first; a miss is fetched and stored (only a same-origin 200). */
async function cacheFirst(request: Request, env: SwEnv): Promise<Response> {
  const hit = await env.caches.match(request);
  if (hit) return hit;
  const res = await env.fetch(request);
  if (res.ok && res.type === 'basic') await (await env.caches.open(env.cacheName)).put(request, res.clone());
  return res;
}

/** Caches to delete on activate: every anolim-* except the current one and the most recent previous one. */
export function staleCaches(keys: readonly string[], current: string): string[] {
  const ours = keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== current);
  // CacheStorage keys come in creation order: the last one is the most recent previous generation.
  return ours.slice(0, -1);
}

// ---------- service-worker wiring (not run in unit tests) ----------

interface SwScope {
  location: Location;
  clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', fn: (e: { waitUntil(p: Promise<unknown>): void }) => void): void;
  addEventListener(type: 'fetch', fn: (e: FetchEventLike) => void): void;
  addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void;
}

if (typeof self !== 'undefined' && 'registration' in self) {
  const sw = self as unknown as SwScope;
  const cacheName = `${CACHE_PREFIX}${__BUILD_ID__}`;
  const env: SwEnv = { origin: sw.location.origin, cacheName, precache: new Set(__PRECACHE__), caches, fetch: (r) => fetch(r) };
  sw.addEventListener('install', (e) => {
    // No skipWaiting(): an update waits for the page's 새로고침 (or for every tab to close).
    e.waitUntil(caches.open(cacheName).then((c) => c.addAll(__PRECACHE__.map((u) => new Request(u, { cache: 'reload' })))));
  });

  sw.addEventListener('activate', (e) => {
    e.waitUntil(
      (async () => {
        const keys = await caches.keys();
        // First install (no earlier generation of ours): take control of the open page right away.
        const firstInstall = !keys.some((k) => k.startsWith(CACHE_PREFIX) && k !== cacheName);
        for (const k of staleCaches(keys, cacheName)) await caches.delete(k);
        if (firstInstall) await sw.clients.claim();
      })(),
    );
  });

  sw.addEventListener('fetch', (e) => handleFetch(e, env));

  sw.addEventListener('message', (e) => {
    if ((e.data as { type?: unknown } | null)?.type === 'SKIP_WAITING') void sw.skipWaiting();
  });
}
