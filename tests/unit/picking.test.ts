import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Texture, Vector3, type Material } from 'three';
import { attachPicking, type PickTarget } from '../../src/scene/picking';
import { buildRemote } from '../../src/scene/props';
import type { RoomEvent } from '../../src/scene/state';

/** A minimal canvas stand-in: an EventTarget with a 200×100 rect and a style. */
function fakeCanvas() {
  const t = new EventTarget() as EventTarget & { style: { cursor: string }; getBoundingClientRect(): DOMRect };
  t.style = { cursor: '' };
  t.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
  return t as unknown as HTMLCanvasElement;
}

function pointer(type: string, x: number, y: number, pointerType = 'mouse'): Event {
  return Object.assign(new Event(type), { clientX: x, clientY: y, pointerType });
}

const block = (x: number, mat = new MeshStandardMaterial({ color: '#884422' })) => {
  const g = new Group();
  g.add(new Mesh(new BoxGeometry(0.5, 0.5, 0.5), mat));
  g.position.set(x, 0, 0);
  g.updateMatrixWorld(true);
  return g;
};

/** Screen x (CSS px, 200-wide canvas) of world x on the z=0 plane for the test camera. */
const sx = (camera: PerspectiveCamera, x: number) => ((new Vector3(x, 0, 0).project(camera).x + 1) / 2) * 200;

