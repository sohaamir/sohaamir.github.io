import {
  NeutralToneMapping,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  SpotLight,
  Scene,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ROOM, couchExtras, decor, tableTop } from './decor';
import { renderQuality } from './frame-pacing';
import { Kit, satin } from './kit';

export type Room = {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  targets: { couch: Object3D; table: Object3D; tvScreen: Mesh };
  dispose(): void;
};

/** Daytime palette: warm white walls, oak, a muted rust couch, an amber lamp; `night` is the sky fallback. */
const PALETTE = {
  couch: '#86473a',
  cushion: '#925244',
  tvStand: '#b58d63',
  tvStandSeam: '#5e452f',
  leg: '#2b2522',
  metal: '#2a2b30',
  trim: '#6b6d74',
  grille: '#1b1b1f',
  box: '#f0efec',
  vase: '#c9b9a0',
  tvBody: '#0b0b0f',
  screenOff: '#0c0f17',
  standby: '#ff3b3b',
  lampShade: '#ffcf8a',
  lampLight: '#ffb35c',
  lampPole: '#5a4a3e',
  night: '#a9cdee',
  frame: '#f1ece3',
  ambient: '#ffffff',
  skyFill: '#f3f6fb',
  groundFill: '#8a7462',
  tvLight: '#6aa8ff',
} as const;

/**
 * Light levels. A bright daytime room: a warm white fill (ambient + sky/floor
 * hemisphere), a warm lamp with a gentler falloff (decay < 2) for a cosy pool
 * by the couch, and sunlight from the window side. The TV screen is unlit and not
 * tone-mapped, so exposure does not wash it out.
 */
const LIGHTS = {
  exposure: 1.0,
  ambient: 0.55,
  hemisphere: 1.5,
  lamp: 9,
  lampSpot: 12,
  spotAngle: 1.0,
  lampDecay: 1.5,
  shade: 1.8,
  sun: 3.0,
} as const;

/** Glowable materials (couch fabric, remote body) are flagged so main.ts can pulse them. */
export function flat(color: string, opts: { roughness?: number; glow?: boolean } = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.85 });
  if (opts.glow) m.userData.glow = true;
  return m;
}

