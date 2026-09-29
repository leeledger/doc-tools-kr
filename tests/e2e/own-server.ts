// A test with its own static server (one per Playwright worker, random port), for the specs that must swap the
// served build (service-worker updates) or count the requests that reach the server (preload). baseURL points
// at it, so the no-upload fixture judges same-origin against this server.
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base } from './no-upload';
import { startServer } from './serve.mjs';

export interface OwnServer {
  url: string;
  /** Serves another build folder from now on (a "new deploy"). */
  setRoot(dir: string): void;
  /** Resets every connection while true (an unreachable host). */
  setDown(down: boolean): void;
  /** Paths the server was asked for, in order. */
  log: string[];
  /** A fresh copy of dist/ in a temp folder. */
  copyDist(): string;
}

export const DIST = join(process.cwd(), 'dist');

/** Replaces the build id in every HTML file of `dir` (what a new deploy looks like to the page). */
export function setBuildId(dir: string, id: string): void {
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) writeFileSync(p, readFileSync(p, 'utf8').replace(/<meta name="build-id" content="[^"]+">/, `<meta name="build-id" content="${id}">`));
    }
  };
  walk(dir);
}

export const test = base.extend<object, { ownServer: OwnServer }>({
  ownServer: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const tmp = mkdtempSync(join(tmpdir(), 'anolim-own-'));
      let n = 0;
      const copyDist = (): string => {
        const dir = join(tmp, String(n++));
        cpSync(DIST, dir, { recursive: true });
        return dir;
      };
      const log: string[] = [];
      const server = await startServer({ root: copyDist(), port: 0, onRequest: (_m: string, path: string) => log.push(path) });
      await use({ url: server.url, setRoot: server.setRoot, setDown: server.setDown, log, copyDist });
      server.setDown(false);
      await server.close();
      rmSync(tmp, { recursive: true, force: true });
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ ownServer }, use) => use(ownServer.url),
});

export { expect } from './no-upload';
