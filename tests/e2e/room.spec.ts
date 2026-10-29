import { test, expect, type Page } from '@playwright/test';
import { ready } from './ready';

type Beat = 'arrive' | 'seated' | 'tv';

const beat = (page: Page) => page.evaluate(() => window.__room!.state().beat);
const settledAt = (page: Page, b: Beat) =>
  page.waitForFunction(
    (b) => window.__room?.state().beat === b && !window.__room.state().moving,
    b,
    { timeout: 5_000 },
  );

test('room renders a canvas and is ready at beat arrive with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await ready(page);
  expect(await beat(page)).toBe('arrive');
  expect(errors).toEqual([]);
});

test('model-failure: brain.glb aborted, room still ready and Enter, Enter reaches tv', async ({ page }) => {
  const uncaught: string[] = [];
  page.on('pageerror', (e) => uncaught.push(e.message));
  await page.route('**/models/brain.glb', (r) => r.abort());

  await page.goto('/');
  await ready(page);
  await page.keyboard.press('Enter');
  await settledAt(page, 'seated');
  await page.keyboard.press('Enter');
  await settledAt(page, 'tv');
  expect(uncaught).toEqual([]);
});

test('?tv=1 opens straight at the tv beat', async ({ page }) => {
  await page.goto('/?tv=1');
  await ready(page);
  expect(await beat(page)).toBe('tv');
});

test('modified keys are ignored in the room', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.keyboard.press('Control+Enter');
  expect(await page.evaluate(() => window.__room!.state())).toEqual({ beat: 'arrive', highlighted: 0, moving: false });
});
