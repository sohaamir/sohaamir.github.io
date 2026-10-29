import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  Texture,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { withBase } from '../lib/url';
import { Kit, painted } from './kit';
import { POSTER_FRAME, ROOM, WALL_POSTERS, type WallPoster } from './decor';
import { TABLE_TOP, flat } from './room';

export type Props = { remote: Object3D; props: Object3D[]; posters: Object3D[] };

/** Easter eggs: clicking these props opens a link in a new tab (picking.ts). */
export const EASTER_EGGS = {
  bat: 'https://www.espncricinfo.com/',
  speakers: 'https://open.spotify.com/playlist/4b2qbaLoB2NEmlv253TYti',
  brain: 'https://github.com/sohaamir/my_brain',
  chalk: 'https://www.wst.tv/',
  cinn: 'https://research.reading.ac.uk/cinn/',
  stanford: 'https://www.poldracklab.org/',
  imperial: 'https://www.imperial.ac.uk/medicine/',
  nottingham: 'https://www.nottingham.ac.uk/psychology/welcome-to-psychology.aspx',
  alpn: 'https://alpn-lab.github.io/',
  sdnGroup: 'https://www.sdn-lab.org/',
} as const;

const shadowed = <T extends Mesh>(m: T): T => {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

/** The chalk wrapper's print: black, gold lettering, two cream bands (one small canvas, every side). */
function chalkWrapper(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 88;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#101012';
  ctx.fillRect(0, 0, 128, 88);
  ctx.fillStyle = '#d9c48c';
  ctx.font = '600 11px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('PROFESSIONAL', 22, 26);
  ctx.fillText('BILLIARD CHALK', 22, 39);
  ctx.fillStyle = '#efe6c4';
  ctx.fillRect(0, 50, 128, 5);
  ctx.fillRect(0, 78, 128, 5);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Snooker chalk: a blue cube standing in its black, banded wrapper. */
function chalk(): Object3D {
  const s = 0.05;
  const wrapH = s * 0.68;
  const wrapper = shadowed(new Mesh(new BoxGeometry(s, wrapH, s), new MeshStandardMaterial({ map: chalkWrapper(), color: '#ffffff', roughness: 0.9 })));
  wrapper.position.y = wrapH / 2;
  const topH = s * 0.42;
  const top = shadowed(new Mesh(new RoundedBoxGeometry(s * 0.95, topH, s * 0.95, 1, 0.004), flat('#2f86c8', { roughness: 0.95 })));
  top.position.y = s - topH / 2;
  const g = new Group();
  g.add(wrapper, top);
  g.position.set(0.18, TABLE_TOP, -0.16);
  g.rotation.y = 0.35;
  g.name = 'chalk';
  g.userData.href = EASTER_EGGS.chalk;
  return g;
}

/**
 * The logos inside the wall frames (decor.ts): one plane each, all sharing one
 * material and one texture atlas. The atlas is fetched after the room is ready
 * (loadPosterArt); until then the posters are blank white paper.
 */
function wallPosters(): Mesh[] {
  const blank = document.createElement('canvas');
  blank.width = blank.height = 1;
  const ctx = blank.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 1, 1);
  }
  const art = new Texture(blank);
  art.colorSpace = SRGBColorSpace;
  art.anisotropy = 4;
  art.needsUpdate = true;
  art.userData.src = withBase('/assets/img/posters.jpg');
  // Same settings as the brain poster's material (decor.ts), so no new shader is compiled; a little
  // darker, since the left wall catches the lamp and white paper would wash the logos out.
  const mat = new MeshStandardMaterial({ map: art, color: '#bdbdbd', roughness: 0.9 });
  const out = POSTER_FRAME.depth + 0.002;
  return WALL_POSTERS.map((p: WallPoster) => {
    const geo = new PlaneGeometry(p.w, p.h);
    atlasUv(geo, p.uv);
    const m = new Mesh(geo, mat);
    const [z, y] = p.at;
    m.position.set(-ROOM.halfWidth + out, y, z);
    m.rotation.y = Math.PI / 2;
    m.receiveShadow = true;
    m.name = `poster-${p.name}`;
    m.userData.href = EASTER_EGGS[p.name];
    m.userData.onWall = true;
    return m;
  });
}

/** Point a plane's UVs at one rectangle of the posters atlas ([u0, u1, v0, v1]). */
function atlasUv(geo: BufferGeometry, [u0, u1, v0, v1]: readonly number[]): void {
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
}

