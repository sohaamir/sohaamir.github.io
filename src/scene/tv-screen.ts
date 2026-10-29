import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace, type Material, type Mesh, type PointLight } from 'three';
import { CHANNELS } from '../lib/channels';
import type { RoomState } from './state';

const LAST = String(CHANNELS.length).padStart(2, '0');
export const MENU_HEADER = `AAMIR SOHAIL · CH 01–${LAST}`;

export type MenuModel = {
  header: string;
  /** `▶ 2 publications` for the highlighted row, `  1 about` for the others. */
  rows: string[];
  highlighted: number;
  /** Label of the highlighted channel and its summary. */
  label: string;
  preview: string;
};

export type TvScreen = {
  render(s: RoomState): void;
  /** Switch on: a ~400 ms flicker (or straight on with `flicker: false`). Idempotent. */
  on(opts?: { flicker?: boolean }): Promise<void>;
  /** What is drawn now (for tests and debugging). */
  model(): MenuModel & { on: boolean };
  /** The lit screen's material (its shader and texture can be prepared before the screen switches on). */
  readonly material: MeshBasicMaterial;
};

/** Canvas size and the channel list's box, in canvas pixels (also used for picking rows). */
export const ROW_LAYOUT = { width: 1024, height: 576, top: 134, rowHeight: 46, left: 150, right: 874 } as const;
/** The programme-info box under the rows. */
const INFO = { top: 378, bottom: 478, pad: 22 } as const;
/** Bold, rounded-ish sans like an early-2000s satellite guide. */
const FONT = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const INK = '#ffffff';
const NAVY = '#1b2a7a';
const AMBER = '#ffd23f';
const TV_LIGHT = 9;
const FLICKER_MS = 400;
/** Brightness over the flicker: a few uneven blinks, then full on. */
const FLICKER = [0.15, 0.9, 0.05, 0.6, 0.2, 1, 0.55, 1];

export function menuModel(s: RoomState): MenuModel {
  const current = CHANNELS[s.highlighted] ?? CHANNELS[0];
  return {
    header: MENU_HEADER,
    rows: CHANNELS.map((c, i) => `${i === s.highlighted ? '▶' : ' '} ${c.num} ${c.label}`),
    highlighted: s.highlighted,
    label: current.label,
    preview: current.blurb,
  };
}

/**
 * Word-wrap `text` into at most `maxLines` lines no wider than `maxWidth`.
 * Whatever does not fit is cut with an ellipsis on the last line.
 */
