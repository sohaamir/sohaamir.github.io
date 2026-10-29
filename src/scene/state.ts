import { CHANNELS, channelByKey } from '../lib/channels';

export type Beat = 'arrive' | 'seated' | 'tv';
export type RoomState = { beat: Beat; highlighted: number; moving: boolean };
export type RoomEvent =
  | { type: 'select'; target: 'couch' | 'remote' | 'channel'; index?: number }
  | { type: 'key'; key: string; mod: boolean }
  | { type: 'arrived' }
  | { type: 'back' };
export type Effect =
  | { type: 'camera'; to: Beat }
  | { type: 'dive'; path: string }
  | { type: 'tvOn' };

type Result = { state: RoomState; effects: Effect[] };

export function initialState(opts: { startAt?: Beat }): RoomState {
  return { beat: opts.startAt === 'tv' ? 'tv' : 'arrive', highlighted: 0, moving: false };
}

const ignore = (state: RoomState): Result => ({ state, effects: [] });

function sit(s: RoomState): Result {
  return {
    state: { ...s, beat: 'seated', moving: true },
    effects: [{ type: 'camera', to: 'seated' }],
  };
}

function pickUpRemote(s: RoomState): Result {
  return {
    state: { ...s, beat: 'tv', moving: true },
    effects: [{ type: 'camera', to: 'tv' }, { type: 'tvOn' }],
  };
}

function dive(s: RoomState, index: number): Result {
  const channel = CHANNELS[index];
  if (!channel) return ignore(s);
  return {
    state: { ...s, highlighted: index, moving: true },
    effects: [{ type: 'dive', path: channel.path }],
  };
}

export function reduce(s: RoomState, e: RoomEvent): Result {
  if (e.type === 'back') return { state: { ...s, beat: 'tv', moving: false }, effects: [] };
  if (e.type === 'arrived') return { state: { ...s, moving: false }, effects: [] };
  if (s.moving) return ignore(s);

  if (e.type === 'select') {
    if (e.target === 'couch' && s.beat === 'arrive') return sit(s);
    if (e.target === 'remote' && s.beat === 'seated') return pickUpRemote(s);
    if (e.target === 'channel' && s.beat === 'tv' && e.index !== undefined && Number.isInteger(e.index)) {
      return dive(s, e.index);
    }
    return ignore(s);
  }

  // key
  if (e.mod) return ignore(s);
  if (s.beat === 'arrive') return e.key === 'Enter' ? sit(s) : ignore(s);
  if (s.beat === 'seated') return e.key === 'Enter' ? pickUpRemote(s) : ignore(s);

  const n = CHANNELS.length;
  if (e.key === 'Enter') return dive(s, s.highlighted);
  if (e.key === 'ArrowDown') return { state: { ...s, highlighted: (s.highlighted + 1) % n }, effects: [] };
  if (e.key === 'ArrowUp') return { state: { ...s, highlighted: (s.highlighted + n - 1) % n }, effects: [] };
  const channel = channelByKey(e.key);
  return channel ? dive(s, CHANNELS.indexOf(channel)) : ignore(s);
}
