import { describe, expect, it } from 'vitest';
import { IDLE_FRAME_MS, createDprGovernor, createFrameGate, renderQuality, shouldRender } from '../../src/scene/frame-pacing';

describe('shouldRender', () => {
  const still = { moving: false, pulsing: false, dirty: false };

  it('renders every frame while the camera moves or something changed', () => {
    expect(shouldRender(16, 0, { ...still, moving: true })).toBe(true);
    expect(shouldRender(16, 0, { ...still, dirty: true })).toBe(true);
  });

  it('renders nothing while the scene is still (e.g. idle at the tv menu)', () => {
    expect(shouldRender(5000, 0, still)).toBe(false);
  });

  it('draws the idle glow pulse at ~30 fps, not every display frame', () => {
    const pulse = { ...still, pulsing: true };
    expect(IDLE_FRAME_MS).toBeCloseTo(1000 / 30);
    expect(shouldRender(100 + 1000 / 60, 100, pulse)).toBe(false); // the next 60 Hz frame
    expect(shouldRender(100 + 2000 / 60, 100, pulse)).toBe(true); // the one after
    expect(shouldRender(100 + 3 * (1000 / 120), 100, pulse)).toBe(false); // 120 Hz: wait for the 4th
    expect(shouldRender(100 + 4 * (1000 / 120), 100, pulse)).toBe(true);
  });
});

