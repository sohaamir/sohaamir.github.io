import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Color, CylinderGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Kit, matte, painted, satin } from '../../src/scene/kit';

const colorAt = (attr: { getX(i: number): number; getY(i: number): number; getZ(i: number): number }, i: number) =>
  new Color(attr.getX(i), attr.getY(i), attr.getZ(i));

describe('Kit', () => {
  it('merges many differently coloured parts into one mesh (one draw call)', () => {
    const kit = new Kit();
    kit.add(new BoxGeometry(1, 1, 1), '#ff0000');
    kit.add(new CylinderGeometry(0.2, 0.2, 1, 6), '#00ff00', { at: [3, 0, 0] });
    kit.add(new RoundedBoxGeometry(0.5, 0.5, 0.5, 1, 0.05), '#0000ff', { at: [0, 2, 0] });
    expect(kit.size).toBe(3);
    const mesh = kit.build(painted());
    expect(mesh.isMesh).toBe(true);
    expect(mesh.children).toEqual([]);
    const g = mesh.geometry;
    expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
    expect(g.getAttribute('normal').count).toBe(g.getAttribute('position').count);
    // The first vertex belongs to the red box; the last to the blue rounded box.
    expect(colorAt(g.getAttribute('color'), 0).getHexString()).toBe('ff0000');
    expect(colorAt(g.getAttribute('color'), g.getAttribute('position').count - 1).getHexString()).toBe('0000ff');
  });

  it('bakes each part’s placement (position, rotation, scale) into the vertices', () => {
    const kit = new Kit();
    kit.add(new BoxGeometry(2, 1, 1), '#ffffff', { at: [5, 1, -2], rot: [0, Math.PI / 2, 0], scale: [1, 3, 1] });
    const box = new Box3().setFromBufferAttribute(kit.build(painted()).geometry.getAttribute('position') as never);
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    expect(size.x).toBeCloseTo(1); // turned 90°: its 2 m side now runs along z
    expect(size.y).toBeCloseTo(3);
    expect(size.z).toBeCloseTo(2);
    expect(centre.toArray().map((v) => +v.toFixed(6))).toEqual([5, 1, -2]);
  });

  it('can shade a part per vertex (e.g. walls darkening towards the ceiling)', () => {
    const kit = new Kit();
    kit.add(new BoxGeometry(1, 2, 1), (p) => new Color(p.y > 0 ? '#000000' : '#ffffff'), { at: [0, 1, 0] });
    const g = kit.build(painted()).geometry;
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    for (let i = 0; i < pos.count; i++) expect(col.getX(i)).toBe(pos.getY(i) > 0 ? 0 : 1);
  });

  it('builds with the shadow flags asked for, and painted() is smooth-shaded with vertex colours', () => {
    const kit = new Kit();
    kit.add(new BoxGeometry(), '#888888');
    const mat = painted({ roughness: 0.4, glow: true });
    const mesh = kit.build(mat, { cast: true });
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.material).toBe(mat);
    expect(mat.vertexColors).toBe(true);
    expect(mat.flatShading).toBe(false);
    expect(mat.roughness).toBe(0.4);
    expect(mat.userData.glow).toBe(true);
    expect(new Kit().add(new BoxGeometry(), '#888888').build(painted()).castShadow).toBe(false);
  });

  it('matte() is the diffuse-only (Lambert) twin of painted(), optionally glow-flagged', () => {
    const m = matte({ glow: true });
    expect(m.type).toBe('MeshLambertMaterial');
    expect(m.vertexColors).toBe(true);
    expect(m.flatShading).toBe(false);
    expect(m.userData.glow).toBe(true);
    expect(matte().userData.glow).toBeUndefined();
  });

  it('satin() is a cheaper Blinn-Phong twin with a soft sheen, optionally glow-flagged', () => {
    const m = satin({ glow: true });
    expect(m.type).toBe('MeshPhongMaterial');
    expect(m.vertexColors).toBe(true);
    expect(m.flatShading).toBe(false);
    expect(m.shininess).toBeLessThan(10); // broad, soft highlight: rough surfaces
    expect(m.userData.glow).toBe(true);
    expect(satin().userData.glow).toBeUndefined();
  });

  it('refuses to build an empty kit', () => {
    expect(() => new Kit().build(painted())).toThrow();
  });
});