/** Fetch the logo atlas into the wall posters' shared texture. Resolves true once it is on the GPU's way. */
export async function loadPosterArt(posters: Object3D[]): Promise<boolean> {
  const map = ((posters[0] as Mesh | undefined)?.material as MeshStandardMaterial | undefined)?.map;
  const src = map?.userData.src as string | undefined;
  if (!map || !src) return false;
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  map.dispose(); // its GPU storage is 1×1: free it so the atlas gets storage of its own size
  map.image = img;
  map.needsUpdate = true;
  return true;
}

/** Cricket bat lying on the table: flattened box blade with a cylinder handle. */
function bat(): Object3D {
  const g = new Group();
  const bladeLen = 0.52;
  const blade = shadowed(new Mesh(new RoundedBoxGeometry(0.11, 0.035, bladeLen, 1, 0.008), flat('#d9b77a', { roughness: 0.6 })));
  const handle = shadowed(new Mesh(new CylinderGeometry(0.016, 0.016, 0.22, 6), flat('#3a2a20')));
  handle.rotation.x = Math.PI / 2;
  handle.position.z = -(bladeLen / 2 + 0.11);
  g.add(blade, handle);
  g.position.set(-0.3, TABLE_TOP + 0.0175, 0.02);
  g.rotation.y = 0.9;
  g.name = 'bat';
  g.userData.href = EASTER_EGGS.bat;
  return g;
}

/** Remote body size (metres): x across, y thickness, z along (the top, with the sky logo, is at −z). */
export const REMOTE = { width: 0.056, height: 0.022, length: 0.23 } as const;
const TOP = REMOTE.height / 2;
/** The silver face plate between the dark rubber sides. */
const PLATE = { inset: 0.007, height: 0.002 } as const;
const PLATE_TOP = TOP + PLATE.height / 2 + 0.0002;
const KEY_H = 0.0035;
/** Every key's top sits at this height, so one flat label decal lies on all of them. */
const KEY_TOP = PLATE_TOP + KEY_H;
const LABEL_Y = KEY_TOP + 0.0006;
/** How much narrower the remote gets towards the hand end (fraction of its width). */
const TAPER = 0.16;

const DARK = '#2c2d33';
const SLATE = '#7f98c0'; // the blue-grey keys
const SILVER = '#c3c7cd';

export type RemoteKey = { label: string; x: number; z: number; r: number };
/** Number keys 1–9 on a 3×3 pad, then 0 centred below, like a Sky remote's. */
export const REMOTE_KEYS: readonly RemoteKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((label, i) => ({
  label,
  x: i === 9 ? 0 : ((i % 3) - 1) * 0.0115,
  z: 0.028 + Math.floor(i / 3) * 0.0155,
  r: 0.0045,
}));
const LETTERS = ['', 'abc', 'def', 'ghi', 'jkl', 'mno', 'pqrs', 'tuv', 'wxyz', ''];
/** Oval keys: label, centre, size (x across, z along) and colour. */
type Oval = { label: string; x: number; z: number; w: number; l: number; color: string };
const OVALS: readonly Oval[] = [
  { label: 'tv', x: -0.0135, z: -0.097, w: 0.009, l: 0.0065, color: DARK },
  { label: 'box office', x: -0.0092, z: -0.085, w: 0.0155, l: 0.0055, color: SLATE },
  { label: 'services', x: 0.0092, z: -0.085, w: 0.0155, l: 0.0055, color: SLATE },
  { label: 'tv guide', x: -0.0118, z: -0.0755, w: 0.0145, l: 0.0055, color: SLATE },
  { label: 'interactive', x: 0.0118, z: -0.0755, w: 0.0145, l: 0.0055, color: SLATE },
  { label: 'back up', x: 0, z: -0.029, w: 0.012, l: 0.005, color: DARK },
  { label: '', x: 0, z: -0.0165, w: 0.013, l: 0.0095, color: SLATE }, // play / pause
];
/** Small round keys: label (or symbol), centre, radius and colour. */
type Round = { label: string; x: number; z: number; r: number; color: string };
const ROUNDS: readonly Round[] = [
  { label: 'power', x: 0.0135, z: -0.097, r: 0.0042, color: DARK },
  { label: 'mute', x: -0.0062, z: -0.066, r: 0.003, color: DARK },
  { label: 'i', x: 0.0062, z: -0.066, r: 0.003, color: DARK },
  { label: 'text', x: -0.0135, z: -0.029, r: 0.0032, color: DARK },
  { label: 'help', x: 0.0135, z: -0.029, r: 0.0032, color: DARK },
  { label: 'rew', x: -0.0135, z: -0.0165, r: 0.0034, color: DARK },
  { label: 'ff', x: 0.0135, z: -0.0165, r: 0.0034, color: DARK },
  { label: 'rec', x: -0.0062, z: -0.004, r: 0.0032, color: DARK },
  { label: 'stop', x: 0.0062, z: -0.004, r: 0.0032, color: DARK },
  { label: '', x: -0.0138, z: 0.0105, r: 0.0028, color: '#e0453a' },
  { label: '', x: -0.0046, z: 0.0105, r: 0.0028, color: '#2fb597' },
  { label: '', x: 0.0046, z: 0.0105, r: 0.0028, color: '#f39a4a' },
  { label: '', x: 0.0138, z: 0.0105, r: 0.0028, color: '#1f2e6b' },
];
const DPAD = { z: -0.047, ring: 0.0112, select: 0.0055 };
const ROCKER = { x: 0.0172, z: -0.047, width: 0.0075, length: 0.022 };
const LED = { z: -0.107, r: 0.0011 };
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
const INK = '#f4f6fa';
/** Label texture resolution: 5 px per millimetre of the remote's face. */
const LABEL_PX_PER_M = 5000;

