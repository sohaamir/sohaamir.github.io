import { describe, expect, it } from 'vitest';
import { Vector3, type Light, type PointLight, type SpotLight } from 'three';
import { lamp } from '../../src/scene/room';

const lights = (o: ReturnType<typeof lamp>) => {
  const out: Light[] = [];
  o.traverse((x) => (x as Light).isLight && out.push(x as Light));
  return out;
};

describe('floor lamp lighting', () => {
  it('no point light casts a shadow (cube shadow maps come out garbled on ANGLE Metal)', () => {
    const points = lights(lamp()).filter((l) => (l as PointLight).isPointLight);
    expect(points.length).toBe(1);
    for (const p of points) expect(p.castShadow).toBe(false);
  });

  it('one spotlight at the bulb casts the shadows, aimed between the table and the couch', () => {
    const g = lamp();
    g.updateMatrixWorld(true);
    const spots = lights(g).filter((l) => (l as SpotLight).isSpotLight) as SpotLight[];
    expect(spots.length).toBe(1);
    const [key] = spots;
    expect(key.castShadow).toBe(true);
    expect(key.target.parent).toBe(g); // in the scene graph, so its world matrix follows the lamp
    const from = key.getWorldPosition(new Vector3());
    const to = key.target.getWorldPosition(new Vector3());
    expect(from.y).toBeGreaterThan(1.2); // at the bulb, under the shade
    expect(to.z).toBeGreaterThan(0.3); // past the table (z 0.3) towards the couch (z 1.75)
    expect(to.z).toBeLessThan(1.75);
    expect(Math.abs(to.x)).toBeLessThan(0.7); // the table's middle
  });
});
