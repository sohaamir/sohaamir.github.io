/**
 * Frame pacing for the room's render loop: draw only when something on screen can
 * change, and lower the resolution on machines that cannot keep up.
 */

/** The idle glow pulse is slow (≈2 s period), so ~30 fps is indistinguishable from 60. */
export const IDLE_FRAME_MS = 1000 / 30;
/** rAF timestamps jitter by a millisecond or two; don't skip a frame for that. */
const JITTER_MS = 2;

export type FrameNeeds = {
  /** A camera glide, dive or screen flicker is running: draw every frame. */
  moving: boolean;
  /** The idle glow pulse is showing (arrive / seated beats). */
  pulsing: boolean;
  /** Something changed since the last draw (state, hover, resize, props). */
  dirty: boolean;
};

export function shouldRender(now: number, lastRender: number, needs: FrameNeeds): boolean {
  if (needs.moving || needs.dirty) return true;
  return needs.pulsing && now - lastRender >= IDLE_FRAME_MS - JITTER_MS;
}

/**
 * Highest resolution scale. A full-screen retina canvas at 2× is 4× the pixels of 1×,
 * every one shaded with the lamp's shadow; 1.5× looks nearly as crisp.
 */
const MAX_PIXEL_RATIO = 1.5;

/**
 * Starting resolution and anti-aliasing for a display. On hi-DPI screens the pixel
 * density already hides jaggies and MSAA at 1.5× was the difference between
 * dropped frames and none on an integrated GPU (perf-probe, R2 Task B); standard
 * displays keep MSAA, where pixels are big and fill is cheap.
 */
export function renderQuality(devicePixelRatio: number): { pixelRatio: number; antialias: boolean } {
  return { pixelRatio: Math.min(devicePixelRatio, MAX_PIXEL_RATIO), antialias: devicePixelRatio < 1.5 };
}

export type DprGovernor = {
  readonly ratio: number;
  /** Feed one frame time (ms between two consecutive drawn frames). Returns the new ratio when it changes. */
  sample(frameMs: number): number | null;
  /**
   * Feed the interval after a display frame that drew nothing: pure rAF cadence, no
   * GPU work in it, so it tells a throttled browser from a slow GPU.
   */
  idle(intervalMs: number): void;
  /** Drop a partly filled window, so frames from different glides never share a decision. */
  reset(): void;
};

export type DprOptions = {
  /** Starting (and highest) pixel ratio. */
  max: number;
  /** Lowest pixel ratio (default 1, or `max` if that is lower). */
  min?: number;
  step?: number;
  /** Frames per decision (a 60 fps glide of ~1.15 s fills three). */
  window?: number;
  /** Step down when the window's median frame is slower than this (ms)... */
  slowMs?: number;
  /** Frame times above this are stalls (tab switch, GC, shader compile), not load: ignored. */
  stallMs?: number;
  /**
   * ...and step back up after `upWindows` windows in a row whose 90th-percentile frame
   * beats this. The run survives between glides (`reset()` only drops the partial window).
   */
  fastMs?: number;
  upWindows?: number;
};

/**
 * A browser saving power (Safari Low Power Mode, Chrome's battery saver) caps
 * requestAnimationFrame at 30 fps: every frame then takes ~33.3 ms however light
 * the GPU load is. Lowering the resolution would only blur the picture for nothing.
 */
const THROTTLED_MS = { low: 28, high: 38 } as const;
/** A frame is slow when it takes this much longer than the display's own period. */
const PERIOD_SLACK = 1.3;
/** Idle intervals kept to estimate the display's period (their minimum: rAF can't beat it). */
const PERIOD_SAMPLES = 8;

