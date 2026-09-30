// Cloudflare Pages Free limits (owner-verified 2026-09-30: 20,000 files per site, 25 MiB per file) and our
// guards below them (Growth G.8). check-dist fails at MAX_FILES or at MAX_FILE per file, warns above WARN_FILES.
export const CF_MAX_FILES = 20_000;
export const MAX_FILES = 15_000;
export const WARN_FILES = 10_000;
export const MAX_FILE = 24 * 1024 * 1024;
