import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { buildSitemap, sitemapPaths } from '../lib/sitemap';

export async function GET(context: APIContext) {
  const site = (context.site ?? new URL('https://sohamir.org')).origin;
  return new Response(buildSitemap(site, import.meta.env.BASE_URL, sitemapPaths((await getCollection('blog')).map((p) => ({ id: p.id, date: p.data.date })))), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