describe('createDprGovernor', () => {
  const feed = (g: ReturnType<typeof createDprGovernor>, ms: number, n: number) => {
    const changes: number[] = [];
    for (let i = 0; i < n; i++) {
      const r = g.sample(ms);
      if (r !== null) changes.push(r);
    }
    return changes;
  };

  it('starts at the cap and holds it while frames are on time', () => {
    const g = createDprGovernor({ max: 1.5 });
    expect(g.ratio).toBe(1.5);
    expect(feed(g, 16.7, 300)).toEqual([]);
    expect(g.ratio).toBe(1.5);
  });

  it('steps the pixel ratio down while frames are slow, never below the floor', () => {
    const g = createDprGovernor({ max: 1.5, window: 30 });
    expect(feed(g, 45, 30)).toEqual([1.25]);
    expect(feed(g, 45, 300)).toEqual([1]);
    expect(g.ratio).toBe(1);
  });

  it('does not react to a single hitch (it looks at the median of a window)', () => {
    const g = createDprGovernor({ max: 1.5, window: 30 });
    feed(g, 16.7, 25);
    expect(g.sample(180)).toBeNull();
    expect(feed(g, 16.7, 4)).toEqual([]);
    expect(g.ratio).toBe(1.5);
  });

  it('ignores stalls (tab switches, long tasks) entirely', () => {
    const g = createDprGovernor({ max: 1.5, window: 30 });
    expect(feed(g, 900, 120)).toEqual([]);
    expect(g.ratio).toBe(1.5);
  });

  it('steps back up after a long run of fast frames (a transient slowdown is not forever)', () => {
    const g = createDprGovernor({ max: 1.5, window: 30, upWindows: 4 });
    expect(feed(g, 45, 30)).toEqual([1.25]);
    expect(feed(g, 16.7, 30 * 3)).toEqual([]); // three fast windows: not yet
    expect(feed(g, 16.7, 30)).toEqual([1.5]); // the fourth: back to the cap
    expect(feed(g, 16.7, 300)).toEqual([]); // never above the cap
    expect(g.ratio).toBe(1.5);
  });

  it('a run of fast frames must be unbroken: one slow-ish window restarts the count', () => {
    const g = createDprGovernor({ max: 1.5, window: 30, upWindows: 4 });
    feed(g, 45, 30);
    feed(g, 16.7, 30 * 3);
    feed(g, 19.5, 30); // neither slow nor fast enough to count
    expect(feed(g, 16.7, 30 * 3)).toEqual([]);
    expect(feed(g, 16.7, 30)).toEqual([1.5]);
  });

  it('cannot oscillate: a ratio that was too slow again after stepping back up is not retried', () => {
    const g = createDprGovernor({ max: 2, window: 30, upWindows: 4 });
    expect(feed(g, 45, 30)).toEqual([1.75]);
    expect(feed(g, 16.7, 30 * 4)).toEqual([2]);
    expect(feed(g, 45, 30)).toEqual([1.75]); // 2× really is too much for this machine
    expect(feed(g, 16.7, 30 * 40)).toEqual([]);
    expect(g.ratio).toBe(1.75);
  });

  it('reads a flat ~33 ms cadence as rAF throttling (Low Power Mode, battery saver), not GPU load', () => {
    const g = createDprGovernor({ max: 1.5, window: 30 });
    const throttled = Array.from({ length: 300 }, (_, i) => 33.3 + ((i * 7) % 5) * 0.4 - 0.8); // 32.5–34.1 ms
    expect(throttled.map((ms) => g.sample(ms)).filter((r) => r !== null)).toEqual([]);
    expect(g.ratio).toBe(1.5);
  });

  it('a GPU that misses vsync (16.7/33.3 ms mix, median 33) is slow, not throttled', () => {
    const g = createDprGovernor({ max: 1.5, window: 30 });
    const missing = Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? 16.7 : 33.3));
    expect(missing.map((ms) => g.sample(ms)).filter((r) => r !== null)).toEqual([1.25]);
  });

  it('a flat 33 ms cadence on a display measured at 60 Hz is a GPU missing every vsync: step down', () => {
    const g = createDprGovernor({ max: 1.5, window: 30 });
    for (let i = 0; i < 8; i++) g.idle(16.7 + (i % 2) * 0.2); // ticks that drew nothing: the display's period
    expect(feed(g, 33.3, 30)).toEqual([1.25]);
  });

  it('a display measured at 30 Hz (rAF throttled) is not load, even if frames jitter beyond the flat band', () => {
    const g = createDprGovernor({ max: 1.5, window: 30 });
    for (let i = 0; i < 8; i++) g.idle(33.3);
    const jittery = Array.from({ length: 300 }, (_, i) => (i % 5 === 0 ? 40 : 33.3));
    expect(jittery.map((ms) => g.sample(ms)).filter((r) => r !== null)).toEqual([]);
    expect(feed(g, 70, 30)).toEqual([1.25]); // but missing the throttled cadence too is real load
  });

  it('ignores idle intervals that are stalls (tab hidden) when measuring the display', () => {
    const g = createDprGovernor({ max: 1.5, window: 30 });
    for (let i = 0; i < 8; i++) g.idle(16.7);
    g.idle(5000);
    expect(feed(g, 33.3, 30)).toEqual([1.25]);
  });

  it('reset() drops a partly filled window (frames from two glides never share a decision)', () => {
    const g = createDprGovernor({ max: 1.5, window: 30 });
    feed(g, 45, 29);
    g.reset();
    expect(feed(g, 16.7, 1)).toEqual([]);
    expect(feed(g, 45, 28)).toEqual([]); // 29 in this window: no decision yet
    expect(feed(g, 45, 1)).toEqual([1.25]);
  });

  it('a ratio that has held up is confirmed: a much later slowdown does not lower the ceiling', () => {
    const g = createDprGovernor({ max: 2, window: 30, upWindows: 2 });
    expect(feed(g, 45, 30)).toEqual([1.75]);
    expect(feed(g, 16.7, 30 * 2)).toEqual([2]); // back up
    expect(feed(g, 16.7, 30 * 2)).toEqual([]); // and 2× holds up for a while: confirmed
    expect(feed(g, 45, 30)).toEqual([1.75]); // a later burst of load
    expect(feed(g, 16.7, 30 * 2)).toEqual([2]); // 2× may be tried again
  });

  it('defaults: a decision every 20 frames, and one fast glide (3 windows) is enough to step back up', () => {
    const g = createDprGovernor({ max: 1.5 });
    expect(feed(g, 45, 20)).toEqual([1.25]);
    expect(feed(g, 16.7, 40)).toEqual([]);
    expect(feed(g, 16.7, 20)).toEqual([1.5]);
  });

  it('a display with ratio 1 stays at 1', () => {
    const g = createDprGovernor({ max: 1 });
    expect(feed(g, 40, 300)).toEqual([]);
    expect(g.ratio).toBe(1);
  });
});

