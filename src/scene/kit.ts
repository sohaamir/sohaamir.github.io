import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type ColorRepresentation,
  type Material,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Cheaper stand-ins for `painted()` on the big, rough surfaces that fill most of the
 * screen, where a physically based material's per-light cost (GGX) buys little:
 * `satin()` keeps a soft grazing sheen (Blinn-Phong; the lamp's warm pool on the walls
 * and ceiling is mostly that sheen), `matte()` is diffuse only (Lambert), for the floor.
 * Both glow like `painted()` (they have an emissive colour).
 */
export function satin(opts: { glow?: boolean } = {}): MeshPhongMaterial {
  const m = new MeshPhongMaterial({ vertexColors: true, specular: '#2c2c2c', shininess: 4 });
  if (opts.glow) m.userData.glow = true;
  return m;
}

export function matte(opts: { glow?: boolean; map?: Texture | null } = {}): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true, map: opts.map ?? null });
  if (opts.glow) m.userData.glow = true;
  return m;
}

/** Where a part goes, relative to the kit's origin. */
export type Place = {
  at?: readonly [number, number, number];
  rot?: readonly [number, number, number];
  scale?: readonly [number, number, number] | number;
  /** Texture coordinates: the part's own uvs, scaled then offset (for a shared, tiling map). */
  uv?: { scale?: readonly [number, number]; offset?: readonly [number, number] };
};

/** A flat colour, or one picked per vertex from its placed position. */
export type Paint = ColorRepresentation | ((p: Vector3) => Color);

/**
 * Material that takes its colour from the vertices, so a whole kit of
 * differently coloured parts shares one material (and one draw call).
 */
export function painted(opts: { roughness?: number; glow?: boolean } = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.85 });
  if (opts.glow) m.userData.glow = true;
  return m;
}

const m4 = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const v = new Vector3();
const s = new Vector3();

/**
 * Collects low-poly parts and merges them into a single mesh: the room's
 * detail costs one draw call per kit, not one per cushion, book or leaf.
 */
export class Kit {
  private parts: BufferGeometry[] = [];

  get size(): number {
    return this.parts.length;
  }

  add(geometry: BufferGeometry, paint: Paint, place: Place = {}): this {
    // Positions, normals and uvs only, unindexed, so any mix of geometries merges.
    const src = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (src !== geometry) geometry.dispose();
    const g = new BufferGeometry();
    g.setAttribute('position', src.getAttribute('position'));
    g.setAttribute('normal', src.getAttribute('normal'));
    const srcUv = src.getAttribute('uv');
    const uv = new Float32Array(src.getAttribute('position').count * 2);
    if (srcUv) {
      const [su, sv] = place.uv?.scale ?? [1, 1];
      const [ou, ov] = place.uv?.offset ?? [0, 0];
      for (let i = 0; i < srcUv.count; i++) {
        uv[i * 2] = srcUv.getX(i) * su + ou;
        uv[i * 2 + 1] = srcUv.getY(i) * sv + ov;
      }
    }
    g.setAttribute('uv', new BufferAttribute(uv, 2));
    src.dispose();

    const scale = place.scale ?? 1;
    s.set(...(typeof scale === 'number' ? ([scale, scale, scale] as const) : scale));
    q.setFromEuler(e.set(...(place.rot ?? ([0, 0, 0] as const))));
    g.applyMatrix4(m4.compose(v.set(...(place.at ?? ([0, 0, 0] as const))), q, s));

    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const flatColor = typeof paint === 'function' ? null : new Color(paint);
    for (let i = 0; i < pos.count; i++) {
      const c = flatColor ?? (paint as (p: Vector3) => Color)(v.fromBufferAttribute(pos, i));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new BufferAttribute(colors, 3));
    this.parts.push(g);
    return this;
  }

  /** Merge everything added so far into one mesh. Receives shadows; casts them only if asked. */
  build(material: Material, opts: { cast?: boolean } = {}): Mesh {
    if (!this.parts.length) throw new Error('Kit.build: nothing to build');
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw new Error('Kit.build: parts could not be merged');
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    merged.computeBoundingSphere();
    const mesh = new Mesh(merged, material);
    mesh.castShadow = !!opts.cast;
    mesh.receiveShadow = true;
    return mesh;
  }
}
