import { CHANNELS } from './channels';
import { joinBase } from './url';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Site-relative paths of every real page (no 404, no redirect stubs). */
export function sitemapPaths(posts: { id: string; date: Date }[] = []): string[] {
  return ['/', ...CHANNELS.map((c) => c.path), ...posts.map((p) => `/blog/${p.date.getUTCFullYear()}/${p.id}/`)];
}

/** sitemap.xml body; `site` is an origin, `base` the deploy base ('/' in prod). */
export function buildSitemap(site: string, base: string, paths: string[]): string {
  const urls = paths.map((p) => `  <url><loc>${esc(site + joinBase(base, p))}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
