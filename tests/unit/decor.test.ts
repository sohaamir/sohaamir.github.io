import { describe, expect, it } from 'vitest';
import { Box3, Vector3, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { ROOM, couchExtras, decor, tableTop } from '../../src/scene/decor';

const meshes = (o: Object3D) => {
  const out: Mesh[] = [];
  o.traverse((x) => (x as Mesh).isMesh && out.push(x as Mesh));
  return out;
};

describe('room decor', () => {
  it('all the static detail costs a handful of draw calls', () => {
    expect(meshes(decor()).length).toBeLessThanOrEqual(4); // floor, fixtures, furniture, clickable speakers
  });

  it('walls, floor, rug and wall art receive shadows but never cast them; furniture casts', () => {
    const d = decor();
    for (const name of ['floor', 'fixtures']) {
      const m = d.getObjectByName(name) as Mesh;
      expect(m.castShadow).toBe(false);
      expect(m.receiveShadow).toBe(true);
    }
    expect((d.getObjectByName('furniture') as Mesh).castShadow).toBe(true);
  });

  it('stays inside the room', () => {
    const d = decor();
    d.updateMatrixWorld(true);
    const box = new Box3().setFromObject(d);
    const eps = 1e-3;
    expect(box.min.x).toBeGreaterThanOrEqual(-ROOM.halfWidth - eps);
    expect(box.max.x).toBeLessThanOrEqual(ROOM.halfWidth + eps);
    expect(box.min.y).toBeGreaterThanOrEqual(-eps);
    expect(box.max.y).toBeLessThanOrEqual(ROOM.height + eps);
    expect(box.min.z).toBeGreaterThanOrEqual(ROOM.back - eps);
    expect(box.max.z).toBeLessThanOrEqual(ROOM.front + eps);
  });

  it('the floor and rug are drawn about once per pixel (no full-size layer under the boards)', () => {
    const floor = decor().getObjectByName('floor') as Mesh;
    const pos = floor.geometry.getAttribute('position');
    const [a, b, c] = [new Vector3(), new Vector3(), new Vector3()];
    let upArea = 0;
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      if (Math.max(a.y, b.y, c.y) > 0.01) continue;
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      if (n.y > 0) upArea += n.length() / 2;
    }
    const floorArea = ROOM.halfWidth * 2 * (ROOM.front - ROOM.back);
    expect(upArea).toBeGreaterThan(floorArea); // boards, plus the rug on top
    expect(upArea).toBeLessThan(floorArea * 1.2);
  });

  it('the big surfaces skip the physically based shader: the floor is matte, the rest satin', () => {
    const d = decor();
    const type = (m: Mesh) => (m.material as MeshStandardMaterial).type;
    expect(type(d.getObjectByName('floor') as Mesh)).toBe('MeshLambertMaterial');
    for (const name of ['fixtures', 'furniture']) expect(type(d.getObjectByName(name) as Mesh)).toBe('MeshPhongMaterial');
    expect(type(couchExtras())).toBe('MeshPhongMaterial');
  });

  it('the cushions are one glowing mesh (they pulse and hover with the couch)', () => {
    const extras = couchExtras();
    expect(extras.isMesh).toBe(true);
    expect((extras.material as MeshStandardMaterial).userData.glow).toBe(true);
  });

  it('the table (top, legs, mug) is one mesh whose top is at the given height', () => {
    const t = tableTop(0.49);
    expect(t.isMesh).toBe(true);
    expect(t.castShadow).toBe(true);
    t.geometry.computeBoundingBox();
    const size = t.geometry.boundingBox!.getSize(new Vector3());
    expect(size.x).toBeCloseTo(1.3, 2);
    // The mug stands on the top, so the mesh rises above it, but not by more than a mug.
    expect(t.geometry.boundingBox!.max.y).toBeGreaterThan(0.49);
    expect(t.geometry.boundingBox!.max.y).toBeLessThan(0.49 + 0.12);
  });
});
