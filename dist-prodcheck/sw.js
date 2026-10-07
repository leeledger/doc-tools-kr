'use strict';
var exports = {};
const __BUILD_ID__ = "727ea6bf58c7";
const __PRECACHE__ = ["/","/pdf-merge/","/pdf-compress/","/photo-compress/","/id-photo/","/stamp-signature/","/hwp-to-pdf/","/offline/","/_astro/Base.C6FXN4k9.css","/_astro/Base.astro_astro_type_script_index_0_lang.BtjzhFIf.js","/_astro/anolim-ui-400.BPHptGj2.woff2","/_astro/anolim-ui-800.Ddx1K8ZV.woff2","/_astro/controller.BLwmQSVI.js","/_astro/controller.DY4KPcTH.js","/_astro/decode.DUPxSDDa.js","/_astro/index.astro_astro_type_script_index_0_lang.0p32KgU1.js","/_astro/index.astro_astro_type_script_index_0_lang.BKrFMkkd.js","/_astro/index.astro_astro_type_script_index_0_lang.CF6Kh0GB.js","/_astro/index.astro_astro_type_script_index_0_lang.DK86Ef7t.js","/_astro/index.astro_astro_type_script_index_0_lang.gqec5RDh.js","/_astro/index.astro_astro_type_script_index_0_lang.hUMFO0qz.js","/_astro/pdf-pick.BgHV_C4x.js","/_astro/raster.Bi0jyIuH.js","/_astro/reorder.DgatqggT.js","/_astro/session.mvyIyWGm.js","/_astro/sniff.COct9oXL.js","/_astro/ui-shared.BzUmkI1m.js"];
Object.defineProperty(exports, "__esModule", { value: true });
exports.OFFLINE_PAGE = exports.NAV_TIMEOUT_MS = exports.NETWORK_PREFIXES = exports.RUNTIME_PAGES = exports.BYPASS = exports.RUNTIME_PREFIXES = exports.CACHE_PREFIX = void 0;
exports.route = route;
exports.handleFetch = handleFetch;
exports.staleCaches = staleCaches;
exports.CACHE_PREFIX = 'anolim-';
exports.RUNTIME_PREFIXES = ['/_astro/', '/vendor/', '/fonts/', '/brand/'];
exports.BYPASS = ['/sw.js', '/deploy-manifest.json'];
exports.RUNTIME_PAGES = ['/licenses/', '/terms/', '/privacy/', '/jpg-to-pdf/', '/pdf-to-jpg/', '/pdf-password/', '/hwp-viewer/'];
exports.NETWORK_PREFIXES = ['/vendor/birefnet-lite-512/', '/vendor/onnxruntime-web/'];
exports.NAV_TIMEOUT_MS = 3000;
exports.OFFLINE_PAGE = '/offline/';
function route(req, origin) {
    if (req.method !== 'GET')
        return 'default';
    const url = new URL(req.url);
    if (url.origin !== origin)
        return 'default';
    if (exports.BYPASS.includes(url.pathname) || url.pathname.startsWith('/api/'))
        return 'default';
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/'))
        return 'default';
    if (exports.NETWORK_PREFIXES.some((p) => url.pathname.startsWith(p)))
        return 'default';
    if (req.mode === 'navigate')
        return 'navigate';
    if (exports.RUNTIME_PREFIXES.some((p) => url.pathname.startsWith(p)))
        return 'runtime';
    return 'default';
}
function handleFetch(event, env) {
    const r = route(event.request, env.origin);
    if (r === 'navigate')
        event.respondWith(networkFirst(event.request, env));
    else if (r === 'runtime')
        event.respondWith(cacheFirst(event.request, env));
}
async function networkFirst(request, env) {
    const path = new URL(request.url).pathname;
    const network = env.fetch(request).then(async (res) => {
        if (res.ok && (env.precache.has(path) || exports.RUNTIME_PAGES.includes(path)))
            await (await env.caches.open(env.cacheName)).put(path, res.clone());
        return res;
    });
    const cached = () => env.caches.match(path, { ignoreSearch: true });
    const fallback = async () => (await cached()) ?? (await env.caches.match(exports.OFFLINE_PAGE)) ?? Response.error();
    const slow = new Promise((resolve) => setTimeout(() => resolve('slow'), env.timeoutMs ?? exports.NAV_TIMEOUT_MS));
    network.catch(() => undefined);
    try {
        const first = await Promise.race([network, slow]);
        if (first !== 'slow')
            return first;
        return (await cached()) ?? (await network);
    }
    catch {
        return fallback();
    }
}
async function cacheFirst(request, env) {
    const hit = await env.caches.match(request);
    if (hit)
        return hit;
    const res = await env.fetch(request);
    if (res.ok && res.type === 'basic')
        await (await env.caches.open(env.cacheName)).put(request, res.clone());
    return res;
}
function staleCaches(keys, current) {
    const ours = keys.filter((k) => k.startsWith(exports.CACHE_PREFIX) && k !== current);
    return ours.slice(0, -1);
}
if (typeof self !== 'undefined' && 'registration' in self) {
    const sw = self;
    const cacheName = `${exports.CACHE_PREFIX}${__BUILD_ID__}`;
    const env = { origin: sw.location.origin, cacheName, precache: new Set(__PRECACHE__), caches, fetch: (r) => fetch(r) };
    sw.addEventListener('install', (e) => {
        e.waitUntil(caches.open(cacheName).then((c) => c.addAll(__PRECACHE__.map((u) => new Request(u, { cache: 'reload' })))));
    });
    sw.addEventListener('activate', (e) => {
        e.waitUntil((async () => {
            const keys = await caches.keys();
            const firstInstall = !keys.some((k) => k.startsWith(exports.CACHE_PREFIX) && k !== cacheName);
            for (const k of staleCaches(keys, cacheName))
                await caches.delete(k);
            if (firstInstall)
                await sw.clients.claim();
        })());
    });
    sw.addEventListener('fetch', (e) => handleFetch(e, env));
    sw.addEventListener('message', (e) => {
        if (e.data?.type === 'SKIP_WAITING')
            void sw.skipWaiting();
    });
}
