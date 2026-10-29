import { test, expect } from '@playwright/test';
import { READY_TIMEOUT } from './ready';

test.describe('no WebGL', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
    });
  });

  test('shows the 2D channel menu, no errors, and digits navigate', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Channels' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link')).toHaveCount(5);
    await expect(page.locator('#room')).toBeHidden();
    await expect(page.getByTestId('room-still')).toBeVisible();
    expect(errors).toEqual([]);
    await page.keyboard.press('3');
    await expect(page).toHaveURL(/\/cv\/$/);
  });

  test('does not hijack modifier combos', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Channels' })).toBeVisible();
    await page.keyboard.press('Control+4');
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('scene setup throws late (WebGL available)', () => {
  test('tears the room down, shows the 2D menu, and a digit navigates exactly once', async ({ page }) => {
    // Throws once the room's listeners exist: the sound toggle is wired after the keydown handler.
    await page.addInitScript(() => {
      const set = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name: string, value: string) {
        if (this.hasAttribute('data-room-sound') && name === 'aria-pressed') throw new Error('injected setup failure');
        return set.call(this, name, value);
      };
      // After the document-level handlers have run: did the room's own handler start a dive?
      window.addEventListener('keydown', () => {
        const overlay = document.querySelector<HTMLElement>('[data-dive-overlay]');
        sessionStorage.setItem('dived', String(overlay?.style.transition === 'none'));
      });
    });
    const errors: string[] = [];
    const warns: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'warning' && warns.push(m.text()));
    await page.goto('/?tv=1');
    const nav = page.getByRole('navigation', { name: 'Channels' });
    await expect(nav).toBeVisible();
    await expect(page.locator('#room')).toBeHidden();
    expect(await page.evaluate(() => window.__room?.ready === true)).toBe(false);
    expect(errors).toEqual([]);
    expect(warns.join('\n')).toContain('Room scene failed');
    await page.keyboard.press('3');
    await expect(page).toHaveURL(/\/cv\/$/);
    // Only the fallback's channel keys acted: the room's handler (a dive) must be gone.
    expect(await page.evaluate(() => sessionStorage.getItem('dived'))).toBe('false');
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('Enter goes arrive -> seated, settled within 400 ms', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__room?.ready === true, null, { timeout: READY_TIMEOUT });
    // Deterministic form of "within 400 ms": no tween means the move has settled after a few
    // microtasks, with no animation frame needed (wall-clock timing is unreliable when 4 workers
    // share a software GL renderer).
    const settled = await page.evaluate(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      for (let i = 0; i < 5; i++) await Promise.resolve();
      return window.__room!.state();
    });
    expect(settled).toMatchObject({ beat: 'seated', moving: false });
  });

  test('the glide is replaced by a 250 ms cross-fade on the canvas', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__room?.ready === true, null, { timeout: READY_TIMEOUT });
    await page.keyboard.press('Enter');
    const fade = await page.evaluate(() =>
      document.getElementById('room')!.getAnimations().map((a) => a.effect?.getTiming().duration),
    );
    expect(fade).toContain(250);
  });
});

test('/ has a Channels nav with 5 links (WebGL page)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('nav[aria-label="Channels"]')).toHaveCount(1);
  await expect(page.locator('nav[aria-label="Channels"] a')).toHaveCount(5);
});

test('prompt and skip link are keyboard-focusable', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__room?.ready === true, null, { timeout: READY_TIMEOUT });
  const skip = page.locator('[data-room-skip]');
  await skip.focus();
  await expect(skip).toBeFocused();
  await expect(page.locator('[data-room-prompt] button')).toBeVisible();
  await page.locator('[data-room-prompt] button').focus();
  await expect(page.locator('[data-room-prompt] button')).toBeFocused();
});