function box(w: number, h: number, d: number, mat: Material, x = 0, y = 0, z = 0, radius = 0): Mesh {
  const m = new Mesh(radius > 0 ? new RoundedBoxGeometry(w, h, d, 2, radius) : new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Couch: frame, seat cushions, back and arms merged into one mesh, plus its cushions (decor.ts). */
function couch(): Group {
  const k = new Kit();
  // Upholstered: every part has softly rounded edges (padded fabric, not boxes).
  const part = (w: number, h: number, d: number, color: string, x: number, y: number, z: number, r: number) =>
    k.add(new RoundedBoxGeometry(w, h, d, 3, r), color, { at: [x, y, z] });
  // A modern sofa: the base sits on short tapered legs, off the floor.
  part(2.3, 0.3, 0.9, PALETTE.couch, 0, 0.25, 0, 0.04);
  part(1.02, 0.14, 0.76, PALETTE.cushion, -0.53, 0.47, -0.05, 0.05);
  part(1.02, 0.14, 0.76, PALETTE.cushion, 0.53, 0.47, -0.05, 0.05);
  part(2.3, 0.58, 0.22, PALETTE.couch, 0, 0.69, 0.34, 0.07);
  part(0.2, 0.52, 0.92, PALETTE.couch, -1.25, 0.36, 0, 0.08);
  part(0.2, 0.52, 0.92, PALETTE.couch, 1.25, 0.36, 0, 0.08);
  for (const x of [-1.22, 1.22]) {
    for (const z of [-0.36, 0.36]) k.add(new CylinderGeometry(0.022, 0.014, 0.1, 10), PALETTE.leg, { at: [x, 0.05, z] });
  }
  const g = new Group();
  g.add(k.build(satin({ glow: true }), { cast: true }), couchExtras());
  g.position.set(0, 0, 1.75);
  g.name = 'couch';
  return g;
}

/** Table group origin is on the floor; its top surface is at TABLE_TOP (local y). */
export const TABLE_TOP = 0.49;

function table(): Group {
  const g = new Group();
  g.add(tableTop(TABLE_TOP));
  g.position.set(0, 0, 0.3);
  g.name = 'table';
  return g;
}

/**
 * The switched-off screen: near-black glass with a faint diagonal sheen (the window's
 * reflection, painted once into a small canvas instead of a real reflection pass).
 */
function screenOffTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = PALETTE.screenOff;
  ctx.fillRect(0, 0, 160, 90);
  const sheen = ctx.createLinearGradient(40, 0, 130, 90);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.45, 'rgba(200,215,235,0.07)');
  sheen.addColorStop(0.55, 'rgba(200,215,235,0.10)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 160, 90);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** TV depth (m); its front face sits just behind the screen plane at z = −2.744. */
const TV_DEPTH = 0.035;

/**
 * A slim, thin-bezel TV on a pedestal stand, on a low oak media console with
 * three doors and black metal legs. The console and stand are one mesh (Kit).
 */
function tv(): { group: Group; screen: Mesh } {
  const g = new Group();
  const k = new Kit();
  const cz = -2.72;
  const legH = 0.12;
  const body = { w: 2.0, h: 0.36, d: 0.42 };
  k.add(new RoundedBoxGeometry(body.w, body.h, body.d, 2, 0.012), PALETTE.tvStand, { at: [0, legH + body.h / 2, cz] });
  const front = cz + body.d / 2 + 0.001;
  for (const x of [-body.w / 6, body.w / 6]) k.add(new BoxGeometry(0.006, body.h - 0.05, 0.003), PALETTE.tvStandSeam, { at: [x, legH + body.h / 2, front] });
  for (const x of [-body.w / 3, 0, body.w / 3]) k.add(new BoxGeometry(0.12, 0.012, 0.012), PALETTE.metal, { at: [x, legH + body.h - 0.06, front + 0.006] });
  for (const x of [-0.92, 0.92]) for (const z of [cz - 0.17, cz + 0.17]) k.add(new CylinderGeometry(0.012, 0.01, legH, 8), PALETTE.metal, { at: [x, legH / 2, z] });
  const top = legH + body.h;
  const tvZ = -2.744 - TV_DEPTH / 2 - 0.001;
  k.add(new RoundedBoxGeometry(0.38, 0.012, 0.22, 1, 0.005), PALETTE.metal, { at: [0, top + 0.006, cz - 0.04] });
  k.add(new BoxGeometry(0.07, 1.07 - 0.435 - 0.022 - top, 0.025), PALETTE.metal, { at: [0, (top + 1.07 - 0.435 - 0.022) / 2, tvZ - 0.01] });
  // On the console: a soundbar in front of the stand, a set-top box, books and a vase.
  k.add(new RoundedBoxGeometry(0.9, 0.06, 0.09, 2, 0.02), PALETTE.metal, { at: [0, top + 0.03, cz + 0.13] });
  k.add(new BoxGeometry(0.86, 0.04, 0.003), PALETTE.grille, { at: [0, top + 0.03, cz + 0.176] });
  k.add(new RoundedBoxGeometry(0.28, 0.045, 0.2, 2, 0.008), PALETTE.box, { at: [0.72, top + 0.0225, cz - 0.02] });
  k.add(new BoxGeometry(0.004, 0.004, 0.002), PALETTE.standby, { at: [0.62, top + 0.03, cz + 0.081] });
  k.add(new BoxGeometry(0.22, 0.035, 0.16), '#3f5f8f', { at: [-0.72, top + 0.0175, cz], rot: [0, 0.12, 0] });
  k.add(new BoxGeometry(0.2, 0.03, 0.15), '#a46e48', { at: [-0.72, top + 0.05, cz], rot: [0, -0.08, 0] });
  k.add(new CylinderGeometry(0.035, 0.05, 0.2, 20), PALETTE.vase, { at: [-0.86, top + 0.1, cz - 0.08] });
  k.add(new CylinderGeometry(0.018, 0.035, 0.05, 20), PALETTE.vase, { at: [-0.86, top + 0.225, cz - 0.08] });

  // The TV's own detail: a slim metal edge, a chin with a logo, the thicker rear housing.
  const tvTop = 1.07 + 0.435;
  const tvBottom = 1.07 - 0.435;
  const edge = (w: number, h: number, x: number, y: number) =>
    k.add(new BoxGeometry(w, h, TV_DEPTH + 0.004), PALETTE.trim, { at: [x, y, tvZ] });
  edge(1.536, 0.003, 0, tvTop + 0.0015);
  edge(1.536, 0.003, 0, tvBottom - 0.0015);
  edge(0.003, 0.876, -0.7665, 1.07);
  edge(0.003, 0.876, 0.7665, 1.07);
  k.add(new BoxGeometry(1.53, 0.022, TV_DEPTH), PALETTE.tvBody, { at: [0, tvBottom - 0.011, tvZ] });
  k.add(new BoxGeometry(0.06, 0.006, 0.002), PALETTE.trim, { at: [0, tvBottom - 0.011, tvZ + TV_DEPTH / 2 + 0.001] });
  k.add(new RoundedBoxGeometry(1.1, 0.55, 0.05, 2, 0.02), PALETTE.tvBody, { at: [0, 1.0, tvZ - TV_DEPTH / 2 - 0.02] });

  const stand = k.build(satin(), { cast: true });
  stand.name = 'tvStand';
  g.add(stand, box(1.53, 0.87, TV_DEPTH, flat(PALETTE.tvBody, { roughness: 0.3 }), 0, 1.07, tvZ, 0.008));
  const offMap = screenOffTexture();
  const screen = new Mesh(
    new PlaneGeometry(1.5, 0.84),
    new MeshStandardMaterial(
      offMap ? { map: offMap, roughness: 0.2, metalness: 0.1 } : { color: PALETTE.screenOff, roughness: 0.2, metalness: 0.1 },
    ),
  );
  screen.position.set(0, 1.07, -2.744);
  screen.name = 'tvScreen';

  const standby = new Mesh(new CircleGeometry(0.004, 8), new MeshBasicMaterial({ color: PALETTE.standby }));
  standby.position.set(0, -0.428, 0.002);
  standby.name = 'standby';

  // Off until the TV screen switches on (tv-screen.ts).
  const glow = new PointLight(PALETTE.tvLight, 0, 7, 2);
  glow.position.set(0, 0, 0.6);
  glow.name = 'tvLight';

  screen.add(standby, glow);
  g.add(screen);
  return { group: g, screen };
}

/** Floor lamp in the back-left corner; its key light is aimed between the table and the couch. */
const LAMP = { at: [-2.2, 0, -1.7], bulbY: 1.42, aim: [0.2, 0.2, 0.9] } as const;

export function lamp(): Group {
  const g = new Group();
  const pole = flat(PALETTE.lampPole);
  const base = new Mesh(new CylinderGeometry(0.18, 0.2, 0.04, 32), pole);
  base.position.y = 0.02;
  const stick = new Mesh(new CylinderGeometry(0.02, 0.02, 1.45, 12), pole);
  stick.position.y = 0.745;
  const shade = new Mesh(
    new CylinderGeometry(0.17, 0.28, 0.32, 32, 1, true),
    new MeshStandardMaterial({
      color: PALETTE.lampShade,
      emissive: PALETTE.lampLight,
      emissiveIntensity: LIGHTS.shade,
      side: DoubleSide,
    }),
  );
  shade.position.y = 1.55;

  // The bulb lights the whole room but casts no shadow: three's point-light shadows
  // (a cube depth texture) come out garbled on ANGLE's Metal backend, the default in
  // Chrome and Safari on Macs (stray, pixelated copies of every shadow on the walls).
  // The shadows come from a spotlight at the bulb aimed at the couch and table: a
  // plain 2D shadow map (one pass instead of six), drawn once (static, main.ts).
  const bulb = new PointLight(PALETTE.lampLight, LIGHTS.lamp, 0, LIGHTS.lampDecay);
  bulb.position.y = LAMP.bulbY;
  const key = new SpotLight(PALETTE.lampLight, LIGHTS.lampSpot, 0, LIGHTS.spotAngle, 1, LIGHTS.lampDecay);
  key.position.y = LAMP.bulbY;
  key.target.position.set(LAMP.aim[0] - LAMP.at[0], LAMP.aim[1], LAMP.aim[2] - LAMP.at[2]);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.3;
  key.shadow.camera.far = 8;
  key.shadow.bias = -0.0005;
  key.shadow.radius = 3;
  key.name = 'lampKey';

  g.add(base, stick, shade, bulb, key, key.target);
  g.position.set(LAMP.at[0], 0, LAMP.at[2]);
  return g;
}

/**
 * The view out of the window on a fine day: sky fading to a hazy horizon, a few soft
 * clouds, and a far line of trees and rooftops. Drawn once into a small canvas (256×232).
 */
function skyTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const W = 256;
  const H = 232;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#7fb0e0');
  sky.addColorStop(0.65, '#bcd8ef');
  sky.addColorStop(1, '#e4eef4');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, r] of [[60, 50, 34], [92, 44, 26], [190, 80, 30], [214, 86, 22], [140, 120, 18]] as const) {
    const c = ctx.createRadialGradient(x, y, 0, x, y, r);
    c.addColorStop(0, 'rgba(255,255,255,0.85)');
    c.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.6, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Rooftops, then a tree line in front of them.
  ctx.fillStyle = '#9aa5b2';
  for (const [x, w, h] of [[10, 50, 34], [70, 40, 46], [150, 60, 30], [215, 40, 40]] as const) ctx.fillRect(x, H - 40 - h, w, h + 40);
  ctx.fillStyle = '#6f8f72';
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, H - 38 - 14 * Math.abs(Math.sin(x * 0.07)) - 8 * Math.abs(Math.sin(x * 0.19 + 1)));
  ctx.lineTo(W, H);
  ctx.fill();
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function windowView(): Group {
  const g = new Group();
  const frameMat = flat(PALETTE.frame, { roughness: 0.5 });
  g.add(box(1.16, 1.06, 0.05, frameMat, 0, 0, 0, 0.01));
  const view = skyTexture();
  const pane = new Mesh(new PlaneGeometry(1.02, 0.92), new MeshBasicMaterial(view ? { map: view } : { color: PALETTE.night }));
  pane.position.z = 0.027;
  g.add(pane, box(0.03, 0.92, 0.03, frameMat, 0, 0, 0.04), box(1.02, 0.03, 0.03, frameMat, 0, 0, 0.04));
  g.position.set(1.85, 1.65, ROOM.back + 0.03);
  return g;
}

