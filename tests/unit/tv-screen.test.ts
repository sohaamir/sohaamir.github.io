import { describe, expect, it } from 'vitest';
import { MENU_HEADER, fitLines, menuModel, rowAt, ROW_LAYOUT } from '../../src/scene/tv-screen';
import type { RoomState } from '../../src/scene/state';

const s = (highlighted: number): RoomState => ({ beat: 'tv', highlighted, moving: false });

describe('menuModel', () => {
  it('has the header and the five channels in order, ▶ on the highlighted row', () => {
    const m = menuModel(s(1));
    expect(m.header).toBe('AAMIR SOHAIL · CH 01–05');
    expect(MENU_HEADER).toBe(m.header);
    expect(m.rows).toEqual(['  1 about', '▶ 2 publications', '  3 cv', '  4 journey', '  5 blog']);
    expect(m.highlighted).toBe(1);
  });

  it("shows the highlighted channel's fixed summary", () => {
    expect(menuModel(s(3)).preview).toBe('my scientific journey in pictures');
    expect(menuModel(s(0)).preview).toBe('my background and research interests');
    expect(menuModel(s(2)).preview).toBe('view and download my cv');
  });
});

describe('fitLines', () => {
  const measure = (t: string) => t.length * 10; // 10 px per character

  it('keeps short text on one line', () => {
    expect(fitLines('short title', 200, 3, measure)).toEqual(['short title']);
  });

  it('wraps on words within the width', () => {
    expect(fitLines('aaaa bbbb cccc dddd', 100, 3, measure)).toEqual(['aaaa bbbb', 'cccc dddd']);
  });

  it('truncates the last allowed line with an ellipsis', () => {
    const lines = fitLines('aaaa bbbb cccc dddd eeee ffff gggg', 100, 2, measure);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(100);
  });

  it('breaks a single over-long word with an ellipsis', () => {
    const lines = fitLines('x'.repeat(40), 100, 1, measure);
    expect(lines).toEqual(['x'.repeat(9) + '…']);
  });

  it('returns nothing for empty text', () => {
    expect(fitLines('  ', 100, 2, measure)).toEqual([]);
  });
});

describe('rowAt', () => {
  const { width, height, top, rowHeight, left, right } = ROW_LAYOUT;
  const uvAt = (px: number, py: number) => ({ x: px / width, y: 1 - py / height });

  it('maps a point in each row band to its index', () => {
    for (let i = 0; i < 5; i++) expect(rowAt(uvAt((left + right) / 2, top + rowHeight * (i + 0.5)))).toBe(i);
  });

  it('is null outside the list (header, preview panel)', () => {
    expect(rowAt(uvAt((left + right) / 2, top / 2))).toBeNull();
    expect(rowAt(uvAt(right + 10, top + rowHeight))).toBeNull();
    expect(rowAt(uvAt((left + right) / 2, top + rowHeight * 5 + 1))).toBeNull();
  });
});
