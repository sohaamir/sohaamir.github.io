import type { APIContext } from 'astro';
import { joinBase } from '../lib/url';

export function GET(context: APIContext) {
  const site = (context.site ?? new URL('https://sohamir.org')).origin;
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${site}${joinBase(import.meta.env.BASE_URL, '/sitemap.xml')}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
