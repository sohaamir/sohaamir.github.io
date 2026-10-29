import { describe, expect, it } from 'vitest';
import { SOUND_KEY, createSound } from '../../src/scene/sound';

const memoryStorage = (init: Record<string, string> = {}) => {
  const data = new Map(Object.entries(init));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};
const throwingStorage = () => ({
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
});

/** A tiny stand-in for AudioContext that counts what gets started. */
function fakeAudio() {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const log = { created: 0, resumed: 0, started: 0 };
  const node = () => ({
    connect: (n: unknown) => n,
    start: () => void log.started++,
    stop() {},
    gain: param(),
    frequency: param(),
    Q: param(),
    type: '',
    buffer: null as unknown,
  });
  const factory = () => {
    log.created++;
    return {
      state: 'suspended',
      currentTime: 0,
      sampleRate: 8000,
      destination: {},
      resume: async () => void log.resumed++,
      createGain: node,
      createOscillator: node,
      createBiquadFilter: node,
      createBufferSource: node,
      createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    } as unknown as AudioContext;
  };
  return { factory, log };
}

describe('sound', () => {
  it('is muted by default and creates no AudioContext up front', () => {
    const audio = fakeAudio();
    const sound = createSound({ storage: () => memoryStorage(), audio: audio.factory });
    expect(sound.enabled).toBe(false);
    sound.tvOn();
    expect(audio.log.created).toBe(0);
  });

  it('toggling on (a user gesture) creates/resumes the context and stores the preference', () => {
    const audio = fakeAudio();
    const storage = memoryStorage();
    const sound = createSound({ storage: () => storage, audio: audio.factory });
    expect(sound.toggle()).toBe(true);
    expect(audio.log.created).toBe(1);
    expect(audio.log.resumed).toBe(1);
    expect(storage.data.get(SOUND_KEY)).toBe('on');
    expect(sound.toggle()).toBe(false);
    expect(storage.data.get(SOUND_KEY)).toBe('off');
  });

  it('remembers "on" from storage, and plays the synthesized click on tvOn', () => {
    const audio = fakeAudio();
    const sound = createSound({ storage: () => memoryStorage({ [SOUND_KEY]: 'on' }), audio: audio.factory });
    expect(sound.enabled).toBe(true);
    expect(audio.log.created).toBe(0); // still nothing until a gesture plays it
    sound.tvOn();
    expect(audio.log.created).toBe(1);
    expect(audio.log.started).toBeGreaterThan(0);
  });

  it('a throwing localStorage falls back to muted and toggling still works', () => {
    const audio = fakeAudio();
    const sound = createSound({ storage: () => throwingStorage(), audio: audio.factory });
    expect(sound.enabled).toBe(false);
    expect(sound.toggle()).toBe(true);
  });

  it('no storage at all (null) is muted', () => {
    expect(createSound({ storage: () => null, audio: fakeAudio().factory }).enabled).toBe(false);
  });

  it('an AudioContext that cannot be created never throws', () => {
    const sound = createSound({
      storage: () => memoryStorage({ [SOUND_KEY]: 'on' }),
      audio: () => {
        throw new Error('no audio');
      },
    });
    expect(() => sound.tvOn()).not.toThrow();
    expect(() => sound.toggle()).not.toThrow();
  });
});
