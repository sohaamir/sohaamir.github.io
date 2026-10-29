import { describe, expect, it } from 'vitest';
import { inlineMarkdown } from '../../src/lib/inline-md';

describe('inlineMarkdown', () => {
  it('renders links, bold and italic', () => {
    expect(inlineMarkdown('**A** *b* [x](https://e.org/a_b_c)')).toBe(
      '<strong>A</strong> <em>b</em> <a href="https://e.org/a_b_c" rel="noopener">x</a>',
    );
  });
  it('escapes raw html', () => {
    expect(inlineMarkdown('<script>x</script>')).toBe('&lt;script&gt;x&lt;/script&gt;');
  });
  it('does not emphasise inside link urls', () => {
    expect(inlineMarkdown('[t](https://e.org/*a*)')).toContain('href="https://e.org/*a*"');
  });
});