/**
 * Print the key labels onto a canvas laid over the remote's top face
 * (canvas x ↔ remote x, canvas y ↔ remote z; top of the canvas = the sky logo end).
 */
export function drawRemoteLabels(ctx: CanvasRenderingContext2D, pxPerM: number): void {
  const X = (x: number) => (x + REMOTE.width / 2) * pxPerM;
  const Y = (z: number) => (z + REMOTE.length / 2) * pxPerM;
  const mm = pxPerM / 1000;
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const [i, k] of REMOTE_KEYS.entries()) {
    ctx.font = `600 ${4.2 * mm}px ${SANS}`;
    ctx.fillText(k.label, X(k.x), Y(k.z) - (LETTERS[i] ? 0.8 * mm : 0));
    if (LETTERS[i]) {
      ctx.font = `500 ${1.7 * mm}px ${SANS}`;
      ctx.fillText(LETTERS[i], X(k.x), Y(k.z) + 2.2 * mm);
    }
  }
  ctx.font = `600 ${1.9 * mm}px ${SANS}`;
  for (const o of OVALS) if (o.label) ctx.fillText(o.label, X(o.x), Y(o.z));

  // The sky wordmark on the silver plate, between the tv and power keys.
  ctx.fillStyle = '#22356f';
  ctx.font = `800 ${5 * mm}px ${SANS}`;
  ctx.fillText('sky', X(0), Y(-0.097));
  ctx.fillStyle = INK;

  const tri = (cx: number, cy: number, angle: number, size: number) => {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = angle + (i * 2 * Math.PI) / 3;
      ctx.lineTo(cx + Math.cos(a) * size, cy + Math.sin(a) * size);
    }
    ctx.closePath();
    ctx.fill();
  };
  ctx.lineWidth = 0.6 * mm;
  ctx.lineCap = 'round';
  for (const r of ROUNDS) {
    const [cx, cy] = [X(r.x), Y(r.z)];
    if (r.label === 'power') {
      ctx.beginPath();
      ctx.arc(cx, cy, 1.8 * mm, -Math.PI / 2 + 0.7, -Math.PI / 2 - 0.7 + Math.PI * 2);
      ctx.moveTo(cx, cy - 2.4 * mm);
      ctx.lineTo(cx, cy - 0.4 * mm);
      ctx.stroke();
    } else if (r.label === 'rew' || r.label === 'ff') {
      const a = r.label === 'ff' ? 0 : Math.PI;
      tri(cx - 0.8 * mm, cy, a, 1.3 * mm);
      tri(cx + 0.8 * mm, cy, a, 1.3 * mm);
    } else if (r.label === 'rec') {
      ctx.fillStyle = '#e0453a';
      ctx.beginPath();
      ctx.arc(cx, cy, 1.1 * mm, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
    } else if (r.label === 'stop') {
      ctx.fillRect(cx - 1 * mm, cy - 1 * mm, 2 * mm, 2 * mm);
    } else if (r.label === 'i') {
      ctx.font = `italic 700 ${3 * mm}px Georgia, serif`;
      ctx.fillText('i', cx, cy);
    } else if (r.label) {
      ctx.font = `600 ${1.7 * mm}px ${SANS}`;
      ctx.fillText(r.label, cx, cy);
    }
  }

  // Play / pause: ‖ over ▶.
  const pp = OVALS[OVALS.length - 1];
  ctx.fillRect(X(pp.x) - 1.1 * mm, Y(pp.z) - 3.2 * mm, 0.6 * mm, 2.2 * mm);
  ctx.fillRect(X(pp.x) + 0.5 * mm, Y(pp.z) - 3.2 * mm, 0.6 * mm, 2.2 * mm);
  tri(X(pp.x), Y(pp.z) + 1.9 * mm, 0, 1.4 * mm);

  // D-pad: four arrows round the ring, select in the middle (dark ink on the silver centre).
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    tri(X(Math.cos(a) * 0.0085), Y(DPAD.z + Math.sin(a) * 0.0085), a, 1.6 * mm);
  }
  ctx.fillStyle = '#3a3d46';
  ctx.font = `600 ${2 * mm}px ${SANS}`;
  ctx.fillText('select', X(0), Y(DPAD.z));
  ctx.fillStyle = INK;

  // Rockers: volume and channel, + at the top and − at the bottom, labelled outside the ring.
  const bar = (cx: number, cy: number, w: number, h: number) => ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  for (const x of [-ROCKER.x, ROCKER.x]) {
    const yUp = Y(ROCKER.z - 0.0068);
    bar(X(x), yUp, 2.6 * mm, 0.6 * mm);
    bar(X(x), yUp, 0.6 * mm, 2.6 * mm);
    bar(X(x), Y(ROCKER.z + 0.0068), 2.6 * mm, 0.6 * mm);
  }
  ctx.font = `600 ${1.8 * mm}px ${SANS}`;
  ctx.fillText('vol', X(-ROCKER.x), Y(ROCKER.z));
  ctx.fillText('ch', X(ROCKER.x), Y(ROCKER.z));
}

