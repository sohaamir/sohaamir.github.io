import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { withBase } from '../lib/url';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export async function GET(context: APIContext) {
  const site = (context.site ?? new URL('https://sohamir.org')).origin;
  const posts = (await getCollection('blog')).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  const items = posts
    .map((p) => {
      const link = `${site}${withBase(`/blog/${p.data.date.getUTCFullYear()}/${p.id}/`)}`;
      return [
        '    <item>',
        `      <title>${esc(p.data.title)}</title>`,
        `      <link>${esc(link)}</link>`,
        `      <guid>${esc(link)}</guid>`,
        `      <pubDate>${p.data.date.toUTCString()}</pubDate>`,
        p.data.description ? `      <description>${esc(p.data.description)}</description>` : null,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Aamir Sohail</title>
    <link>${esc(site + withBase('/blog/'))}</link>
    <description>Blog posts by Aamir Sohail</description>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
