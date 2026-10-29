import { describe, expect, it } from 'vitest';
import { Box3, Mesh, MeshBasicMaterial, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { REMOTE, REMOTE_KEYS, buildRemote, drawRemoteLabels } from '../../src/scene/props';

const meshes = (o: { traverse(f: (x: unknown) => void): void }) => {
  const out: Mesh[] = [];
  o.traverse((x) => (x as Mesh).isMesh && out.push(x as Mesh));
  return out;
};

describe('the remote', () => {
  it('is one object named "remote" and costs at most four draw calls', () => {
    const r = buildRemote(new Texture());
    expect(r.name).toBe('remote');
    expect(meshes(r).length).toBeLessThanOrEqual(4);
  });

  it('every lit part is glow-flagged (the idle pulse lights the whole remote); the LED stays unlit red', () => {
    const r = buildRemote(new Texture());
    const lit = meshes(r).filter((m) => (m.material as MeshStandardMaterial).isMeshStandardMaterial);
    expect(lit.length).toBeGreaterThanOrEqual(3); // body, keys, labels
    for (const m of lit) expect((m.material as MeshStandardMaterial).userData.glow).toBe(true);
    const led = r.getObjectByName('led') as Mesh;
    expect((led.material as MeshBasicMaterial).isMeshBasicMaterial).toBe(true);
    expect(led.position.z).toBeLessThan(REMOTE_KEYS[0].z); // the LED sits above the number pad
  });

  it('casts no shadow (it moves into the hand and the lamp shadow map is static)', () => {
    for (const m of meshes(buildRemote(new Texture()))) expect(m.castShadow).toBe(false);
  });

  it('has number keys 1–9 on a 3×3 grid in reading order with 0 centred below, all on the body', () => {
    expect(REMOTE_KEYS.map((k) => k.label)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
    for (const row of [REMOTE_KEYS.slice(0, 3), REMOTE_KEYS.slice(3, 6), REMOTE_KEYS.slice(6, 9)]) {
      expect(row[0].x).toBeLessThan(row[1].x);
      expect(row[1].x).toBeLessThan(row[2].x);
      expect(new Set(row.map((k) => k.z)).size).toBe(1);
    }
    expect(REMOTE_KEYS[3].z).toBeGreaterThan(REMOTE_KEYS[0].z); // 4–6 below 1–3 (towards the hand)
    expect(REMOTE_KEYS[9].x).toBe(0);
    expect(REMOTE_KEYS[9].z).toBeGreaterThan(REMOTE_KEYS[6].z);
    for (const k of REMOTE_KEYS) {
      expect(Math.abs(k.x) + k.r).toBeLessThan(REMOTE.width / 2 - 0.004);
      expect(Math.abs(k.z) + k.r).toBeLessThan(REMOTE.length / 2);
    }
  });

  it('without a label texture it still builds (no canvas in tests), with a body that tapers', () => {
    const r = buildRemote(null);
    const body = r.getObjectByName('remoteBody') as Mesh;
    const pos = body.geometry.getAttribute('position');
    const halfWidthNear = (zSign: number) => {
      let w = 0;
      for (let i = 0; i < pos.count; i++) if (Math.sign(pos.getZ(i)) === zSign) w = Math.max(w, Math.abs(pos.getX(i)));
      return w;
    };
    expect(halfWidthNear(1)).toBeLessThan(halfWidthNear(-1)); // narrower at the hand end
    r.rotation.set(0, 0, 0); // measure along the remote, not its turn on the table
    const size = new Box3().setFromObject(r).getSize(new Vector3());
    expect(size.z).toBeCloseTo(REMOTE.length, 2);
  });
});

describe('drawRemoteLabels', () => {
  it('prints each digit on its key (canvas ↔ remote top face; within 1 mm, letters sit under it)', () => {
    const texts: { t: string; x: number; y: number }[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_o, k) =>
          k === 'fillText'
            ? (t: string, x: number, y: number) => texts.push({ t, x, y })
            : k === 'measureText'
              ? () => ({ width: 10 })
              : () => {},
        set: () => true,
      },
    ) as CanvasRenderingContext2D;
    const pxPerM = 4000;
    drawRemoteLabels(ctx, pxPerM);
    for (const k of REMOTE_KEYS) {
      const d = texts.find((t) => t.t === k.label);
      expect(d, `digit ${k.label}`).toBeDefined();
      expect(d!.x).toBeCloseTo((k.x + REMOTE.width / 2) * pxPerM, 0);
      expect(Math.abs(d!.y - (k.z + REMOTE.length / 2) * pxPerM)).toBeLessThan(pxPerM / 1000);
    }
  });
});
