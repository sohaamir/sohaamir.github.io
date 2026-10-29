import { Vector3, type PerspectiveCamera } from 'three';
import type { Beat } from './state';

export type Pose = { position: Vector3; target: Vector3 };
export type CameraRig = {
  poseFor(b: Beat): Pose;
  /**
   * Move to a beat's pose. Resolves `true` when the move completes and `false`
   * when a newer `goTo` superseded it, so callers can ignore stale completions.
   */
  goTo(b: Beat, opts?: { instant?: boolean }): Promise<boolean>;
};

/** Beat-to-beat glide. Long enough to read as a move, short enough not to feel like waiting. */
const DURATION_MS = 1150;

/** Room layout (room.ts): couch at z≈1.6 facing −z, coffee table z≈0.3, TV screen centre (0, 1.1, −2.71). */
const POSES: Record<Beat, Pose> = {
  // Wide shot from behind the couch, slightly to the right.
  arrive: { position: new Vector3(0.8, 2.05, 4.3), target: new Vector3(0, 0.85, -1.4) },
  // Seated eye level on the couch, table in the near foreground.
  seated: { position: new Vector3(0, 1.15, 1.45), target: new Vector3(0, 0.62, -1.6) },
  // Eased in towards the screen.
  tv: { position: new Vector3(0, 1.1, -1.05), target: new Vector3(0, 1.07, -2.71) },
};

/** TV screen (room.ts): 1.5 m wide, its glass at z = −2.744. */
const SCREEN = { halfWidth: 0.75, z: -2.744 };
/** Leave a little wall either side of the screen when backing off to fit it. */
const FIT_MARGIN = 1.08;

/** Gentler than cubic at both ends with a lower peak speed (π/2 vs 3× the mean), so motion starts at once. */
export function easeInOutSine(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return (1 - Math.cos(Math.PI * t)) / 2;
}

export function createCameraRig(camera: PerspectiveCamera): CameraRig {
  const target = new Vector3();
  let cancel: (() => void) | null = null;

  const place = (position: Vector3, look: Vector3) => {
    camera.position.copy(position);
    target.copy(look);
    camera.lookAt(target);
  };

  /**
   * The beat's pose for the camera's current aspect. At narrow (portrait) aspects
   * the tv close-up backs straight off along its view line until the whole
   * screen fits across the frame, so the menu is never cropped on a phone.
   */
  const poseFor = (b: Beat): Pose => {
    const position = POSES[b].position.clone();
    const target = POSES[b].target.clone();
    if (b === 'tv') {
      const tanHalf = Math.tan(((camera.fov / 2) * Math.PI) / 180);
      const needDepth = (SCREEN.halfWidth * FIT_MARGIN) / (tanHalf * camera.aspect);
      const depth = position.z - SCREEN.z;
      if (needDepth > depth) {
        const back = position.clone().sub(target).normalize();
        position.addScaledVector(back, (needDepth - depth) / back.z);
      }
    }
    return { position, target };
  };

  const goTo = (b: Beat, opts: { instant?: boolean } = {}): Promise<boolean> => {
    cancel?.();
    const to = poseFor(b);
    if (opts.instant) {
      place(to.position, to.target);
      return Promise.resolve(true);
    }
    const fromPos = camera.position.clone();
    const fromTarget = target.clone();
    const pos = new Vector3();
    const look = new Vector3();
    return new Promise((resolve) => {
      // The clock starts on the first drawn frame: a slow frame right after the key
      // press then delays the glide instead of making it jump ahead.
      let start = -1;
      let frame = 0;
      const finish = (completed: boolean) => {
        cancelAnimationFrame(frame);
        cancel = null;
        resolve(completed);
      };
      const step = (now: number) => {
        if (start < 0) start = now;
        const k = easeInOutSine(Math.min(1, (now - start) / DURATION_MS));
        place(pos.lerpVectors(fromPos, to.position, k), look.lerpVectors(fromTarget, to.target, k));
        if (k < 1) frame = requestAnimationFrame(step);
        else finish(true);
      };
      cancel = () => finish(false);
      frame = requestAnimationFrame(step);
    });
  };

  return { poseFor, goTo };
}
