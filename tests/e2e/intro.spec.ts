import { test, expect, type Page } from '@playwright/test';
import { ready } from './ready';

type Beat = 'arrive' | 'seated' | 'tv';

const settledAt = (page: Page, b: Beat) =>
  page.waitForFunction(
    (b) => window.__room?.state().beat === b && !window.__room.state().moving,
    b,
    { timeout: 5_000 },
  );
const screenPos = (page: Page, name: 'couch' | 'remote') =>
  page.evaluate((n) => window.__room!.screenPos(n), name);

const prompt = (page: Page) => page.getByTestId('room-prompt');
const skip = (page: Page) => page.getByRole('link', { name: 'skip to site →' });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await ready(page);
});

test('arrive shows the "take a seat" prompt and the skip link', async ({ page }) => {
  await expect(prompt(page)).toHaveText('take a seat');
  await expect(prompt(page)).toBeVisible();
  await expect(skip(page)).toBeVisible();
});

test('clicking the couch sits down, then clicking the remote turns the TV on', async ({ page }) => {
  const couch = await screenPos(page, 'couch');
  expect(couch).not.toBeNull();
  await page.mouse.move(couch!.x, couch!.y);
  await expect(page.locator('canvas#room')).toHaveCSS('cursor', 'pointer');
  await page.mouse.click(couch!.x, couch!.y);
  await settledAt(page, 'seated');
  await expect(prompt(page)).toHaveText('pick up the remote');
  await expect(prompt(page)).toBeVisible();
  await expect(skip(page)).toBeHidden();

  const remote = await screenPos(page, 'remote');
  expect(remote).not.toBeNull();
  await page.mouse.click(remote!.x, remote!.y);
  await settledAt(page, 'tv');
  await expect(prompt(page)).toBeHidden();
});

test('clicking empty floor does nothing', async ({ page }) => {
  await page.mouse.click(1270, 790);
  expect(await page.evaluate(() => window.__room!.state())).toEqual({ beat: 'arrive', highlighted: 0, moving: false });
  await expect(page.locator('canvas#room')).not.toHaveCSS('cursor', 'pointer');
});

test('the skip link goes to the about channel', async ({ page }) => {
  await skip(page).click();
  await expect(page).toHaveURL(/\/about\/$/);
});

test('pressing 2 at arrive does not navigate', async ({ page }) => {
  const before = page.url();
  await page.keyboard.press('2');
  await page.waitForTimeout(300);
  expect(page.url()).toBe(before);
  expect(await page.evaluate(() => window.__room!.state().beat)).toBe('arrive');
});

test('the prompt is a keyboard-reachable button that does what clicking the object does', async ({ page }) => {
  await prompt(page).getByRole('button', { name: 'take a seat' }).focus();
  await page.keyboard.press('Enter');
  await settledAt(page, 'seated');
  await prompt(page).getByRole('button', { name: 'pick up the remote' }).click();
  await settledAt(page, 'tv');
});
