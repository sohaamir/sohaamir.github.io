import { Box3, Color, Mesh, Raycaster, Vector2, Vector3, type MeshStandardMaterial, type Object3D } from 'three';
import { createCameraRig } from './camera-rig';
import { dive } from './dive';
import { createDprGovernor, createFrameGate, shouldRender, type FrameNeeds } from './frame-pacing';
import { bindOverlays } from './overlays';
import { attachPicking, type PickTarget, type Picking } from './picking';
import { addProps, holdRemote, loadPosterArt, paintRemoteLabels } from './props';
import { createRoom } from './room';
import { hasWebGL, showNoWebGL } from './fallback';
import { createSound } from './sound';
import { initialState, reduce, type Effect, type RoomEvent, type RoomState } from './state';
import { createTvScreen, rowAt, type TvScreen } from './tv-screen';

export type RoomHook = {
  state(): RoomState;
  dispatch(e: RoomEvent): void;
  ready: boolean;
  /** CSS-pixel position of a target's projected centre (null if it isn't in the scene yet). */
  screenPos(name: 'couch' | 'remote'): { x: number; y: number } | null;
  /** What the TV screen shows now (header, rows, preview line, whether it is on). */
  menu(): ReturnType<TvScreen['model']>;
  /** Whether the camera sits at a beat's pose (to check resets in tests). */
  cameraAt(beat: RoomState['beat']): boolean;
};

declare global {
  interface Window {
    __room?: RoomHook;
  }
}

const REDUCED_FADE_MS = 250;
const GLOW = new Color('#ffb070');

/** The glow-flagged materials under `obj` (collected once, so the idle pulse does no per-frame traversal). */
function glowMaterials(obj: Object3D): MeshStandardMaterial[] {
  const out = new Set<MeshStandardMaterial>();
  obj.traverse((o) => {
    const mat = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (mat?.userData?.glow) out.add(mat);
  });
  for (const m of out) m.emissive.copy(GLOW);
  return [...out];
}

/** Pulse glow materials (0 = off). */
function glow(mats: readonly MeshStandardMaterial[], k: number): void {
  for (const m of mats) m.emissiveIntensity = k;
}

/**
 * Keys aimed at a focused control stay with it: anything typed into a field, and
 * Enter/Space on a link or button. Other keys (1–6, arrows) still drive the room,
 * so e.g. clicking the sound toggle doesn't lock the keyboard menu.
 */
function keyBelongsToTarget(t: EventTarget | null, key: string): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.closest('input, select, textarea')) return true;
  return (key === 'Enter' || key === ' ') && !!t.closest('a, button');
}

