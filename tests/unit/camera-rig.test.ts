import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { createCameraRig, easeInOutSine } from '../../src/scene/camera-rig';

/** The previous easing, for comparison. */
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

describe('camera rig', () => {
  it('easeInOutSine is 0 → 0.5 → 1, symmetric, and gets going sooner than cubic', () => {
    expect(easeInOutSine(0)).toBe(0);
    expect(easeInOutSine(0.5)).toBeCloseTo(0.5);
    expect(easeInOutSine(1)).toBe(1);
    expect(easeInOutSine(0.25)).toBeCloseTo(1 - easeInOutSine(0.75));
    // A gentler start and a lower peak speed than cubic: the glide starts visibly on the first frames.
    expect(easeInOutSine(0.1)).toBeGreaterThan(easeInOutCubic(0.1) * 4);
    let last = 0;
    for (let t = 0; t <= 1; t += 0.05) {
      expect(easeInOutSine(t)).toBeGreaterThanOrEqual(last);
      last = easeInOutSine(t);
    }
  });

  it('beat poses: seated is lower than arrive, tv is closer to the screen than seated', () => {
    const rig = createCameraRig(new PerspectiveCamera());
    const arrive = rig.poseFor('arrive');
    const seated = rig.poseFor('seated');
    const tv = rig.poseFor('tv');
    expect(seated.position.y).toBeLessThan(arrive.position.y);
    expect(tv.position.distanceTo(tv.target)).toBeLessThan(seated.position.distanceTo(seated.target));
    // Every beat looks towards the back wall (negative z).
    for (const p of [arrive, seated, tv]) expect(p.target.z).toBeLessThan(p.position.z);
  });

  it('poseFor returns copies that cannot mutate the rig', () => {
    const rig = createCameraRig(new PerspectiveCamera());
    rig.poseFor('tv').position.set(99, 99, 99);
    expect(rig.poseFor('tv').position.x).not.toBe(99);
  });

  it('goTo instant places the camera at the pose and looks at the target', async () => {
    const camera = new PerspectiveCamera();
    const rig = createCameraRig(camera);
    await rig.goTo('seated', { instant: true });
    const { position, target } = rig.poseFor('seated');
    expect(camera.position.distanceTo(position)).toBeLessThan(1e-9);
    const forward = camera.getWorldDirection(new Vector3());
    const want = target.clone().sub(position).normalize();
    expect(forward.distanceTo(want)).toBeLessThan(1e-6);
  });

  describe('completion (stale tweens)', () => {
    afterEach(() => vi.unstubAllGlobals());

    /** Manual rAF: frames run only when the test calls `tick(ms)`. */
    const manualFrames = () => {
      let now = 0;
      let queue: FrameRequestCallback[] = [];
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
      vi.stubGlobal('cancelAnimationFrame', () => {});
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      return (ms: number) => {
        now += ms;
        const run = queue;
        queue = [];
        run.forEach((cb) => cb(now));
      };
    };

    it('a tween that runs to the end resolves true', async () => {
      const tick = manualFrames();
      const rig = createCameraRig(new PerspectiveCamera());
      await rig.goTo('arrive', { instant: true });
      const done = rig.goTo('seated');
      tick(16);
      tick(1200);
      expect(await done).toBe(true);
    });

    const settledFlag = (p: Promise<boolean>) => {
      const f = { done: false };
      void p.then(() => (f.done = true));
      return f;
    };
    const flush = () => new Promise((r) => setTimeout(r, 0));

    it('a glide takes ~1.15 s, timed from its first drawn frame', async () => {
      const tick = manualFrames();
      const rig = createCameraRig(new PerspectiveCamera());
      await rig.goTo('arrive', { instant: true });
      const f = settledFlag(rig.goTo('seated'));
      tick(16); // first frame: the clock starts here
      tick(1080);
      await flush();
      expect(f.done).toBe(false);
      tick(100);
      await flush();
      expect(f.done).toBe(true);
    });

    it('a late first frame (a hitch after the key press) starts the glide from rest instead of jumping ahead', async () => {
      const tick = manualFrames();
      const camera = new PerspectiveCamera();
      const rig = createCameraRig(camera);
      await rig.goTo('arrive', { instant: true });
      void rig.goTo('seated');
      tick(250);
      expect(camera.position.distanceTo(rig.poseFor('arrive').position)).toBeLessThan(1e-9);
      tick(16);
      expect(camera.position.distanceTo(rig.poseFor('arrive').position)).toBeGreaterThan(0);
    });

    it('a superseded tween resolves false, so a stale "arrived" can be ignored', async () => {
      manualFrames();
      const rig = createCameraRig(new PerspectiveCamera());
      const first = rig.goTo('seated');
      const second = rig.goTo('tv', { instant: true });
      expect(await first).toBe(false);
      expect(await second).toBe(true);
    });
  });

  describe('portrait framing', () => {
    const SCREEN_Z = -2.744;
    const SCREEN_HALF_WIDTH = 0.75;
    const halfWidthAtScreen = (camera: PerspectiveCamera, z: number) =>
      (z - SCREEN_Z) * Math.tan(((camera.fov / 2) * Math.PI) / 180) * camera.aspect;

    it('at a phone aspect the tv pose backs off so the whole screen fits across', () => {
      const camera = new PerspectiveCamera(50, 390 / 844);
      const tv = createCameraRig(camera).poseFor('tv');
      expect(halfWidthAtScreen(camera, tv.position.z)).toBeGreaterThanOrEqual(SCREEN_HALF_WIDTH);
      // Still looking straight at the screen, and still in front of the couch.
      expect(tv.target.z).toBeCloseTo(-2.71);
      expect(tv.position.z).toBeLessThan(1.4);
    });

    it('at a landscape aspect the tv pose is the close-up', () => {
      const camera = new PerspectiveCamera(50, 1280 / 800);
      const tv = createCameraRig(camera).poseFor('tv');
      expect(tv.position.z).toBeCloseTo(-1.05);
    });
  });
});
