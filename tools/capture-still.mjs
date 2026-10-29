// Regenerates public/img/room-still.webp: the room at beat `tv`, for the no-WebGL fallback.
// Needs a running site:  npm run build && npm run preview -- --port 4321   (override with BASE_URL)
// Usage: node tools/capture-still.mjs
// Playwright screenshots are PNG/JPEG only, so the PNG is re-encoded to WebP in a blank page's 2D canvas.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const out = new URL('../public/img/room-still.webp', import.meta.url);
const QUALITY = 0.8;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${base}/?tv=1`);
  await page.waitForFunction(() => window.__room?.ready === true, null, { timeout: 15_000 });
  await page.waitForTimeout(1500); // let the screen's power-on settle
  const png = (await page.screenshot({ type: 'png' })).toString('base64');

  const blank = await browser.newPage();
  const webp = await blank.evaluate(
    async ({ png, quality }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      const blob = await new Promise((res) => c.toBlob(res, 'image/webp', quality));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    },
    { png, quality: QUALITY },
  );
  writeFileSync(out, Buffer.from(webp));
  console.log(`wrote ${out.pathname} (${(webp.length / 1024).toFixed(1)} KB)`);
} finally {
  await browser.close();
}