/**
 * Adaptive resolution. If the median frame of a window is slow, drop the pixel
 * ratio a step; after a long unbroken run of fast windows, try a step back up.
 *
 * Slow is judged against the display's measured period (from ticks that drew
 * nothing) when there is one: under rAF throttling (30 Hz) a 33 ms frame is on
 * time, while at 60 Hz a flat 33 ms is a GPU missing every vsync. With no period
 * measured yet, a flat ~33 ms cadence is taken for throttling and left alone.
 * A ratio that turns out too slow again right after stepping back up to it (before
 * `upWindows` fast windows confirm it) is never retried, so it cannot oscillate.
 */
export function createDprGovernor(opts: DprOptions): DprGovernor {
  const { max, step = 0.25, window = 20, slowMs = 22, stallMs = 500, fastMs = 18.5, upWindows = 3 } = opts;
  const min = Math.min(opts.min ?? 1, max);
  let ratio = max;
  let ceiling = max;
  let lastUp: number | null = null;
  let fastRun = 0;
  const buf: number[] = [];
  const idle: number[] = [];
  const round = (r: number) => Math.round(r * 100) / 100;

  const decide = (s: readonly number[]): number | null => {
    const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
    const median = at(0.5);
    const period = idle.length ? Math.min(...idle) : null;
    const slow =
      period !== null
        ? median > Math.max(slowMs, period * PERIOD_SLACK)
        : median > slowMs && !(at(0.1) >= THROTTLED_MS.low && at(0.9) <= THROTTLED_MS.high);
    if (slow) {
      fastRun = 0;
      if (ratio <= min) return null;
      if (ratio === lastUp) ceiling = round(ratio - step); // stepped up to it and it is slow again
      ratio = round(Math.max(min, ratio - step));
      lastUp = null;
      return ratio;
    }
    if (at(0.9) > fastMs) {
      fastRun = 0;
      return null;
    }
    if (++fastRun < upWindows) return null;
    fastRun = 0;
    lastUp = null; // this ratio has held up: a later slowdown is load, not a ratio set too high
    if (ratio >= ceiling) return null;
    ratio = round(Math.min(ceiling, ratio + step));
    lastUp = ratio;
    return ratio;
  };

  const sample = (ms: number): number | null => {
    if (!(ms > 0) || ms > stallMs) return null;
    buf.push(ms);
    if (buf.length < window) return null;
    buf.sort((a, b) => a - b);
    const changed = decide(buf);
    buf.length = 0;
    return changed;
  };

  return {
    get ratio() {
      return ratio;
    },
    sample,
    idle: (ms) => {
      if (!(ms > 0) || ms > stallMs) return;
      idle.push(ms);
      if (idle.length > PERIOD_SAMPLES) idle.shift();
    },
    reset: () => {
      buf.length = 0;
    },
  };
}

export type FrameGate = {
  /**
   * Call once per display tick, before drawing, with whether the camera is gliding
   * and whether this tick will draw. Returns a new pixel ratio when it changes.
   */
  tick(now: number, moving: boolean, draws: boolean): number | null;
};

/**
 * What the render loop feeds the governor. Only frames drawn back to back within one
 * glide measure what a frame costs: idle-pulse frames are paced at ~30 fps and a single
 * frame can hide inside the GPU's queue. The gap after a tick that drew nothing is the
 * display's own period (`idle`). A glide's start and end drop the partly filled window,
 * so frames from different glides never share a decision; the governor's count of fast
 * windows carries on, so a fast glide after a slow one can step back up.
 */
export function createFrameGate(governor: Pick<DprGovernor, 'sample' | 'idle' | 'reset'>): FrameGate {
  let lastTick: number | null = null;
  let drew = false;
  let wasMoving = false;
  return {
    tick(now, moving, draws) {
      let changed: number | null = null;
      if (lastTick !== null) {
        const ms = now - lastTick;
        if (!drew) governor.idle(ms);
        else if (moving && wasMoving) changed = governor.sample(ms);
      }
      if (moving !== wasMoving) governor.reset();
      lastTick = now;
      drew = draws;
      wasMoving = moving;
      return changed;
    },
  };
}

