import { describe, it, expect } from 'vitest';
// @ts-expect-error plain .mjs script, no types
import { extractHtmlRefs, extractImports, detectBase, toDistPath, resolveImport, evaluateBudget, LIMIT } from '../../scripts/check-budget.mjs';

describe('extractHtmlRefs', () => {
  it('collects script src, stylesheet and modulepreload links', () => {
    const html =
      '<link rel="stylesheet" href="/_astro/a.css"><link rel="modulepreload" href="/_astro/b.js">' +
      '<link rel="icon" href="/favicon.svg"><script type="module" src="/_astro/c.js"></script>';
    expect(extractHtmlRefs(html).sort()).toEqual(['/_astro/a.css', '/_astro/b.js', '/_astro/c.js']);
  });
  it('includes static imports of inline module scripts', () => {
    const html = '<script type="module">import "/_astro/x.js"; import {a} from "/_astro/y.js";</script>';
    expect(extractHtmlRefs(html).sort()).toEqual(['/_astro/x.js', '/_astro/y.js']);
  });
  it('ignores external urls and plain inline scripts', () => {
    const html = '<script src="https://cdn.example/x.js"></script><script>import("a")</script>';
    expect(extractHtmlRefs(html)).toEqual([]);
  });
});

describe('extractImports', () => {
  it('finds static, side-effect, re-export and dynamic imports', () => {
    const js =
      'import a from"./a.js";import"./b.js";export{c}from"./c.js";export*from"./d.js";const m=()=>import("./e.js");import{x as y}from "../f.js"';
    expect(extractImports(js).sort()).toEqual(['../f.js', './a.js', './b.js', './c.js', './d.js', './e.js']);
  });
  it('ignores bare specifiers and import.meta', () => {
    expect(extractImports('import t from"three";console.log(import.meta.url)')).toEqual([]);
  });
});

describe('base handling', () => {
  it('detects the base from the _astro prefix', () => {
    expect(detectBase(['/_astro/a.js'])).toBe('/');
    expect(detectBase(['/new_website/_astro/a.js'])).toBe('/new_website/');
    expect(detectBase([])).toBe('/');
  });
  it('strips the base to a dist-relative path', () => {
    expect(toDistPath('/_astro/a.js', '/')).toBe('_astro/a.js');
    expect(toDistPath('/new_website/_astro/a.js?v=1', '/new_website/')).toBe('_astro/a.js');
  });
  it('resolves relative imports against the importing file', () => {
    expect(resolveImport('./b.js', '_astro/a.js', '/')).toBe('_astro/b.js');
    expect(resolveImport('../x/b.js', '_astro/a.js', '/')).toBe('x/b.js');
    expect(resolveImport('/new_website/_astro/b.js', '_astro/a.js', '/new_website/')).toBe('_astro/b.js');
  });
});

describe('evaluateBudget', () => {
  it('passes at exactly the limit and fails above it', () => {
    expect(evaluateBudget(LIMIT).ok).toBe(true);
    expect(evaluateBudget(LIMIT + 1).ok).toBe(false);
    expect(LIMIT).toBe(3 * 1024 * 1024);
  });
});
