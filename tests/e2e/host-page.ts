// A host site for the embed widget e2e (REV5): a tiny server on localhost (another site than our 127.0.0.1, so the
// widget runs in a real third-party frame) that answers GET /__studio/?src=<url> with one iframe of that URL. A real
// loopback server, not a page.route stub: Chromium's local network access check refuses a frame of 127.0.0.1 inside a
// page with no address (net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS). Its own requests are the test's, not ours:
// specs take them off the no-upload log (dropHost).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NetworkLog } from './no-upload';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface HostSite {
  /** The host page that frames `src` (an absolute URL). */
  url(src: string): string;
  /** Takes the host's own requests off the no-upload log. */
  drop(network: NetworkLog): void;
  close(): Promise<void>;
}

export async function startHost(): Promise<HostSite> {
  const server: Server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://localhost');
    const src = u.searchParams.get('src');
    if (u.pathname !== '/__studio/' || !src) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><html lang="ko"><title>사진관</title><iframe src="${esc(src)}" title="도구" width="100%" height="820" onload="window.__framed=true"></iframe></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://localhost:${(server.address() as AddressInfo).port}`;
  return {
    url: (src) => `${origin}/__studio/?src=${encodeURIComponent(src)}`,
    drop: (network) => {
      for (const r of network.requests.filter((x) => x.url().startsWith(origin))) network.requests.splice(network.requests.indexOf(r), 1);
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