describe('attachPicking', () => {
  let camera: PerspectiveCamera;
  let canvas: HTMLCanvasElement;
  let couch: Group;
  let remote: Group;
  let prop: Group;
  let dispatch: ReturnType<typeof vi.fn<(e: RoomEvent) => void>>;
  const shared = new MeshStandardMaterial({ color: '#334455' });

  beforeEach(() => {
    camera = new PerspectiveCamera(50, 2, 0.1, 50);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    canvas = fakeCanvas();
    couch = block(-1.2);
    remote = block(0);
    // The remote also has an unlit part (no emissive) that must be left alone.
    remote.add(new Mesh(new BoxGeometry(0.1, 0.1, 0.1), new MeshBasicMaterial({ color: 'red' })));
    prop = block(1.2, shared);
    dispatch = vi.fn<(e: RoomEvent) => void>();
  });

  const attach = (live?: (t: PickTarget) => boolean) =>
    attachPicking(camera, canvas, { couch, remote, props: [prop] }, dispatch, live);

  it('clicking the couch or the remote dispatches select; a prop or empty space dispatches nothing', () => {
    attach();
    canvas.dispatchEvent(pointer('click', sx(camera, -1.2), 50));
    canvas.dispatchEvent(pointer('click', sx(camera, 0), 50));
    canvas.dispatchEvent(pointer('click', sx(camera, 1.2), 50));
    canvas.dispatchEvent(pointer('click', 2, 2));
    expect(dispatch.mock.calls).toEqual([
      [{ type: 'select', target: 'couch' }],
      [{ type: 'select', target: 'remote' }],
    ]);
  });

  it('clicking a prop with userData.href opens that link and dispatches nothing', () => {
    const openLink = vi.fn<(href: string) => void>();
    const egg = block(1.2);
    egg.userData.href = 'https://example.org/';
    attachPicking(camera, canvas, { couch, remote, props: [egg] }, dispatch, undefined, undefined, openLink);
    canvas.dispatchEvent(pointer('click', sx(camera, 1.2), 50));
    expect(openLink).toHaveBeenCalledWith('https://example.org/');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('hover glows and lifts the target and sets a pointer cursor; leaving restores everything exactly', () => {
    attach();
    const mesh = remote.children[0] as Mesh;
    const unlit = remote.children[1] as Mesh;
    const original = mesh.material as MeshStandardMaterial;
    const unlitMat = unlit.material;
    const y0 = remote.position.y;

    canvas.dispatchEvent(pointer('pointermove', sx(camera, 0), 50));
    expect(canvas.style.cursor).toBe('pointer');
    expect(remote.position.y).toBeGreaterThan(y0);
    expect(mesh.material).not.toBe(original);
    expect((mesh.material as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0);
    expect(unlit.material).toBe(unlitMat);
    expect(original.emissiveIntensity).toBe(1); // the original is never touched
    expect(original.emissive.getHex()).toBe(0);

    canvas.dispatchEvent(pointer('pointermove', 2, 2));
    expect(canvas.style.cursor).toBe('');
    expect(remote.position.y).toBe(y0);
    expect(mesh.material).toBe(original);
  });

  it('hovering a prop whose material is shared does not leak glow onto other meshes', () => {
    const elsewhere = new Mesh(new BoxGeometry(), shared);
    attach();
    canvas.dispatchEvent(pointer('pointermove', sx(camera, 1.2), 50));
    expect((prop.children[0] as Mesh).material).not.toBe(shared);
    expect(elsewhere.material).toBe(shared);
    expect(shared.emissive.getHex()).toBe(0);
  });

  it('touch pointers do not hover, but taps (click) still select', () => {
    attach();
    canvas.dispatchEvent(pointer('pointermove', sx(camera, 0), 50, 'touch'));
    expect(canvas.style.cursor).toBe('');
    canvas.dispatchEvent(pointer('click', sx(camera, 0), 50, 'touch'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'select', target: 'remote' });
  });

  it('targets that are not live neither hover nor select', () => {
    attach((t) => t !== 'couch');
    canvas.dispatchEvent(pointer('pointermove', sx(camera, -1.2), 50));
    expect(canvas.style.cursor).toBe('');
    canvas.dispatchEvent(pointer('click', sx(camera, -1.2), 50));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('clicking clears the hover before dispatching, and refresh() re-checks liveness', () => {
    let live = true;
    const picking = attach(() => live);
    const y0 = couch.position.y;
    canvas.dispatchEvent(pointer('pointermove', sx(camera, -1.2), 50));
    expect(couch.position.y).toBeGreaterThan(y0);
    dispatch.mockImplementation(() => {
      // By the time the reducer runs, the couch is back at rest.
      expect(couch.position.y).toBe(y0);
      live = false;
    });
    canvas.dispatchEvent(pointer('click', sx(camera, -1.2), 50));
    picking.refresh();
    expect(couch.position.y).toBe(y0);
    expect(canvas.style.cursor).toBe('');
  });

  it('a target moved elsewhere while hovered (e.g. into the hand) is not pulled back down on leave', () => {
    attach();
    canvas.dispatchEvent(pointer('pointermove', sx(camera, 0), 50));
    remote.position.set(3, 3, 3); // holdRemote places it absolutely
    canvas.dispatchEvent(pointer('pointerleave', 0, 0));
    expect(remote.position.toArray()).toEqual([3, 3, 3]);
  });

  it('reports each hover change (so the render loop can redraw on demand), and only changes', () => {
    const onChange = vi.fn();
    attachPicking(camera, canvas, { couch, remote, props: [prop] }, dispatch, undefined, onChange);
    canvas.dispatchEvent(pointer('pointermove', sx(camera, 0), 50));
    expect(onChange).toHaveBeenCalledTimes(1);
    canvas.dispatchEvent(pointer('pointermove', sx(camera, 0) + 1, 50)); // still on the remote
    expect(onChange).toHaveBeenCalledTimes(1);
    canvas.dispatchEvent(pointer('pointermove', sx(camera, -1.2), 50)); // remote off, couch on
    expect(onChange).toHaveBeenCalledTimes(2);
    canvas.dispatchEvent(pointer('pointerleave', 0, 0));
    expect(onChange).toHaveBeenCalledTimes(3);
    canvas.dispatchEvent(pointer('pointermove', 2, 2)); // empty space, nothing was hovered
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('the real multi-mesh remote glows as a whole and every part gets its exact material back', () => {
    const labels = new Texture();
    const real = buildRemote(labels);
    real.position.set(0, 0, 0);
    real.rotation.set(Math.PI / 2, 0, 0); // face the camera so the pointer lands on it
    real.scale.setScalar(4);
    real.updateMatrixWorld(true);
    attachPicking(camera, canvas, { couch, remote: real, props: [prop] }, dispatch);
    const parts: Mesh[] = [];
    real.traverse((o) => (o as Mesh).isMesh && parts.push(o as Mesh));
    expect(parts.length).toBeGreaterThan(2);
    const originals = new Map<Mesh, Material>(parts.map((m) => [m, m.material as Material]));
    const isLit = (m: Mesh) => 'emissive' in (originals.get(m) as object);

    const clonesSeen = new Set<Material>();
    for (let cycle = 0; cycle < 3; cycle++) {
      canvas.dispatchEvent(pointer('pointermove', sx(camera, 0), 50));
      for (const m of parts) {
        if (!isLit(m)) {
          expect(m.material).toBe(originals.get(m)); // the unlit power key is left alone
          continue;
        }
        const c = m.material as MeshStandardMaterial;
        expect(c).not.toBe(originals.get(m));
        expect(c.emissiveIntensity).toBeGreaterThan(0);
        expect(c.userData.glow).toBeUndefined(); // the idle pulse must not overwrite it
        clonesSeen.add(c);
      }
      const decal = real.getObjectByName('remoteLabels') as Mesh;
      expect((decal.material as MeshStandardMaterial).map).toBe(labels); // labels stay printed while it glows
      canvas.dispatchEvent(pointer('pointermove', 2, 2));
      for (const m of parts) expect(m.material).toBe(originals.get(m));
    }
    expect(clonesSeen.size).toBe(parts.filter(isLit).length); // one clone per material, reused every hover
    for (const m of originals.values()) expect((m as MeshStandardMaterial).emissiveIntensity ?? 1).toBe(1);
  });

  it('detach removes listeners, restores materials and resets the cursor', () => {
    const picking = attach();
    const mesh = couch.children[0] as Mesh;
    const original = mesh.material;
    canvas.dispatchEvent(pointer('pointermove', sx(camera, -1.2), 50));
    picking();
    expect(mesh.material).toBe(original);
    expect(canvas.style.cursor).toBe('');
    canvas.dispatchEvent(pointer('click', sx(camera, -1.2), 50));
    expect(dispatch).not.toHaveBeenCalled();
  });
});
