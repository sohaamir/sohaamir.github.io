// Frame-time probe for the living room (not part of the e2e suite).
//
// Loads the production preview, then records requestAnimationFrame deltas while it
// idles at each beat and while it glides arrive → seated → tv. Prints, per segment:
// frames, p50/p95/max frame ms, dropped frames (> 20 ms) and WebGL draw calls per frame.
//
// Usage:
//   node tools/perf-probe.mjs                 # builds dist/ if missing, serves it on a free port
//   BASE_URL=http://127.0.0.1:4321 node tools/perf-probe.mjs   # use a running `npm run preview`
// Options:
//   --build          rebuild dist/ first (when it serves its own preview)
//   --headed         run a visible browser (real GPU) instead of headless (software GL)
//   --angle=metal    pass --use-angle=<backend> to Chromium (e.g. metal on a Mac); real GPU even headless
//   --runs=N         repeat the whole sequence N times and pool the frames (default 2)
//   --dpr=N          deviceScaleFactor (default 2: a retina Mac); viewport is 1440×900
//   --json           print the raw summary as JSON as well
//   --trace          list every dropped frame (index in its segment, ms, draw calls)
//   --uncapped       turn off vsync and the frame-rate limit, so frame times show the real
//                    cost of a frame instead of sitting at the display's 16.7 ms (headroom)
//
// Headless Chromium renders WebGL with SwiftShader (on the CPU), so its absolute numbers
// are pessimistic: compare before/after on the same machine and mode.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const RUNS = Number(args.runs ?? 2);
const DPR = Number(args.dpr ?? 2);
const DROP_MS = 20;
const IDLE_MS = 2500;

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

async function waitForHttp(url, ms = 30_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview did not answer at ${url}`);
}

/** Serve dist/ with `astro preview` on a free port (never 4321, which the e2e suite owns). */
async function startPreview() {
  if (args.build || !existsSync(`${root}/dist/index.html`)) {
    const b = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
    if (b.status !== 0) throw new Error('build failed');
  }
  let port = await freePort();
  if (port === 4321) port = await freePort();
  const child = spawn('npx', ['astro', 'preview', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'], {
    cwd: root,
    stdio: 'ignore',
    detached: true,
  });
  const url = `http://127.0.0.1:${port}`;
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGTERM'); // the whole group: npx and the astro server under it
    } catch {}
  };
  try {
    await waitForHttp(url);
  } catch (e) {
    stop();
    throw e;
  }
  return { url, stop };
}

// Runs in the page before any script: count WebGL draw calls so a frame's cost is visible.
function countDrawCalls() {
  window.__draws = 0;
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const orig = C.prototype[name];
      if (!orig) continue;
      C.prototype[name] = function (...a) {
        window.__draws++;
        return orig.apply(this, a);
      };
    }
  }
}

