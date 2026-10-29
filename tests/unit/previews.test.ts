import { describe, expect, it } from 'vitest';
import { byFileOrder } from '../../src/lib/previews';

describe('byFileOrder', () => {
  it('sorts entries by where their id first appears in the source file', () => {
    const yml = '- id: first\n  caption: a\n- id: first_b\n  caption: b\n- id: last\n  caption: c\n';
    const out = byFileOrder([{ id: 'last' }, { id: 'first_b' }, { id: 'first' }], yml);
    expect(out.map((e) => e.id)).toEqual(['first', 'first_b', 'last']);
  });

  it('puts ids it cannot find at the end, keeping their order', () => {
    const out = byFileOrder([{ id: 'x' }, { id: 'a' }, { id: 'y' }], '- id: a\r\n');
    expect(out.map((e) => e.id)).toEqual(['a', 'x', 'y']);
  });
});
