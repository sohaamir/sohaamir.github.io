import { describe, expect, it } from 'vitest';
import { externalLinksNewTab, isExternal } from '../../src/lib/new-tab';

describe('externalLinksNewTab', () => {
  it('adds target and rel to external links', () => {
    expect(externalLinksNewTab('<a href="https://e.org/">x</a>')).toBe(
      '<a href="https://e.org/" rel="noopener" target="_blank">x</a>',
    );
  });
  it('merges noopener into an existing rel', () => {
    expect(externalLinksNewTab('<a rel="me" href="https://e.org/">x</a>')).toBe(
      '<a rel="me noopener" href="https://e.org/" target="_blank">x</a>',
    );
  });
  it('does not duplicate noopener', () => {
    expect(externalLinksNewTab('<a href="https://e.org/" rel="noopener">x</a>')).toBe(
      '<a href="https://e.org/" rel="noopener" target="_blank">x</a>',
    );
  });
  it('leaves internal, mailto and already-targeted links alone', () => {
    const html =
      '<a href="/research/">r</a><a href="mailto:a@b.c">m</a><a href="#top">t</a><a href="https://e.org/" target="_self">s</a>';
    expect(externalLinksNewTab(html)).toBe(html);
  });
  it('ignores anchors inside scripts', () => {
    const html = '<script>const s = \'<a href="https://e.org/">\';</script>';
    expect(externalLinksNewTab(html)).toBe(html);
  });
  it('detects external urls', () => {
    expect(isExternal('https://e.org')).toBe(true);
    expect(isExternal('//cdn.e.org/x')).toBe(true);
    expect(isExternal('/about/')).toBe(false);
  });
});