/**
 * The label decal's texture, or null where there is no DOM canvas (unit tests).
 * It starts blank: printing the labels costs ~15 ms, so `paintRemoteLabels` does
 * it just after the room is ready instead of on the load path.
 */
function remoteLabelTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(REMOTE.width * LABEL_PX_PER_M);
  canvas.height = Math.round(REMOTE.length * LABEL_PX_PER_M);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.paint = () => {
    drawRemoteLabels(ctx, LABEL_PX_PER_M);
    t.needsUpdate = true;
  };
  return t;
}

/** Print the labels onto a remote's blank decal (once). Returns whether anything changed. */
export function paintRemoteLabels(remote: Object3D): boolean {
  const decal = remote.getObjectByName('remoteLabels') as Mesh | undefined;
  const map = (decal?.material as MeshStandardMaterial | undefined)?.map;
  const paint = map?.userData.paint as (() => void) | undefined;
  if (!map || !paint) return false;
  delete map.userData.paint;
  paint();
  return true;
}

/** Narrow a remote-shaped geometry towards the hand end (+z); `under` also thins its underside there. */
function taper(g: BufferGeometry, under = false): BufferGeometry {
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getZ(i) + REMOTE.length / 2) / REMOTE.length; // 0 at the top, 1 at the hand end
    pos.setX(i, pos.getX(i) * (1 - TAPER * t));
    if (under && pos.getY(i) < 0) pos.setY(i, pos.getY(i) * (1 - 0.3 * t));
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Sky remote (one Object3D, four draw calls): a tapered dark body with rubber
 * sides; the silver face plate and every key merged into one mesh (slate-blue
 * service keys and d-pad, dark playback and number keys, the four colour keys);
 * an unlit red LED at the top; and a decal printing the labels and the sky logo.
 * Every lit part is glow-flagged so the hover/idle glow lights the whole remote.
 * It receives but casts no shadow: it moves into the hand, and the lamp's shadow
 * map is static (main.ts). `labels` defaults to a canvas texture (null: no decal).
 */
