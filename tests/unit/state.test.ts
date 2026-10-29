import { describe, expect, it } from 'vitest';
import { initialState, reduce, type RoomState } from '../../src/scene/state';

const at = (beat: RoomState['beat'], highlighted = 0, moving = false): RoomState => ({
  beat,
  highlighted,
  moving,
});
const key = (k: string, mod = false) => ({ type: 'key' as const, key: k, mod });

describe('room state machine', () => {
  it('initial states', () => {
    expect(initialState({})).toEqual(at('arrive'));
    expect(initialState({ startAt: 'tv' })).toEqual(at('tv'));
  });
  it('arrive + select couch -> seated', () => {
    const r = reduce(at('arrive'), { type: 'select', target: 'couch' });
    expect(r.state).toEqual(at('seated', 0, true));
    expect(r.effects).toEqual([{ type: 'camera', to: 'seated' }]);
  });
  it('arrive + Enter same as couch', () => {
    expect(reduce(at('arrive'), key('Enter'))).toEqual(
      reduce(at('arrive'), { type: 'select', target: 'couch' }),
    );
  });
  it('seated + select remote -> tv', () => {
    const r = reduce(at('seated'), { type: 'select', target: 'remote' });
    expect(r.state).toEqual(at('tv', 0, true));
    expect(r.effects).toEqual([{ type: 'camera', to: 'tv' }, { type: 'tvOn' }]);
  });
  it('seated + Enter picks up remote', () => {
    expect(reduce(at('seated'), key('Enter')).state.beat).toBe('tv');
  });
  it('tv + key 2 dives to publications and highlights it', () => {
    const r = reduce(at('tv'), key('2'));
    expect(r.effects).toEqual([{ type: 'dive', path: '/publications/' }]);
    expect(r.state).toEqual(at('tv', 1, true));
  });
  it('arrows wrap', () => {
    expect(reduce(at('tv', 4), key('ArrowDown')).state.highlighted).toBe(0);
    expect(reduce(at('tv', 0), key('ArrowUp')).state.highlighted).toBe(4);
    expect(reduce(at('tv', 2), key('ArrowDown')).effects).toEqual([]);
  });
  it('tv + Enter dives to highlighted', () => {
    const r = reduce(at('tv', 3), key('Enter'));
    expect(r.effects).toEqual([{ type: 'dive', path: '/journey/' }]);
    expect(r.state.beat).toBe('tv');
    expect(r.state.moving).toBe(true);
  });
  it('tv + select channel index 2 dives to cv', () => {
    const r = reduce(at('tv'), { type: 'select', target: 'channel', index: 2 });
    expect(r.effects).toEqual([{ type: 'dive', path: '/cv/' }]);
  });
  it('out-of-range channel is ignored', () => {
    for (const index of [-1, 5, undefined]) {
      const s = at('tv');
      expect(reduce(s, { type: 'select', target: 'channel', index })).toEqual({ state: s, effects: [] });
    }
  });
  it('invalid key/target for beat is a no-op', () => {
    const cases = [
      [at('arrive'), key('2')],
      [at('seated'), key('3')],
      [at('tv'), key('Escape')],
      [at('tv'), key('0')],
      [at('tv'), key('7')],
      [at('arrive'), { type: 'select', target: 'remote' }],
      [at('seated'), { type: 'select', target: 'couch' }],
      [at('tv'), { type: 'select', target: 'couch' }],
      [at('arrive'), { type: 'select', target: 'channel', index: 1 }],
    ] as const;
    for (const [s, e] of cases) {
      expect(reduce(s, e)).toEqual({ state: s, effects: [] });
    }
  });
  it('mod keys ignored', () => {
    expect(reduce(at('arrive'), key('Enter', true))).toEqual({ state: at('arrive'), effects: [] });
    expect(reduce(at('tv'), key('2', true)).effects).toEqual([]);
  });
  it('ignores input while moving; arrived clears it', () => {
    const m = at('arrive', 0, true);
    expect(reduce(m, { type: 'select', target: 'couch' })).toEqual({ state: m, effects: [] });
    expect(reduce(m, key('Enter')).effects).toEqual([]);
    expect(reduce(m, { type: 'arrived' }).state).toEqual(at('arrive'));
  });
  it('back -> tv, no effects, highlight kept', () => {
    for (const b of ['arrive', 'seated', 'tv'] as const) {
      const r = reduce(at(b, 3, true), { type: 'back' });
      expect(r).toEqual({ state: at('tv', 3), effects: [] });
    }
  });
  it('does not mutate input', () => {
    const s = Object.freeze(at('tv', 1));
    expect(() => reduce(s, key('ArrowDown'))).not.toThrow();
    expect(s.highlighted).toBe(1);
  });
});
