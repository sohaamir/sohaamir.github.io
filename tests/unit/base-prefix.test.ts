import { describe, it, expect } from 'vitest';
import { prefixHtml } from '../../src/lib/base-prefix';

const B = '/new_website/';

describe('prefixHtml', () => {
  it('prefixes root-relative src and href', () => {
    expect(prefixHtml('<img src="/assets/x.png">', B)).toBe('<img src="/new_website/assets/x.png">');
    expect(prefixHtml("<a href='/cv/'>x</a>", B)).toBe("<a href='/new_website/cv/'>x</a>");
  });
  it('leaves protocol-relative, already-prefixed, absolute and relative urls alone', () => {
    for (const html of [
      '<script src="//cdn.x/a.js"></script>',
      '<a href="/new_website/cv/">x</a>',
      '<a href="https://example.com/a">x</a>',
      '<a href="mailto:a@b.c">x</a>',
      '<a href="#top">x</a>',
      '<a href="rel/path">x</a>',
    ]) {
      expect(prefixHtml(html, B)).toBe(html);
    }
  });
  it('prefixes the bare base-less root', () => {
    expect(prefixHtml('<a href="/">home</a>', B)).toBe('<a href="/new_website/">home</a>');
  });
  it('prefixes each srcset candidate', () => {
    expect(prefixHtml('<img srcset="/a.png 1x, /b.png 2x">', B)).toBe(
      '<img srcset="/new_website/a.png 1x, /new_website/b.png 2x">',
    );
  });
  it('does not touch text content or script bodies', () => {
    const html = '<p>see href="/x" here</p><script>var a = \'<a href="/y">\';</script>';
    expect(prefixHtml(html, B)).toBe(html);
  });
  it('prefixes meta-refresh redirect targets', () => {
    expect(prefixHtml('<meta http-equiv="refresh" content="0;url=/journey/">', B)).toBe(
      '<meta http-equiv="refresh" content="0;url=/new_website/journey/">',
    );
  });
  it('is a no-op when base is /', () => {
    const html = '<img src="/assets/x.png">';
    expect(prefixHtml(html, '/')).toBe(html);
  });
  it('accepts a base without trailing slash', () => {
    expect(prefixHtml('<a href="/cv/">x</a>', '/new_website')).toBe('<a href="/new_website/cv/">x</a>');
  });
});
