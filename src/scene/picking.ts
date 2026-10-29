import { Color, Raycaster, Vector2, type Material, type Mesh, type MeshStandardMaterial, type Object3D, type PerspectiveCamera } from 'three';
import type { RoomEvent } from './state';

export type PickTarget = 'couch' | 'remote' | 'prop';
export type Pickables = { couch: Object3D; remote: Object3D; props: Object3D[] };
/** Detach (restore everything, remove listeners); `refresh()` re-checks the hover after a state change. */
export type Picking = (() => void) & { refresh(): void };

const GLOW = new Color('#ffb070');
const GLOW_INTENSITY = 0.22;
const LIFT = 0.02; // metres

type Entry = { target: PickTarget; root: Object3D; glowFor: Map<Material, Material> };

const isEmissive = (m: Material): m is MeshStandardMaterial => 'emissive' in m;

/**
 * Click/tap picking and hover feedback for the room's targets (spec §3.1–3.2).
 * Hover swaps in per-pickable glow clones of each emissive material and lifts the
 * object slightly; leaving puts the original material objects and height back,
 * so nothing shared with other meshes is ever modified. `live(target)` gates both
 * hover and selection (default: always live). `onChange` fires whenever the hover
 * changes what is drawn (the room renders on demand). A prop with `userData.href`
 * (the easter eggs) opens that link in a new tab when clicked.
 */
export function attachPicking(
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  pickables: Pickables,
  dispatch: (e: RoomEvent) => void,
  live: (t: PickTarget) => boolean = () => true,
  onChange: () => void = () => {},
  openLink: (href: string) => void = (href) => void window.open(href, '_blank', 'noopener'),
): Picking {
  const entries: Entry[] = [
    { target: 'couch' as const, root: pickables.couch },
    { target: 'remote' as const, root: pickables.remote },
    ...pickables.props.map((root) => ({ target: 'prop' as const, root })),
  ].map((e) => ({ ...e, glowFor: new Map() }));

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  let pointerAt: { x: number; y: number } | null = null;
  let hovered: { entry: Entry; liftedY: number; swapped: { mesh: Mesh; original: Material }[] } | null = null;

  const entryOf = (o: Object3D | null): Entry | undefined => {
    for (let n = o; n; n = n.parent) {
      const e = entries.find((x) => x.root === n);
      if (e) return e;
    }
    return undefined;
  };

  /** The closest pickable under the pointer, if it is live (a dead one in front still blocks). */
  const pick = (x: number, y: number): Entry | undefined => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(entries.map((e) => e.root), true)[0];
    const entry = hit && entryOf(hit.object);
    return entry && live(entry.target) ? entry : undefined;
  };

  const glowClone = (entry: Entry, m: MeshStandardMaterial): Material => {
    let c = entry.glowFor.get(m) as MeshStandardMaterial | undefined;
    if (!c) {
      c = m.clone();
      delete c.userData.glow; // main.ts's idle pulse must not overwrite the hover glow
      c.emissive.copy(GLOW);
      c.emissiveIntensity = GLOW_INTENSITY;
      entry.glowFor.set(m, c);
    }
    return c;
  };

  /** Returns whether anything was hovered. */
  const unhover = (): boolean => {
    if (!hovered) return false;
    const { entry, liftedY, swapped } = hovered;
    // If something else re-placed the object meanwhile (holdRemote), leave it where it is.
    if (!entry.root.userData.onWall && entry.root.position.y === liftedY) entry.root.position.y -= LIFT;
    for (const { mesh, original } of swapped) if (entry.glowFor.get(original) === mesh.material) mesh.material = original;
    hovered = null;
    canvas.style.cursor = '';
    return true;
  };

  const hover = (entry: Entry | undefined) => {
    if (hovered?.entry === entry) return;
    const changed = unhover();
    if (!entry) {
      if (changed) onChange();
      return;
    }
    const swapped: { mesh: Mesh; original: Material }[] = [];
    entry.root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material) || !isEmissive(mesh.material)) return;
      swapped.push({ mesh, original: mesh.material });
      mesh.material = glowClone(entry, mesh.material);
    });
    if (!entry.root.userData.onWall) entry.root.position.y += LIFT; // wall posters glow but stay put
    hovered = { entry, liftedY: entry.root.position.y, swapped };
    canvas.style.cursor = 'pointer';
    onChange();
  };

  const refresh = () => hover(pointerAt ? pick(pointerAt.x, pointerAt.y) : undefined);

  const onMove = (ev: Event) => {
    const e = ev as PointerEvent;
    if (e.pointerType === 'touch') return; // no hover on touch; taps arrive as clicks
    pointerAt = { x: e.clientX, y: e.clientY };
    refresh();
  };
  const onLeave = () => {
    pointerAt = null;
    if (unhover()) onChange();
  };
  const onClick = (ev: Event) => {
    const e = ev as MouseEvent;
    const entry = pick(e.clientX, e.clientY);
    if (!entry) return;
    if (entry.target === 'prop') {
      const href = entry.root.userData.href as string | undefined;
      if (href) openLink(href);
      return;
    }
    if (unhover()) onChange(); // put things back before the beat changes (the remote moves to the hand)
    dispatch({ type: 'select', target: entry.target });
  };

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);

  const detach = () => {
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('click', onClick);
    unhover();
    for (const e of entries) for (const c of e.glowFor.values()) c.dispose();
  };
  return Object.assign(detach, { refresh });
}
