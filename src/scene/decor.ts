import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  OctahedronGeometry,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  TorusGeometry,
  type BufferGeometry,
  type Texture,
  type Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Kit, matte, painted, satin } from './kit';

/**
 * The room's static detail, merged into a few meshes (kit.ts) so it costs a
 * handful of draw calls: `floor` (wood-grained floorboards, matte) and `fixtures` (shell,
 * rug, skirting, curtains, frames, cable), which receive shadows only, `furniture` (shelf
 * and books, side table, plant: cast into the static lamp shadow), and the clickable
 * `speakers`.
 */

/** Room shell (metres). The couch faces −z towards the TV on the back wall. */
export const ROOM = { halfWidth: 3, back: -3, front: 4.8, height: 2.8 } as const;

/** Bright daytime palette: warm cream walls, oak floor, soft muted accents. */
const C = {
  wallLow: '#d8cdbb',
  wallHigh: '#ece5d8',
  sideLow: '#d2c6b3',
  sideHigh: '#e6ded0',
  ceiling: '#f3efe7',
  boards: ['#a07c5c', '#ab8766', '#937256', '#b2906e'],
  boardGap: '#6b4a31',
  skirting: '#f1ece3',
  rugField: '#5d6e99',
  rugBorder: '#a85d4b',
  rugAccent: '#d9ab6f',
  curtain: '#cdbb9d',
  curtainDeep: '#bba78a',
  rod: '#6b5a4a',
  sill: '#f1ece3',
  frame: '#2b2440',
  socket: '#8b8aa0',
  cable: '#0d0d12',
  wood: '#6e4a33',
  woodDark: '#4a3022',
  shelf: '#4a3022',
  pot: '#8a4a35',
  soil: '#2a1d18',
  leaf: '#3f6a4a',
  leafDark: '#2f5540',
  mug: '#d8d2c4',
  coffee: '#2a1a12',
  cushionA: '#c79a3a',
  cushionB: '#6a4a7a',
  radiator: '#ece9e2',
  valve: '#b9b4aa',
  clockRim: '#26262b',
  clockFace: '#f4f1ea',
  ceilingRose: '#efebe3',
  pendant: '#d9cdb8',
  speaker: '#4a3426',
  grille: '#1d1d21',
  driver: '#2c2c31',
  pouf: '#9a8f7c',
  basket: '#b59466',
  blanket: '#a65f4a',
  potWhite: '#e9e6df',
  snake: '#4f6b43',
  snakeEdge: '#8a9a52',
} as const;

const BOOKS = ['#b49a52', '#5b7294', '#8f4f58', '#557c70', '#6e5f84', '#a46e48', '#44597a', '#80805e', '#87566f'];

/** Deterministic 0–1 noise, so the layout is the same on every load. */
const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Colour that runs from `low` at the floor to `high` at the ceiling (a soft falloff up the walls). */
const upTheWall = (low: string, high: string) => {
  const a = new Color(low);
  const b = new Color(high);
  const out = new Color();
  return (p: Vector3) => out.lerpColors(a, b, Math.min(1, Math.max(0, p.y / ROOM.height)));
};

/**
 * Baked ambient occlusion (a brightness factor, 0–1) for a point on the shell: darker
 * into the corners, where two surfaces meet, and on the floor around and under the
 * furniture standing on it. Painted into the vertex colours once at load, so it costs
 * nothing per frame; the big planes are subdivided (`grid`) so the falloff is smooth.
 */
