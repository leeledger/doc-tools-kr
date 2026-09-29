// Static server for dist/ that mimics Cloudflare Pages closely enough for e2e, Lighthouse and the asset
// smoke test: applies dist/_headers (the `/*` block and the path blocks, so tests run under the real CSP and
// cache rules), redirects directory paths to their trailing-slash form, serves 404.html with status 404,
// and gzips text responses the way the CDN compresses them (keeps Lighthouse numbers comparable).
// `startServer({ root, port })` serves any build folder; the folder can be swapped at runtime (the service
// worker e2e serves a second build this way).
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createGzip } from 'node:zlib';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
};

/** Parses a Cloudflare _headers file into [{ pattern, headers }], skipping absolute-URL (host) rules. */
export function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = line.trim();
      current = pattern.startsWith('/') ? { pattern, headers: {} } : null;
      if (current) rules.push(current);
      continue;
    }
    if (current) {
      const i = line.indexOf(':');
      current.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return rules;
}

const matches = (pattern, path) => (pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern);

function headersFor(rules, path) {
  const out = {};
  for (const r of rules) if (matches(r.pattern, path)) Object.assign(out, r.headers);
  return out;
}

function loadRules(root) {
  const built = join(root, '_headers');
  const file = existsSync(built) ? built : join(repo, 'public', '_headers');
  const rules = parseHeaders(readFileSync(file, 'utf8'));
  if (!rules.some((r) => r.pattern === '/*' && r.headers['Content-Security-Policy'])) throw new Error('serve: no CSP in the /* block of _headers');
  return rules;
}

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.xml', '.txt', '.svg', '.wasm', '.bcmap']);

/** @param {{ root?: string, port?: number, host?: string, onRequest?: (method: string, path: string) => void }} [options] */
export function startServer({ root = join(repo, 'dist'), port = 4173, host = '127.0.0.1', onRequest } = {}) {
  let dist = root;
  let rules = loadRules(dist);
  let down = false;

  function send(req, res, status, file, path) {
    const ext = extname(file);
    const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
    res.writeHead(status, {
      'Cache-Control': 'no-cache',
      ...headersFor(rules, path),
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      Vary: 'Accept-Encoding',
      ...(gzip ? { 'Content-Encoding': 'gzip' } : { 'Content-Length': statSync(file).size }),
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const body = createReadStream(file);
    if (gzip) body.pipe(createGzip()).pipe(res);
    else body.pipe(res);
  }

  const server = createServer((req, res) => {
    // "Network down": every connection is reset, as if the host were unreachable.
    if (down) {
      req.socket.destroy();
      return;
    }
    const global = headersFor(rules, '/*');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, global).end();
      return;
    }
    let path;
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      res.writeHead(400, global).end();
      return;
    }
    onRequest?.(req.method, path);
    const file = normalize(join(dist, path));
    if (!file.startsWith(dist + sep) && file !== dist) {
      res.writeHead(403, global).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) {
      if (!path.endsWith('/')) {
        res.writeHead(308, { ...global, Location: `${path}/` }).end();
        return;
      }
      const index = join(file, 'index.html');
      if (existsSync(index)) return send(req, res, 200, index, path);
    } else if (existsSync(file)) {
      return send(req, res, 200, file, path);
    }
    send(req, res, 404, join(dist, '404.html'), path);
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      const bound = typeof address === 'object' && address ? address.port : port;
      resolve({
        server,
        port: bound,
        url: `http://${host}:${bound}`,
        /** Serves another build folder from now on (a "new deploy"). */
        setRoot(next) {
          dist = next;
          rules = loadRules(next);
        },
        /** Resets every connection while true (an unreachable host). */
        setDown(value) {
          down = value;
        },
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 4173);
  const root = process.env.DIST ? normalize(process.env.DIST) : join(repo, 'dist');
  const { url } = await startServer({ root, port });
  console.log(`serve: ${url}/ (${root}, _headers applied)`);
}