export function createRoom(canvas: HTMLCanvasElement): Room {
  const quality = renderQuality(devicePixelRatio);
  const renderer = new WebGLRenderer({ canvas, antialias: quality.antialias });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = true;
  // Static shadows: the lamp's shadow map (an extra pass) is drawn once and again
  // only when objects move (main.ts sets needsUpdate), not every frame.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  // Khronos PBR Neutral: keeps base colours true and rolls highlights off gently
  // (ACES pushes warm tones towards orange, which reads as cartoonish here).
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = LIGHTS.exposure;

  const scene = new Scene();
  scene.background = new Color(PALETTE.night);

  const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 30);
  scene.add(camera); // so objects parented to the camera (the held remote) render

  const couchGroup = couch();
  const tableGroup = table();
  const { group: tvGroup, screen } = tv();

  const sunlight = new DirectionalLight('#fff6e8', LIGHTS.sun);
  sunlight.position.set(1.8, 2.5, -4);
  scene.add(
    new AmbientLight(PALETTE.ambient, LIGHTS.ambient),
    new HemisphereLight(PALETTE.skyFill, PALETTE.groundFill, LIGHTS.hemisphere),
    sunlight,
    decor(),
    couchGroup,
    tableGroup,
    tvGroup,
    lamp(),
    windowView(),
  );

  const onResize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight, false);
  };
  addEventListener('resize', onResize);

  const dispose = () => {
    removeEventListener('resize', onResize);
    renderer.setAnimationLoop(null);
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      (mesh.geometry as BufferGeometry).dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        (m as MeshStandardMaterial).map?.dispose(); // canvas textures (poster, remote labels)
        m.dispose();
      });
    });
    renderer.dispose();
  };

  return { scene, camera, renderer, targets: { couch: couchGroup, table: tableGroup, tvScreen: screen }, dispose };
}