/** Start sampling rAF deltas in the page (and draw calls per frame). */
const startRecording = (page) =>
  page.evaluate(() => {
    const rec = { deltas: [], draws: [], stop: false };
    window.__rec = rec;
    let last = performance.now();
    let lastDraws = window.__draws;
    const tick = (now) => {
      if (rec.stop) return;
      rec.deltas.push(now - last);
      rec.draws.push(window.__draws - lastDraws);
      last = now;
      lastDraws = window.__draws;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

const stopRecording = (page) =>
  page.evaluate(() => {
    const rec = window.__rec;
    rec.stop = true;
    return { deltas: rec.deltas.slice(1), draws: rec.draws.slice(1) }; // first delta spans the evaluate call
  });

const settled = (page, beat) =>
  page.waitForFunction((b) => window.__room?.state().beat === b && !window.__room.state().moving, beat, {
    timeout: 30_000,
  });

const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : NaN);

function summarise(deltas, draws) {
  const s = [...deltas].sort((a, b) => a - b);
  const drawFrames = draws.filter((d) => d > 0);
  return {
    frames: deltas.length,
    p50: quantile(s, 0.5),
    p95: quantile(s, 0.95),
    max: s[s.length - 1] ?? NaN,
    dropped: deltas.filter((d) => d > DROP_MS).length,
    renderedFrames: drawFrames.length,
    drawsPerFrame: drawFrames.length ? Math.max(...drawFrames) : 0,
  };
}

async function runOnce(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR });
  await context.addInitScript(countDrawCalls);
  const page = await context.newPage();
  const out = {};
  const segment = async (name, action, until) => {
    await startRecording(page);
    const t0 = Date.now();
    await action();
    await until();
    const r = await stopRecording(page);
    out[name] = { ...summarise(r.deltas, r.draws), wallMs: Date.now() - t0 };
    if (args.trace) {
      const slow = r.deltas.flatMap((d, i) => (d > DROP_MS ? [`#${i}:${d.toFixed(0)}ms/${r.draws[i]}dc`] : []));
      if (slow.length) console.log(`  ${name}: ${slow.join(' ')} (of ${r.deltas.length})`);
    }
  };
  const idle = () => page.waitForTimeout(IDLE_MS);

  await page.goto(`${base}/`);
  await page.waitForFunction(() => window.__room?.ready === true, null, { timeout: 30_000 });
  await page.waitForTimeout(1000); // let first-frame work (shader compile, brain upload) finish
  await segment('idle arrive', async () => {}, idle);
  await segment('arrive → seated', () => page.keyboard.press('Enter'), () => settled(page, 'seated'));
  await segment('idle seated', async () => {}, idle);
  await segment('seated → tv', () => page.keyboard.press('Enter'), () => settled(page, 'tv'));
  await segment('idle tv', async () => {}, idle);
  await segment('menu ArrowDown ×3', async () => {
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);
    }
  }, async () => {});
  const info = await page.evaluate(() => ({ dpr: devicePixelRatio, canvas: [document.querySelector('canvas')?.width, document.querySelector('canvas')?.height] }));
  await context.close();
  return { out, info };
}

function pool(runs) {
  const names = Object.keys(runs[0].out);
  return Object.fromEntries(
    names.map((n) => {
      const r = runs.map((x) => x.out[n]);
      const avg = (k) => r.reduce((a, b) => a + b[k], 0) / r.length;
      return [
        n,
        {
          frames: avg('frames'),
          p50: avg('p50'),
          p95: avg('p95'),
          max: Math.max(...r.map((x) => x.max)),
          dropped: avg('dropped'),
          renderedFrames: avg('renderedFrames'),
          drawsPerFrame: Math.max(...r.map((x) => x.drawsPerFrame)),
          wallMs: avg('wallMs'),
        },
      ];
    }),
  );
}

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-');

let server = null;
const base = process.env.BASE_URL ?? (server = await startPreview()).url;
const launchArgs = [
  // --enable-gpu lets headless Chromium use the real GPU too (not SwiftShader).
  ...(args.angle ? [`--use-angle=${args.angle}`, '--enable-gpu', '--ignore-gpu-blocklist'] : []),
  ...(args.uncapped ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
];
const browser = await chromium.launch({ headless: !args.headed, args: launchArgs });
try {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await runOnce(browser, base));
  const summary = pool(runs);
  const mode = `${args.headed ? 'headed' : 'headless'}${args.angle ? ` angle=${args.angle}` : ''}${args.uncapped ? ' uncapped' : ''}`;
  console.log(`perf-probe ${base}  ${mode}  1440×900 @${DPR}x  canvas ${runs[0].info.canvas.join('×')}  runs=${RUNS}`);
  console.log('segment              frames   p50ms   p95ms   maxms  dropped>20ms  rendered  draws/frame  wall ms');
  for (const [name, s] of Object.entries(summary)) {
    console.log(
      `${name.padEnd(20)} ${fmt(s.frames, 0).padStart(6)} ${fmt(s.p50).padStart(7)} ${fmt(s.p95).padStart(7)} ${fmt(s.max).padStart(7)} ${fmt(s.dropped).padStart(13)} ${fmt(s.renderedFrames, 0).padStart(9)} ${String(s.drawsPerFrame).padStart(12)} ${fmt(s.wallMs, 0).padStart(8)}`,
    );
  }
  if (args.json) console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
  server?.stop();
}