const CORNER = { strength: 0.32, reach: 0.3 };
/** Floor contact shadows: [x0, x1, z0, z1, strength] footprints (room.ts / below). */
const FOOTPRINTS: readonly (readonly [number, number, number, number, number])[] = [
  [-1.35, 1.35, 1.29, 2.21, 0.45], // couch (on short legs)
  [-0.65, 0.65, -0.03, 0.63, 0.28], // coffee table (open underneath)
  [-1.0, 1.0, -2.93, -2.51, 0.35], // TV console (on legs)
  [1.62, 1.98, 1.37, 1.73, 0.3], // side table
  [2.28, 2.62, -2.57, -2.23, 0.45], // plant pot
  [-2.4, -2.0, -1.9, -1.5, 0.3], // lamp base
  [-1.36, -1.14, -2.86, -2.62, 0.45], // left floor speaker
  [1.14, 1.36, -2.86, -2.62, 0.45], // right floor speaker
  [-2.25, -1.75, 0.65, 1.15, 0.4], // pouf
  [-2.8, -2.4, 1.2, 1.6, 0.4], // basket
  [-2.78, -2.42, -2.78, -2.42, 0.45], // tall plant
];
/** Darkening from one surface `d` metres away (none on the surface itself, or beyond its reach). */
const edge = (d: number): number =>
  d > 1e-3 && d < CORNER.reach * 5 ? 1 - CORNER.strength * Math.exp(-d / CORNER.reach) : 1;
const occlusion = (p: Vector3): number => {
  let k =
    edge(p.y) * edge(ROOM.height - p.y) * edge(p.x + ROOM.halfWidth) * edge(ROOM.halfWidth - p.x) * edge(p.z - ROOM.back);
  if (p.y < 0.01) {
    for (const [x0, x1, z0, z1, s] of FOOTPRINTS) {
      const dx = Math.max(x0 - p.x, 0, p.x - x1);
      const dz = Math.max(z0 - p.z, 0, p.z - z1);
      if (dx < 0.8 && dz < 0.8) k *= 1 - s * Math.exp(-Math.sqrt(dx * dx + dz * dz) / 0.16);
    }
  }
  return k;
};
const shaded = (paint: string | ((p: Vector3) => Color)) => {
  const base = typeof paint === 'string' ? new Color(paint) : null;
  const out = new Color();
  return (p: Vector3) => out.copy(base ?? (paint as (p: Vector3) => Color)(p)).multiplyScalar(occlusion(p));
};

const plane = (w: number, h: number): BufferGeometry => new PlaneGeometry(w, h);
/** A plane cut into roughly `cell`-metre squares, so baked shading can vary across it. */
const grid = (w: number, h: number, cell = 0.25): BufferGeometry =>
  new PlaneGeometry(w, h, Math.max(1, Math.round(w / cell)), Math.max(1, Math.round(h / cell)));

/**
 * Wood grain for the floorboards: fine, wavering darker streaks on white, tiled along
 * each board and multiplied with its tone. Drawn once into a small canvas (64×512).
 */
