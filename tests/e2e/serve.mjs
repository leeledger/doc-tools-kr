// Static server for dist/ that mimics Cloudflare Pages closely enough for e2e and Lighthouse:
// applies the `/*` header block from public/_headers (so tests run under the real CSP),
// redirects directory paths to their trailing-slash form, serves 404.html with status 404, and
// gzips text responses the way the CDN compresses them (keeps Lighthouse numbers comparable).
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createGzip } from 'node:zlib';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(root, 'dist');
const port = Number(process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
};

/** Parses the `/*` block of public/_headers. */
function globalHeaders() {
  const lines = readFileSync(join(root, 'public', '_headers'), 'utf8').split(/\r?\n/);
  const headers = {};
  let inBlock = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) {
      inBlock = line.trim() === '/*';
      continue;
    }
    if (inBlock) {
      const i = line.indexOf(':');
      headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  if (!headers['Content-Security-Policy']) throw new Error('serve: no CSP in public/_headers');
  return headers;
}
const HEADERS = globalHeaders();

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.xml', '.txt', '.svg', '.wasm', '.bcmap']);

function send(req, res, status, file) {
  const ext = extname(file);
  const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  res.writeHead(status, {
    ...HEADERS,
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
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
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, HEADERS).end();
    return;
  }
  let path;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    res.writeHead(400, HEADERS).end();
    return;
  }
  const file = normalize(join(dist, path));
  if (!file.startsWith(dist + sep) && file !== dist) {
    res.writeHead(403, HEADERS).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!path.endsWith('/')) {
      res.writeHead(308, { ...HEADERS, Location: `${path}/` }).end();
      return;
    }
    const index = join(file, 'index.html');
    if (existsSync(index)) return send(req, res, 200, index);
  } else if (existsSync(file)) {
    return send(req, res, 200, file);
  }
  send(req, res, 404, join(dist, '404.html'));
});

server.listen(port, '127.0.0.1', () => console.log(`serve: http://127.0.0.1:${port}/ (dist, _headers applied)`));