export function buildRemote(labels: Texture | null = remoteLabelTexture()): Object3D {
  const g = new Group();
  const body = new Mesh(taper(new RoundedBoxGeometry(REMOTE.width, REMOTE.height, REMOTE.length, 2, 0.006), true), flat('#232429', { roughness: 0.7, glow: true }));
  body.name = 'remoteBody';
  body.receiveShadow = true;

  const keyY = PLATE_TOP + KEY_H / 2 - 0.0005; // keys sink 0.5 mm into the plate
  const h = KEY_H + 0.001;
  const oval = (w: number, l: number, extra = 0) => new CylinderGeometry(0.5, 0.5, h + extra, 12).scale(w, 1, l);
  const keys = new Kit();
  const plate = new RoundedBoxGeometry(REMOTE.width - PLATE.inset * 2, PLATE.height, REMOTE.length - 0.01, 1, 0.0009);
  plate.translate(0, TOP + 0.0002, 0);
  keys.add(taper(plate), SILVER);
  for (const k of REMOTE_KEYS) keys.add(oval(k.r * 2, k.r * 2), DARK, { at: [k.x, keyY, k.z] });
  for (const o of OVALS) keys.add(oval(o.w, o.l), o.color, { at: [o.x, keyY, o.z] });
  for (const r of ROUNDS) keys.add(oval(r.r * 2, r.r * 2), r.color, { at: [r.x, keyY, r.z] });
  keys.add(oval(DPAD.ring * 2, DPAD.ring * 2), SLATE, { at: [0, keyY, DPAD.z] });
  keys.add(oval(DPAD.select * 2, DPAD.select * 2, 0.0006), SILVER, { at: [0, keyY + 0.0003, DPAD.z] });
  for (const x of [-ROCKER.x, ROCKER.x]) keys.add(oval(ROCKER.width, ROCKER.length), DARK, { at: [x, keyY, ROCKER.z] });
  keys.add(new BoxGeometry(0.02, 0.008, 0.002), '#3a0d14', { at: [0, 0.001, -REMOTE.length / 2 - 0.0002] }); // IR window
  const keyMesh = keys.build(painted({ roughness: 0.55, glow: true }));
  keyMesh.name = 'remoteKeys';

  const led = new Mesh(new CylinderGeometry(LED.r, LED.r, 0.0008, 10), new MeshBasicMaterial({ color: '#ff4d4d' }));
  led.position.set(0, PLATE_TOP + 0.0002, LED.z);
  led.name = 'led';
  g.add(body, keyMesh, led);

  if (labels) {
    const mat = new MeshStandardMaterial({ map: labels, transparent: true, depthWrite: false, roughness: 0.6 });
    mat.userData.glow = true;
    const decal = new Mesh(new PlaneGeometry(REMOTE.width, REMOTE.length), mat);
    decal.rotation.x = -Math.PI / 2;
    decal.position.y = LABEL_Y;
    decal.name = 'remoteLabels';
    g.add(decal);
  }

  g.position.set(0.1, TABLE_TOP + TOP, 0.08);
  g.rotation.y = -0.25;
  g.name = 'remote';
  return g;
}

/** Aamir's brain (tools/brain), on a small stand, turned so its left side faces the couch. */
async function brain(): Promise<Object3D> {
  const gltf = await new GLTFLoader().loadAsync(withBase('/models/brain.glb'));
  const skin = new MeshStandardMaterial({ color: '#e6a6b0', roughness: 0.7 });
  gltf.scene.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) {
      m.material = skin;
      m.castShadow = true;
    }
  });
  const size = 0.15; // unit-height model → 15 cm tall
  gltf.scene.scale.setScalar(size);
  gltf.scene.position.y = 0.03 + size / 2;
  gltf.scene.rotation.y = Math.PI / 2 - 0.5;

  const g = new Group();
  const stand = shadowed(new Mesh(new CylinderGeometry(0.06, 0.07, 0.03, 8), flat('#3b2f44')));
  stand.position.y = 0.015;
  g.add(stand, gltf.scene);
  g.position.set(0.42, TABLE_TOP, -0.08);
  g.name = 'brain';
  g.userData.href = EASTER_EGGS.brain;
  return g;
}

/**
 * Put the props on the coffee table, and make the floor speakers (decor.ts) a
 * clickable prop too. The brain is fetched; if it fails the room carries on
 * without it (Review Focus 4).
 */
export async function addProps(scene: Scene, table: Object3D): Promise<Props> {
  const r = buildRemote();
  const props: Object3D[] = [chalk(), bat()];
  table.add(r, ...props);
  const posters = wallPosters();
  scene.add(...posters);
  props.push(...posters);
  const speakers = scene.getObjectByName('speakers');
  if (speakers) {
    speakers.userData.href = EASTER_EGGS.speakers;
    props.push(speakers);
  }
  try {
    const b = await brain();
    table.add(b);
    props.push(b);
  } catch (err) {
    console.warn('brain model failed to load; continuing without it', err);
  }
  return { remote: r, props, posters };
}

/** Beat `tv`: the remote is "in your hand", fixed to the lower-right of the view. */
export function holdRemote(remoteObj: Object3D, camera: PerspectiveCamera): void {
  camera.add(remoteObj);
  remoteObj.position.set(0.2, -0.17, -0.45);
  remoteObj.rotation.set(0.9, -0.35, 0.15);
}
