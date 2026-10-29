import { test, expect, type Page } from '@playwright/test';
import { ready } from './ready';

type Beat = 'arrive' | 'seated' | 'tv';

const state = (page: Page) => page.evaluate(() => window.__room!.state());
const settledAt = (page: Page, b: Beat) =>
  page.waitForFunction(
    (b) => window.__room?.state().beat === b && !window.__room.state().moving,
    b,
    { timeout: 5_000 },
  );
const screenPos = (page: Page, name: 'couch' | 'remote') =>
  page.evaluate((n) => window.__room!.screenPos(n), name);
const overlay = (page: Page) => page.getByTestId('dive-overlay');
const onScreenRemote = (page: Page) => page.getByTestId('on-screen-remote');

test.describe('tv menu (desktop)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('/?tv=1 is at beat tv and ready within 5 s with no tween', async ({ page }) => {
    await page.goto('/?tv=1');
    await ready(page);
    expect(await state(page)).toEqual({ beat: 'tv', highlighted: 0, moving: false });
    // The menu is drawn on the screen and lists the five channels.
    expect(await page.evaluate(() => window.__room!.menu?.())).toEqual(
      expect.objectContaining({ header: 'AAMIR SOHAIL · CH 01–05', on: true }),
    );
  });

  test('ArrowDown at tv highlights channel 2', async ({ page }) => {
    await page.goto('/?tv=1');
    await ready(page);
    await page.keyboard.press('ArrowDown');
    expect((await state(page)).highlighted).toBe(1);
    const menu = await page.evaluate(() => window.__room!.menu!());
    expect(menu.rows[1]).toMatch(/^▶/);
    expect(menu.preview).toBe('an up-to-date list of my research');
  });

  test('Enter at tv dives to /publications/ after ArrowDown', async ({ page }) => {
    await page.goto('/?tv=1');
    await ready(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/publications\/$/);
    await expect(page.locator('.badge')).toHaveText('CH 02 · publications');
  });

  test('4 at tv dives to /journey/', async ({ page }) => {
    await page.goto('/?tv=1');
    await ready(page);
    await page.keyboard.press('4');
    await expect(page).toHaveURL(/\/journey\/$/);
  });

  test('the sound toggle is muted by default and remembers its setting', async ({ page }) => {
    await page.goto('/?tv=1');
    await ready(page);
    const toggle = page.getByRole('button', { name: 'sound' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await ready(page);
    await expect(page.getByRole('button', { name: 'sound' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('back-button: dive to /cv/ then Back returns to beat tv with no stuck overlay', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.keyboard.press('Enter');
    await settledAt(page, 'seated');
    await page.keyboard.press('Enter');
    await settledAt(page, 'tv');
    await page.keyboard.press('3');
    await expect(page).toHaveURL(/\/cv\/$/);

    await page.goBack();
    await ready(page);
    await settledAt(page, 'tv');
    expect(await state(page)).toEqual(expect.objectContaining({ beat: 'tv', moving: false }));
    await expect(overlay(page)).toHaveCSS('opacity', '0');
    // The room is usable again: a channel key dives.
    await page.keyboard.press('1');
    await expect(page).toHaveURL(/\/about\/$/);
  });

  // Playwright's Chromium refuses the bfcache (BackForwardCacheDisabledForDelegate), so the
  // real Back above reloads /?tv=1. This reproduces what a bfcache restore hands the page:
  // the document frozen at the end of a dive (overlay opaque, camera at the glass, moving).
  test('back-button (bfcache restore): pageshow persisted puts the room back at the menu, settled', async ({ page }) => {
    await page.goto('/?tv=1');
    await ready(page);
    let navigated!: () => void;
    const diveEnded = new Promise<void>((r) => (navigated = r));
    // The dive's navigation goes nowhere (204), leaving the page as the bfcache would freeze it.
    await page.route('**/cv/', (r) => (navigated(), r.fulfill({ status: 204 })));
    await page.keyboard.press('3');
    await diveEnded;
    const opacity = () => page.evaluate(() => getComputedStyle(document.querySelector('[data-dive-overlay]')!).opacity);
    expect(await opacity()).toBe('1');
    expect((await state(page)).moving).toBe(true);
    expect(await page.evaluate(() => window.__room!.cameraAt('tv'))).toBe(false);
    expect(new URL(page.url()).search).toBe('?tv=1'); // so Back from the channel lands on the menu

    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    expect(await state(page)).toEqual(expect.objectContaining({ beat: 'tv', moving: false }));
    expect(await opacity()).toBe('0');
    expect(await page.evaluate(() => window.__room!.cameraAt('tv'))).toBe(true);
    await page.unroute('**/cv/');
    await page.keyboard.press('1');
    await expect(page).toHaveURL(/\/about\/$/);
  });

  test('after a lost and restored WebGL context the idle menu is drawn again', async ({ page }) => {
    /** Mean colour of a patch of the TV menu's blue background (screenshot, decoded in the page). */
    const menuPatch = async () => {
      const png = (await page.screenshot({ clip: { x: 560, y: 470, width: 40, height: 40 } })).toString('base64');
      return page.evaluate(async (png) => {
        const img = new Image();
        img.src = `data:image/png;base64,${png}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
        const n = d.length / 4;
        return { r: sum[0] / n, g: sum[1] / n, b: sum[2] / n };
      }, png);
    };
    const isMenuBlue = (p: { r: number; b: number }) => p.b > 90 && p.b > p.r + 40;

    await page.goto('/?tv=1');
    await ready(page);
    await expect.poll(async () => isMenuBlue(await menuPatch()), { timeout: 5_000 }).toBe(true);

    await page.evaluate(async () => {
      const canvas = document.querySelector('canvas')!;
      const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl'))!;
      const ext = gl.getExtension('WEBGL_lose_context')!;
      const event = (name: string) => new Promise((r) => canvas.addEventListener(name, r, { once: true }));
      const lost = event('webglcontextlost');
      ext.loseContext();
      await lost;
      await new Promise((r) => setTimeout(r, 100)); // restore is allowed once the lost event has been handled
      const restored = event('webglcontextrestored');
      ext.restoreContext();
      await restored;
    });
    // Nothing else happens (no key, no pointer): the room must redraw by itself.
    await expect.poll(async () => isMenuBlue(await menuPatch()), { timeout: 5_000 }).toBe(true);
  });

  test('a bfcache restore with no dive (Back after the skip link) leaves the beat alone', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    expect(await state(page)).toEqual({ beat: 'arrive', highlighted: 0, moving: false });
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('tap couch, tap remote, on-screen remote 3 opens /cv/, no horizontal scroll', async ({ page }) => {
    const noHScroll = async () =>
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    await page.goto('/');
    await ready(page);
    await noHScroll();
    await expect(onScreenRemote(page)).toBeHidden();

    const couch = await screenPos(page, 'couch');
    expect(couch).not.toBeNull();
    await page.touchscreen.tap(couch!.x, couch!.y);
    await settledAt(page, 'seated');
    await noHScroll();

    const remote = await screenPos(page, 'remote');
    expect(remote).not.toBeNull();
    await page.touchscreen.tap(remote!.x, remote!.y);
    await settledAt(page, 'tv');
    await noHScroll();

    await expect(onScreenRemote(page)).toBeVisible();
    await onScreenRemote(page).getByRole('button', { name: '3 cv' }).tap();
    await expect(page).toHaveURL(/\/cv\/$/);
    await noHScroll();
  });
});
