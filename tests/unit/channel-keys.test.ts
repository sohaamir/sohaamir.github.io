import { describe, expect, it } from 'vitest';
import { channelKeyAction } from '../../src/scripts/channel-keys';

const base = { metaKey: false, ctrlKey: false, altKey: false, targetIsEditable: false };

describe('channelKeyAction', () => {
  it('maps number keys to channel paths', () => {
    expect(channelKeyAction({ ...base, key: '3' })).toEqual({ type: 'go', path: '/cv/' });
    expect(channelKeyAction({ ...base, key: '1' })).toEqual({ type: 'go', path: '/about/' });
    expect(channelKeyAction({ ...base, key: '4' })).toEqual({ type: 'go', path: '/journey/' });
    expect(channelKeyAction({ ...base, key: '5' })).toEqual({ type: 'go', path: '/blog/' });
  });
  it('maps Escape and 0 to menu', () => {
    expect(channelKeyAction({ ...base, key: 'Escape' })).toEqual({ type: 'menu' });
    expect(channelKeyAction({ ...base, key: '0' })).toEqual({ type: 'menu' });
  });
  it('ignores modified keys', () => {
    for (const m of ['metaKey', 'ctrlKey', 'altKey'] as const) {
      expect(channelKeyAction({ ...base, key: '3', [m]: true })).toBeNull();
    }
  });
  it('ignores keys typed in editable targets', () => {
    expect(channelKeyAction({ ...base, key: '3', targetIsEditable: true })).toBeNull();
    expect(channelKeyAction({ ...base, key: 'Escape', targetIsEditable: true })).toBeNull();
  });
  it('ignores other keys', () => {
    expect(channelKeyAction({ ...base, key: 'x' })).toBeNull();
    expect(channelKeyAction({ ...base, key: '6' })).toBeNull();
  });
});
