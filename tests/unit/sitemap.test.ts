import { describe, it, expect } from 'vitest';
import { buildSitemap, sitemapPaths } from '../../src/lib/sitemap';

describe('sitemapPaths', () => {
  it('lists home, the five channels and blog posts; no 404 or redirects', () => {
    const paths = sitemapPaths([{ id: 'hello', date: new Date('2024-05-11') }]);
    expect(paths).toEqual(['/', '/about/', '/publications/', '/cv/', '/journey/', '/blog/', '/blog/2024/hello/']);
    expect(paths.some((p) => p.includes('404'))).toBe(false);
  });
});

describe('buildSitemap', () => {
  it('emits absolute URLs from site + base, XML-escaped', () => {
    const xml = buildSitemap('https://sohamir.org', '/new_website/', ['/', '/a&b/']);
    expect(xml).toContain('<loc>https://sohamir.org/new_website/</loc>');
    expect(xml).toContain('<loc>https://sohamir.org/new_website/a&amp;b/</loc>');
    expect(xml.startsWith('<?xml')).toBe(true);
  });
});
