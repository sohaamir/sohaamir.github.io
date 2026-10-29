import { Vector3, type Mesh, type PerspectiveCamera } from 'three';
import { withBase } from '../lib/url';
import { easeInOutSine } from './camera-rig';

const DURATION_MS = 700;
const REDUCED_MS = 200;
/** How far in front of the glass the push ends (metres; beyond the 0.05 near plane, so the glass is never clipped). */
const STOP_SHORT = 0.08;
/** The fade to blue starts this far into the push. */
const FADE_FROM = 0.4;

/** Overlay opacity over the push (k in 0..1): clear at first, then up to fully blue. */
export function diveOpacity(k: number): number {
  if (k <= FADE_FROM) return 0;
  return Math.min(1, ((k - FADE_FROM) / (1 - FADE_FROM)) ** 1.5);
}

export type DiveDeps = {
  overlay?: HTMLElement | null;
  reducedMotion?: boolean;
  /** Defaults: history.replaceState / location.href. */
  replaceUrl?: (url: string) => void;
  navigate?: (url: string) => void;
};

/**
 * Push the camera through the TV glass (spec §3.4): tween up to the screen over
 * ~0.7 s while a full-viewport overlay fades to the screen's blue, then go to
 * the channel. Before leaving, the current history entry becomes the menu
 * (`/?tv=1`) so browser Back returns to the TV, with or without bfcache.
 */
export function dive(camera: PerspectiveCamera, screen: Mesh, path: string, deps: DiveDeps = {}): Promise<void> {
  const overlay = deps.overlay !== undefined ? deps.overlay : document.querySelector<HTMLElement>('[data-dive-overlay]');
  const replaceUrl = deps.replaceUrl ?? ((url: string) => history.replaceState(history.state, '', url));
  const navigate = deps.navigate ?? ((url: string) => void (location.href = url));
  const duration = deps.reducedMotion ? REDUCED_MS : DURATION_MS;

  screen.updateWorldMatrix(true, false);
  const glass = screen.getWorldPosition(new Vector3());
  const normal = new Vector3(0, 0, 1).transformDirection(screen.matrixWorld);
  const fromPos = camera.position.clone();
  const toPos = glass.clone().addScaledVector(normal, STOP_SHORT);
  const fromLook = camera.position.clone().add(camera.getWorldDirection(new Vector3()));
  const pos = new Vector3();
  const look = new Vector3();
  if (overlay) overlay.style.transition = 'none';

  return new Promise((resolve) => {
    let start = -1; // set on the first frame (see camera-rig)
    const step = (now: number) => {
      if (start < 0) start = now;
      const k = Math.min(1, (now - start) / duration);
      if (!deps.reducedMotion) {
        const e = easeInOutSine(k);
        camera.position.copy(pos.lerpVectors(fromPos, toPos, e));
        camera.lookAt(look.lerpVectors(fromLook, glass, Math.min(1, e * 2)));
      }
      if (overlay) overlay.style.opacity = String(deps.reducedMotion ? k : diveOpacity(k));
      if (k < 1) {
        requestAnimationFrame(step);
        return;
      }
      replaceUrl(withBase('/?tv=1'));
      navigate(withBase(path));
      resolve();
    };
    requestAnimationFrame(step);
  });
}