export async function start(canvas: HTMLCanvasElement): Promise<void> {
  const startAtTv = new URLSearchParams(location.search).get('tv') === '1';
  let state = initialState({ startAt: startAtTv ? 'tv' : undefined });

  // No WebGL: build nothing 3D. `window.__room` stays undefined and the 2D menu takes over.
  if (!hasWebGL()) {
    showNoWebGL();
    return;
  }

  const room = createRoom(canvas);
  const life = new AbortController(); // every listener below dies with it
  const { signal } = life;
  let picking: Picking | null = null;
  let hook: RoomHook | null = null;
  try {
  const rig = createCameraRig(room.camera);
  // Read once, then follow changes; never queried in a hot path.
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;
  motionQuery.addEventListener('change', (ev) => (reducedMotion = ev.matches), { signal });
  const screen = createTvScreen(room.targets.tvScreen);
  const sound = createSound();
  const diveOverlay = document.querySelector<HTMLElement>('[data-dive-overlay]');
  let remote: Object3D | null = null;
  let posters: Object3D[] = [];
  let remoteGlow: MeshStandardMaterial[] = [];
  const couchGlow = glowMaterials(room.targets.couch);
  /**
   * The room renders on demand (frame-pacing.ts): mark it dirty whenever what is
   * on screen may have changed. The lamp's shadow map is static too, and is only
   * re-rendered when objects move (`shadows`), never for camera moves.
   */
  let dirty = true;
  const invalidate = (opts: { shadows?: boolean } = {}) => {
    dirty = true;
    if (opts.shadows) room.renderer.shadowMap.needsUpdate = true;
  };
  /** Set when we leave through the TV, so a bfcache restore knows to come back to the menu. */
  let dived = false;

  const run = (fx: Effect) => {
    if (fx.type === 'camera') {
      // A superseded move resolves false: its stale completion must not clear `moving`.
      if (reducedMotion) {
        // No glide: cut to the pose and cross-fade the canvas over 250 ms.
        canvas.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: REDUCED_FADE_MS, easing: 'ease-out' });
      }
      void rig.goTo(fx.to, { instant: reducedMotion }).then((done) => done && dispatch({ type: 'arrived' }));
    } else if (fx.type === 'tvOn') {
      sound.tvOn(); // inside the click/key that picked up the remote: a user gesture
      void screen.on({ flicker: !reducedMotion }).then(() => invalidate());
      if (remote) holdRemote(remote, room.camera);
    } else {
      dived = true;
      void dive(room.camera, room.targets.tvScreen, fx.path, { overlay: diveOverlay, reducedMotion });
    }
  };

  const updateOverlays = bindOverlays(
    (target) => dispatch({ type: 'select', target }),
    (index) => dispatch({ type: 'select', target: 'channel', index }),
  );
  updateOverlays(state);
  screen.render(state);

  function dispatch(e: RoomEvent): boolean {
    const r = reduce(state, e);
    const changed = r.state !== state;
    state = r.state;
    r.effects.forEach(run);
    if (changed) {
      updateOverlays(state);
      screen.render(state);
      picking?.refresh();
      invalidate();
    }
    return changed;
  }

  // Hover/select only what the current beat can use, and nothing mid-glide.
  const live = (t: PickTarget) =>
    !state.moving &&
    (t === 'couch' ? state.beat === 'arrive' : t === 'remote' ? state.beat === 'seated' : state.beat !== 'tv');

  const screenPos = (name: 'couch' | 'remote') => {
    const obj = name === 'couch' ? room.targets.couch : remote;
    if (!obj) return null;
    room.camera.updateMatrixWorld();
    obj.updateWorldMatrix(true, true);
    const p = new Box3().setFromObject(obj).getCenter(new Vector3()).project(room.camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  };

  hook = {
    state: () => state,
    dispatch: (e) => void dispatch(e),
    ready: false,
    screenPos,
    menu: () => screen.model(),
    cameraAt: (beat) => room.camera.position.distanceTo(rig.poseFor(beat).position) < 1e-3,
  };
  window.__room = hook;

  document.addEventListener('keydown', (ev) => {
    if (keyBelongsToTarget(ev.target, ev.key)) return;
    const mod = ev.ctrlKey || ev.metaKey || ev.altKey;
    const handled = dispatch({ type: 'key', key: ev.key, mod });
    if (handled && !mod) ev.preventDefault();
  }, { signal });

  // Speaker toggle: muted by default; the click is the gesture that may start audio.
  const soundButton = document.querySelector<HTMLButtonElement>('[data-room-sound]');
  soundButton?.setAttribute('aria-pressed', String(sound.enabled));
  soundButton?.addEventListener('click', () => soundButton.setAttribute('aria-pressed', String(sound.toggle())), { signal });

  // At the tv beat the menu rows on the screen are clickable too (mouse users without a keyboard).
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const rowUnder = (x: number, y: number): number | null => {
    if (state.beat !== 'tv' || state.moving) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, room.camera);
    const uv = raycaster.intersectObject(room.targets.tvScreen, false)[0]?.uv;
    return uv ? rowAt(uv) : null;
  };
  canvas.addEventListener('click', (ev) => {
    const index = rowUnder(ev.clientX, ev.clientY);
    if (index !== null) dispatch({ type: 'select', target: 'channel', index });
  }, { signal });
  canvas.addEventListener('pointermove', (ev) => {
    if (state.beat === 'tv') canvas.style.cursor = rowUnder(ev.clientX, ev.clientY) === null ? '' : 'pointer';
  }, { signal });

  // Back from a channel page restored from the bfcache (Review Focus 3): the page
  // was frozen at the end of the dive (overlay opaque, camera at the glass,
  // `moving`). Put it back at the menu, settled. A restore after leaving some
  // other way (the skip link at arrive) keeps its beat.
  addEventListener('pageshow', (ev) => {
    if (!ev.persisted || !dived) return;
    dived = false;
    dispatch({ type: 'back' });
    if (diveOverlay) {
      diveOverlay.style.transition = 'none';
      diveOverlay.style.opacity = '0';
    }
    void rig.goTo('tv', { instant: true });
    void screen.on({ flicker: false });
    if (remote) holdRemote(remote, room.camera);
    invalidate();
  }, { signal });

  // Refit the framing (the tv pose depends on aspect) when the window changes shape.
  addEventListener('resize', () => {
    if (!state.moving) void rig.goTo(state.beat, { instant: true });
    invalidate();
  }, { signal });

  await rig.goTo(state.beat, { instant: true });
  if (state.beat === 'tv') void screen.on({ flicker: false });

  // Draw the lit screen once, into a single pixel of the canvas, so the frame the TV
  // switches on (the start of the seated → tv glide) doesn't stall. Compiling alone is
  // not enough: ANGLE's Metal backend builds the GPU pipeline on the first real draw,
  // which cost 0.1–0.7 s at TV-on (R2 Task C). The first full frame covers the pixel.
  const warm = new Mesh(room.targets.tvScreen.geometry, screen.material);
  warm.frustumCulled = false;
  const prepareScreen = () => {
    const r = room.renderer;
    room.scene.add(warm);
    r.setScissorTest(true);
    r.setScissor(0, 0, 1, 1);
    r.render(room.scene, room.camera);
    r.setScissorTest(false);
    room.scene.remove(warm);
    invalidate();
  };
  prepareScreen();

  // A lost GPU context (GPU switch on a dual-GPU Mac, a discarded tab, memory
  // pressure) is restored by three.js, but on-demand rendering would leave the
  // canvas blank until the next input: re-upload and redraw once it is back.
  canvas.addEventListener('webglcontextlost', (ev) => ev.preventDefault(), { signal });
  canvas.addEventListener('webglcontextrestored', () => {
    prepareScreen();
    invalidate({ shadows: true });
  }, { signal });

  // Lower the resolution a step at a time if this machine can't keep up (retina + integrated GPU),
  // and back up when it can again. The gate (frame-pacing.ts) decides which frames count.
  const resolution = createDprGovernor({ max: room.renderer.getPixelRatio() });
  const gate = createFrameGate(resolution);
  let lastRender = -Infinity;
  const needs: FrameNeeds = { moving: false, pulsing: false, dirty: false }; // reused: no per-frame garbage
  room.renderer.setAnimationLoop((t) => {
    const arrive = state.beat === 'arrive' && !state.moving;
    const seated = state.beat === 'seated' && !state.moving && remoteGlow.length > 0;
    needs.moving = state.moving;
    needs.pulsing = arrive || seated;
    needs.dirty = dirty;
    const draws = shouldRender(t, lastRender, needs);
    const ratio = gate.tick(t, state.moving, draws);
    if (ratio !== null) room.renderer.setPixelRatio(ratio);
    if (!draws) return;
    dirty = false;
    lastRender = t;
    const pulse = 0.5 + 0.5 * Math.sin(t / 320);
    glow(couchGlow, arrive ? 0.02 + 0.06 * pulse : 0);
    glow(remoteGlow, seated ? 0.1 + 0.25 * pulse : 0);
    room.renderer.render(room.scene, room.camera);
  });

  try {
    const added = await addProps(room.scene, room.targets.table);
    remote = added.remote;
    posters = added.posters;
    remoteGlow = glowMaterials(remote);
    if (state.beat === 'tv') holdRemote(remote, room.camera);
    picking = attachPicking(
      room.camera,
      canvas,
      { couch: room.targets.couch, ...added },
      (e) => void dispatch(e),
      live,
      () => invalidate({ shadows: true }), // hover lifts the object a little
    );
    invalidate({ shadows: true });
  } finally {
    hook.ready = !signal.aborted;
  }
  // Off the load path: print the remote's key labels once the room is up.
  setTimeout(() => {
    if (!signal.aborted && remote && paintRemoteLabels(remote)) invalidate();
    // The wall posters' logos: one small atlas, fetched once the room is up.
    if (posters.length) void loadPosterArt(posters).then((ok) => ok && !signal.aborted && invalidate(), () => {});
  }, 0);
  } catch (err) {
    // Partial setup: stop everything the room started so the 2D fallback owns the page alone.
    life.abort();
    picking?.();
    if (window.__room === hook) delete window.__room;
    room.dispose();
    throw err;
  }
}