export function fitLines(text: string, maxWidth: number, maxLines: number, measure: (t: string) => number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  let i = 0;
  for (; i < words.length && lines.length < maxLines; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (measure(next) <= maxWidth) {
      line = next;
    } else if (!line) {
      line = words[i]; // a single word wider than the line: ellipsize below
      i++;
      break;
    } else {
      lines.push(line);
      line = '';
      i--;
    }
  }
  const overflow = i < words.length || measure(line) > maxWidth;
  if (line && lines.length < maxLines) lines.push(line);
  if (overflow && lines.length) {
    let last = lines[lines.length - 1];
    while (last && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

/** Which channel row a point on the screen (mesh uv, origin bottom-left) falls in, if any. */
export function rowAt(uv: { x: number; y: number }): number | null {
  const { width, height, top, rowHeight, left, right } = ROW_LAYOUT;
  const px = uv.x * width;
  const py = (1 - uv.y) * height;
  if (px < left || px > right || py < top) return null;
  const i = Math.floor((py - top) / rowHeight);
  return i >= 0 && i < CHANNELS.length ? i : null;
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

type Icon = (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void;

/** One outlined pictogram per channel (about, publications, cv, journey, blog), centred on cx, cy. */
const ICONS: Record<string, Icon> = {
  about: (ctx, cx, cy) => {
    ctx.beginPath();
    ctx.arc(cx, cy - 8, 9, 0, Math.PI * 2);
    ctx.moveTo(cx - 18, cy + 20);
    ctx.quadraticCurveTo(cx - 18, cy + 3, cx, cy + 3);
    ctx.quadraticCurveTo(cx + 18, cy + 3, cx + 18, cy + 20);
    ctx.closePath();
    ctx.stroke();
  },
  publications: (ctx, cx, cy) => {
    // An open book: two pages meeting at the spine.
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.quadraticCurveTo(cx - 12, cy - 18, cx - 24, cy - 14);
    ctx.lineTo(cx - 24, cy + 16);
    ctx.quadraticCurveTo(cx - 12, cy + 12, cx, cy + 18);
    ctx.quadraticCurveTo(cx + 12, cy + 12, cx + 24, cy + 16);
    ctx.lineTo(cx + 24, cy - 14);
    ctx.quadraticCurveTo(cx + 12, cy - 18, cx, cy - 12);
    ctx.lineTo(cx, cy + 18);
    ctx.stroke();
  },
  cv: (ctx, cx, cy) => {
    // A page with a folded corner and text lines.
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy - 20);
    ctx.lineTo(cx + 7, cy - 20);
    ctx.lineTo(cx + 15, cy - 12);
    ctx.lineTo(cx + 15, cy + 20);
    ctx.lineTo(cx - 15, cy + 20);
    ctx.closePath();
    for (let k = 0; k < 3; k++) {
      ctx.moveTo(cx - 8, cy - 4 + k * 8);
      ctx.lineTo(cx + 8, cy - 4 + k * 8);
    }
    ctx.stroke();
  },
  journey: (ctx, cx, cy) => {
    // A camera.
    roundRect(ctx, cx - 24, cy - 12, 48, 32, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 12);
    ctx.lineTo(cx - 6, cy - 19);
    ctx.lineTo(cx + 6, cy - 19);
    ctx.lineTo(cx + 10, cy - 12);
    ctx.moveTo(cx + 10, cy + 4);
    ctx.arc(cx, cy + 4, 10, 0, Math.PI * 2);
    ctx.stroke();
  },
  blog: (ctx, cx, cy) => {
    // A pencil, writing on a line.
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy + 14);
    ctx.lineTo(cx - 12, cy + 2);
    ctx.lineTo(cx + 10, cy - 20);
    ctx.lineTo(cx + 18, cy - 12);
    ctx.lineTo(cx - 4, cy + 10);
    ctx.closePath();
    ctx.moveTo(cx + 4, cy - 14);
    ctx.lineTo(cx + 12, cy - 6);
    ctx.moveTo(cx - 24, cy + 20);
    ctx.lineTo(cx + 24, cy + 20);
    ctx.stroke();
  },
};

/** Header: the wordmark, then one tab per channel with its icon; the highlighted channel's tab is lit. */
function drawHeader(ctx: CanvasRenderingContext2D, highlighted: number): void {
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = `900 46px ${FONT}`;
  ctx.fillText('aamir', 28, 50);
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText('guide', 32, 92);
  const x0 = 214;
  const tabW = (ROW_LAYOUT.width - 10 - x0) / CHANNELS.length;
  CHANNELS.forEach((c, i) => {
    const cx = x0 + tabW * i + tabW / 2;
    const on = i === highlighted;
    if (on) {
      ctx.fillStyle = 'rgba(16, 40, 130, 0.55)';
      roundRect(ctx, cx - tabW / 2 + 4, 8, tabW - 8, 104, 10);
      ctx.fill();
    }
    ctx.strokeStyle = on ? AMBER : INK;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ICONS[c.slug]?.(ctx, cx, 40);
    ctx.fillStyle = on ? AMBER : INK;
    ctx.textAlign = 'center';
    const label = c.label.toUpperCase();
    let size = 20;
    do ctx.font = `italic 800 ${size}px ${FONT}`;
    while (ctx.measureText(label).width > tabW - 14 && --size > 12);
    ctx.fillText(label, cx, 90);
  });
  ctx.textAlign = 'left';
}

function drawRow(ctx: CanvasRenderingContext2D, num: string, label: string, y: number, on: boolean): void {
  const { rowHeight, left, right } = ROW_LAYOUT;
  const h = rowHeight - 8;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, on ? '#ffe36b' : '#30469f');
  g.addColorStop(1, on ? '#f2a516' : NAVY);
  ctx.fillStyle = g;
  ctx.fillRect(left, y + 4, right - left, h);
  ctx.fillStyle = on ? 'rgba(255, 255, 255, 0.7)' : 'rgba(120, 150, 230, 0.8)';
  ctx.fillRect(left, y + 4, right - left, 2);
  ctx.fillStyle = on ? NAVY : INK;
  ctx.font = `900 26px ${FONT}`;
  ctx.fillText(num, left + 26, y + rowHeight / 2 + 1);
  ctx.fillText(label.toUpperCase(), left + 72, y + rowHeight / 2 + 1);
}

/** A key cap printed in the footer ("Press ENTER …"). */
function keyCap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): number {
  ctx.font = `900 22px ${FONT}`;
  const w = ctx.measureText(text).width + 20;
  ctx.fillStyle = AMBER;
  ctx.fillRect(x, y - 16, w, 32);
  ctx.fillStyle = NAVY;
  ctx.fillText(text, x + 10, y + 1);
  return w;
}

function draw(ctx: CanvasRenderingContext2D, m: MenuModel): void {
  const { width, height, top, rowHeight, left, right } = ROW_LAYOUT;
  // Pale sky blue at the top left, deepening to the bottom right, with a soft sheen.
  const g = ctx.createLinearGradient(0, 0, width * 0.6, height);
  g.addColorStop(0, '#b4cff3');
  g.addColorStop(0.55, '#6d98dc');
  g.addColorStop(1, '#2c5bb4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  const sheen = ctx.createRadialGradient(width * 0.75, height * 0.15, 20, width * 0.75, height * 0.15, 520);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'middle';

  drawHeader(ctx, m.highlighted);

  // A little "more above" arrow at the list's top right, as in the guide.
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(right - 26, top - 4);
  ctx.lineTo(right - 14, top - 18);
  ctx.lineTo(right - 2, top - 4);
  ctx.fill();

  CHANNELS.forEach((c, i) => drawRow(ctx, String(c.num), c.label, top + rowHeight * i, i === m.highlighted));

  // Programme info for the highlighted channel.
  ctx.fillStyle = 'rgba(14, 28, 100, 0.82)';
  ctx.fillRect(left, INFO.top, right - left, INFO.bottom - INFO.top);
  const x = left + INFO.pad;
  ctx.fillStyle = AMBER;
  ctx.font = `900 24px ${FONT}`;
  ctx.fillText(`CH ${String(m.highlighted + 1).padStart(2, '0')}  ${m.label.toUpperCase()}`, x, INFO.top + 28);
  ctx.fillStyle = INK;
  ctx.font = `600 24px ${FONT}`;
  fitLines(m.preview, right - left - INFO.pad * 2, 2, (t) => ctx.measureText(t).width).forEach((line, i) => {
    ctx.fillText(line, x, INFO.top + 64 + i * 30);
  });

  // Footer: what the keys do, and whose guide this is.
  ctx.fillStyle = INK;
  ctx.font = `900 22px ${FONT}`;
  ctx.fillText('Press', left, 522);
  const w = keyCap(ctx, 'ENTER', left + ctx.measureText('Press ').width, 522);
  ctx.fillStyle = INK;
  ctx.font = `900 22px ${FONT}`;
  ctx.fillText('to learn more', left + ctx.measureText('Press ').width + w + 10, 522);
  ctx.textAlign = 'right';
  ctx.fillText(`1–${CHANNELS.length} to jump`, right, 522);
  ctx.font = `700 16px ${FONT}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fillText(m.header, right, 556);
  ctx.textAlign = 'left';
}

/**
 * The TV's menu (spec §3.3), drawn on a canvas texture in the style of an early
 * satellite TV guide: tabbed header, the channel rows with the highlighted one in
 * amber, and a programme-info box for that channel.
 * Until `on()` the screen keeps its dark "off" material and the standby dot.
 */
export function createTvScreen(mesh: Mesh): TvScreen {
  const canvas = document.createElement('canvas');
  canvas.width = ROW_LAYOUT.width;
  canvas.height = ROW_LAYOUT.height;
  const ctx = canvas.getContext('2d');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  // Unlit and not tone-mapped, so the text keeps its contrast; no specular hotspot either.
  const lit = new MeshBasicMaterial({ map: texture, toneMapped: false });
  const light = mesh.getObjectByName('tvLight') as PointLight | undefined;
  const standby = mesh.getObjectByName('standby');

  let current = menuModel({ beat: 'tv', highlighted: 0, moving: false });
  let drawn = '';
  let isOn = false;
  let switching: Promise<void> | null = null;

  const render = (s: RoomState) => {
    current = menuModel(s);
    const key = JSON.stringify(current);
    if (key === drawn || !ctx) return;
    drawn = key;
    draw(ctx, current);
    texture.needsUpdate = true;
  };

  const brightness = (b: number) => {
    lit.color.setScalar(b);
    if (light) light.intensity = TV_LIGHT * b;
  };

  const on = (opts: { flicker?: boolean } = {}): Promise<void> => {
    if (switching) return switching;
    isOn = true;
    (mesh.material as Material).dispose();
    mesh.material = lit;
    if (standby) standby.visible = false;
    if (opts.flicker === false) {
      brightness(1);
      switching = Promise.resolve();
      return switching;
    }
    brightness(FLICKER[0]);
    switching = new Promise((resolve) => {
      const start = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / FLICKER_MS);
        brightness(k >= 1 ? 1 : FLICKER[Math.floor(k * FLICKER.length)]);
        if (k < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    return switching;
  };

  return { render, on, model: () => ({ ...current, on: isOn }), material: lit };
}
