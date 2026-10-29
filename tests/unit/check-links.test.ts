import { describe, it, expect } from 'vitest';
// @ts-expect-error plain .mjs script, no types
import { extractTargets, resolveTarget } from '../../scripts/check-links.mjs';

describe('extractTargets', () => {
  it('collects href, src and srcset candidates', () => {
    const html = '<a href="/cv/">a</a><img src="/a.png" srcset="/b.png 1x, /c.png 2x">';
    expect(extractTargets(html).sort()).toEqual(['/a.png', '/b.png', '/c.png', '/cv/']);
  });
  it('collects meta-refresh redirect targets', () => {
    expect(extractTargets('<meta http-equiv="refresh" content="0;url=/journey/">')).toEqual(['/journey/']);
  });
  it('ignores external, mailto, tel, data and fragment targets', () => {
    const html =
      '<a href="https://x.org">a</a><a href="http://x.org">b</a><a href="mailto:a@b.c">c</a><a href="tel:1">d</a><a href="#top">e</a><img src="data:image/png;base64,AA"><a href="//cdn.x/y">f</a>';
    expect(extractTargets(html)).toEqual([]);
  });
});

describe('resolveTarget', () => {
  const exists = (set: string[]) => (p: string) => set.includes(p);
  it('maps directory urls to index.html', () => {
    expect(resolveTarget('/cv/', '/', '/dist', exists(['/dist/cv/index.html']))).toEqual({ ok: true });
  });
  it('strips query and hash; /?tv=1 is dist/index.html', () => {
    const ex = exists(['/dist/index.html', '/dist/cv/index.html']);
    expect(resolveTarget('/?tv=1', '/', '/dist', ex).ok).toBe(true);
    expect(resolveTarget('/cv/#x', '/', '/dist', ex).ok).toBe(true);
  });
  it('strips the base before mapping', () => {
    expect(resolveTarget('/new_website/a.png', '/new_website/', '/dist', exists(['/dist/a.png'])).ok).toBe(true);
  });
  it('reports missing targets', () => {
    expect(resolveTarget('/nope/', '/', '/dist', exists([])).ok).toBe(false);
  });
  it('flags root-relative targets lacking the base', () => {
    const r = resolveTarget('/cv/', '/new_website/', '/dist', exists(['/dist/cv/index.html']));
    expect(r.ok).toBe(false);
  });
  it('skips relative targets', () => {
    expect(resolveTarget('foo/bar', '/', '/dist', exists([])).ok).toBe(true);
  });
});
