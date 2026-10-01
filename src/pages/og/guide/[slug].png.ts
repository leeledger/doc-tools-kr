// Share image of a guide or hub (Growth G.1; G2 A1): 1200×630, drawn at build with the gen-brand helpers (logo,
// colours, fonts). A title or line that does not fit throws, so the build fails instead of shipping a cut image.
import type { APIRoute } from 'astro';
import { ogDomain, ogImage } from '../../../../scripts/gen-brand.mjs';
import { hubs, publishedGuides } from '../../../data/guides';

export async function getStaticPaths() {
  const pages = [...(await publishedGuides()), ...(await hubs())];
  return pages.map((g) => ({ params: { slug: g.id }, props: { og: g.data.og } }));
}

export const GET: APIRoute = ({ props, site }) => {
  const og = props.og as { title: string; line: string };
  const png: Buffer = ogImage({ title: og.title, line: og.line }, ogDomain(site?.href), { lineMaxLines: 2 });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
