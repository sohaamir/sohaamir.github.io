/**
 * The TV-on sound (spec §3.3, Claude's call: muted by default, speaker toggle).
 * Synthesized with the Web Audio API, so there is no audio asset. The
 * AudioContext is only created or resumed from a user gesture (the toggle, or
 * the click/key that turns the TV on), never on page load.
 */

export const SOUND_KEY = 'room:sound';

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

export type Sound = {
  readonly enabled: boolean;
  /** Flip the setting (call from a user gesture). Returns the new setting. */
  toggle(): boolean;
  /** Play the TV switching on, if enabled (call from a user gesture). */
  tvOn(): void;
};

const defaultStorage = (): Store | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const defaultAudio = (): AudioContext => new AudioContext();

/** Click/thunk, then a short burst of static over a fading mains hum (~0.5 s). */
function playTvOn(ctx: AudioContext): void {
  const t = ctx.currentTime + 0.01;
  const out = ctx.createGain();
  out.gain.value = 0.5;
  out.connect(ctx.destination);

  // The relay "thunk": a low sine dropping in pitch, very short.
  const thunk = ctx.createOscillator();
  const thunkGain = ctx.createGain();
  thunk.type = 'sine';
  thunk.frequency.setValueAtTime(140, t);
  thunk.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  thunkGain.gain.setValueAtTime(0.9, t);
  thunkGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  thunk.connect(thunkGain).connect(out);
  thunk.start(t);
  thunk.stop(t + 0.16);

  // White noise, used for the click (bright, ~15 ms) and the static (band-passed, ~350 ms).
  const length = Math.floor(ctx.sampleRate * 0.45);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

  const click = ctx.createBufferSource();
  click.buffer = buffer;
  const clickFilter = ctx.createBiquadFilter();
  clickFilter.type = 'highpass';
  clickFilter.frequency.value = 2500;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.7, t);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
  click.connect(clickFilter).connect(clickGain).connect(out);
  click.start(t);
  click.stop(t + 0.03);

  const hiss = ctx.createBufferSource();
  hiss.buffer = buffer;
  const hissFilter = ctx.createBiquadFilter();
  hissFilter.type = 'bandpass';
  hissFilter.frequency.value = 3200;
  hissFilter.Q.value = 0.8;
  const hissGain = ctx.createGain();
  hissGain.gain.setValueAtTime(0.0001, t + 0.03);
  hissGain.gain.linearRampToValueAtTime(0.12, t + 0.06);
  hissGain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
  hiss.connect(hissFilter).connect(hissGain).connect(out);
  hiss.start(t + 0.03);
  hiss.stop(t + 0.45);

  // A faint CRT hum under it.
  const hum = ctx.createOscillator();
  const humGain = ctx.createGain();
  hum.type = 'triangle';
  hum.frequency.value = 100;
  humGain.gain.setValueAtTime(0.0001, t);
  humGain.gain.linearRampToValueAtTime(0.05, t + 0.08);
  humGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  hum.connect(humGain).connect(out);
  hum.start(t);
  hum.stop(t + 0.52);
}

export function createSound(
  deps: { storage?: () => Store | null; audio?: () => AudioContext } = {},
): Sound {
  const storage = deps.storage ?? defaultStorage;
  const makeAudio = deps.audio ?? defaultAudio;
  let ctx: AudioContext | null = null;

  let enabled = false;
  try {
    enabled = storage()?.getItem(SOUND_KEY) === 'on';
  } catch {
    enabled = false;
  }

  /** Create or resume the context; only ever called from a user gesture. */
  const ready = (): AudioContext | null => {
    try {
      ctx ??= makeAudio();
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      return ctx;
    } catch {
      return null;
    }
  };

  return {
    get enabled() {
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      try {
        storage()?.setItem(SOUND_KEY, enabled ? 'on' : 'off');
      } catch {
        // Private mode / blocked storage: the setting just isn't remembered.
      }
      if (enabled) ready();
      return enabled;
    },
    tvOn() {
      if (!enabled) return;
      const c = ready();
      if (!c) return;
      try {
        playTvOn(c);
      } catch {
        // Audio is a nicety; never let it break the room.
      }
    },
  };
}
