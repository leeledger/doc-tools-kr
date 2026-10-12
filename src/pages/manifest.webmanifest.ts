import type { APIRoute } from 'astro';
import { webManifest } from '../data/web-manifest';

/** Web app manifest: built in src/data/web-manifest.ts (shared with the TWA tests). */
export const GET: APIRoute = () =>
  new Response(JSON.stringify(webManifest()), { headers: { 'Content-Type': 'application/manifest+json' } });