function grainTexture(): Texture | null {
  if (typeof document === 'undefined') return null;
  const W = 64;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 46; i++) {
    const x0 = rand(i + 300) * W;
    const amp = 1 + rand(i + 400) * 3;
    const freq = 1 + rand(i + 500) * 3;
    ctx.strokeStyle = `rgba(70, 40, 20, ${0.05 + rand(i + 600) * 0.12})`;
    ctx.lineWidth = 0.6 + rand(i + 700) * 1.6;
    ctx.beginPath();
    for (let y = 0; y <= H; y += 8) ctx.lineTo(x0 + Math.sin((y / H) * Math.PI * 2 * freq + i) * amp, y);
    ctx.stroke();
  }
  // A couple of elongated knots.
  for (const [x, y] of [[20, 140], [44, 380]] as const) {
    ctx.strokeStyle = 'rgba(70, 40, 20, 0.18)';
    for (let r = 1; r < 4; r++) {
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.6, r * 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Seams between floorboards and the rug sit a hair above the boards. */
const SEAM_Y = 0.0005;
const RUG_Y = 0.003;

/**
 * Floorboards running front to back, with staggered joints and slightly different
 * tones. The boards abut and thin dark seams are laid over the joints, so the floor
 * is drawn about once per pixel (no full-size sub-floor under it).
 */
function floor(k: Kit): void {
  const w = ROOM.halfWidth * 2;
  const depth = ROOM.front - ROOM.back;
  const midZ = (ROOM.front + ROOM.back) / 2;
  const flatDown = [-Math.PI / 2, 0, 0] as const;
  const boardW = 0.2;
  const seam = 0.005;
  const n = Math.round(w / boardW);
  for (let i = 0; i < n; i++) {
    const x = -ROOM.halfWidth + (i + 0.5) * boardW;
    if (i > 0) k.add(grid(seam, depth, 0.3), shaded(C.boardGap), { at: [x - boardW / 2, SEAM_Y, midZ], rot: flatDown });
    let z = ROOM.back;
    let j = 0;
    while (z < ROOM.front - 1e-6) {
      let len = 1.3 + rand(i * 17 + j) * 1.6 - (j === 0 ? rand(i) * 0.9 : 0);
      if (ROOM.front - z - len < 0.3) len = ROOM.front - z; // no sliver at the end
      const tone = C.boards[Math.floor(rand(i * 31 + j * 7) * C.boards.length)];
      k.add(grid(boardW, len), shaded(tone), {
        at: [x, 0, z + len / 2],
        rot: flatDown,
        uv: { scale: [1, len / 1.2], offset: [rand(i * 13 + j), rand(i * 7 + j * 3)] },
      });
      if (j > 0) k.add(plane(boardW, seam), shaded(C.boardGap), { at: [x, SEAM_Y, z], rot: flatDown });
      z += len;
      j++;
    }
  }
}

function shell(k: Kit): void {
  const depth = ROOM.front - ROOM.back;
  const midZ = (ROOM.front + ROOM.back) / 2;
  const w = ROOM.halfWidth * 2;
  const h = ROOM.height;
  k.add(grid(w, depth, 0.4), shaded(C.ceiling), { at: [0, h, midZ], rot: [Math.PI / 2, 0, 0] });
  k.add(grid(w, h), shaded(upTheWall(C.wallLow, C.wallHigh)), { at: [0, h / 2, ROOM.back] });
  k.add(grid(depth, h), shaded(upTheWall(C.sideLow, C.sideHigh)), { at: [-ROOM.halfWidth, h / 2, midZ], rot: [0, Math.PI / 2, 0] });
  k.add(grid(depth, h), shaded(upTheWall(C.sideLow, C.sideHigh)), { at: [ROOM.halfWidth, h / 2, midZ], rot: [0, -Math.PI / 2, 0] });

  // Skirting boards.
  const sk = { h: 0.09, d: 0.015 };
  k.add(new BoxGeometry(w, sk.h, sk.d), C.skirting, { at: [0, sk.h / 2, ROOM.back + sk.d / 2] });
  for (const side of [-1, 1]) {
    k.add(new BoxGeometry(sk.d, sk.h, depth), C.skirting, { at: [side * (ROOM.halfWidth - sk.d / 2), sk.h / 2, midZ] });
  }
}

/**
 * Octagonal rug under the table: a border, a field, an inner ring and a centre
 * lozenge, as flat rings that don't overlap (one layer of fill over the boards).
 */
function rug(k: Kit): void {
  const place = { at: [0, RUG_Y, 0.4] as const, rot: [-Math.PI / 2, 0, 0] as const, scale: [1, 0.7, 1] as const };
  const ring = (inner: number, outer: number) => new RingGeometry(inner, outer, 8, 4, Math.PI / 8);
  k.add(ring(1.47, 1.6), shaded(C.rugBorder), place);
  k.add(ring(0.95, 1.47), shaded(C.rugField), place);
  k.add(ring(0.88, 0.95), shaded(C.rugAccent), place);
  k.add(ring(0.32, 0.88), shaded(C.rugField), place);
  k.add(new CircleGeometry(0.32, 4), shaded(C.rugBorder), place);
}

/** Window sill and a pair of folded floor-length curtains on a rod (window: room.ts). */
function windowDressing(k: Kit): void {
  const win = { x: 1.85, y: 1.65, w: 1.16, h: 1.06 };
  const wall = ROOM.back;
  k.add(new BoxGeometry(win.w + 0.14, 0.035, 0.13), C.sill, { at: [win.x, win.y - win.h / 2 - 0.018, wall + 0.065] });
  const top = win.y + win.h / 2 + 0.17;
  k.add(new CylinderGeometry(0.012, 0.012, win.w + 0.75, 6), C.rod, { at: [win.x, top, wall + 0.1], rot: [0, 0, Math.PI / 2] });
  const slats = 6;
  const slatW = 0.06;
  const hang = top - 0.04; // floor-length
  for (const side of [-1, 1]) {
    const edge = win.x + side * (win.w / 2 + 0.02);
    for (let i = 0; i < slats; i++) {
      const x = edge + side * (i + 0.5) * slatW * 0.9 - side * 0.12;
      k.add(new BoxGeometry(slatW, hang, 0.012), i % 2 ? C.curtain : C.curtainDeep, {
        at: [x, hang / 2 + 0.03, wall + 0.075 + (i % 2) * 0.02],
        rot: [0, (i % 2 ? 0.45 : -0.45) * side, 0],
      });
    }
  }
}

/**
 * Logo posters (labs and universities), framed in a two-row group on the left
 * wall, with two lab photos beside them (nearer the couch). `at` is [z, y]; `w` × `h` follow each logo's shape; `uv` is its
 * rectangle in the atlas public/assets/img/posters.jpg ([u0, u1, v0, v1]).
 * The logos themselves are clickable props (props.ts); the frames are fixtures.
 */
export const WALL_POSTERS = [
  { name: 'cinn', at: [-1.61, 1.9], w: 0.78, h: 0.407, uv: [0, 1, 0.398, 0.7816] },
  { name: 'nottingham', at: [-0.83, 1.9], w: 0.442, h: 0.443, uv: [0.7041, 1, 0.7816, 1] },
  { name: 'stanford', at: [-1.82, 1.36], w: 1.25, h: 0.207, uv: [0, 1, 0.2766, 0.398] },
  { name: 'imperial', at: [-0.83, 1.3], w: 0.39, h: 0.442, uv: [0.4424, 0.7041, 0.7816, 1] },
  // Lab photos, one above the other: ALPN outside the CHBH, Birmingham; MSN + SDN labs.
  { name: 'alpn', at: [0.05, 2.0], w: 0.85, h: 0.638, uv: [0, 0.499, 0, 0.2751] },
  { name: 'sdnGroup', at: [0.05, 1.31], w: 0.85, h: 0.481, uv: [0.501, 1, 0.0682, 0.2751] },
] as const;
export type WallPoster = (typeof WALL_POSTERS)[number];
/** Gap between a poster's frame and the wall, and the frame's border width. */
export const POSTER_FRAME = { depth: 0.025, border: 0.025 } as const;

/** Frames for the logo posters and lab photos on the left wall. */
function frames(k: Kit): void {
  const { depth, border } = POSTER_FRAME;
  for (const f of WALL_POSTERS) {
    const [z, y] = f.at;
    k.add(new BoxGeometry(f.w + border * 2, f.h + border * 2, depth), C.frame, {
      at: [-ROOM.halfWidth + depth / 2, y, z],
      rot: [0, Math.PI / 2, 0],
    });
  }
}

/** The TV's power cable: down behind the stand, along the skirting, up to a wall socket. */
function cable(k: Kit): void {
  const z = ROOM.back + 0.03;
  const r = 0.006;
  const run = (len: number, at: [number, number, number], horizontal: boolean) =>
    k.add(new CylinderGeometry(r, r, len, 5), C.cable, { at, rot: horizontal ? [0, 0, Math.PI / 2] : [0, 0, 0] });
  run(0.56, [0.55, 0.28, z], false);
  run(0.75, [0.925, r, z], true);
  run(0.28, [1.3, 0.14, z], false);
  k.add(new BoxGeometry(0.08, 0.11, 0.01), C.socket, { at: [1.3, 0.3, ROOM.back + 0.005] });
}

/** Where the bookshelf and the clock above it hang on the right wall (z, metres). */
const SHELF_Z = -1.0;

/** Two shelves of books (varied heights, one leaning, a small stack), a globe and a little plant. */
function shelf(k: Kit): void {
  // On the right wall: x offsets below are measured from the wall into the room.
  const ox = ROOM.halfWidth - 0.14;
  const oy = 1.15;
  const oz = SHELF_Z;
  const at = (x: number, y: number, z: number) => [ox - x, oy + y, oz + z] as [number, number, number];
  for (const y of [0, 0.42]) {
    k.add(new BoxGeometry(0.26, 0.035, 1.2), C.shelf, { at: at(0, y, 0) });
    for (const z of [-0.45, 0.45]) k.add(new BoxGeometry(0.11, 0.08, 0.025), C.woodDark, { at: at(-0.075, y - 0.055, z) });
  }
  // Lower shelf: a row of books, the last one leaning on its neighbour.
  let z = -0.54;
  for (let i = 0; i < 9; i++) {
    const h = 0.2 + rand(i + 3) * 0.12;
    const t = 0.03 + rand(i + 11) * 0.03;
    const d = 0.15 + rand(i + 23) * 0.05;
    const lean = i === 8 ? 0.38 : 0; // the last one leans back onto its neighbour
    k.add(new BoxGeometry(d, h, t), BOOKS[i], {
      at: at(0.02 - (0.19 - d) / 2, 0.0175 + (h / 2) * Math.cos(lean) + (t / 2) * Math.sin(lean), z + t / 2 + (h / 2) * Math.sin(lean)),
      rot: [-lean, 0, 0],
    });
    z += t + 0.004;
  }
  // A small globe on a stand.
  k.add(new CylinderGeometry(0.03, 0.04, 0.02, 8), C.woodDark, { at: at(0, 0.0275, 0.42) });
  k.add(new CylinderGeometry(0.006, 0.006, 0.05, 5), C.rod, { at: at(0, 0.06, 0.42) });
  k.add(new IcosahedronGeometry(0.065, 3), '#3f6aa0', { at: at(0, 0.145, 0.42) });
  // Upper shelf: three books lying flat and a little plant in a pot.
  [0.035, 0.03, 0.04].forEach((t, i) => {
    k.add(new BoxGeometry(0.17 - i * 0.015, t, 0.24 - i * 0.02), BOOKS[(i * 4 + 1) % BOOKS.length], {
      at: at(0, 0.4375 + 0.035 * i + t / 2, -0.3),
      rot: [0, 0.1 * (i - 1), 0],
    });
  });
  k.add(new CylinderGeometry(0.06, 0.045, 0.1, 16), C.pot, { at: at(0, 0.4375 + 0.05, 0.35) });
  for (let i = 0; i < 5; i++) {
    const leaf = new OctahedronGeometry(1, 0).scale(0.025, 0.065, 0.008).translate(0, 0.065, 0);
    leaf.rotateX(0.5).rotateY((i / 5) * Math.PI * 2);
    k.add(leaf, i % 2 ? C.leaf : C.leafDark, { at: at(0, 0.53, 0.35) });
  }
}

/** A round side table at the couch's right arm, with a book and a candle. */
function sideTable(k: Kit): void {
  const x = 1.8;
  const z = 1.55;
  k.add(new CylinderGeometry(0.16, 0.18, 0.025, 24), C.woodDark, { at: [x, 0.0125, z] });
  k.add(new CylinderGeometry(0.025, 0.03, 0.5, 12), C.woodDark, { at: [x, 0.27, z] });
  k.add(new CylinderGeometry(0.25, 0.25, 0.03, 32), C.wood, { at: [x, 0.535, z] });
  k.add(new BoxGeometry(0.16, 0.03, 0.22), BOOKS[1], { at: [x - 0.05, 0.565, z + 0.02], rot: [0, 0.4, 0] });
  k.add(new BoxGeometry(0.14, 0.025, 0.19), BOOKS[5], { at: [x - 0.05, 0.5925, z + 0.02], rot: [0, 0.2, 0] });
  k.add(new CylinderGeometry(0.03, 0.03, 0.08, 16), '#e8dcc0', { at: [x + 0.12, 0.59, z - 0.05] });
}

/** A leafy plant in a terracotta pot, in the corner under the window. */
function plant(k: Kit): void {
  const x = 2.45;
  const z = -2.4;
  const potH = 0.38;
  k.add(new CylinderGeometry(0.17, 0.13, potH, 24), C.pot, { at: [x, potH / 2, z] });
  k.add(new CylinderGeometry(0.185, 0.17, 0.04, 24), C.pot, { at: [x, potH - 0.02, z] });
  k.add(new CylinderGeometry(0.155, 0.155, 0.01, 24), C.soil, { at: [x, potH - 0.02, z] });
  for (let i = 0; i < 9; i++) {
    const len = 0.45 + rand(i + 40) * 0.3;
    const leaf = new OctahedronGeometry(1, 0).scale(0.075, len / 2, 0.012).translate(0, len / 2, 0);
    leaf.rotateX(0.2 + rand(i + 50) * 0.45).rotateY((i / 9) * Math.PI * 2 + rand(i) * 0.4);
    k.add(leaf, i % 2 ? C.leaf : C.leafDark, { at: [x, potH - 0.03, z] });
  }
}

/**
 * A white panel radiator under the window, a wall clock above the shelf and a
 * pendant light: fixtures (receive shadows only).
 */
function roomDetail(k: Kit): void {
  // Radiator: a row of fins between two pipes, on two brackets, with a valve.
  const rad = { x: 1.75, y: 0.42, w: 0.8, h: 0.5, z: ROOM.back + 0.07 };
  const fins = 16;
  for (let i = 0; i < fins; i++) {
    const x = rad.x - rad.w / 2 + (i + 0.5) * (rad.w / fins);
    k.add(new RoundedBoxGeometry(rad.w / fins - 0.008, rad.h, 0.06, 1, 0.006), C.radiator, { at: [x, rad.y, rad.z] });
  }
  for (const y of [rad.y - rad.h / 2 + 0.03, rad.y + rad.h / 2 - 0.03]) {
    k.add(new CylinderGeometry(0.015, 0.015, rad.w + 0.04, 10), C.radiator, { at: [rad.x, y, rad.z], rot: [0, 0, Math.PI / 2] });
  }
  k.add(new CylinderGeometry(0.02, 0.02, 0.06, 12), C.valve, { at: [rad.x + rad.w / 2 + 0.05, rad.y - rad.h / 2 + 0.03, rad.z] });
  k.add(new CylinderGeometry(0.01, 0.01, rad.y - rad.h / 2 + 0.03, 8), C.radiator, { at: [rad.x + rad.w / 2 + 0.05, (rad.y - rad.h / 2 + 0.03) / 2, rad.z] });

  // Wall clock on the right wall, above the shelf: rim, face, twelve ticks, hands at ten past ten.
  const clock = { y: 2.05, z: SHELF_Z, r: 0.17 };
  const wallX = ROOM.halfWidth;
  const faceOut = [0, 0, Math.PI / 2] as const; // a cylinder's axis turned to point out of the wall (−x)
  k.add(new CylinderGeometry(clock.r, clock.r, 0.035, 40), C.clockRim, { at: [wallX - 0.018, clock.y, clock.z], rot: faceOut });
  k.add(new CylinderGeometry(clock.r - 0.015, clock.r - 0.015, 0.004, 40), C.clockFace, { at: [wallX - 0.037, clock.y, clock.z], rot: faceOut });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const len = i % 3 === 0 ? 0.03 : 0.015;
    k.add(new BoxGeometry(0.003, len, 0.006), C.clockRim, {
      at: [wallX - 0.04, clock.y + Math.cos(a) * (clock.r - 0.04), clock.z + Math.sin(a) * (clock.r - 0.04)],
      rot: [a, 0, 0],
    });
  }
  // Angle 0 points up; positive turns towards +z, which reads as the clock's right from inside the room.
  for (const [a, len, w] of [[-(2 / 12) * Math.PI * 2 + 0.09, 0.075, 0.008], [(2 / 12) * Math.PI * 2, 0.11, 0.005]] as const) {
    k.add(new BoxGeometry(0.003, len, w), C.clockRim, {
      at: [wallX - 0.043, clock.y + (Math.cos(a) * len) / 2, clock.z + (Math.sin(a) * len) / 2],
      rot: [a, 0, 0],
    });
  }

  // Pendant light over the coffee table: ceiling rose, cord, drum shade.
  const pend = { x: 0, z: 0.4 };
  k.add(new CylinderGeometry(0.06, 0.06, 0.02, 20), C.ceilingRose, { at: [pend.x, ROOM.height - 0.01, pend.z] });
  k.add(new CylinderGeometry(0.004, 0.004, 0.42, 6), C.cable, { at: [pend.x, ROOM.height - 0.23, pend.z] });
  k.add(new CylinderGeometry(0.2, 0.2, 0.18, 36, 1, true), C.pendant, { at: [pend.x, ROOM.height - 0.53, pend.z] });
  k.add(new CylinderGeometry(0.05, 0.05, 0.004, 16), C.pendant, { at: [pend.x, ROOM.height - 0.45, pend.z] });
}

/** Floor-standing speakers either side of the TV console: their own mesh so they can be clicked (props.ts). */
function speakers(k: Kit): void {
  for (const side of [-1, 1]) {
    const x = side * 1.25;
    const z = -2.74;
    k.add(new RoundedBoxGeometry(0.2, 0.92, 0.22, 2, 0.01), C.speaker, { at: [x, 0.48, z] });
    k.add(new BoxGeometry(0.17, 0.86, 0.004), C.grille, { at: [x, 0.48, z + 0.111] });
    for (const [y, r] of [[0.78, 0.045], [0.58, 0.06], [0.36, 0.06]] as const) {
      k.add(new CylinderGeometry(r, r, 0.006, 24), C.driver, { at: [x, y, z + 0.114], rot: [Math.PI / 2, 0, 0] });
    }
    k.add(new BoxGeometry(0.22, 0.02, 0.24), C.woodDark, { at: [x, 0.01, z] });
  }
}

/** Busier corners: a knitted pouf and a blanket basket by the shelf, and a tall snake plant in the back-left corner. */
function moreFurniture(k: Kit): void {
  // Pouf: a squat knitted drum with a button on top.
  k.add(new CylinderGeometry(0.24, 0.25, 0.36, 28), C.pouf, { at: [-2.0, 0.18, 0.9] });
  k.add(new CylinderGeometry(0.2, 0.24, 0.04, 28), C.pouf, { at: [-2.0, 0.38, 0.9] });
  k.add(new CylinderGeometry(0.02, 0.02, 0.012, 10), C.woodDark, { at: [-2.0, 0.405, 0.9] });
  // Woven basket with a folded blanket.
  k.add(new CylinderGeometry(0.2, 0.17, 0.34, 24, 1, true), C.basket, { at: [-2.6, 0.17, 1.4] });
  k.add(new CylinderGeometry(0.17, 0.17, 0.01, 24), C.basket, { at: [-2.6, 0.005, 1.4] });
  k.add(new RoundedBoxGeometry(0.3, 0.12, 0.22, 2, 0.04), C.blanket, { at: [-2.6, 0.36, 1.4], rot: [0, 0.4, 0.15] });
  // Snake plant: stiff upright leaves in a white pot.
  const sp = { x: -2.6, z: -2.6, potH: 0.32 };
  k.add(new CylinderGeometry(0.16, 0.13, sp.potH, 24), C.potWhite, { at: [sp.x, sp.potH / 2, sp.z] });
  k.add(new CylinderGeometry(0.15, 0.15, 0.01, 20), C.soil, { at: [sp.x, sp.potH - 0.02, sp.z] });
  for (let i = 0; i < 11; i++) {
    const len = 0.5 + rand(i + 80) * 0.45;
    const leaf = new OctahedronGeometry(1, 0).scale(0.045, len / 2, 0.01).translate(0, len / 2, 0);
    leaf.rotateX((rand(i + 90) - 0.5) * 0.35).rotateY((i / 11) * Math.PI * 2 + rand(i + 95));
    k.add(leaf, i % 3 ? C.snake : C.snakeEdge, { at: [sp.x + (rand(i + 70) - 0.5) * 0.12, sp.potH - 0.03, sp.z + (rand(i + 75) - 0.5) * 0.12] });
  }
}

/** All the static detail: four draw calls. */
export function decor(): Group {
  const floorKit = new Kit();
  floor(floorKit);
  const floorMesh = floorKit.build(matte({ map: grainTexture() }));
  floorMesh.name = 'floor';

  const fixtures = new Kit();
  shell(fixtures);
  rug(fixtures);
  windowDressing(fixtures);
  roomDetail(fixtures);
  frames(fixtures);
  cable(fixtures);
  const fixturesMesh = fixtures.build(satin());
  fixturesMesh.name = 'fixtures';

  const furniture = new Kit();
  shelf(furniture);
  sideTable(furniture);
  plant(furniture);
  moreFurniture(furniture);
  const furnitureMesh = furniture.build(satin(), { cast: true });
  furnitureMesh.name = 'furniture';

  const speakerKit = new Kit();
  speakers(speakerKit);
  const speakersMesh = speakerKit.build(satin(), { cast: true });
  speakersMesh.name = 'speakers';

  const g = new Group();
  g.add(floorMesh, fixturesMesh, furnitureMesh, speakersMesh);
  g.name = 'decor';
  return g;
}

/**
 * Two throw cushions against the backrest (their tops show over it from the
 * doorway), in the couch group's local frame
 * (room.ts: backrest z 0.23–0.45, top y 0.98; seat top y 0.54). One glow-flagged
 * mesh, so it pulses and lights on hover with the couch.
 */
export function couchExtras(): Mesh {
  const k = new Kit();
  const cushion = () => new RoundedBoxGeometry(0.45, 0.45, 0.13, 2, 0.05);
  k.add(cushion(), C.cushionA, { at: [-0.86, 0.77, 0.13], rot: [0.3, 0.12, 0.1] });
  k.add(cushion(), C.cushionB, { at: [0.88, 0.76, 0.13], rot: [0.3, -0.15, -0.12] });
  const mesh = k.build(satin({ glow: true }), { cast: true });
  mesh.name = 'couchExtras';
  return mesh;
}

/**
 * The coffee table as one mesh: top, legs and a mug, in the table group's frame
 * (origin on the floor, top surface at `top`).
 */
export function tableTop(top: number): Mesh {
  const k = new Kit();
  k.add(new RoundedBoxGeometry(1.3, 0.06, 0.65, 2, 0.012), C.wood, { at: [0, top - 0.03, 0] });
  const legH = top - 0.06;
  for (const x of [-0.56, 0.56]) for (const z of [-0.24, 0.24]) k.add(new CylinderGeometry(0.022, 0.015, legH, 10), C.woodDark, { at: [x, legH / 2, z] });
  // A mug, front right.
  const mug = { x: 0.52, z: 0.17, r: 0.038, h: 0.09 };
  k.add(new CylinderGeometry(mug.r, mug.r * 0.92, mug.h, 20), C.mug, { at: [mug.x, top + mug.h / 2, mug.z] });
  k.add(new CylinderGeometry(mug.r * 0.85, mug.r * 0.85, 0.004, 20), C.coffee, { at: [mug.x, top + mug.h - 0.008, mug.z] });
  k.add(new TorusGeometry(0.024, 0.007, 8, 12, Math.PI), C.mug, { at: [mug.x + mug.r, top + mug.h / 2, mug.z], rot: [0, 0, -Math.PI / 2] });
  const mesh = k.build(painted({ roughness: 0.5 }), { cast: true });
  mesh.name = 'tableTop';
  return mesh;
}
