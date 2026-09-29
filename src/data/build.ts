// Build id (brief Polish P.1): the first 12 characters of CF_PAGES_COMMIT_SHA on Cloudflare, else the local
// `git rev-parse --short=12 HEAD`, else "dev". Evaluated at build time only (Astro frontmatter); the page
// carries it as <meta name="build-id">, and the postbuild scripts read it back from dist/index.html so the
// deploy manifest and the service worker always name the same build.
import { execSync } from 'node:child_process';

function resolveBuildId(): string {
  const sha = process.env.CF_PAGES_COMMIT_SHA?.trim();
  if (sha) return sha.slice(0, 12);
  try {
    const head = execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (/^[0-9a-f]{4,40}$/i.test(head)) return head;
  } catch {
    // Not a git checkout.
  }
  return 'dev';
}

export const BUILD_ID = resolveBuildId();