describe('renderQuality', () => {
  it('standard displays: full resolution with MSAA (pixels are big, fill is cheap)', () => {
    expect(renderQuality(1)).toEqual({ pixelRatio: 1, antialias: true });
    expect(renderQuality(1.25)).toEqual({ pixelRatio: 1.25, antialias: true });
  });

  it('retina displays: capped at 1.5× and no MSAA (the density hides jaggies; MSAA at 1.5× drops frames)', () => {
    expect(renderQuality(2)).toEqual({ pixelRatio: 1.5, antialias: false });
    expect(renderQuality(3)).toEqual({ pixelRatio: 1.5, antialias: false });
    expect(renderQuality(1.5)).toEqual({ pixelRatio: 1.5, antialias: false });
  });
});

describe('createFrameGate (when the render loop feeds the governor)', () => {
  const HZ60 = 1000 / 60;
  /** Drive the gate tick by tick: `moving` per tick, `draws` per tick, each tick `ms` after the last. */
  const run = (gate: ReturnType<typeof createFrameGate>, ticks: { ms: number; moving: boolean; draws: boolean }[], t0 = 0) => {
    const changes: number[] = [];
    let t = t0;
    for (const k of ticks) {
      t += k.ms;
      const r = gate.tick(t, k.moving, k.draws);
      if (r !== null) changes.push(r);
    }
    return { changes, t };
  };
  /** A glide: `frames` drawn back to back, each taking `ms`. */
  const glide = (frames: number, ms: number) => Array.from({ length: frames }, () => ({ ms, moving: true, draws: true }));
  /** Settled at a beat with the glow pulse: every other 60 Hz tick draws (or none at the tv menu). */
  const idle = (ticks: number, pulse = true) =>
    Array.from({ length: ticks }, (_, i) => ({ ms: HZ60, moving: false, draws: pulse && i % 2 === 0 }));

  it('samples only frames drawn back to back within one glide; idle ticks only tell it the display period', () => {
    const calls: string[] = [];
    const fake = { ratio: 1.5, sample: (ms: number) => (calls.push(`sample ${ms.toFixed(1)}`), null), idle: (ms: number) => void calls.push(`idle ${ms.toFixed(1)}`), reset: () => void calls.push('reset') };
    const gate = createFrameGate(fake);
    run(gate, [
      { ms: 16.7, moving: false, draws: true }, // first tick: nothing to measure yet
      { ms: 16.7, moving: false, draws: false }, // after a drawn idle frame: not a glide frame
      { ms: 16.7, moving: true, draws: true }, // glide starts: after an undrawn tick, the display period
      { ms: 20, moving: true, draws: true }, // a glide frame
      { ms: 21, moving: true, draws: true },
      { ms: 16.7, moving: false, draws: true }, // glide over
    ]);
    expect(calls).toEqual(['idle 16.7', 'reset', 'sample 20.0', 'sample 21.0', 'reset']);
  });

  it('a realistic session: a slow first glide steps down, a fast later glide steps back up', () => {
    const governor = createDprGovernor({ max: 1.5 });
    const gate = createFrameGate(governor);
    let t = 0;
    const go = (ticks: { ms: number; moving: boolean; draws: boolean }[]) => {
      const r = run(gate, ticks, t);
      t = r.t;
      return r.changes;
    };
    expect(go(idle(120))).toEqual([]); // arrive, glow pulse
    expect(go(glide(35, 33.3))).toEqual([1.25]); // arrive → seated on a busy GPU (a background tab rendering, say)
    expect(go(idle(300))).toEqual([]); // seated
    expect(go(glide(70, HZ60))).toEqual([1.5]); // seated → tv, now smooth: back to full resolution
    expect(go(idle(600, false))).toEqual([]); // the tv menu draws nothing
    expect(go(glide(70, HZ60))).toEqual([]); // later glides: stays at the cap
    expect(governor.ratio).toBe(1.5);
  });

  it('a glide too short for a window leaves no stale frames for the next one', () => {
    const governor = createDprGovernor({ max: 1.5 });
    const gate = createFrameGate(governor);
    let t = 0;
    for (let i = 0; i < 6; i++) {
      const g = run(gate, glide(15, 45), t); // 15 slow frames: never a full window of 20
      t = run(gate, idle(60), g.t).t;
      expect(g.changes).toEqual([]);
    }
    expect(governor.ratio).toBe(1.5);
  });
});
